import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { createHash } from 'node:crypto';
import { PrismaService } from '../../common/prisma.service';

export type AnchorCorrectionRecord = {
  id: string;
  diaryId: string;
  diaryVersion: number;
  anchorId: string;
  sourceBlockId: string;
  correction: string;
  version: number;
  source: 'user';
  updatedAt: string;
};

export type SaveAnchorCorrectionInput = {
  diaryId: string;
  diaryVersion: number;
  anchorId: string;
  sourceBlockId: string;
  correction: string;
  expectedVersion: number;
  idempotencyKey: string;
};

export class AnchorCorrectionError extends Error {
  constructor(
    readonly code: 'not_found' | 'invalid_input' | 'version_conflict' | 'permission_denied',
    message: string,
  ) {
    super(message);
    this.name = 'AnchorCorrectionError';
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function normalizeIdentifier(value: unknown, field: string) {
  if (typeof value !== 'string' || !value.trim() || value.trim().length > 191) {
    throw new AnchorCorrectionError('invalid_input', `请求中的 ${field} 无效。`);
  }
  return value.trim();
}

function normalizeVersion(value: unknown, field: string, allowZero = false) {
  const minimum = allowZero ? 0 : 1;
  if (!Number.isSafeInteger(value) || (value as number) < minimum) {
    throw new AnchorCorrectionError('invalid_input', `请求中的 ${field} 无效。`);
  }
  return value as number;
}

function mapCorrection(record: {
  id: string;
  diaryId: string;
  sourceDiaryVersion: number;
  anchorId: string;
  sourceBlockId: string;
  correction: string;
  version: number;
  updatedAt: Date;
}): AnchorCorrectionRecord {
  return {
    id: record.id,
    diaryId: record.diaryId,
    diaryVersion: record.sourceDiaryVersion,
    anchorId: record.anchorId,
    sourceBlockId: record.sourceBlockId,
    correction: record.correction,
    version: record.version,
    source: 'user',
    updatedAt: record.updatedAt.toISOString(),
  };
}

function mapCommandReplay(
  command: { correctionVersion: number },
  record: Parameters<typeof mapCorrection>[0] | null,
): AnchorCorrectionRecord {
  if (!record) throw new Error('幂等纠正记录缺失。');
  if (record.version !== command.correctionVersion) {
    throw new AnchorCorrectionError('version_conflict', '该纠正请求已被后续版本取代，请重新读取。');
  }
  return mapCorrection(record);
}

function hasSourceBlock(snapshot: unknown, sourceBlockId: string) {
  if (!isRecord(snapshot) || !Array.isArray(snapshot.blocks)) return false;
  return snapshot.blocks.some(block =>
    isRecord(block)
    && block.id === sourceBlockId
    && (block.type === 'text' || block.type === 'quote'),
  );
}

function requestFingerprint(input: SaveAnchorCorrectionInput) {
  return createHash('sha256')
    .update(JSON.stringify([
      input.diaryId,
      input.diaryVersion,
      input.anchorId,
      input.sourceBlockId,
      input.correction,
      input.expectedVersion,
    ]))
    .digest('hex');
}

async function lockDiary(
  transaction: Prisma.TransactionClient,
  diaryId: string,
) {
  await transaction.$queryRaw<Array<{ id: string }>>(Prisma.sql`
    SELECT \`id\` FROM \`Diary\` WHERE \`id\` = ${diaryId} FOR UPDATE
  `);
  return transaction.diary.findUnique({ where: { id: diaryId } });
}

@Injectable()
export class AnchorCorrectionsService {
  constructor(private readonly prisma: PrismaService) {}

  async getCorrection(input: unknown, ownerDeviceId: unknown): Promise<AnchorCorrectionRecord | null> {
    if (!isRecord(input)) {
      throw new AnchorCorrectionError('invalid_input', '锚点纠正查询条件无效。');
    }
    const diaryId = normalizeIdentifier(input.diaryId, 'diaryId');
    const anchorId = normalizeIdentifier(input.anchorId, 'anchorId');
    const diaryVersion = normalizeVersion(input.diaryVersion, 'diaryVersion');
    const owner = normalizeIdentifier(ownerDeviceId, 'ownerDeviceId');
    return this.prisma.$transaction(async transaction => {
      const diary = await lockDiary(transaction, diaryId);
      if (!diary) throw new AnchorCorrectionError('not_found', '日记不存在。');
      if (diary.ownerDeviceId !== owner) {
        throw new AnchorCorrectionError('permission_denied', '日记不属于当前设备。');
      }
      if (diary.version !== diaryVersion) {
        throw new AnchorCorrectionError('version_conflict', '日记已更新，请重新读取后再提交。');
      }

      const anchor = await transaction.diaryAnchor.findFirst({
        where: {
          ownerDeviceId: owner,
          diaryId,
          diaryVersion,
          anchorId,
          source: 'provider',
          extraction: { is: { status: 'succeeded', source: 'provider' } },
        },
        select: { sourceBlockId: true },
      });
      if (!anchor || !hasSourceBlock(diary.contentSnapshot, anchor.sourceBlockId)) {
        throw new AnchorCorrectionError('not_found', '锚点或其来源正文已不可用。');
      }
      const correction = await transaction.anchorCorrection.findUnique({
        where: {
          ownerDeviceId_diaryId_anchorId_sourceDiaryVersion: {
            ownerDeviceId: owner,
            diaryId,
            anchorId,
            sourceDiaryVersion: diaryVersion,
          },
        },
      });
      if (correction && correction.sourceBlockId !== anchor.sourceBlockId) {
        throw new AnchorCorrectionError('not_found', '锚点纠正与当前来源正文不匹配。');
      }
      return correction ? mapCorrection(correction) : null;
    });
  }

  async saveCorrection(input: unknown, ownerDeviceId: unknown): Promise<AnchorCorrectionRecord> {
    if (!isRecord(input)) {
      throw new AnchorCorrectionError('invalid_input', '锚点纠正请求无效。');
    }
    const normalized: SaveAnchorCorrectionInput = {
      diaryId: normalizeIdentifier(input.diaryId, 'diaryId'),
      diaryVersion: normalizeVersion(input.diaryVersion, 'diaryVersion'),
      anchorId: normalizeIdentifier(input.anchorId, 'anchorId'),
      sourceBlockId: normalizeIdentifier(input.sourceBlockId, 'sourceBlockId'),
      correction: typeof input.correction === 'string' ? input.correction.trim() : '',
      expectedVersion: normalizeVersion(input.expectedVersion, 'expectedVersion', true),
      idempotencyKey: normalizeIdentifier(input.idempotencyKey, 'idempotencyKey'),
    };
    const owner = normalizeIdentifier(ownerDeviceId, 'ownerDeviceId');
    if (!normalized.correction) {
      throw new AnchorCorrectionError('invalid_input', '纠正内容不能为空。');
    }
    const requestHash = requestFingerprint(normalized);

    try {
      return await this.prisma.$transaction(async transaction => {
        const commandKey = {
          ownerDeviceId_idempotencyKey: {
            ownerDeviceId: owner,
            idempotencyKey: normalized.idempotencyKey,
          },
        };
        const previousCommand = await transaction.anchorCorrectionCommand.findUnique({ where: commandKey });
        if (previousCommand) {
          if (previousCommand.requestHash !== requestHash) {
            throw new AnchorCorrectionError('invalid_input', '同一请求标识不能用于不同的纠正内容。');
          }
          const priorRecord = await transaction.anchorCorrection.findUnique({
            where: { id: previousCommand.correctionId },
          });
          return mapCommandReplay(previousCommand, priorRecord);
        }

        const diary = await lockDiary(transaction, normalized.diaryId);
        if (!diary) throw new AnchorCorrectionError('not_found', '日记不存在。');
        if (diary.ownerDeviceId !== owner) {
          throw new AnchorCorrectionError('permission_denied', '日记不属于当前设备。');
        }
        if (diary.version !== normalized.diaryVersion) {
          throw new AnchorCorrectionError('version_conflict', '日记已更新，请重新读取后再提交。');
        }
        if (!hasSourceBlock(diary.contentSnapshot, normalized.sourceBlockId)) {
          throw new AnchorCorrectionError('not_found', '锚点来源正文已不可用。');
        }
        const anchor = await transaction.diaryAnchor.findFirst({
          where: {
            ownerDeviceId: owner,
            diaryId: normalized.diaryId,
            diaryVersion: normalized.diaryVersion,
            anchorId: normalized.anchorId,
            sourceBlockId: normalized.sourceBlockId,
            source: 'provider',
            extraction: { is: { status: 'succeeded', source: 'provider' } },
          },
          select: { id: true },
        });
        if (!anchor) {
          throw new AnchorCorrectionError('not_found', '锚点未出现在当前版本的已保存提取结果中。');
        }

        const uniqueCorrection = {
          ownerDeviceId_diaryId_anchorId_sourceDiaryVersion: {
            ownerDeviceId: owner,
            diaryId: normalized.diaryId,
            anchorId: normalized.anchorId,
            sourceDiaryVersion: normalized.diaryVersion,
          },
        };
        const existing = await transaction.anchorCorrection.findUnique({ where: uniqueCorrection });
        let correctionId: string;
        let correctionVersion: number;

        if (!existing) {
          if (normalized.expectedVersion !== 0) {
            throw new AnchorCorrectionError('version_conflict', '纠正内容已更新，请重新读取后再提交。');
          }
          const created = await transaction.anchorCorrection.create({
            data: {
              ownerDeviceId: owner,
              diaryId: normalized.diaryId,
              anchorId: normalized.anchorId,
              sourceBlockId: normalized.sourceBlockId,
              sourceDiaryVersion: normalized.diaryVersion,
              correction: normalized.correction,
              version: 1,
            },
          });
          correctionId = created.id;
          correctionVersion = created.version;
        } else {
          if (existing.sourceBlockId !== normalized.sourceBlockId
            || existing.version !== normalized.expectedVersion) {
            throw new AnchorCorrectionError('version_conflict', '纠正内容已更新，请重新读取后再提交。');
          }
          const update = await transaction.anchorCorrection.updateMany({
            where: {
              id: existing.id,
              ownerDeviceId: owner,
              version: normalized.expectedVersion,
            },
            data: {
              correction: normalized.correction,
              version: normalized.expectedVersion + 1,
            },
          });
          if (update.count !== 1) {
            throw new AnchorCorrectionError('version_conflict', '纠正内容已更新，请重新读取后再提交。');
          }
          correctionId = existing.id;
          correctionVersion = normalized.expectedVersion + 1;
        }

        await transaction.anchorCorrectionCommand.create({
          data: {
            ownerDeviceId: owner,
            idempotencyKey: normalized.idempotencyKey,
            requestHash,
            correctionId,
            correctionVersion,
          },
        });
        const saved = await transaction.anchorCorrection.findUniqueOrThrow({
          where: { id: correctionId },
        });
        return mapCorrection(saved);
      });
    } catch (error) {
      if (error instanceof AnchorCorrectionError) throw error;
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        const command = await this.prisma.anchorCorrectionCommand.findUnique({
          where: {
            ownerDeviceId_idempotencyKey: {
              ownerDeviceId: owner,
              idempotencyKey: normalized.idempotencyKey,
            },
          },
        });
        if (command) {
          if (command.requestHash !== requestHash) {
            throw new AnchorCorrectionError('invalid_input', '同一请求标识不能用于不同的纠正内容。');
          }
          const replayed = await this.prisma.anchorCorrection.findUnique({
            where: { id: command.correctionId },
          });
          return mapCommandReplay(command, replayed);
        }
        throw new AnchorCorrectionError('version_conflict', '纠正内容已被其他请求更新，请重新读取后再提交。');
      }
      throw error;
    }
  }
}
