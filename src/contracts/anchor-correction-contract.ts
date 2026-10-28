export const ANCHOR_CORRECTION_CONTRACT_VERSION = 'anchor-correction-v1';

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

export type GetAnchorCorrectionQuery = {
  diaryId: string;
  diaryVersion: number;
  anchorId: string;
};

export type SaveAnchorCorrectionInput = GetAnchorCorrectionQuery & {
  sourceBlockId: string;
  correction: string;
  expectedVersion: number;
  idempotencyKey: string;
};

export type ChatAnchorCorrectionRecord = {
  id: string;
  anchorId: string;
  anchorBatchId: string;
  correction: string;
  version: number;
  source: 'user';
  updatedAt: string;
};

export type ChatAnchorCorrectionQuery = {
  anchorId: string;
  anchorBatchId: string;
};

export type SaveChatAnchorCorrectionInput = ChatAnchorCorrectionQuery & {
  correction: string;
  expectedVersion: number;
  idempotencyKey: string;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

export function isAnchorCorrectionRecord(value: unknown): value is AnchorCorrectionRecord {
  return isRecord(value)
    && isNonEmptyString(value.id)
    && isNonEmptyString(value.diaryId)
    && Number.isSafeInteger(value.diaryVersion)
    && (value.diaryVersion as number) > 0
    && isNonEmptyString(value.anchorId)
    && isNonEmptyString(value.sourceBlockId)
    && isNonEmptyString(value.correction)
    && Array.from(value.correction).length <= 240
    && Number.isSafeInteger(value.version)
    && (value.version as number) > 0
    && value.source === 'user'
    && typeof value.updatedAt === 'string'
    && Number.isFinite(Date.parse(value.updatedAt));
}

export function isChatAnchorCorrectionRecord(value: unknown): value is ChatAnchorCorrectionRecord {
  return isRecord(value)
    && isNonEmptyString(value.id)
    && isNonEmptyString(value.anchorId)
    && isNonEmptyString(value.anchorBatchId)
    && isNonEmptyString(value.correction)
    && Array.from(value.correction).length <= 240
    && Number.isSafeInteger(value.version)
    && (value.version as number) > 0
    && value.source === 'user'
    && typeof value.updatedAt === 'string'
    && Number.isFinite(Date.parse(value.updatedAt));
}
