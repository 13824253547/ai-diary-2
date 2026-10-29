import type { AnchorExtractionResult } from './anchor-contract';
import { isPetChatMessage, type PetChatMessage } from './pet-chat-contract';

export const ANCHOR_READ_MODEL_CONTRACT_VERSION = 'anchor-extraction-v1';
export const MEMORY_ANCHOR_FEED_VERSION = 'memory-anchor-v1';
export const ANCHOR_READ_PAGE_SIZES = [10, 20, 50, 100] as const;

export type ProviderAnchorResult = Omit<AnchorExtractionResult, 'source'> & {
  source: 'provider';
};

export type PersistedAnchorRecord = {
  id: string;
  anchorId: string;
  tagId: string;
  sourceBlockId: string;
  excerpt: string;
  source: 'provider';
  diary: {
    id: string;
    version: number;
    title: string;
    date: string;
    coverPhotoId: string;
  };
};

export type AnchorExtractionRunRecord = {
  diaryId: string;
  diaryVersion: number;
  requestId: string;
  attempt: number;
  status: 'pending' | 'succeeded' | 'failed';
  failureCode?: 'timeout' | 'cancelled' | 'provider_failed';
  source?: 'provider';
  anchors: Array<{
    id: string;
    anchorId: string;
    tagId: string;
    sourceBlockId: string;
    excerpt: string;
    source: 'provider';
  }>;
};

export type AnchorsByTagPage = {
  items: PersistedAnchorRecord[];
  tagId: string;
  page: number;
  pageSize: typeof ANCHOR_READ_PAGE_SIZES[number];
  total: number;
};

export type MemoryAnchorFeedRecord = {
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
  items: MemoryAnchorFeedRecord[];
  tagId: string | null;
  page: number;
  pageSize: typeof ANCHOR_READ_PAGE_SIZES[number];
  total: number;
};

export type MemoryAnchorSummary = { total: number };

export type ChatAnchorHistoryPage = {
  batchId: string;
  sourceVersion: string;
  sourceDateStart: string;
  sourceDateEnd: string;
  items: PetChatMessage[];
  page: number;
  pageSize: typeof ANCHOR_READ_PAGE_SIZES[number];
  total: number;
};

export function isChatAnchorHistoryPage(value: unknown): value is ChatAnchorHistoryPage {
  if (!isRecord(value) || !isNonEmptyString(value.batchId) || !isNonEmptyString(value.sourceVersion)
    || !isDate(value.sourceDateStart) || !isDate(value.sourceDateEnd)
    || !isPositiveInteger(value.page)
    || !ANCHOR_READ_PAGE_SIZES.includes(value.pageSize as typeof ANCHOR_READ_PAGE_SIZES[number])
    || !Number.isSafeInteger(value.total) || (value.total as number) < 1
    || !Array.isArray(value.items) || value.items.length > (value.pageSize as number)
    || !value.items.every(isPetChatMessage)) return false;
  const ids = value.items.map(item => item.id);
  return new Set(ids).size === ids.length
    && value.items.length === Math.min(value.pageSize as number,
      Math.max(0, (value.total as number) - ((value.page as number) - 1) * (value.pageSize as number)));
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

function isPositiveInteger(value: unknown) {
  return Number.isSafeInteger(value) && (value as number) > 0;
}

function isDate(value: unknown) {
  return typeof value === 'string' && Number.isFinite(Date.parse(value));
}

function isPersistedAnchor(value: unknown): value is PersistedAnchorRecord {
  if (!isRecord(value) || !isRecord(value.diary)) return false;
  return isNonEmptyString(value.id)
    && isNonEmptyString(value.anchorId)
    && isNonEmptyString(value.tagId)
    && isNonEmptyString(value.sourceBlockId)
    && isNonEmptyString(value.excerpt)
    && value.source === 'provider'
    && isNonEmptyString(value.diary.id)
    && isPositiveInteger(value.diary.version)
    && typeof value.diary.title === 'string'
    && isDate(value.diary.date)
    && isNonEmptyString(value.diary.coverPhotoId);
}

export function isAnchorExtractionRunRecord(value: unknown): value is AnchorExtractionRunRecord {
  if (!isRecord(value)
    || !isNonEmptyString(value.diaryId)
    || !isPositiveInteger(value.diaryVersion)
    || !isNonEmptyString(value.requestId)
    || !isPositiveInteger(value.attempt)
    || (value.status !== 'pending' && value.status !== 'succeeded' && value.status !== 'failed')
    || !Array.isArray(value.anchors)) return false;
  if (value.failureCode !== undefined
    && value.failureCode !== 'timeout'
    && value.failureCode !== 'cancelled'
    && value.failureCode !== 'provider_failed') return false;
  if (value.source !== undefined && value.source !== 'provider') return false;
  if (value.status === 'succeeded' && value.source !== 'provider') return false;
  if (value.status === 'failed' && value.failureCode === undefined) return false;
  const anchorIds = new Set<string>();
  return value.anchors.every(anchor => {
    if (!isRecord(anchor)
      || !isNonEmptyString(anchor.id)
      || !isNonEmptyString(anchor.anchorId)
      || anchorIds.has(anchor.anchorId)
      || !isNonEmptyString(anchor.tagId)
      || !isNonEmptyString(anchor.sourceBlockId)
      || !isNonEmptyString(anchor.excerpt)
      || anchor.source !== 'provider') return false;
    anchorIds.add(anchor.anchorId);
    return true;
  });
}

export function isAnchorsByTagPage(value: unknown): value is AnchorsByTagPage {
  return isRecord(value)
    && Array.isArray(value.items)
    && isNonEmptyString(value.tagId)
    && value.items.every(item => isPersistedAnchor(item) && item.tagId === value.tagId)
    && isPositiveInteger(value.page)
    && ANCHOR_READ_PAGE_SIZES.includes(value.pageSize as typeof ANCHOR_READ_PAGE_SIZES[number])
    && value.items.length <= (value.pageSize as number)
    && Number.isSafeInteger(value.total)
    && (value.total as number) >= 0;
}

function isMemoryAnchorFeedRecord(value: unknown): value is MemoryAnchorFeedRecord {
  if (!isRecord(value)
    || !isNonEmptyString(value.id)
    || !isNonEmptyString(value.anchorId)
    || (value.sourceType !== 'diary' && value.sourceType !== 'chat')
    || !isNonEmptyString(value.tagId)
    || typeof value.title !== 'string'
    || !isDate(value.displayDate)
    || !isNonEmptyString(value.excerpt)
    || (value.correction !== undefined
      && (typeof value.correction !== 'string' || !value.correction.trim()))
    || (value.correctionVersion !== undefined && !isPositiveInteger(value.correctionVersion))) {
    return false;
  }
  if (value.sourceType === 'diary') {
    return isRecord(value.diary)
      && isNonEmptyString(value.diary.id)
      && isPositiveInteger(value.diary.version)
      && typeof value.diary.coverPhotoId === 'string'
      && isNonEmptyString(value.sourceBlockId)
      && Array.isArray(value.sourceBlockIds)
      && value.sourceBlockIds.length > 0
      && value.sourceBlockIds.every(isNonEmptyString);
  }
  return isRecord(value.chat)
    && isNonEmptyString(value.chat.batchId)
    && isDate(value.chat.sourceDateStart)
    && isDate(value.chat.sourceDateEnd)
    && Array.isArray(value.chat.sourceMessages)
    && value.chat.sourceMessages.length > 0
    && value.chat.sourceMessages.every(message =>
      isRecord(message)
      && isNonEmptyString(message.conversationId)
      && isNonEmptyString(message.messageId));
}

export function isMemoryAnchorFeedPage(value: unknown): value is MemoryAnchorFeedPage {
  return isRecord(value)
    && Array.isArray(value.items)
    && value.items.every(isMemoryAnchorFeedRecord)
    && (value.tagId === null || isNonEmptyString(value.tagId))
    && isPositiveInteger(value.page)
    && ANCHOR_READ_PAGE_SIZES.includes(value.pageSize as typeof ANCHOR_READ_PAGE_SIZES[number])
    && value.items.length <= (value.pageSize as number)
    && Number.isSafeInteger(value.total)
    && (value.total as number) >= 0;
}

export function isMemoryAnchorSummary(value: unknown): value is MemoryAnchorSummary {
  return isRecord(value)
    && Number.isSafeInteger(value.total)
    && (value.total as number) >= 0;
}
