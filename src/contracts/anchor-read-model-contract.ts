import type { AnchorExtractionResult } from './anchor-contract';

export const ANCHOR_READ_MODEL_CONTRACT_VERSION = 'anchor-extraction-v1';
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
