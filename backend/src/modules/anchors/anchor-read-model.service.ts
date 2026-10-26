import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { createHash } from 'node:crypto';
import { PrismaService } from '../../common/prisma.service';

export const ANCHOR_PAGE_SIZES = [10, 20, 50, 100] as const;

export type PersistedAnchor = {
  id: string;
  anchorId: string;
  tagId: string;
  sourceBlockId: string;
  excerpt: string;
  source: 'provider';
};

export type AnchorExtractionRun = {
  diaryId: string;
  diaryVersion: number;
  requestId: string;
  attempt: number;
  status: 'pending' | 'succeeded' | 'failed';
  failureCode?: 'timeout' | 'cancelled' | 'provider_failed';
  source?: 'provider';
  anchors: PersistedAnchor[];
};

export type AnchorsByTagPage = {
  items: Array<PersistedAnchor & {
    diary: {
      id: string;
      version: number;
      title: string;
      date: string;
      coverPhotoId: string;
    };
  }>;
  tagId: string;
  page: number;
  pageSize: typeof ANCHOR_PAGE_SIZES[number];
  total: number;
};

export type ProviderAnchorResult = {
  requestId: string;
  diaryId: string;
  diaryVersion: number;
  source: 'provider';
  anchors: Array<{
    id: string;
    tagId: string;
    sourceBlockId: string;
    excerpt: string;
  }>;
};

export class AnchorReadModelError extends Error {
  constructor(
    readonly code: 'not_found' | 'invalid_input' | 'version_conflict' | 'permission_denied' | 'provider_failed',
    message: string,
  ) {
    super(message);
    this.name = 'AnchorReadModelError';
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function normalizeIdentifier(value: unknown, field: string) {
  if (typeof value !== 'string' || !value.trim() || value.trim().length > 191) {
    throw new AnchorReadModelError('invalid_input', `请求中的 ${field} 无效。`);
  }
  return value.trim();
}

function normalizePositiveInteger(value: unknown, field: string) {
  if (!Number.isSafeInteger(value) || (value as number) < 1) {
    throw new AnchorReadModelError('invalid_input', `请求中的 ${field} 无效。`);
  }
  return value as number;
}

function currentSourceBlocks(snapshot: unknown) {
  if (!isRecord(snapshot) || !Array.isArray(snapshot.blocks)) {
    throw new AnchorReadModelError('invalid_input', '日记正文快照不可用。');
  }
  const blocks = snapshot.blocks.filter((block): block is Record<string, unknown> =>
    isRecord(block)
    && (block.type === 'text' || block.type === 'quote')
    && typeof block.id === 'string'
    && !!block.id.trim()
    && typeof block.content === 'string'
    && !!block.content.trim(),
  );
  if (blocks.length === 0) {
    throw new AnchorReadModelError('invalid_input', '日记没有可提取的正文段落。');
  }
  return blocks;
}

function snapshotHash(blocks: Array<Record<string, unknown>>) {
  return createHash('sha256')
    .update(JSON.stringify(blocks.map(block => ({
      id: block.id,
      type: block.type,
      content: block.content,
    }))))
    .digest('hex');
}

function resultHash(result: ProviderAnchorResult) {
  const anchors = [...result.anchors]
    .sort((left, right) => left.id.localeCompare(right.id))
    .map(anchor => ({
      id: anchor.id,
      tagId: anchor.tagId,
      sourceBlockId: anchor.sourceBlockId,
      excerpt: anchor.excerpt,
    }));
  return createHash('sha256')
    .update(JSON.stringify([result.diaryId, result.diaryVersion, result.requestId, anchors]))
    .digest('hex');
}

function validateProviderResult(value: unknown): asserts value is ProviderAnchorResult {
  if (!isRecord(value)
    || typeof value.requestId !== 'string'
    || !value.requestId.trim()
    || typeof value.diaryId !== 'string'
    || !value.diaryId.trim()
    || !Number.isSafeInteger(value.diaryVersion)
    || (value.diaryVersion as number) < 1
    || value.source !== 'provider'
    || !Array.isArray(value.anchors)) {
    throw new AnchorReadModelError('invalid_input', '锚点提取结果无效。');
  }
  const ids = new Set<string>();
  for (const anchor of value.anchors) {
    if (!isRecord(anchor)
      || typeof anchor.id !== 'string'
      || !anchor.id.trim()
      || ids.has(anchor.id)
      || typeof anchor.tagId !== 'string'
      || !anchor.tagId.trim()
      || typeof anchor.sourceBlockId !== 'string'
      || !anchor.sourceBlockId.trim()
      || typeof anchor.excerpt !== 'string'
      || !anchor.excerpt.trim()) {
      throw new AnchorReadModelError('invalid_input', '锚点提取结果包含无效或重复记录。');
    }
    ids.add(anchor.id);
  }
}

function assertTrustedProviderRuntime() {
  if (process.env.NODE_ENV !== 'test') {
    throw new AnchorReadModelError('provider_failed', '当前运行环境尚未配置可信的锚点提取服务。');
  }
}

async function lockDiary(transaction: Prisma.TransactionClient, diaryId: string) {
  await transaction.$queryRaw<Array<{ id: string }>>(Prisma.sql`
    SELECT \`id\` FROM \`Diary\` WHERE \`id\` = ${diaryId} FOR UPDATE
  `);
  return transaction.diary.findUnique({ where: { id: diaryId } });
}

function mapAnchor(record: {
  id: string;
  anchorId: string;
  tagId: string;
  sourceBlockId: string;
  excerpt: string;
  source: string;
}): PersistedAnchor {
  return {
    id: record.id,
    anchorId: record.anchorId,
    tagId: record.tagId,
    sourceBlockId: record.sourceBlockId,
    excerpt: record.excerpt,
    source: record.source as 'provider',
  };
}

@Injectable()
export class AnchorReadModelService {
  constructor(private readonly prisma: PrismaService) {}

  async beginExtraction(input: {
    diaryId: string;
    diaryVersion: number;
    requestId: string;
    attempt: number;
  }, ownerDeviceId: string): Promise<AnchorExtractionRun> {
    assertTrustedProviderRuntime();
    const diaryId = normalizeIdentifier(input.diaryId, 'diaryId');
    const diaryVersion = normalizePositiveInteger(input.diaryVersion, 'diaryVersion');
    const requestId = normalizeIdentifier(input.requestId, 'requestId');
    const attempt = normalizePositiveInteger(input.attempt, 'attempt');
    const owner = normalizeIdentifier(ownerDeviceId, 'ownerDeviceId');

    return this.prisma.$transaction(async transaction => {
      const diary = await lockDiary(transaction, diaryId);
      if (!diary) throw new AnchorReadModelError('not_found', '日记不存在。');
      if (diary.ownerDeviceId !== owner) {
        throw new AnchorReadModelError('permission_denied', '日记不属于当前设备。');
      }
      if (diary.version !== diaryVersion) {
        throw new AnchorReadModelError('version_conflict', '日记已更新，请重新读取后再提取。');
      }
      const blocks = currentSourceBlocks(diary.contentSnapshot);
      const sourceHash = snapshotHash(blocks);
      const uniqueVersion = {
        ownerDeviceId_diaryId_diaryVersion: {
          ownerDeviceId: owner,
          diaryId,
          diaryVersion,
        },
      };
      const existing = await transaction.diaryAnchorExtraction.findUnique({
        where: uniqueVersion,
        include: { anchors: true },
      });
      if (existing) {
        if (existing.sourceHash !== sourceHash) {
          throw new AnchorReadModelError('version_conflict', '同一日记版本对应的正文快照已变化。');
        }
        if (existing.requestId !== requestId) {
          throw new AnchorReadModelError('version_conflict', '该日记版本已有提取请求。');
        }
        if (existing.status === 'succeeded' || (existing.status === 'pending' && existing.attempt === attempt)) {
          return this.mapRun(existing);
        }
        if (existing.status !== 'failed' || attempt !== existing.attempt + 1) {
          throw new AnchorReadModelError('version_conflict', '锚点提取轮次已更新。');
        }
        const updated = await transaction.diaryAnchorExtraction.update({
          where: { id: existing.id },
          data: { attempt, status: 'pending', failureCode: null },
          include: { anchors: true },
        });
        return this.mapRun(updated);
      }

      const requestCollision = await transaction.diaryAnchorExtraction.findUnique({
        where: {
          ownerDeviceId_requestId: {
            ownerDeviceId: owner,
            requestId,
          },
        },
      });
      if (requestCollision) {
        throw new AnchorReadModelError('invalid_input', '提取请求标识已用于其他日记。');
      }
      const created = await transaction.diaryAnchorExtraction.create({
        data: {
          ownerDeviceId: owner,
          diaryId,
          diaryVersion,
          requestId,
          sourceHash,
          attempt,
          status: 'pending',
        },
        include: { anchors: true },
      });
      return this.mapRun(created);
    });
  }

  async completeExtraction(input: {
    attempt: number;
    result: unknown;
  }, ownerDeviceId: string): Promise<AnchorExtractionRun> {
    assertTrustedProviderRuntime();
    const attempt = normalizePositiveInteger(input.attempt, 'attempt');
    validateProviderResult(input.result);
    const result = input.result;
    const owner = normalizeIdentifier(ownerDeviceId, 'ownerDeviceId');
    const diaryId = normalizeIdentifier(result.diaryId, 'diaryId');
    const requestId = normalizeIdentifier(result.requestId, 'requestId');
    const diaryVersion = normalizePositiveInteger(result.diaryVersion, 'diaryVersion');
    const normalizedAnchors = result.anchors.map(anchor => ({
      id: normalizeIdentifier(anchor.id, 'anchorId'),
      tagId: normalizeIdentifier(anchor.tagId, 'tagId'),
      sourceBlockId: normalizeIdentifier(anchor.sourceBlockId, 'sourceBlockId'),
      excerpt: anchor.excerpt.trim(),
    }));
    const hash = resultHash({ ...result, anchors: normalizedAnchors });

    return this.prisma.$transaction(async transaction => {
      const diary = await lockDiary(transaction, diaryId);
      if (!diary) throw new AnchorReadModelError('not_found', '日记不存在。');
      if (diary.ownerDeviceId !== owner) {
        throw new AnchorReadModelError('permission_denied', '日记不属于当前设备。');
      }
      if (diary.version !== diaryVersion) {
        throw new AnchorReadModelError('version_conflict', '日记已更新，旧版本锚点不能写入。');
      }
      const sourceBlocks = currentSourceBlocks(diary.contentSnapshot);
      const sourceBlockIds = new Set(sourceBlocks.map(block => String(block.id)));
      if (normalizedAnchors.some(anchor => !sourceBlockIds.has(anchor.sourceBlockId))) {
        throw new AnchorReadModelError('invalid_input', '锚点引用了当前日记中不存在的正文段落。');
      }
      const run = await transaction.diaryAnchorExtraction.findUnique({
        where: {
          ownerDeviceId_diaryId_diaryVersion: {
            ownerDeviceId: owner,
            diaryId,
            diaryVersion,
          },
        },
        include: { anchors: true },
      });
      if (!run || run.requestId !== requestId) {
        throw new AnchorReadModelError('not_found', '锚点提取请求不存在。');
      }
      if (run.sourceHash !== snapshotHash(sourceBlocks)) {
        throw new AnchorReadModelError('version_conflict', '提取来源快照已变化。');
      }
      if (run.status === 'succeeded') {
        if (run.resultHash !== hash) {
          throw new AnchorReadModelError('version_conflict', '该版本锚点结果已经提交。');
        }
        return this.mapRun(run);
      }
      if (run.status !== 'pending' || run.attempt !== attempt) {
        throw new AnchorReadModelError('version_conflict', '锚点提取轮次已更新。');
      }

      for (const anchor of normalizedAnchors) {
        await transaction.diaryAnchor.create({
          data: {
            anchorId: anchor.id,
            ownerDeviceId: owner,
            diaryId,
            diaryVersion,
            extractionId: run.id,
            tagId: anchor.tagId,
            sourceBlockId: anchor.sourceBlockId,
            excerpt: anchor.excerpt,
            source: 'provider',
          },
        });
      }
      const updated = await transaction.diaryAnchorExtraction.update({
        where: { id: run.id },
        data: {
          status: 'succeeded',
          source: 'provider',
          resultHash: hash,
          failureCode: null,
        },
        include: { anchors: true },
      });
      return this.mapRun(updated);
    });
  }

  async failExtraction(input: {
    diaryId: string;
    diaryVersion: number;
    requestId: string;
    attempt: number;
    failureCode: 'timeout' | 'cancelled' | 'provider_failed';
  }, ownerDeviceId: string): Promise<AnchorExtractionRun> {
    assertTrustedProviderRuntime();
    const diaryId = normalizeIdentifier(input.diaryId, 'diaryId');
    const diaryVersion = normalizePositiveInteger(input.diaryVersion, 'diaryVersion');
    const requestId = normalizeIdentifier(input.requestId, 'requestId');
    const attempt = normalizePositiveInteger(input.attempt, 'attempt');
    if (!['timeout', 'cancelled', 'provider_failed'].includes(input.failureCode)) {
      throw new AnchorReadModelError('invalid_input', '提取失败类型无效。');
    }
    const owner = normalizeIdentifier(ownerDeviceId, 'ownerDeviceId');
    return this.prisma.$transaction(async transaction => {
      const diary = await lockDiary(transaction, diaryId);
      if (!diary) throw new AnchorReadModelError('not_found', '日记不存在。');
      if (diary.ownerDeviceId !== owner) {
        throw new AnchorReadModelError('permission_denied', '日记不属于当前设备。');
      }
      if (diary.version !== diaryVersion) {
        throw new AnchorReadModelError('version_conflict', '日记已更新，旧版本提取失败不能覆盖新版本。');
      }
      const run = await transaction.diaryAnchorExtraction.findUnique({
        where: {
          ownerDeviceId_diaryId_diaryVersion: {
            ownerDeviceId: owner,
            diaryId,
            diaryVersion,
          },
        },
        include: { anchors: true },
      });
      if (!run || run.requestId !== requestId) {
        throw new AnchorReadModelError('not_found', '锚点提取请求不存在。');
      }
      if (run.status === 'failed' && run.attempt === attempt && run.failureCode === input.failureCode) {
        return this.mapRun(run);
      }
      if (run.status !== 'pending' || run.attempt !== attempt) {
        throw new AnchorReadModelError('version_conflict', '锚点提取轮次已更新。');
      }
      const updated = await transaction.diaryAnchorExtraction.update({
        where: { id: run.id },
        data: { status: 'failed', failureCode: input.failureCode },
        include: { anchors: true },
      });
      return this.mapRun(updated);
    });
  }

  async listByTag(input: unknown, ownerDeviceId: string): Promise<AnchorsByTagPage> {
    const owner = normalizeIdentifier(ownerDeviceId, 'ownerDeviceId');
    if (!isRecord(input)) {
      throw new AnchorReadModelError('invalid_input', '锚点查询条件无效。');
    }
    const tagId = normalizeIdentifier(input.tagId, 'tagId');
    if (typeof input.page !== 'number'
      || !Number.isSafeInteger(input.page)
      || input.page < 1
      || typeof input.pageSize !== 'number'
      || !ANCHOR_PAGE_SIZES.includes(input.pageSize as typeof ANCHOR_PAGE_SIZES[number])) {
      throw new AnchorReadModelError('invalid_input', '锚点分页条件无效。');
    }
    const page = input.page;
    const pageSize = input.pageSize as typeof ANCHOR_PAGE_SIZES[number];
    const start = (page - 1) * pageSize;
    if (!Number.isSafeInteger(start)) throw new AnchorReadModelError('invalid_input', '锚点页码超出范围。');
    const fromAndWhere = Prisma.sql`
      FROM \`DiaryAnchor\` AS a
      INNER JOIN \`DiaryAnchorExtraction\` AS e
        ON e.\`id\` = a.\`extractionId\`
        AND e.\`ownerDeviceId\` = a.\`ownerDeviceId\`
        AND e.\`status\` = 'succeeded'
        AND e.\`source\` = 'provider'
      INNER JOIN \`Diary\` AS d
        ON d.\`id\` = a.\`diaryId\`
        AND d.\`ownerDeviceId\` = a.\`ownerDeviceId\`
        AND d.\`version\` = a.\`diaryVersion\`
      INNER JOIN JSON_TABLE(
        d.\`contentSnapshot\`,
        '$.blocks[*]' COLUMNS (
          \`blockId\` VARCHAR(191) PATH '$.id' NULL ON EMPTY,
          \`blockType\` VARCHAR(32) PATH '$.type' NULL ON EMPTY,
          \`blockContent\` LONGTEXT PATH '$.content' NULL ON EMPTY
        )
      ) AS source_block
        ON source_block.\`blockId\` COLLATE utf8mb4_unicode_ci = a.\`sourceBlockId\`
        AND source_block.\`blockType\` IN ('text', 'quote')
        AND source_block.\`blockContent\` IS NOT NULL
        AND CHAR_LENGTH(TRIM(source_block.\`blockContent\`)) > 0
      WHERE a.\`ownerDeviceId\` = ${owner}
        AND a.\`tagId\` = ${tagId}
        AND a.\`source\` = 'provider'
    `;
    return this.prisma.$transaction(async transaction => {
      const counts = await transaction.$queryRaw<Array<{ total: bigint | number }>>(Prisma.sql`
        SELECT COUNT(DISTINCT a.\`id\`) AS total
        ${fromAndWhere}
      `);
      const rows = await transaction.$queryRaw<Array<{
        id: string;
        anchorId: string;
        tagId: string;
        sourceBlockId: string;
        excerpt: string;
        source: string;
        diaryId: string;
        diaryVersion: number;
        title: string;
        diaryDate: Date;
        coverPhotoId: string | null;
      }>>(Prisma.sql`
        SELECT DISTINCT
          a.\`id\`,
          a.\`anchorId\`,
          a.\`tagId\`,
          a.\`sourceBlockId\`,
          a.\`excerpt\`,
          a.\`source\`,
          d.\`id\` AS \`diaryId\`,
          d.\`version\` AS \`diaryVersion\`,
          d.\`title\`,
          d.\`createdAt\` AS \`diaryDate\`,
          JSON_UNQUOTE(JSON_EXTRACT(d.\`contentSnapshot\`, '$.coverPhotoId')) AS \`coverPhotoId\`
        ${fromAndWhere}
        ORDER BY d.\`createdAt\` DESC, d.\`id\` ASC, a.\`anchorId\` ASC, a.\`id\` ASC
        LIMIT ${pageSize} OFFSET ${start}
      `);
      return {
        items: rows.map(row => ({
          ...mapAnchor(row),
          diary: {
            id: row.diaryId,
            version: row.diaryVersion,
            title: row.title,
            date: row.diaryDate.toISOString(),
            coverPhotoId: row.coverPhotoId ?? '',
          },
        })),
        tagId,
        page,
        pageSize,
        total: Number(counts[0]?.total ?? 0),
      };
    }, { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead });
  }

  private mapRun(record: {
    diaryId: string;
    diaryVersion: number;
    requestId: string;
    attempt: number;
    status: string;
    failureCode: string | null;
    source: string | null;
    anchors: Array<{
      id: string;
      anchorId: string;
      tagId: string;
      sourceBlockId: string;
      excerpt: string;
      source: string;
    }>;
  }): AnchorExtractionRun {
    return {
      diaryId: record.diaryId,
      diaryVersion: record.diaryVersion,
      requestId: record.requestId,
      attempt: record.attempt,
      status: record.status as AnchorExtractionRun['status'],
      ...(record.failureCode === 'timeout'
        || record.failureCode === 'cancelled'
        || record.failureCode === 'provider_failed'
        ? { failureCode: record.failureCode }
        : {}),
      ...(record.source === 'provider' ? { source: 'provider' as const } : {}),
      anchors: record.anchors.map(mapAnchor),
    };
  }
}
