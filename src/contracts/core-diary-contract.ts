import type { DiaryItem, DiaryPrivacy, DiaryType } from '../types/diary';
import { isDiaryType } from '../types/diary-capabilities';

export const CORE_DIARY_CONTRACT_VERSION = 'core-diary-v1';

export type ContractErrorCode =
  | 'permission_denied'
  | 'device_identity_required'
  | 'timeout'
  | 'cancelled'
  | 'not_found'
  | 'invalid_input'
  | 'version_conflict'
  | 'asset_unreadable'
  | 'provider_failed';

export type RemoteError = {
  code: ContractErrorCode;
  message: string;
  retryable: boolean;
};

export type RemoteResult<T> =
  | { ok: true; version: typeof CORE_DIARY_CONTRACT_VERSION; data: T }
  | { ok: false; version: typeof CORE_DIARY_CONTRACT_VERSION; error: RemoteError };

export type PhotoAssetContract = {
  id: string;
  uri: string;
  previewUri: string;
  width: number;
  height: number;
  createdAt?: string;
  location?: string;
  personIds?: string[];
};

export type DraftContract = {
  id: string;
  sourceDiaryId?: string;
  type: DiaryType;
  characterId: string;
  selectedPhotoIds: string[];
  privacy: DiaryPrivacy;
  version: number;
};

export type DiaryContract = {
  id: string;
  draftId?: string;
  title: string;
  summary: string;
  location: string;
  date: string;
  privacy: DiaryPrivacy;
  photoIds: string[];
  publicBlockIds?: string[];
  version: number;
  contentSnapshot?: DiaryContentContract;
};

export type GenerationBlockContract =
  | { id: string; type: 'text'; title?: string; content: string; photoIds?: string[] }
  | { id: string; type: 'quote'; content: string; photoIds?: string[]; relatedBlockId?: string }
  | { id: string; type: 'photo'; photoId: string; caption: string; relatedBlockId?: string };

export type GenerationPersonContract = {
  id: string;
  name: string;
  photoIds: string[];
  avatarPhotoId: string;
  aliases?: string[];
};

export type DiaryContentContract = Pick<
  DiaryItem,
  | 'type'
  | 'subtitle'
  | 'helperMessage'
  | 'characterId'
  | 'companionName'
  | 'coverPhotoId'
  | 'blocks'
  | 'people'
  | 'posterPhotoIds'
>;

export type SaveDiaryRequestContract = {
  id?: string;
  draftId: string;
  sourceDiaryId?: string;
  sourceDiaryVersion?: number;
  idempotencyKey: string;
  title: string;
  summary: string;
  location: string;
  date: string;
  privacy: DiaryPrivacy;
  photoIds: string[];
  publicBlockIds?: string[];
  contentSnapshot: DiaryContentContract;
  version: number;
};

export type GenerationResultContract = {
  title: string;
  summary: string;
  location: string;
  date: string;
  companionName: string;
  coverPhotoId: string;
  posterPhotoIds: string[];
  blocks: GenerationBlockContract[];
  people?: GenerationPersonContract[];
};

export type GenerationJobContract = {
  jobId: string;
  draftId: string;
  draftVersion: number;
  idempotencyKey: string;
  status: 'queued' | 'running' | 'succeeded' | 'failed' | 'cancelled';
  stage: 'queued' | 'analyzing-photos' | 'drafting' | 'structuring' | 'completed' | 'failed' | 'cancelled';
  progressPercent?: number;
  attemptCount?: number;
  maxAttempts?: number;
  errorCode?: Extract<ContractErrorCode, 'timeout' | 'provider_failed'>;
  errorMessage?: string;
  retryable?: boolean;
  result?: GenerationResultContract;
};

export type RewriteJobContract = {
  jobId: string;
  draftId: string;
  blockId: string;
  draftVersion: number;
  status: 'queued' | 'running' | 'succeeded' | 'failed' | 'cancelled';
};

export type RewriteBlockRequestContract = {
  draftId: string;
  blockId: string;
  draftVersion: number;
  characterId: string;
  blockType: 'text' | 'quote';
  content: string;
  selectedPhotoIds: string[];
  photoIds?: string[];
};

export type RewriteBlockResultContract = {
  draftId: string;
  blockId: string;
  draftVersion: number;
  blockType: 'text' | 'quote';
  content: string;
  photoIds?: string[];
};

export type SaveDraftCommand = {
  draftId: string;
  sourceDiaryId?: string;
  sourceDiaryVersion?: number;
  draftVersion: number;
  idempotencyKey: string;
};

export type SaveDraftResult = {
  diaryId: string;
  draftId: string;
  savedVersion: number;
};

export type MemoriesQuery = {
  month?: string;
  day?: string;
  keyword?: string;
  page: number;
  pageSize: number;
};

export type MemoriesQueryResult = {
  items: DiaryContract[];
  page: number;
  pageSize: number;
  total: number;
};

const GENERATION_JOB_STATUSES = ['queued', 'running', 'succeeded', 'failed', 'cancelled'] as const;
const GENERATION_JOB_STAGES = ['queued', 'analyzing-photos', 'drafting', 'structuring', 'completed', 'failed', 'cancelled'] as const;

function isGenerationJobStatus(value: unknown): value is GenerationJobContract['status'] {
  return typeof value === 'string' && GENERATION_JOB_STATUSES.includes(value as GenerationJobContract['status']);
}

function isGenerationJobStage(value: unknown): value is GenerationJobContract['stage'] {
  return typeof value === 'string' && GENERATION_JOB_STAGES.includes(value as GenerationJobContract['stage']);
}

function isGenerationStatusStagePairValid(
  status: GenerationJobContract['status'],
  stage: GenerationJobContract['stage'],
) {
  switch (status) {
    case 'queued':
      return stage === 'queued';
    case 'running':
      return stage === 'analyzing-photos' || stage === 'drafting' || stage === 'structuring';
    case 'succeeded':
      return stage === 'completed';
    case 'failed':
      return stage === 'failed';
    case 'cancelled':
      return stage === 'cancelled';
  }
}

function isValidGenerationProgress(value: unknown) {
  return value === undefined || (typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= 100);
}

function isValidAttemptCount(value: unknown) {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function isNonEmptyString(value: unknown) {
  return typeof value === 'string' && value.trim().length > 0;
}

function isStringArray(value: unknown) {
  return Array.isArray(value) && value.every(isNonEmptyString);
}

function isDiaryPrivacy(value: unknown): value is DiaryPrivacy {
  return value === 'private'
    || value === 'anonymous'
    || value === 'public-likes'
    || value === 'public-comments';
}

function isGenerationBlockContract(value: unknown): value is GenerationBlockContract {
  if (!isRecord(value) || !isNonEmptyString(value.id)) return false;
  if (value.type === 'text') {
    return isNonEmptyString(value.content)
      && (value.title === undefined || isNonEmptyString(value.title))
      && (value.photoIds === undefined || isStringArray(value.photoIds));
  }
  if (value.type === 'quote') {
    return isNonEmptyString(value.content)
      && (value.photoIds === undefined || isStringArray(value.photoIds))
      && (value.relatedBlockId === undefined || isNonEmptyString(value.relatedBlockId));
  }
  if (value.type === 'photo') {
    return isNonEmptyString(value.photoId)
      && isNonEmptyString(value.caption)
      && (value.relatedBlockId === undefined || isNonEmptyString(value.relatedBlockId));
  }
  return false;
}

function isGenerationPersonContract(value: unknown): value is GenerationPersonContract {
  if (!isRecord(value)) return false;
  return isNonEmptyString(value.id)
    && isNonEmptyString(value.name)
    && isStringArray(value.photoIds)
    && isNonEmptyString(value.avatarPhotoId)
    && (value.aliases === undefined || isStringArray(value.aliases));
}

export function isGenerationResultContract(value: unknown): value is GenerationResultContract {
  if (!isRecord(value)) return false;
  if (
    !isNonEmptyString(value.title)
    || !isNonEmptyString(value.summary)
    || !isNonEmptyString(value.location)
    || !isNonEmptyString(value.date)
    || !isNonEmptyString(value.companionName)
    || !isNonEmptyString(value.coverPhotoId)
    || !isStringArray(value.posterPhotoIds)
    || !Array.isArray(value.blocks)
    || value.blocks.length === 0
    || !value.blocks.every(isGenerationBlockContract)
  ) {
    return false;
  }
  return value.people === undefined || (Array.isArray(value.people) && value.people.every(isGenerationPersonContract));
}

export function isDiaryContentContract(value: unknown): value is DiaryContentContract {
  if (!isRecord(value)) return false;
  return isDiaryType(value.type)
    && typeof value.subtitle === 'string'
    && typeof value.helperMessage === 'string'
    && isNonEmptyString(value.characterId)
    && isNonEmptyString(value.companionName)
    && typeof value.coverPhotoId === 'string'
    && Array.isArray(value.blocks)
    && value.blocks.every(isGenerationBlockContract)
    && (value.posterPhotoIds === undefined || isStringArray(value.posterPhotoIds))
    && (value.people === undefined || (Array.isArray(value.people) && value.people.every(isGenerationPersonContract)));
}

export function isRewriteBlockResultContract(value: unknown): value is RewriteBlockResultContract {
  if (!isRecord(value)) return false;
  return isNonEmptyString(value.draftId)
    && isNonEmptyString(value.blockId)
    && typeof value.draftVersion === 'number'
    && (value.blockType === 'text' || value.blockType === 'quote')
    && isNonEmptyString(value.content)
    && (value.photoIds === undefined || isStringArray(value.photoIds));
}

export function isPhotoAssetContract(value: unknown): value is PhotoAssetContract {
  if (!isRecord(value)) return false;
  return isNonEmptyString(value.id)
    && isNonEmptyString(value.uri)
    && isNonEmptyString(value.previewUri)
    && typeof value.width === 'number'
    && typeof value.height === 'number';
}

export function isDraftContract(value: unknown): value is DraftContract {
  if (!isRecord(value)) return false;
  return isNonEmptyString(value.id)
    && isDiaryType(value.type)
    && (value.sourceDiaryId === undefined || isNonEmptyString(value.sourceDiaryId))
    && isNonEmptyString(value.characterId)
    && isDiaryPrivacy(value.privacy)
    && typeof value.version === 'number'
    && Array.isArray(value.selectedPhotoIds)
    && value.selectedPhotoIds.every(isNonEmptyString);
}

export function isGenerationJobContract(value: unknown): value is GenerationJobContract {
  if (!isRecord(value)) return false;
  if (!isGenerationJobStatus(value.status) || !isGenerationJobStage(value.stage)) return false;
  const attemptCount = typeof value.attemptCount === 'number' ? value.attemptCount : undefined;
  const maxAttempts = typeof value.maxAttempts === 'number' ? value.maxAttempts : undefined;
  return isNonEmptyString(value.jobId)
    && isNonEmptyString(value.draftId)
    && typeof value.draftVersion === 'number'
    && isNonEmptyString(value.idempotencyKey)
    && isGenerationStatusStagePairValid(value.status, value.stage)
    && isValidGenerationProgress(value.progressPercent)
    && (attemptCount === undefined || isValidAttemptCount(attemptCount))
    && (maxAttempts === undefined || isValidAttemptCount(maxAttempts))
    && (
      attemptCount === undefined
      || maxAttempts === undefined
      || attemptCount <= maxAttempts
    )
    && (value.errorCode === undefined || value.errorCode === 'timeout' || value.errorCode === 'provider_failed')
    && (value.errorMessage === undefined || typeof value.errorMessage === 'string')
    && (value.retryable === undefined || typeof value.retryable === 'boolean')
    && (
      (value.status === 'succeeded' && value.stage === 'completed')
        ? isGenerationResultContract(value.result)
        : value.result === undefined
    );
}

export function isMemoriesQuery(value: unknown): value is MemoriesQuery {
  if (!isRecord(value)) return false;
  return typeof value.page === 'number'
    && typeof value.pageSize === 'number'
    && (value.month === undefined || isNonEmptyString(value.month))
    && (value.day === undefined || isNonEmptyString(value.day))
    && (value.keyword === undefined || typeof value.keyword === 'string');
}
