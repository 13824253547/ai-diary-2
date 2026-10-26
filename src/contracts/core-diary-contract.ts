import type {
  DiaryItem,
  DiaryPrivacy,
  DiaryType,
  GenerationProgressMilestone,
  GenerationProgressMilestoneId,
  GenerationStage,
} from '../types/diary';
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
  contentSnapshotStatus?: 'invalid';
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
  progressMilestones?: GenerationProgressMilestone[];
  result?: GenerationResultContract;
};

export type CreateGenerationJobRequestContract = {
  draftId: string;
  draftVersion: number;
  idempotencyKey: string;
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
  contextBlocks?: Array<{
    id: string;
    type: 'text' | 'quote';
    content: string;
  }>;
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
  date?: string;
};

export type MemoriesQuery = {
  month?: string;
  day?: string;
  keyword?: string;
  page: number;
  pageSize: number;
};

export const MEMORIES_PAGE_SIZES = [10, 20, 50, 100] as const;

export type MemoriesQueryResult = {
  items: DiaryContract[];
  page: number;
  pageSize: number;
  total: number;
};

const GENERATION_JOB_STATUSES = ['queued', 'running', 'succeeded', 'failed', 'cancelled'] as const;
const GENERATION_JOB_STAGES = ['queued', 'analyzing-photos', 'drafting', 'structuring', 'completed', 'failed', 'cancelled'] as const;
const GENERATION_PROGRESS_MILESTONES: Record<
  GenerationProgressMilestoneId,
  { stage: GenerationStage; progressPercent: number }
> = {
  queued: { stage: 'queued', progressPercent: 0 },
  'photo-processing-started': { stage: 'analyzing-photos', progressPercent: 0 },
  'photos-ready': { stage: 'analyzing-photos', progressPercent: 15 },
  'provider-submitted': { stage: 'drafting', progressPercent: 25 },
  'provider-response-received': { stage: 'structuring', progressPercent: 80 },
  'result-validated': { stage: 'structuring', progressPercent: 95 },
  completed: { stage: 'completed', progressPercent: 100 },
};
const GENERATION_PROGRESS_MILESTONE_IDS = Object.keys(GENERATION_PROGRESS_MILESTONES) as GenerationProgressMilestoneId[];

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

export function isGenerationProgressMilestoneHistory(value: unknown): value is GenerationProgressMilestone[] {
  if (!Array.isArray(value) || value.length > GENERATION_PROGRESS_MILESTONE_IDS.length) return false;
  let previousProgress = -1;
  let previousReachedAt = -1;
  let previousIdIndex = -1;
  let previousAttemptCount = 0;
  const seen = new Set<string>();
  for (const item of value) {
    if (!isRecord(item)
      || typeof item.milestoneId !== 'string'
      || !GENERATION_PROGRESS_MILESTONE_IDS.includes(item.milestoneId as GenerationProgressMilestoneId)
      || !isValidAttemptCount(item.attemptCount)
      || !Number.isSafeInteger(item.reachedAt)
      || (item.reachedAt as number) < 0) return false;
    const milestoneId = item.milestoneId as GenerationProgressMilestoneId;
    const definition = GENERATION_PROGRESS_MILESTONES[milestoneId];
    const idIndex = GENERATION_PROGRESS_MILESTONE_IDS.indexOf(milestoneId);
    if (seen.has(milestoneId)
      || item.stage !== definition.stage
      || item.progressPercent !== definition.progressPercent
      || definition.progressPercent < previousProgress
      || (item.reachedAt as number) < previousReachedAt
      || (item.attemptCount as number) < previousAttemptCount
      || idIndex < previousIdIndex) return false;
    seen.add(milestoneId);
    previousProgress = definition.progressPercent;
    previousReachedAt = item.reachedAt as number;
    previousIdIndex = idIndex;
    previousAttemptCount = item.attemptCount as number;
  }
  return true;
}

function isGenerationProgressHistoryCompatible(
  milestones: GenerationProgressMilestone[] | undefined,
  status: GenerationJobContract['status'],
  progressPercent: number | undefined,
) {
  if (milestones === undefined) return true;
  const includesCompletion = milestones.some(item => item.milestoneId === 'completed');
  if (includesCompletion !== (status === 'succeeded')) return false;
  const last = milestones.at(-1);
  return !last
    || progressPercent === undefined
    || progressPercent >= last.progressPercent;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function isNonEmptyString(value: unknown) {
  return typeof value === 'string' && value.trim().length > 0;
}

function isStringArray(value: unknown): value is string[] {
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

function isUniqueGenerationPersonArray(value: unknown): value is GenerationPersonContract[] {
  if (!Array.isArray(value)) return false;
  const ids = new Set<string>();
  for (const person of value) {
    if (!isGenerationPersonContract(person) || ids.has(person.id)) return false;
    ids.add(person.id);
  }
  return true;
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
  const textBlocks = value.blocks.filter((block): block is Extract<GenerationBlockContract, { type: 'text' }> =>
    isRecord(block) && block.type === 'text');
  if (
    value.blocks.some(block => isRecord(block) && block.type === 'quote')
    || textBlocks.length === 0
    || textBlocks.some(block => !Array.isArray(block.photoIds) || block.photoIds.length !== 1)
  ) {
    return false;
  }
  return value.people === undefined || isUniqueGenerationPersonArray(value.people);
}

export function isGenerationResultForSelectedPhotoIds(
  value: unknown,
  selectedPhotoIds: string[],
): value is GenerationResultContract {
  if (!isGenerationResultContract(value)) return false;
  const textBlocks = value.blocks.filter((block): block is Extract<GenerationBlockContract, { type: 'text' }> =>
    block.type === 'text');
  return textBlocks.length === selectedPhotoIds.length
    && textBlocks.every((block, index) => block.photoIds?.[0] === selectedPhotoIds[index]);
}

export function isDiaryContentContract(value: unknown): value is DiaryContentContract {
  if (!isRecord(value)) return false;
  if (!isDiaryType(value.type)
    || typeof value.subtitle !== 'string'
    || typeof value.helperMessage !== 'string'
    || !isNonEmptyString(value.characterId)
    || !isNonEmptyString(value.companionName)
    || !isNonEmptyString(value.coverPhotoId)
    || !Array.isArray(value.blocks)
    || value.blocks.length === 0
    || !value.blocks.every(isGenerationBlockContract)
    || (value.posterPhotoIds !== undefined && !isStringArray(value.posterPhotoIds))
    || (value.people !== undefined && !isUniqueGenerationPersonArray(value.people))) {
    return false;
  }

  const blockIds = new Set<string>();
  const paragraphIds = new Set<string>();
  for (const block of value.blocks as GenerationBlockContract[]) {
    if (blockIds.has(block.id)) return false;
    blockIds.add(block.id);
    if (block.type === 'text' || block.type === 'quote') paragraphIds.add(block.id);
  }
  if (paragraphIds.size === 0) return false;

  return (value.blocks as GenerationBlockContract[]).every(block =>
    !('relatedBlockId' in block)
    || block.relatedBlockId === undefined
    || paragraphIds.has(block.relatedBlockId),
  );
}

export function isDiaryContentContractForPhotoIds(
  value: unknown,
  photoIds: unknown,
): value is DiaryContentContract {
  if (!isDiaryContentContract(value)
    || !isStringArray(photoIds)
    || photoIds.length === 0
    || new Set(photoIds).size !== photoIds.length) {
    return false;
  }

  const allowedPhotoIds = new Set(photoIds);
  if (
    !allowedPhotoIds.has(value.coverPhotoId)
    || (value.posterPhotoIds ?? []).some(id => !allowedPhotoIds.has(id))
    || (value.people ?? []).some(person =>
      !person.photoIds.every(id => allowedPhotoIds.has(id))
      || !allowedPhotoIds.has(person.avatarPhotoId)
      || !person.photoIds.includes(person.avatarPhotoId),
    )
  ) {
    return false;
  }

  return value.blocks.every(block => block.type === 'photo'
    ? allowedPhotoIds.has(block.photoId)
    : (block.photoIds ?? []).every(id => allowedPhotoIds.has(id)));
}

export function isRewriteBlockResultContract(value: unknown): value is RewriteBlockResultContract {
  if (!isRecord(value)) return false;
  return isNonEmptyString(value.draftId)
    && isNonEmptyString(value.blockId)
    && Number.isSafeInteger(value.draftVersion)
    && (value.draftVersion as number) > 0
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
  const progressMilestones = value.progressMilestones === undefined
    ? undefined
    : isGenerationProgressMilestoneHistory(value.progressMilestones)
      ? value.progressMilestones
      : null;
  if (progressMilestones === null
    || !isGenerationProgressHistoryCompatible(
      progressMilestones,
      value.status,
      typeof value.progressPercent === 'number' ? value.progressPercent : undefined,
    )) return false;
  return isNonEmptyString(value.jobId)
    && isNonEmptyString(value.draftId)
    && Number.isSafeInteger(value.draftVersion)
    && (value.draftVersion as number) > 0
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
    && (value.progressMilestones === undefined || progressMilestones !== undefined)
    && (
      (value.status === 'succeeded' && value.stage === 'completed')
        ? isGenerationResultContract(value.result)
        : value.result === undefined
    );
}

export function isCreateGenerationJobRequestContract(value: unknown): value is CreateGenerationJobRequestContract {
  if (!isRecord(value)) return false;
  return isNonEmptyString(value.draftId)
    && Number.isSafeInteger(value.draftVersion)
    && (value.draftVersion as number) > 0
    && isNonEmptyString(value.idempotencyKey);
}

export function isValidMemoriesMonth(value: unknown): value is string {
  if (typeof value !== 'string') return false;
  const match = /^(\d{4})-(\d{2})$/.exec(value);
  if (!match) return false;
  const year = Number(match[1]);
  const month = Number(match[2]);
  return year > 0 && month >= 1 && month <= 12;
}

export function isValidMemoriesDay(value: unknown): value is string {
  if (typeof value !== 'string') return false;
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return false;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (year < 1 || month < 1 || month > 12 || day < 1) return false;
  const isLeapYear = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  const daysPerMonth = [31, isLeapYear ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  return day <= daysPerMonth[month - 1];
}

export function isMemoriesQuery(value: unknown): value is MemoriesQuery {
  if (!isRecord(value)) return false;
  return typeof value.page === 'number'
    && Number.isSafeInteger(value.page)
    && value.page > 0
    && typeof value.pageSize === 'number'
    && MEMORIES_PAGE_SIZES.includes(value.pageSize as typeof MEMORIES_PAGE_SIZES[number])
    && (value.month === undefined || isValidMemoriesMonth(value.month))
    && (value.day === undefined || isValidMemoriesDay(value.day))
    && (value.keyword === undefined || typeof value.keyword === 'string');
}
