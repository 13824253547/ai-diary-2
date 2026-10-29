import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { createHash } from 'node:crypto';
import { PrismaService } from '../../common/prisma.service';

export const ANCHOR_PAGE_SIZES = [10, 20, 50, 100] as const;
export const SERVER_ANCHOR_PROVIDER_ACCESS = Symbol('server-anchor-provider-access');
type TrustedAnchorProviderAccess = typeof SERVER_ANCHOR_PROVIDER_ACCESS;

export type PersistedAnchor = {
  id: string;
  anchorId: string;
  tagId: string;
  sourceBlockId: string;
  sourceBlockIds: string[];
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

export type MemoryAnchorFeedItem = {
  id: string;
  anchorId: string;
  sourceType: 'diary' | 'chat';
  tagId: string;
  title: string;
  displayDate: string;
  excerpt: string;
  correction?: string;
  correctionVersion?: number;
  diary?: {
    id: string;
    version: number;
    coverPhotoId: string;
  };
  chat?: {
    batchId: string;
    sourceDateStart: string;
    sourceDateEnd: string;
    sourceMessages: Array<{ conversationId: string; messageId: string }>;
  };
  sourceBlockId?: string;
  sourceBlockIds?: string[];
};

export type MemoryAnchorFeedPage = {
  items: MemoryAnchorFeedItem[];
  tagId: string | null;
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
    sourceBlockIds?: string[];
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
      sourceBlockIds: anchor.sourceBlockIds ?? [anchor.sourceBlockId],
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
    || (anchor.sourceBlockIds !== undefined
      && (!Array.isArray(anchor.sourceBlockIds)
        || anchor.sourceBlockIds.length === 0
        || anchor.sourceBlockIds.some(id => typeof id !== 'string' || !id.trim())
        || new Set(anchor.sourceBlockIds).size !== anchor.sourceBlockIds.length))
      || typeof anchor.excerpt !== 'string'
      || !anchor.excerpt.trim()) {
      throw new AnchorReadModelError('invalid_input', '锚点提取结果包含无效或重复记录。');
    }
    ids.add(anchor.id);
  }
}

function assertTrustedProviderRuntime(access?: TrustedAnchorProviderAccess) {
  if (process.env.NODE_ENV !== 'test' && access !== SERVER_ANCHOR_PROVIDER_ACCESS) {
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
  sourceBlockIds?: unknown;
  excerpt: string;
  source: string;
}): PersistedAnchor {
  const sourceBlockIds = Array.isArray(record.sourceBlockIds)
    ? record.sourceBlockIds.filter((id): id is string => typeof id === 'string' && !!id.trim())
    : [];
  return {
    id: record.id,
    anchorId: record.anchorId,
    tagId: record.tagId,
    sourceBlockId: record.sourceBlockId,
    sourceBlockIds: sourceBlockIds.length ? sourceBlockIds : [record.sourceBlockId],
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
  }, ownerDeviceId: string, access?: TrustedAnchorProviderAccess): Promise<AnchorExtractionRun> {
    assertTrustedProviderRuntime(access);
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
  }, ownerDeviceId: string, access?: TrustedAnchorProviderAccess): Promise<AnchorExtractionRun> {
    assertTrustedProviderRuntime(access);
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
      sourceBlockIds: [...new Set((anchor.sourceBlockIds ?? [anchor.sourceBlockId])
        .map(blockId => normalizeIdentifier(blockId, 'sourceBlockId')))],
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
      if (normalizedAnchors.some(anchor =>
        anchor.sourceBlockIds.some(sourceBlockId => !sourceBlockIds.has(sourceBlockId))
        || !anchor.sourceBlockIds.includes(anchor.sourceBlockId))) {
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
            sourceBlockIds: anchor.sourceBlockIds,
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
  }, ownerDeviceId: string, access?: TrustedAnchorProviderAccess): Promise<AnchorExtractionRun> {
    assertTrustedProviderRuntime(access);
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
        sourceBlockIds: unknown;
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
          a.\`sourceBlockIds\`,
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

  async listFeed(input: unknown, ownerDeviceId: string): Promise<MemoryAnchorFeedPage> {
    const owner = normalizeIdentifier(ownerDeviceId, 'ownerDeviceId');
    if (!isRecord(input)) throw new AnchorReadModelError('invalid_input', '锚点查询条件无效。');
    const tagId = input.tagId === undefined ? null : normalizeIdentifier(input.tagId, 'tagId');
    if (input.sourceType !== undefined && input.sourceType !== 'diary' && input.sourceType !== 'chat') {
      throw new AnchorReadModelError('invalid_input', '锚点来源无效。');
    }
    const sourceFilter = input.sourceType
      ? Prisma.sql`WHERE \`sourceType\` = ${input.sourceType}`
      : Prisma.empty;
    if (typeof input.page !== 'number'
      || !Number.isSafeInteger(input.page)
      || input.page < 1
      || typeof input.pageSize !== 'number'
      || !ANCHOR_PAGE_SIZES.includes(input.pageSize as typeof ANCHOR_PAGE_SIZES[number])) {
      throw new AnchorReadModelError('invalid_input', '锚点分页条件无效。');
    }
    const page = input.page;
    const pageSize = input.pageSize as typeof ANCHOR_PAGE_SIZES[number];
    const offset = (page - 1) * pageSize;
    if (!Number.isSafeInteger(offset)) throw new AnchorReadModelError('invalid_input', '锚点页码超出范围。');

    const diaryTagFilter = tagId ? Prisma.sql`AND a.\`tagId\` = ${tagId}` : Prisma.empty;
    const chatTagFilter = tagId ? Prisma.sql`AND ca.\`tagId\` = ${tagId}` : Prisma.empty;
    const validDiarySources = Prisma.sql`
      SELECT checked_anchor.\`id\`
      FROM \`DiaryAnchor\` AS checked_anchor
      INNER JOIN \`Diary\` AS checked_diary
        ON checked_diary.\`id\` = checked_anchor.\`diaryId\`
        AND checked_diary.\`ownerDeviceId\` = checked_anchor.\`ownerDeviceId\`
        AND checked_diary.\`version\` = checked_anchor.\`diaryVersion\`
      INNER JOIN JSON_TABLE(
        COALESCE(checked_anchor.\`sourceBlockIds\`, JSON_ARRAY(checked_anchor.\`sourceBlockId\`)),
        '$[*]' COLUMNS (\`blockId\` VARCHAR(191) PATH '$' NULL ON EMPTY)
      ) AS checked_source
        ON checked_source.\`blockId\` IS NOT NULL
      INNER JOIN JSON_TABLE(
        checked_diary.\`contentSnapshot\`,
        '$.blocks[*]' COLUMNS (
          \`blockId\` VARCHAR(191) PATH '$.id' NULL ON EMPTY,
          \`blockType\` VARCHAR(32) PATH '$.type' NULL ON EMPTY,
          \`blockContent\` LONGTEXT PATH '$.content' NULL ON EMPTY
        )
      ) AS current_source
        ON current_source.\`blockId\` COLLATE utf8mb4_unicode_ci
          = checked_source.\`blockId\` COLLATE utf8mb4_unicode_ci
        AND current_source.\`blockType\` IN ('text', 'quote')
        AND current_source.\`blockContent\` IS NOT NULL
        AND CHAR_LENGTH(TRIM(current_source.\`blockContent\`)) > 0
      WHERE checked_anchor.\`ownerDeviceId\` = ${owner}
      GROUP BY checked_anchor.\`id\`, checked_anchor.\`sourceBlockIds\`, checked_anchor.\`sourceBlockId\`
      HAVING COUNT(DISTINCT checked_source.\`blockId\`)
        = JSON_LENGTH(COALESCE(checked_anchor.\`sourceBlockIds\`, JSON_ARRAY(checked_anchor.\`sourceBlockId\`)))
    `;
    const validChatSources = Prisma.sql`
      SELECT source_batch.\`id\`
      FROM \`ChatDailyAnchor\` AS source_batch
      INNER JOIN \`ChatDailyAnchorSource\` AS source_link
        ON source_link.\`anchorBatchId\` = source_batch.\`id\`
        AND source_link.\`ownerDeviceId\` = source_batch.\`ownerDeviceId\`
      INNER JOIN \`ChatMessage\` AS source_message
        ON source_message.\`id\` = source_link.\`messageId\`
        AND source_message.\`conversationId\` = source_link.\`conversationId\`
      INNER JOIN \`ChatTurn\` AS source_turn
        ON source_turn.\`id\` = source_link.\`turnId\`
        AND source_turn.\`ownerDeviceId\` = source_batch.\`ownerDeviceId\`
        AND source_turn.\`memoryAnchorBatchId\` = source_batch.\`id\`
        AND source_turn.\`memoryEligible\` = 1
        AND source_turn.\`status\` = 'completed'
        AND source_turn.\`source\` = 'provider'
      INNER JOIN \`ChatConversation\` AS source_conversation
        ON source_conversation.\`id\` = source_link.\`conversationId\`
        AND source_conversation.\`ownerDeviceId\` = source_batch.\`ownerDeviceId\`
      WHERE source_batch.\`ownerDeviceId\` = ${owner}
        AND source_batch.\`status\` = 'succeeded'
      GROUP BY source_batch.\`id\`, source_batch.\`sourceCount\`
      HAVING COUNT(DISTINCT source_link.\`messageId\`) = source_batch.\`sourceCount\`
    `;
    const union = Prisma.sql`
      SELECT
        CONCAT('diary:', a.\`id\`) AS \`id\`,
        a.\`anchorId\`,
        'diary' AS \`sourceType\`,
        a.\`tagId\`,
        d.\`title\`,
        d.\`createdAt\` AS \`displayDate\`,
        a.\`excerpt\`,
        correction.\`correction\`,
        correction.\`version\` AS \`correctionVersion\`,
        d.\`id\` AS \`diaryId\`,
        d.\`version\` AS \`diaryVersion\`,
        JSON_UNQUOTE(JSON_EXTRACT(d.\`contentSnapshot\`, '$.coverPhotoId')) AS \`coverPhotoId\`,
        a.\`sourceBlockId\`,
        COALESCE(a.\`sourceBlockIds\`, JSON_ARRAY(a.\`sourceBlockId\`)) AS \`sourceBlockIds\`,
        NULL AS \`chatBatchId\`,
        NULL AS \`sourceDateStart\`,
        NULL AS \`sourceDateEnd\`
      FROM \`DiaryAnchor\` AS a
      INNER JOIN \`DiaryAnchorExtraction\` AS extraction
        ON extraction.\`id\` = a.\`extractionId\`
        AND extraction.\`ownerDeviceId\` = a.\`ownerDeviceId\`
        AND extraction.\`status\` = 'succeeded'
        AND extraction.\`source\` = 'provider'
      INNER JOIN \`Diary\` AS d
        ON d.\`id\` = a.\`diaryId\`
        AND d.\`ownerDeviceId\` = a.\`ownerDeviceId\`
        AND d.\`version\` = a.\`diaryVersion\`
      INNER JOIN (${validDiarySources}) AS valid_source
        ON valid_source.\`id\` = a.\`id\`
      LEFT JOIN \`AnchorCorrection\` AS correction
        ON correction.\`ownerDeviceId\` = a.\`ownerDeviceId\`
        AND correction.\`diaryId\` = a.\`diaryId\`
        AND correction.\`anchorId\` = a.\`anchorId\`
        AND correction.\`sourceDiaryVersion\` = a.\`diaryVersion\`
      WHERE a.\`ownerDeviceId\` = ${owner}
        AND a.\`source\` = 'provider'
        ${diaryTagFilter}

      UNION ALL

      SELECT
        CONCAT('chat:', ca.\`id\`) AS \`id\`,
        ca.\`anchorId\`,
        'chat' AS \`sourceType\`,
        ca.\`tagId\`,
        '小橘的陪伴记忆' AS \`title\`,
        ca.\`generatedAt\` AS \`displayDate\`,
        ca.\`excerpt\`,
        chat_correction.\`correction\`,
        chat_correction.\`version\` AS \`correctionVersion\`,
        NULL AS \`diaryId\`,
        NULL AS \`diaryVersion\`,
        NULL AS \`coverPhotoId\`,
        NULL AS \`sourceBlockId\`,
        NULL AS \`sourceBlockIds\`,
        ca.\`id\` AS \`chatBatchId\`,
        ca.\`sourceDateStart\`,
        ca.\`sourceDateEnd\`
      FROM \`ChatDailyAnchor\` AS ca
      INNER JOIN (${validChatSources}) AS valid_chat_source
        ON valid_chat_source.\`id\` = ca.\`id\`
      LEFT JOIN \`ChatAnchorCorrection\` AS chat_correction
        ON chat_correction.\`ownerDeviceId\` = ca.\`ownerDeviceId\`
        AND chat_correction.\`anchorId\` = ca.\`anchorId\`
        AND chat_correction.\`anchorBatchId\` = ca.\`id\`
      WHERE ca.\`ownerDeviceId\` = ${owner}
        AND ca.\`status\` = 'succeeded'
        AND ca.\`tagId\` IS NOT NULL
        AND ca.\`excerpt\` IS NOT NULL
        ${chatTagFilter}
    `;

    return this.prisma.$transaction(async transaction => {
      const counts = await transaction.$queryRaw<Array<{ total: bigint | number }>>(Prisma.sql`
        SELECT COUNT(*) AS total FROM (${union}) AS memory_feed ${sourceFilter}
      `);
      const rows = await transaction.$queryRaw<Array<{
        id: string;
        anchorId: string;
        sourceType: 'diary' | 'chat';
        tagId: string;
        title: string;
        displayDate: Date;
        excerpt: string;
        correction: string | null;
        correctionVersion: number | null;
        diaryId: string | null;
        diaryVersion: number | null;
        coverPhotoId: string | null;
        sourceBlockId: string | null;
        sourceBlockIds: unknown;
        chatBatchId: string | null;
        sourceDateStart: string | null;
        sourceDateEnd: string | null;
      }>>(Prisma.sql`
        SELECT * FROM (${union}) AS memory_feed
        ${sourceFilter}
        ORDER BY \`displayDate\` DESC, \`sourceType\` ASC, \`anchorId\` ASC, \`id\` ASC
        LIMIT ${pageSize} OFFSET ${offset}
      `);
      const chatBatchIds = rows
        .filter(row => row.sourceType === 'chat' && row.chatBatchId)
        .map(row => row.chatBatchId!);
      const sourceRows = chatBatchIds.length
        ? await transaction.chatDailyAnchorSource.findMany({
          where: { ownerDeviceId: owner, anchorBatchId: { in: chatBatchIds } },
          orderBy: [
            { localDate: 'asc' },
            { conversationId: 'asc' },
            { turn: { sequence: 'asc' } },
            { message: { order: 'asc' } },
            { messageId: 'asc' },
          ],
          select: { anchorBatchId: true, conversationId: true, messageId: true },
        })
        : [];
      const sourcesByBatch = new Map<string, Array<{ conversationId: string; messageId: string }>>();
      for (const source of sourceRows) {
        const items = sourcesByBatch.get(source.anchorBatchId) ?? [];
        items.push({ conversationId: source.conversationId, messageId: source.messageId });
        sourcesByBatch.set(source.anchorBatchId, items);
      }
      return {
        items: rows.map(row => ({
          id: row.id,
          anchorId: row.anchorId,
          sourceType: row.sourceType,
          tagId: row.tagId,
          title: row.title,
          displayDate: row.displayDate.toISOString(),
          excerpt: row.excerpt,
          ...(row.correction ? {
            correction: row.correction,
            correctionVersion: row.correctionVersion ?? undefined,
          } : {}),
          ...(row.sourceType === 'diary' && row.diaryId && row.diaryVersion !== null
            ? {
              diary: {
                id: row.diaryId,
                version: row.diaryVersion,
                coverPhotoId: row.coverPhotoId ?? '',
              },
              sourceBlockId: row.sourceBlockId ?? undefined,
              sourceBlockIds: Array.isArray(row.sourceBlockIds)
                ? row.sourceBlockIds.filter((id): id is string => typeof id === 'string')
                : (row.sourceBlockId ? [row.sourceBlockId] : []),
            }
            : {}),
          ...(row.sourceType === 'chat' && row.chatBatchId && row.sourceDateStart && row.sourceDateEnd
            ? {
              chat: {
                batchId: row.chatBatchId,
                sourceDateStart: row.sourceDateStart,
                sourceDateEnd: row.sourceDateEnd,
                sourceMessages: sourcesByBatch.get(row.chatBatchId) ?? [],
              },
            }
            : {}),
        })),
        tagId,
        page,
        pageSize,
        total: Number(counts[0]?.total ?? 0),
      };
    }, { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead });
  }

  async getChatHistory(batchId: unknown, input: unknown, ownerDeviceId: string) {
    const owner = normalizeIdentifier(ownerDeviceId, 'ownerDeviceId');
    const id = normalizeIdentifier(batchId, 'batchId');
    if (!isRecord(input) || !Number.isSafeInteger(input.page) || (input.page as number) < 1
      || !ANCHOR_PAGE_SIZES.includes(input.pageSize as typeof ANCHOR_PAGE_SIZES[number])) {
      throw new AnchorReadModelError('invalid_input', '聊天记录分页条件无效。');
    }
    const page = input.page as number;
    const pageSize = input.pageSize as typeof ANCHOR_PAGE_SIZES[number];
    const offset = (page - 1) * pageSize;
    if (!Number.isSafeInteger(offset)) throw new AnchorReadModelError('invalid_input', '聊天记录页码超出范围。');
    return this.prisma.$transaction(async transaction => {
      const batch = await transaction.chatDailyAnchor.findFirst({
        where: { id, ownerDeviceId: owner, status: 'succeeded' },
        include: {
          sources: {
            include: { message: true, turn: { include: { conversation: true } } },
            orderBy: [
              { localDate: 'asc' }, { conversationId: 'asc' },
              { turn: { sequence: 'asc' } }, { message: { order: 'asc' } }, { messageId: 'asc' },
            ],
          },
        },
      });
      if (!batch) throw new AnchorReadModelError('not_found', '聊天锚点不存在或不可访问。');
      const sources = batch.sources;
      if (!sources.length || sources.length !== batch.sourceCount || sources.some(source =>
        source.ownerDeviceId !== owner || source.turn.ownerDeviceId !== owner
        || source.turn.conversation.ownerDeviceId !== owner
        || source.turn.memoryAnchorBatchId !== id || !source.turn.memoryEligible
        || source.turn.status !== 'completed' || source.turn.source !== 'provider'
        || source.conversationId !== source.message.conversationId
        || source.conversationId !== source.turn.conversationId
        || source.message.requestId !== source.turn.requestId
        || source.localDate !== source.turn.deviceLocalDate
        || source.localDate < batch.sourceDateStart || source.localDate > batch.sourceDateEnd
        || (source.message.role === 'user' ? source.message.id !== source.turn.userMessageId
          : source.message.role !== 'assistant' || source.message.id !== source.turn.assistantMessageId)
        || !source.message.text.trim()
      )) throw new AnchorReadModelError('not_found', '聊天锚点来源已失效。');
      // Keep the extraction order for fingerprint validation, then merge conversations chronologically.
      const sourceHash = createHash('sha256').update(JSON.stringify(sources.map(({ message }) =>
        [message.id, message.conversationId, message.requestId, message.role, message.text]))).digest('hex');
      if (sourceHash !== batch.sourceHash) {
        throw new AnchorReadModelError('version_conflict', '聊天锚点来源已更新。');
      }
      const ordered = [...sources].sort((left, right) =>
        left.localDate.localeCompare(right.localDate)
        || left.turn.createdAt.getTime() - right.turn.createdAt.getTime()
        || left.conversationId.localeCompare(right.conversationId)
        || left.turn.sequence - right.turn.sequence
        || left.message.order - right.message.order
        || left.messageId.localeCompare(right.messageId));
      return {
        batchId: id, sourceVersion: sourceHash,
        sourceDateStart: batch.sourceDateStart, sourceDateEnd: batch.sourceDateEnd,
        items: ordered.slice(offset, offset + pageSize).map(({ message }) => ({
          id: message.id, conversationId: message.conversationId, requestId: message.requestId,
          role: message.role as 'user' | 'assistant', text: message.text,
          createdAt: message.createdAt.toISOString(),
        })),
        page, pageSize, total: sources.length,
      };
    }, { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead });
  }

  async countFeed(ownerDeviceId: string): Promise<number> {
    const page = await this.listFeed({ page: 1, pageSize: ANCHOR_PAGE_SIZES[0] }, ownerDeviceId);
    return page.total;
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
      sourceBlockIds?: unknown;
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
