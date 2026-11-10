import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { createHash } from 'node:crypto';
import { Prisma } from '@prisma/client';
import { AccountAiTaskCoordinator } from '../../common/account-ai-task-coordinator';
import { PrismaService } from '../../common/prisma.service';
import {
  AnchorReadModelError,
  AnchorReadModelService,
  SERVER_ANCHOR_PROVIDER_ACCESS,
} from './anchor-read-model.service';
import { ArkMemoryAnchorProvider, MemoryAnchorProviderError } from './ark-memory-anchor-provider';

type DiarySourceBlock = {
  id: string;
  type: 'text' | 'quote';
  content: string;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function sourceBlocks(snapshot: unknown): DiarySourceBlock[] {
  if (!isRecord(snapshot) || !Array.isArray(snapshot.blocks)) return [];
  return snapshot.blocks.flatMap(block => {
    if (!isRecord(block)
      || (block.type !== 'text' && block.type !== 'quote')
      || typeof block.id !== 'string'
      || !block.id.trim()
      || typeof block.content !== 'string'
      || !block.content.trim()) return [];
    return [{
      id: block.id.trim(),
      type: block.type,
      content: block.content.trim(),
    }];
  });
}

function stableRequestId(ownerUserId: string, diaryId: string, diaryVersion: number) {
  const digest = createHash('sha256')
    .update(`${ownerUserId}\u0000${diaryId}\u0000${diaryVersion}`)
    .digest('hex')
    .slice(0, 40);
  return `diary-anchor-${digest}`;
}

function pause(milliseconds: number) {
  return new Promise<void>(resolve => setTimeout(resolve, milliseconds));
}

@Injectable()
export class DiaryAnchorGenerationService implements OnModuleInit {
  private readonly logger = new Logger(DiaryAnchorGenerationService.name);
  private readonly active = new Map<string, Promise<void>>();

  constructor(
    private readonly prisma: PrismaService,
    private readonly readModel: AnchorReadModelService,
    private readonly provider: ArkMemoryAnchorProvider,
    private readonly taskCoordinator: AccountAiTaskCoordinator,
  ) {}

  async onModuleInit() {
    if (process.env.NODE_ENV === 'test') return;
    const pending = await this.prisma.diaryAnchorExtraction.findMany({
      where: { status: 'pending' },
      select: { ownerUserId: true, diaryId: true, diaryVersion: true },
    });
    for (const task of pending) {
      this.enqueue(task.ownerUserId, task.diaryId, task.diaryVersion);
    }
  }

  enqueue(ownerUserId: string, diaryId: string, diaryVersion: number) {
    if (process.env.NODE_ENV === 'test') return;
    const key = `${ownerUserId}\u0000${diaryId}\u0000${diaryVersion}`;
    if (this.active.has(key)) return;
    const task = this.processDiaryVersion(ownerUserId, diaryId, diaryVersion)
      .catch(error => {
        const code = error instanceof AnchorReadModelError ? error.code : 'provider_failed';
        this.logger.warn(`Diary anchor task ended without an anchor (${code}).`);
      })
      .finally(() => {
        if (this.active.get(key) === task) this.active.delete(key);
      });
    this.active.set(key, task);
  }

  async processDiaryVersion(ownerUserId: string, diaryId: string, diaryVersion: number) {
    const requestId = stableRequestId(ownerUserId, diaryId, diaryVersion);
    const diary = await this.prisma.diary.findFirst({
      where: { id: diaryId, ownerUserId, version: diaryVersion },
      select: { contentSnapshot: true },
    });
    if (!diary) return;

    const blocks = sourceBlocks(diary.contentSnapshot);
    if (!blocks.length) {
      await this.saveSkipped(ownerUserId, diaryId, diaryVersion, requestId);
      return;
    }
    if (new Set(blocks.map(block => block.id)).size !== blocks.length) {
      await this.saveSkipped(ownerUserId, diaryId, diaryVersion, requestId);
      return;
    }

    const existing = await this.prisma.diaryAnchorExtraction.findUnique({
      where: {
        ownerUserId_diaryId_diaryVersion: { ownerUserId, diaryId, diaryVersion },
      },
    });
    if (existing?.status === 'succeeded' || existing?.status === 'skipped'
      || (existing?.status === 'failed' && existing.attempt >= 3)) return;

    let attempt = existing?.status === 'failed' ? existing.attempt + 1 : existing?.attempt ?? 1;
    while (attempt <= 3) {
      const run = await this.readModel.beginExtraction({
        diaryId,
        diaryVersion,
        requestId,
        attempt,
      }, ownerUserId, SERVER_ANCHOR_PROVIDER_ACCESS);
      if (run.status === 'succeeded') return;
      if (run.status === 'failed') {
        attempt = run.attempt + 1;
        continue;
      }

      try {
        const summary = await this.taskCoordinator.runBackground(
          ownerUserId,
          () => this.provider.summarize({ kind: 'diary', blocks }),
        );
        await this.readModel.completeExtraction({
          attempt,
          result: {
            requestId,
            diaryId,
            diaryVersion,
            source: 'provider',
            anchors: [{
              id: stableRequestId(ownerUserId, diaryId, diaryVersion),
              tagId: summary.tagId,
              sourceBlockId: blocks[0].id,
              sourceBlockIds: blocks.map(block => block.id),
              excerpt: summary.excerpt,
            }],
          },
        }, ownerUserId, SERVER_ANCHOR_PROVIDER_ACCESS);
        return;
      } catch (error) {
        if (error instanceof AnchorReadModelError && error.code === 'version_conflict') {
          await this.markSourceChanged(ownerUserId, diaryId, diaryVersion, requestId);
          return;
        }
        const failureCode = error instanceof MemoryAnchorProviderError && error.code === 'timeout'
          ? 'timeout'
          : 'provider_failed';
        await this.readModel.failExtraction({
          diaryId,
          diaryVersion,
          requestId,
          attempt,
          failureCode,
        }, ownerUserId, SERVER_ANCHOR_PROVIDER_ACCESS);
        if (attempt >= 3) return;
        await pause(3_000);
        attempt += 1;
      }
    }
  }

  private async saveSkipped(
    ownerUserId: string,
    diaryId: string,
    diaryVersion: number,
    requestId: string,
  ) {
    const sourceHash = createHash('sha256').update('[]').digest('hex');
    await this.prisma.$transaction(async transaction => {
      const [source] = await transaction.$queryRaw<Array<{ id: string }>>(Prisma.sql`
        SELECT \`id\`
        FROM \`Diary\`
        WHERE \`id\` = ${diaryId}
          AND \`ownerUserId\` = ${ownerUserId}
          AND \`version\` = ${diaryVersion}
        FOR UPDATE
      `);
      if (!source) return;
      await transaction.diaryAnchorExtraction.upsert({
        where: {
          ownerUserId_diaryId_diaryVersion: { ownerUserId, diaryId, diaryVersion },
        },
        create: {
          ownerUserId,
          diaryId,
          diaryVersion,
          requestId,
          sourceHash,
          attempt: 0,
          status: 'skipped',
          failureCode: 'no_source',
        },
        update: {},
      });
    });
  }

  private async markSourceChanged(
    ownerUserId: string,
    diaryId: string,
    diaryVersion: number,
    requestId: string,
  ) {
    await this.prisma.diaryAnchorExtraction.updateMany({
      where: {
        ownerUserId,
        diaryId,
        diaryVersion,
        requestId,
        status: 'pending',
      },
      data: { status: 'skipped', failureCode: 'source_changed' },
    });
  }
}
