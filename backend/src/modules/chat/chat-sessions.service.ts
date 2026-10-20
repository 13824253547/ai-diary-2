import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { createHash } from 'node:crypto';
import { PrismaService } from '../../common/prisma.service';

export const CHAT_PAGE_SIZES = [10, 20, 50, 100] as const;

export type ChatMessageRecord = {
  id: string;
  conversationId: string;
  requestId: string;
  role: 'user' | 'assistant';
  text: string;
  source?: 'mock' | 'provider';
  providerRequestId?: string;
  createdAt: string;
};

export type ChatTurnRecord = {
  requestId: string;
  sequence: number;
  userMessageId: string;
  assistantMessageId?: string;
  attempt: number;
  status: 'pending' | 'completed' | 'failed';
  failureCode?: 'timeout' | 'cancelled' | 'provider_failed';
  source?: 'mock' | 'provider';
  providerRequestId?: string;
};

export type ChatConversationSnapshot = {
  id: string;
  updatedAt: string;
  messages: ChatMessageRecord[];
  turns: ChatTurnRecord[];
};

export type ChatConversationPage = {
  items: Array<{ id: string; updatedAt: string; messageCount: number }>;
  page: number;
  pageSize: typeof CHAT_PAGE_SIZES[number];
  total: number;
};

export class ChatSessionError extends Error {
  constructor(
    readonly code: 'not_found' | 'invalid_input' | 'version_conflict' | 'permission_denied' | 'provider_failed',
    message: string,
  ) {
    super(message);
    this.name = 'ChatSessionError';
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function normalizeIdentifier(value: unknown, field: string) {
  if (typeof value !== 'string' || !value.trim() || value.trim().length > 191) {
    throw new ChatSessionError('invalid_input', `请求中的 ${field} 无效。`);
  }
  return value.trim();
}

function normalizePositiveInteger(value: unknown, field: string) {
  if (!Number.isSafeInteger(value) || (value as number) < 1) {
    throw new ChatSessionError('invalid_input', `请求中的 ${field} 无效。`);
  }
  return value as number;
}

function fingerprint(value: unknown) {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex');
}

function assertReplyProviderAvailable() {
  if (process.env.NODE_ENV === 'production') {
    throw new ChatSessionError('provider_failed', '正式环境尚未配置可信的聊天回复服务。');
  }
}

function assertReplySourceAvailable(source: 'mock' | 'provider') {
  assertReplyProviderAvailable();
  if (source === 'provider' && process.env.NODE_ENV !== 'test') {
    throw new ChatSessionError('provider_failed', '当前运行环境尚未配置可信的聊天回复服务。');
  }
}

function mapMessage(record: {
  id: string;
  conversationId: string;
  requestId: string;
  role: string;
  text: string;
  source: string | null;
  providerRequestId: string | null;
  createdAt: Date;
}): ChatMessageRecord {
  return {
    id: record.id,
    conversationId: record.conversationId,
    requestId: record.requestId,
    role: record.role as ChatMessageRecord['role'],
    text: record.text,
    ...(record.source === 'mock' || record.source === 'provider' ? { source: record.source } : {}),
    ...(record.providerRequestId ? { providerRequestId: record.providerRequestId } : {}),
    createdAt: record.createdAt.toISOString(),
  };
}

function mapTurn(record: {
  requestId: string;
  sequence: number;
  userMessageId: string;
  assistantMessageId: string | null;
  attempt: number;
  status: string;
  failureCode: string | null;
  source: string | null;
  providerRequestId: string | null;
}): ChatTurnRecord {
  return {
    requestId: record.requestId,
    sequence: record.sequence,
    userMessageId: record.userMessageId,
    ...(record.assistantMessageId ? { assistantMessageId: record.assistantMessageId } : {}),
    attempt: record.attempt,
    status: record.status as ChatTurnRecord['status'],
    ...(record.failureCode === 'timeout'
      || record.failureCode === 'cancelled'
      || record.failureCode === 'provider_failed'
      ? { failureCode: record.failureCode }
      : {}),
    ...(record.source === 'mock' || record.source === 'provider' ? { source: record.source } : {}),
    ...(record.providerRequestId ? { providerRequestId: record.providerRequestId } : {}),
  };
}

async function lockConversation(
  transaction: Prisma.TransactionClient,
  conversationId: string,
) {
  await transaction.$queryRaw<Array<{ id: string }>>(Prisma.sql`
    SELECT \`id\` FROM \`ChatConversation\` WHERE \`id\` = ${conversationId} FOR UPDATE
  `);
  return transaction.chatConversation.findUnique({ where: { id: conversationId } });
}

@Injectable()
export class ChatSessionsService {
  constructor(private readonly prisma: PrismaService) {}

  async listConversations(input: unknown, ownerDeviceId: string): Promise<ChatConversationPage> {
    const owner = normalizeIdentifier(ownerDeviceId, 'ownerDeviceId');
    if (!isRecord(input)
      || typeof input.page !== 'number'
      || !Number.isSafeInteger(input.page)
      || input.page < 1
      || typeof input.pageSize !== 'number'
      || !CHAT_PAGE_SIZES.includes(input.pageSize as typeof CHAT_PAGE_SIZES[number])) {
      throw new ChatSessionError('invalid_input', '会话分页条件无效。');
    }
    const page = input.page;
    const pageSize = input.pageSize as typeof CHAT_PAGE_SIZES[number];
    const skip = (page - 1) * pageSize;
    if (!Number.isSafeInteger(skip)) throw new ChatSessionError('invalid_input', '会话页码超出范围。');
    const where = { ownerDeviceId: owner };
    const [rows, total] = await this.prisma.$transaction([
      this.prisma.chatConversation.findMany({
        where,
        orderBy: [{ updatedAt: 'desc' }, { id: 'desc' }],
        skip,
        take: pageSize,
        include: { _count: { select: { messages: true } } },
      }),
      this.prisma.chatConversation.count({ where }),
    ]);
    return {
      items: rows.map(row => ({
        id: row.id,
        updatedAt: row.updatedAt.toISOString(),
        messageCount: row._count.messages,
      })),
      page,
      pageSize,
      total,
    };
  }

  async getConversation(conversationIdInput: string, ownerDeviceId: string): Promise<ChatConversationSnapshot> {
    const conversationId = normalizeIdentifier(conversationIdInput, 'conversationId');
    const owner = normalizeIdentifier(ownerDeviceId, 'ownerDeviceId');
    return this.prisma.$transaction(async transaction => {
      const conversation = await lockConversation(transaction, conversationId);
      if (!conversation) throw new ChatSessionError('not_found', '聊天会话不存在。');
      if (conversation.ownerDeviceId !== owner) {
        throw new ChatSessionError('permission_denied', '聊天会话不属于当前设备。');
      }
      const [messages, turns] = await Promise.all([
        transaction.chatMessage.findMany({
          where: { conversationId },
          orderBy: [{ order: 'asc' }, { id: 'asc' }],
        }),
        transaction.chatTurn.findMany({
          where: { ownerDeviceId: owner, conversationId },
          orderBy: [{ sequence: 'asc' }, { id: 'asc' }],
        }),
      ]);
      return {
        id: conversation.id,
        updatedAt: conversation.updatedAt.toISOString(),
        messages: messages.map(mapMessage),
        turns: turns.map(mapTurn),
      };
    });
  }

  async beginTurn(input: {
    conversationId: string;
    requestId: string;
    userMessageId: string;
    text: string;
  }, ownerDeviceId: string): Promise<ChatConversationSnapshot> {
    const conversationId = normalizeIdentifier(input.conversationId, 'conversationId');
    const requestId = normalizeIdentifier(input.requestId, 'requestId');
    const userMessageId = normalizeIdentifier(input.userMessageId, 'userMessageId');
    const text = typeof input.text === 'string' ? input.text.trim() : '';
    if (!text) throw new ChatSessionError('invalid_input', '消息内容不能为空。');
    assertReplyProviderAvailable();
    const owner = normalizeIdentifier(ownerDeviceId, 'ownerDeviceId');
    const requestHash = fingerprint([conversationId, requestId, userMessageId, text]);

    try {
      return await this.prisma.$transaction(async transaction => {
        let conversation = await transaction.chatConversation.findUnique({ where: { id: conversationId } });
        if (!conversation) {
          conversation = await transaction.chatConversation.create({
            data: { id: conversationId, ownerDeviceId: owner },
          });
        }
        if (conversation.ownerDeviceId !== owner) {
          throw new ChatSessionError('permission_denied', '聊天会话不属于当前设备。');
        }
        conversation = await lockConversation(transaction, conversationId);
        if (!conversation) throw new ChatSessionError('not_found', '聊天会话不存在。');

        const uniqueTurn = {
          ownerDeviceId_conversationId_requestId: {
            ownerDeviceId: owner,
            conversationId,
            requestId,
          },
        };
        const existing = await transaction.chatTurn.findUnique({ where: uniqueTurn });
        if (existing) {
          if (existing.requestHash !== requestHash || existing.userMessageId !== userMessageId) {
            throw new ChatSessionError('invalid_input', '同一请求标识不能用于不同的消息。');
          }
          return this.readSnapshot(transaction, conversation);
        }

        const sequence = conversation.nextTurnSequence;
        normalizePositiveInteger(sequence, 'turnSequence');
        await transaction.chatConversation.update({
          where: { id: conversationId },
          data: { nextTurnSequence: sequence + 1 },
        });
        await transaction.chatTurn.create({
          data: {
            ownerDeviceId: owner,
            conversationId,
            requestId,
            requestHash,
            sequence,
            userMessageId,
            attempt: 1,
            status: 'pending',
          },
        });
        await transaction.chatMessage.create({
          data: {
            id: userMessageId,
            conversationId,
            turnSequence: sequence,
            order: sequence * 2,
            requestId,
            role: 'user',
            text,
          },
        });
        const refreshed = await transaction.chatConversation.findUniqueOrThrow({
          where: { id: conversationId },
        });
        return this.readSnapshot(transaction, refreshed);
      });
    } catch (error) {
      if (error instanceof ChatSessionError) throw error;
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        const existing = await this.prisma.chatTurn.findUnique({
          where: {
            ownerDeviceId_conversationId_requestId: { ownerDeviceId: owner, conversationId, requestId },
          },
        });
        if (existing && existing.requestHash === requestHash && existing.userMessageId === userMessageId) {
          return this.getConversation(conversationId, owner);
        }
        if (existing) throw new ChatSessionError('invalid_input', '同一请求标识不能用于不同的消息。');
        const collidedMessage = await this.prisma.chatMessage.findUnique({
          where: { id: userMessageId },
        });
        if (collidedMessage) {
          throw new ChatSessionError('invalid_input', '消息标识已被其他请求使用。');
        }
        const conversation = await this.prisma.chatConversation.findUnique({ where: { id: conversationId } });
        if (conversation && conversation.ownerDeviceId !== owner) {
          throw new ChatSessionError('permission_denied', '聊天会话不属于当前设备。');
        }
        return this.beginTurn(input, owner);
      }
      throw error;
    }
  }

  async completeTurn(input: {
    conversationId: string;
    requestId: string;
    attempt: number;
    assistantMessageId: string;
    text: string;
    source: 'mock' | 'provider';
    providerRequestId?: string;
  }, ownerDeviceId: string): Promise<ChatConversationSnapshot> {
    const conversationId = normalizeIdentifier(input.conversationId, 'conversationId');
    const requestId = normalizeIdentifier(input.requestId, 'requestId');
    const attempt = normalizePositiveInteger(input.attempt, 'attempt');
    const assistantMessageId = normalizeIdentifier(input.assistantMessageId, 'assistantMessageId');
    const text = typeof input.text === 'string' ? input.text.trim() : '';
    if (!text || (input.source !== 'mock' && input.source !== 'provider')) {
      throw new ChatSessionError('invalid_input', '回复内容或来源无效。');
    }
    assertReplySourceAvailable(input.source);
    const providerRequestId = input.providerRequestId
      ? normalizeIdentifier(input.providerRequestId, 'providerRequestId')
      : undefined;
    const owner = normalizeIdentifier(ownerDeviceId, 'ownerDeviceId');
    const resultHash = fingerprint([attempt, assistantMessageId, text, input.source, providerRequestId]);

    return this.prisma.$transaction(async transaction => {
      const conversation = await lockConversation(transaction, conversationId);
      if (!conversation) throw new ChatSessionError('not_found', '聊天会话不存在。');
      if (conversation.ownerDeviceId !== owner) {
        throw new ChatSessionError('permission_denied', '聊天会话不属于当前设备。');
      }
      const turn = await transaction.chatTurn.findUnique({
        where: {
          ownerDeviceId_conversationId_requestId: { ownerDeviceId: owner, conversationId, requestId },
        },
      });
      if (!turn) throw new ChatSessionError('not_found', '聊天请求不存在。');
      if (turn.status === 'completed') {
        if (turn.resultHash !== resultHash) {
          throw new ChatSessionError('version_conflict', '该请求已完成，不能替换已有回复。');
        }
        return this.readSnapshot(transaction, conversation);
      }
      if (turn.status !== 'pending' || turn.attempt !== attempt) {
        throw new ChatSessionError('version_conflict', '聊天请求已更新，请重新读取后再提交。');
      }
      await transaction.chatMessage.create({
        data: {
          id: assistantMessageId,
          conversationId,
          turnSequence: turn.sequence,
          order: turn.sequence * 2 + 1,
          requestId,
          role: 'assistant',
          text,
          source: input.source,
          providerRequestId,
        },
      });
      await transaction.chatTurn.update({
        where: { id: turn.id },
        data: {
          assistantMessageId,
          status: 'completed',
          source: input.source,
          providerRequestId,
          resultHash,
          failureCode: null,
        },
      });
      await transaction.chatConversation.update({
        where: { id: conversationId },
        data: { nextTurnSequence: conversation.nextTurnSequence },
      });
      const refreshed = await transaction.chatConversation.findUniqueOrThrow({
        where: { id: conversationId },
      });
      return this.readSnapshot(transaction, refreshed);
    });
  }

  async failTurn(input: {
    conversationId: string;
    requestId: string;
    attempt: number;
    failureCode: 'timeout' | 'cancelled' | 'provider_failed';
  }, ownerDeviceId: string): Promise<ChatConversationSnapshot> {
    const conversationId = normalizeIdentifier(input.conversationId, 'conversationId');
    const requestId = normalizeIdentifier(input.requestId, 'requestId');
    const attempt = normalizePositiveInteger(input.attempt, 'attempt');
    if (!['timeout', 'cancelled', 'provider_failed'].includes(input.failureCode)) {
      throw new ChatSessionError('invalid_input', '聊天失败类型无效。');
    }
    const owner = normalizeIdentifier(ownerDeviceId, 'ownerDeviceId');
    return this.prisma.$transaction(async transaction => {
      const conversation = await lockConversation(transaction, conversationId);
      if (!conversation) throw new ChatSessionError('not_found', '聊天会话不存在。');
      if (conversation.ownerDeviceId !== owner) {
        throw new ChatSessionError('permission_denied', '聊天会话不属于当前设备。');
      }
      const turn = await transaction.chatTurn.findUnique({
        where: {
          ownerDeviceId_conversationId_requestId: { ownerDeviceId: owner, conversationId, requestId },
        },
      });
      if (!turn) throw new ChatSessionError('not_found', '聊天请求不存在。');
      if (turn.status === 'failed' && turn.attempt === attempt && turn.failureCode === input.failureCode) {
        return this.readSnapshot(transaction, conversation);
      }
      if (turn.status !== 'pending' || turn.attempt !== attempt) {
        throw new ChatSessionError('version_conflict', '聊天请求已更新，请重新读取后再提交。');
      }
      await transaction.chatTurn.update({
        where: { id: turn.id },
        data: { status: 'failed', failureCode: input.failureCode },
      });
      await transaction.chatConversation.update({
        where: { id: conversationId },
        data: { nextTurnSequence: conversation.nextTurnSequence },
      });
      const refreshed = await transaction.chatConversation.findUniqueOrThrow({
        where: { id: conversationId },
      });
      return this.readSnapshot(transaction, refreshed);
    });
  }

  async retryTurn(input: {
    conversationId: string;
    requestId: string;
    nextAttempt: number;
  }, ownerDeviceId: string): Promise<ChatConversationSnapshot> {
    const conversationId = normalizeIdentifier(input.conversationId, 'conversationId');
    const requestId = normalizeIdentifier(input.requestId, 'requestId');
    const nextAttempt = normalizePositiveInteger(input.nextAttempt, 'nextAttempt');
    assertReplyProviderAvailable();
    const owner = normalizeIdentifier(ownerDeviceId, 'ownerDeviceId');
    return this.prisma.$transaction(async transaction => {
      const conversation = await lockConversation(transaction, conversationId);
      if (!conversation) throw new ChatSessionError('not_found', '聊天会话不存在。');
      if (conversation.ownerDeviceId !== owner) {
        throw new ChatSessionError('permission_denied', '聊天会话不属于当前设备。');
      }
      const turn = await transaction.chatTurn.findUnique({
        where: {
          ownerDeviceId_conversationId_requestId: { ownerDeviceId: owner, conversationId, requestId },
        },
      });
      if (!turn) throw new ChatSessionError('not_found', '聊天请求不存在。');
      if (turn.status === 'pending' && turn.attempt === nextAttempt) {
        return this.readSnapshot(transaction, conversation);
      }
      if (turn.status !== 'failed' || nextAttempt !== turn.attempt + 1) {
        throw new ChatSessionError('version_conflict', '聊天请求不能按该轮次重试。');
      }
      await transaction.chatTurn.update({
        where: { id: turn.id },
        data: {
          status: 'pending',
          attempt: nextAttempt,
          failureCode: null,
        },
      });
      await transaction.chatConversation.update({
        where: { id: conversationId },
        data: { nextTurnSequence: conversation.nextTurnSequence },
      });
      const refreshed = await transaction.chatConversation.findUniqueOrThrow({
        where: { id: conversationId },
      });
      return this.readSnapshot(transaction, refreshed);
    });
  }

  private async readSnapshot(
    transaction: Prisma.TransactionClient,
    conversation: { id: string; updatedAt: Date },
  ): Promise<ChatConversationSnapshot> {
    const [messages, turns] = await Promise.all([
      transaction.chatMessage.findMany({
        where: { conversationId: conversation.id },
        orderBy: [{ order: 'asc' }, { id: 'asc' }],
      }),
      transaction.chatTurn.findMany({
        where: { conversationId: conversation.id },
        orderBy: [{ sequence: 'asc' }, { id: 'asc' }],
      }),
    ]);
    return {
      id: conversation.id,
      updatedAt: conversation.updatedAt.toISOString(),
      messages: messages.map(mapMessage),
      turns: turns.map(mapTurn),
    };
  }
}
