import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { createHash } from 'node:crypto';
import { Prisma } from '@prisma/client';
import { DeviceAiTaskCoordinator } from '../../common/device-ai-task-coordinator';
import { PrismaService } from '../../common/prisma.service';
import { classifyPetChatInput, classifyPetChatReply } from '../chat/pet-chat-safety-policy';
import { ArkMemoryAnchorProvider, MemoryAnchorProviderError } from './ark-memory-anchor-provider';

type SourceTurn = {
  id: string;
  ownerDeviceId: string;
  conversationId: string;
  requestId: string;
  sequence: number;
  userMessageId: string;
  assistantMessageId: string | null;
  deviceLocalDate: string | null;
  source: string | null;
};

type SourceMessage = {
  id: string;
  conversationId: string;
  requestId: string;
  role: 'user' | 'assistant';
  text: string;
};

type DailyBatch = {
  id: string;
  ownerDeviceId: string;
  requestId: string;
  attempt: number;
  status: string;
  sourceDateStart: string;
  sourceDateEnd: string;
};

type PendingDailyTrigger = {
  date: string;
  requested: boolean;
};

function validLocalDate(value: unknown): value is string {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00.000Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

function pause(milliseconds: number) {
  return new Promise<void>(resolve => setTimeout(resolve, milliseconds));
}

function sourceHash(messages: SourceMessage[]) {
  return createHash('sha256')
    .update(JSON.stringify(messages.map(({ id, conversationId, requestId, role, text }) =>
      [id, conversationId, requestId, role, text])))
    .digest('hex');
}

function stableRequestId(ownerDeviceId: string, messages: SourceMessage[]) {
  const sourceIds = messages.map(message => message.id).sort();
  const digest = createHash('sha256')
    .update(`${ownerDeviceId}\u0000${sourceIds.join('\u0000')}`)
    .digest('hex')
    .slice(0, 40);
  return `chat-anchor-${digest}`;
}

@Injectable()
export class ChatDailyAnchorService implements OnModuleInit {
  private readonly logger = new Logger(ChatDailyAnchorService.name);
  private readonly pendingTriggers = new Map<string, PendingDailyTrigger>();
  private readonly processingOwners = new Set<string>();
  private readonly processingBatches = new Set<string>();

  constructor(
    private readonly prisma: PrismaService,
    private readonly provider: ArkMemoryAnchorProvider,
    private readonly taskCoordinator: DeviceAiTaskCoordinator,
  ) {}

  async onModuleInit() {
    if (process.env.NODE_ENV === 'test') return;
    const pending = await this.prisma.chatDailyAnchor.findMany({
      where: { status: 'pending' },
      select: { id: true, ownerDeviceId: true },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
    });
    for (const item of pending) this.enqueueBatch(item.id, item.ownerDeviceId);
  }

  enqueueAfterCompletedTurn(ownerDeviceId: string, deviceLocalDate?: string) {
    if (process.env.NODE_ENV === 'test') return;
    if (!validLocalDate(deviceLocalDate)) return;
    const active = this.pendingTriggers.get(ownerDeviceId);
    if (active) {
      if (deviceLocalDate > active.date) active.date = deviceLocalDate;
      active.requested = true;
      return;
    }
    const trigger: PendingDailyTrigger = { date: deviceLocalDate, requested: true };
    this.pendingTriggers.set(ownerDeviceId, trigger);
    void this.drainTriggers(ownerDeviceId, trigger);
  }

  private async drainTriggers(ownerDeviceId: string, trigger: PendingDailyTrigger) {
    if (this.processingOwners.has(ownerDeviceId)) return;
    this.processingOwners.add(ownerDeviceId);
    try {
      while (trigger.requested) {
        trigger.requested = false;
        await this.processCompletedDate(ownerDeviceId, trigger.date);
      }
    } catch (error) {
      const code = error instanceof MemoryAnchorProviderError ? error.code : 'provider_failed';
      this.logger.warn(`Daily chat anchor task stopped (${code}).`);
    } finally {
      this.processingOwners.delete(ownerDeviceId);
      if (this.pendingTriggers.get(ownerDeviceId) === trigger) {
        this.pendingTriggers.delete(ownerDeviceId);
      }
    }
  }

  async processCompletedDate(ownerDeviceId: string, beforeLocalDate: string) {
    if (!validLocalDate(beforeLocalDate)) return;
    const batch = await this.claimOrResumeBatch(ownerDeviceId, beforeLocalDate);
    if (batch) await this.processBatch(batch.id, ownerDeviceId);
  }

  private async claimOrResumeBatch(ownerDeviceId: string, beforeLocalDate: string): Promise<DailyBatch | null> {
    const pending = await this.prisma.chatDailyAnchor.findFirst({
      where: { ownerDeviceId, status: 'pending' },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
    });
    if (pending) return pending;

    return this.prisma.$transaction(async transaction => {
      const locked = await transaction.$queryRaw<Array<{ id: string }>>(Prisma.sql`
        SELECT t.\`id\`
        FROM \`ChatTurn\` AS t
        INNER JOIN \`ChatConversation\` AS c
          ON c.\`id\` = t.\`conversationId\`
          AND c.\`ownerDeviceId\` = t.\`ownerDeviceId\`
        WHERE t.\`ownerDeviceId\` = ${ownerDeviceId}
          AND t.\`memoryEligible\` = 1
          AND t.\`memoryAnchorBatchId\` IS NULL
          AND t.\`deviceLocalDate\` < ${beforeLocalDate}
          AND t.\`status\` = 'completed'
          AND t.\`source\` = 'provider'
          AND t.\`assistantMessageId\` IS NOT NULL
        ORDER BY t.\`deviceLocalDate\` ASC, t.\`conversationId\` ASC, t.\`sequence\` ASC, t.\`id\` ASC
        FOR UPDATE
      `);
      if (!locked.length) return null;
      const ids = locked.map(row => row.id);
      const turns = await transaction.chatTurn.findMany({
        where: {
          id: { in: ids },
          ownerDeviceId,
          memoryEligible: true,
          memoryAnchorBatchId: null,
          status: 'completed',
          source: 'provider',
        },
        orderBy: [
          { deviceLocalDate: 'asc' },
          { conversationId: 'asc' },
          { sequence: 'asc' },
          { id: 'asc' },
        ],
      });
      const turnsWithMessages: Array<{ turn: SourceTurn; messages: SourceMessage[] }> = [];
      for (const turn of turns) {
        if (!turn.assistantMessageId || !validLocalDate(turn.deviceLocalDate)) continue;
        const messageIds = [turn.userMessageId, turn.assistantMessageId];
        const messages = await transaction.chatMessage.findMany({
          where: {
            id: { in: messageIds },
            conversationId: turn.conversationId,
            requestId: turn.requestId,
          },
          orderBy: [{ order: 'asc' }, { id: 'asc' }],
        });
        const user = messages.find(message => message.role === 'user');
        const assistant = messages.find(message => message.role === 'assistant');
        if (messages.length !== 2
          || !user
          || user.id !== turn.userMessageId
          || !assistant
          || assistant.id !== turn.assistantMessageId
          || !user.text.trim()
          || !assistant.text.trim()
          || classifyPetChatInput(user.text)
          || classifyPetChatReply(assistant.text)) {
          await transaction.chatTurn.update({
            where: { id: turn.id },
            data: { memoryEligible: false },
          });
          continue;
        }
        turnsWithMessages.push({
          turn: {
            id: turn.id,
            ownerDeviceId: turn.ownerDeviceId,
            conversationId: turn.conversationId,
            requestId: turn.requestId,
            sequence: turn.sequence,
            userMessageId: turn.userMessageId,
            assistantMessageId: turn.assistantMessageId,
            deviceLocalDate: turn.deviceLocalDate,
            source: turn.source,
          },
          messages: messages.map(message => ({
            id: message.id,
            conversationId: message.conversationId,
            requestId: message.requestId,
            role: message.role as SourceMessage['role'],
            text: message.text,
          })),
        });
      }
      if (!turnsWithMessages.length) return null;

      const allMessages = turnsWithMessages.flatMap(item => item.messages);
      const orderedTurns = turnsWithMessages.map(item => item.turn);
      const dates = orderedTurns.map(turn => turn.deviceLocalDate!).sort();
      const requestId = stableRequestId(ownerDeviceId, allMessages);
      const batch = await transaction.chatDailyAnchor.create({
        data: {
          anchorId: requestId,
          ownerDeviceId,
          requestId,
          sourceHash: sourceHash(allMessages),
          sourceDateStart: dates[0],
          sourceDateEnd: dates[dates.length - 1],
          sourceCount: allMessages.length,
          attempt: 0,
          status: 'pending',
          sources: {
            createMany: {
              data: turnsWithMessages.flatMap(({ turn, messages }) => messages.map(message => ({
                ownerDeviceId,
                turnId: turn.id,
                messageId: message.id,
                conversationId: message.conversationId,
                localDate: turn.deviceLocalDate!,
              }))),
            },
          },
        },
      });
      await transaction.chatTurn.updateMany({
        where: {
          id: { in: orderedTurns.map(turn => turn.id) },
          ownerDeviceId,
          memoryAnchorBatchId: null,
        },
        data: { memoryAnchorBatchId: batch.id },
      });
      return batch;
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  }

  private enqueueBatch(batchId: string, ownerDeviceId: string) {
    void this.processBatch(batchId, ownerDeviceId)
      .catch(error => {
        const code = error instanceof MemoryAnchorProviderError ? error.code : 'provider_failed';
        this.logger.warn(`Daily chat anchor batch stopped (${code}).`);
      })
      .finally(() => this.processingBatches.delete(batchId));
  }

  private async processBatch(batchId: string, ownerDeviceId: string) {
    if (this.processingBatches.has(batchId)) return;
    this.processingBatches.add(batchId);
    try {
      const batch = await this.prisma.chatDailyAnchor.findFirst({
        where: { id: batchId, ownerDeviceId },
        include: {
          sources: {
            include: {
              message: true,
              turn: { select: { sequence: true } },
            },
            orderBy: [
              { localDate: 'asc' },
              { conversationId: 'asc' },
              { turn: { sequence: 'asc' } },
              { message: { order: 'asc' } },
              { messageId: 'asc' },
            ],
          },
        },
      });
      if (!batch || batch.status === 'succeeded' || batch.status === 'failed') return;
      if (batch.sources.length !== batch.sourceCount) {
        await this.prisma.chatDailyAnchor.update({
          where: { id: batchId },
          data: { status: 'failed', failureCode: 'source_unavailable' },
        });
        return;
      }
      const messages: SourceMessage[] = batch.sources.map(source => ({
        id: source.message.id,
        conversationId: source.message.conversationId,
        requestId: source.message.requestId,
        role: source.message.role as SourceMessage['role'],
        text: source.message.text,
      }));
      if (messages.some(message => !message.text.trim())) {
        await this.prisma.chatDailyAnchor.update({
          where: { id: batchId },
          data: { status: 'failed', failureCode: 'source_unavailable' },
        });
        return;
      }
      if (sourceHash(messages) !== batch.sourceHash) {
        await this.prisma.chatDailyAnchor.update({
          where: { id: batchId },
          data: { status: 'failed', failureCode: 'source_changed' },
        });
        return;
      }

      let nextAttempt = batch.attempt === 0 ? 1 : batch.attempt + 1;
      if (nextAttempt > 3) {
        await this.prisma.chatDailyAnchor.updateMany({
          where: { id: batchId, ownerDeviceId, status: 'pending' },
          data: { status: 'failed', failureCode: 'provider_failed' },
        });
        return;
      }
      while (nextAttempt <= 3) {
        await this.prisma.chatDailyAnchor.update({
          where: { id: batchId },
          data: { attempt: nextAttempt, status: 'pending', failureCode: null },
        });
        try {
          const summary = await this.taskCoordinator.runBackground(
            ownerDeviceId,
            () => this.provider.summarize({
              kind: 'chat',
              messages: messages.map(({ role, text }) => ({ role, content: text })),
            }),
          );
          const hash = createHash('sha256')
            .update(JSON.stringify([batch.requestId, summary.tagId, summary.excerpt]))
            .digest('hex');
          await this.prisma.$transaction(async transaction => {
            const current = await transaction.chatDailyAnchor.findUnique({
              where: { id: batchId },
            });
            if (!current || current.ownerDeviceId !== ownerDeviceId) {
              throw new Error('daily anchor batch is unavailable');
            }
            if (current.status === 'succeeded') {
              if (current.resultHash !== hash) throw new Error('daily anchor result conflict');
              return;
            }
            if (current.status !== 'pending' || current.attempt !== nextAttempt) {
              throw new Error('daily anchor attempt is stale');
            }
            await transaction.chatDailyAnchor.update({
              where: { id: batchId },
              data: {
                status: 'succeeded',
                tagId: summary.tagId,
                excerpt: summary.excerpt,
                resultHash: hash,
                generatedAt: new Date(),
                failureCode: null,
              },
            });
          });
          return;
        } catch (error) {
          const failureCode = error instanceof MemoryAnchorProviderError && error.code === 'timeout'
            ? 'timeout'
            : 'provider_failed';
          const terminal = nextAttempt >= 3;
          await this.prisma.chatDailyAnchor.updateMany({
            where: { id: batchId, status: 'pending', attempt: nextAttempt },
            data: { status: terminal ? 'failed' : 'pending', failureCode },
          });
          if (terminal) return;
          await pause(3_000);
          nextAttempt += 1;
        }
      }
    } finally {
      this.processingBatches.delete(batchId);
    }
  }
}
