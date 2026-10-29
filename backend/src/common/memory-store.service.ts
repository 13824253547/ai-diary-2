import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { DiaryGenerationProviderError, DiaryGenerationService, type GenerationInputSnapshot, type GenerationResultRecord, type RewriteInputSnapshot, type RewriteResultRecord } from './diary-generation.service';
import { PrismaService } from './prisma.service';
import { GenerationPhotoInputError, TemporaryGenerationPhotoStore, type UploadedGenerationPhoto } from './temporary-generation-photo-store';
import {
  classifyDiaryGenerationInput,
  getDiaryGenerationPolicyMessage,
} from './diary-generation-policy';
import {
  GENERATION_PROGRESS_MILESTONE_DEFINITIONS,
  type GenerationProgressMilestone,
  type GenerationProgressMilestoneId,
  readGenerationProgressMilestones,
} from './generation-progress';
import {
  buildDiscoveryPublicationSnapshot,
  DiscoveryPublicationError,
} from './discovery-publication';

export type DraftRecord = {
  id: string;
  sourceDiaryId?: string;
  type: string;
  characterId: string;
  selectedPhotoIds: string[];
  privacy: string;
  version: number;
};

export type DiaryRecord = {
  id: string;
  draftId: string;
  title: string;
  summary: string;
  location: string;
  date: string;
  publishedLocalDate?: string;
  privacy: string;
  photoIds: string[];
  publicBlockIds?: string[];
  contentSnapshot?: DiaryContentSnapshotRecord;
  contentSnapshotStatus?: 'invalid';
  version: number;
};

export type DiaryContentSnapshotRecord = {
  type: string;
  subtitle: string;
  helperMessage: string;
  characterId: string;
  companionName: string;
  coverPhotoId: string;
  blocks: unknown[];
  posterPhotoIds?: string[];
  people?: unknown[];
};

export type SaveDiaryCommandResult = {
  diaryId: string;
  draftId: string;
  savedVersion: number;
  date: string;
};

type DiarySaveAssetHook = {
  beforeCommit: (tx: Prisma.TransactionClient, diaryId: string) => Promise<void>;
  rollback: () => Promise<void>;
};

type DiaryDeleteAssetHook = {
  beforeCommit: (tx: Prisma.TransactionClient, diaryId: string) => Promise<void>;
  afterCommit: () => Promise<void>;
  rollback: () => Promise<void>;
};

type SaveErrorCode = 'not_found' | 'version_conflict' | 'invalid_input' | 'publication_blocked';
type GenerationJobErrorCode = 'not_found' | 'version_conflict' | 'invalid_input' | 'asset_unreadable';
type DraftInputErrorCode = 'invalid_input';
type RewriteDraftErrorCode = 'not_found' | 'invalid_input' | 'version_conflict' | 'asset_unreadable';

const SUPPORTED_DIARY_TYPES = ['travel', 'work', 'emotion'] as const;
const CREATABLE_DIARY_TYPES = ['travel'] as const;
const MIN_GENERATION_PHOTOS = 3;
const SUPPORTED_CHARACTER_IDS = [
  'character-blue',
  'character-green',
  'character-brown',
  'character-red',
  'character-brown-2',
  'character-blue-2',
] as const;
const AVAILABLE_CHARACTER_IDS = ['character-blue', 'character-green', 'character-brown'] as const;
const SUPPORTED_DIARY_PRIVACY_SETTINGS = ['private', 'anonymous', 'public-likes', 'public-comments'] as const;

function isSupportedDiaryType(value: string) {
  return SUPPORTED_DIARY_TYPES.includes(value as typeof SUPPORTED_DIARY_TYPES[number]);
}

function canCreateDiaryType(value: string) {
  return CREATABLE_DIARY_TYPES.includes(value as typeof CREATABLE_DIARY_TYPES[number]);
}

function isSupportedCharacterId(value: string) {
  return SUPPORTED_CHARACTER_IDS.includes(value as typeof SUPPORTED_CHARACTER_IDS[number]);
}

function canSelectCharacterId(value: string) {
  return AVAILABLE_CHARACTER_IDS.includes(value as typeof AVAILABLE_CHARACTER_IDS[number]);
}

export class SaveDiaryError extends Error {
  constructor(
    readonly code: SaveErrorCode,
    message: string,
  ) {
    super(message);
  }
}

export class DeleteDiaryError extends Error {
  constructor(
    readonly code: 'not_found' | 'invalid_input',
    message: string,
  ) {
    super(message);
  }
}

function assertSaveCommandIdentity(
  existing: {
    draftId: string;
    sourceDiaryId: string | null;
    sourceDiaryVersion: number | null;
  },
  input: {
    draftId: string;
    sourceDiaryId?: string;
    sourceDiaryVersion?: number;
  },
) {
  if (
    existing.draftId !== input.draftId
    || (existing.sourceDiaryId ?? undefined) !== input.sourceDiaryId
    || (existing.sourceDiaryVersion ?? undefined) !== input.sourceDiaryVersion
  ) {
    throw new SaveDiaryError('version_conflict', '保存幂等键已绑定到其他草稿版本。');
  }
}

export class PermissionDeniedError extends Error {
  constructor(message: string) {
    super(message);
  }
}

export class GenerationJobError extends Error {
  constructor(
    readonly code: GenerationJobErrorCode,
    message: string,
  ) {
    super(message);
  }
}

export class DraftInputError extends Error {
  constructor(
    readonly code: DraftInputErrorCode,
    message: string,
  ) {
    super(message);
  }
}

export class RewriteDraftError extends Error {
  constructor(
    readonly code: RewriteDraftErrorCode,
    message: string,
  ) {
    super(message);
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function readJsonStringIds(value: Prisma.JsonValue) {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : [];
}

function hasJsonDiaryReference(value: Prisma.JsonValue, diaryId: string) {
  return Array.isArray(value) && value.some(item => isRecord(item) && item.id === diaryId);
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

function isValidLocalDateKey(value: unknown): value is string {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00.000Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

function assertDiaryContentSnapshot(
  value: unknown,
  photoIds: string[],
): asserts value is DiaryContentSnapshotRecord {
  const invalid = (): never => {
    throw new SaveDiaryError('invalid_input', 'diary content snapshot is invalid');
  };
  if (!Array.isArray(photoIds)
    || photoIds.length === 0
    || new Set(photoIds).size !== photoIds.length
    || !photoIds.every(isNonEmptyString)) invalid();
  if (!isRecord(value)) invalid();
  const snapshot = value as Record<string, unknown>;
  if (!isNonEmptyString(snapshot.type)
    || !isSupportedDiaryType(snapshot.type)
    || typeof snapshot.subtitle !== 'string'
    || typeof snapshot.helperMessage !== 'string'
    || !isNonEmptyString(snapshot.characterId)
    || !isSupportedCharacterId(snapshot.characterId)
    || !isNonEmptyString(snapshot.companionName)
    || !isNonEmptyString(snapshot.coverPhotoId)) invalid();
  const rawBlocks = snapshot.blocks;
  if (!Array.isArray(rawBlocks) || rawBlocks.length === 0) invalid();
  const blocks = rawBlocks as unknown[];
  const rawPosterPhotoIds = snapshot.posterPhotoIds;
  if (rawPosterPhotoIds !== undefined && !Array.isArray(rawPosterPhotoIds)) invalid();
  const rawPeople = snapshot.people;
  if (rawPeople !== undefined && !Array.isArray(rawPeople)) invalid();

  const allowedPhotos = new Set(photoIds);
  const isAllowedPhoto = (photoId: unknown): photoId is string =>
    isNonEmptyString(photoId) && allowedPhotos.has(photoId);
  const blockIds = new Set<string>();
  const paragraphIds = new Set<string>();
  for (const block of blocks) {
    if (!isRecord(block)) invalid();
    const contentBlock = block as Record<string, unknown>;
    if (!isNonEmptyString(contentBlock.id) || blockIds.has(contentBlock.id)) invalid();
    const blockId = contentBlock.id as string;
    blockIds.add(blockId);
    if (contentBlock.type === 'text' || contentBlock.type === 'quote') {
      if (!isNonEmptyString(contentBlock.content)) invalid();
      if (contentBlock.type === 'text' && contentBlock.title !== undefined && !isNonEmptyString(contentBlock.title)) invalid();
      const blockPhotoIds = contentBlock.photoIds;
      if (blockPhotoIds !== undefined) {
        if (!Array.isArray(blockPhotoIds)) invalid();
        if (!(blockPhotoIds as unknown[]).every(isAllowedPhoto)) invalid();
      }
      if (contentBlock.relatedBlockId !== undefined && !isNonEmptyString(contentBlock.relatedBlockId)) invalid();
      paragraphIds.add(blockId);
      continue;
    }
    if (contentBlock.type === 'photo') {
      if (!isAllowedPhoto(contentBlock.photoId)
        || !isNonEmptyString(contentBlock.caption)
        || (contentBlock.relatedBlockId !== undefined && !isNonEmptyString(contentBlock.relatedBlockId))) invalid();
      continue;
    }
    invalid();
  }

  for (const block of blocks) {
    if (isRecord(block) && block.relatedBlockId !== undefined && !paragraphIds.has(String(block.relatedBlockId))) invalid();
  }
  if (!allowedPhotos.has(snapshot.coverPhotoId as string)) invalid();
  if (rawPosterPhotoIds !== undefined
    && !(rawPosterPhotoIds as unknown[]).every(photoId => isNonEmptyString(photoId) && allowedPhotos.has(photoId))) invalid();
  if (rawPeople !== undefined) {
    const personIds = new Set<string>();
    for (const person of rawPeople as unknown[]) {
      if (!isRecord(person)
        || !isNonEmptyString(person.id)
        || !isNonEmptyString(person.name)
        || !isNonEmptyString(person.avatarPhotoId)
        || !Array.isArray(person.photoIds)
        || !person.photoIds.length
        || !(person.photoIds as unknown[]).every(photoId => isNonEmptyString(photoId) && allowedPhotos.has(photoId))
        || !person.photoIds.includes(person.avatarPhotoId)
        || (person.aliases !== undefined
          && (!Array.isArray(person.aliases) || !(person.aliases as unknown[]).every(isNonEmptyString)))) invalid();
      const validPerson = person as Record<string, unknown>;
      const personId = validPerson.id as string;
      if (personIds.has(personId)) invalid();
      personIds.add(personId);
    }
  }
  if (paragraphIds.size === 0) invalid();
}

export type GenerationJobRecord = {
  jobId: string;
  draftId: string;
  draftVersion: number;
  idempotencyKey: string;
  createdAt: number;
  status: 'queued' | 'running' | 'succeeded' | 'failed' | 'cancelled';
  stage: 'queued' | 'analyzing-photos' | 'drafting' | 'structuring' | 'completed' | 'failed' | 'cancelled';
  progressPercent?: number;
  progressMilestones?: GenerationProgressMilestone[];
  attemptCount: number;
  maxAttempts: number;
  errorCode?: 'timeout' | 'provider_failed';
  errorMessage?: string;
  retryable?: boolean;
  result?: GenerationResultRecord;
};

type StoredGenerationJobRecord = GenerationJobRecord & {
  ownerDeviceId: string;
  inputSnapshot?: GenerationInputSnapshot;
};

@Injectable()
export class MemoryStoreService implements OnModuleDestroy {
  private readonly logger = new Logger(MemoryStoreService.name);
  private readonly processingGenerationJobs = new Map<string, {
    controller: AbortController;
    promise: Promise<void>;
    releaseTask: () => void;
  }>();
  private readonly activeDiaryAiTasks = new Map<string, {
    taskKey: string;
    token: symbol;
    references: number;
  }>();
  private rewriteTaskSequence = 0;

  constructor(
    private readonly prisma: PrismaService,
    private readonly diaryGenerationService: DiaryGenerationService,
    private readonly generationPhotoStore: TemporaryGenerationPhotoStore,
  ) {}

  private acquireDiaryAiTask(ownerDeviceId: string, taskKey: string) {
    let current = this.activeDiaryAiTasks.get(ownerDeviceId);
    if (current && current.taskKey !== taskKey) return undefined;
    if (!current) {
      current = { taskKey, token: Symbol(taskKey), references: 0 };
      this.activeDiaryAiTasks.set(ownerDeviceId, current);
    }
    current.references += 1;
    const token = current.token;
    let released = false;
    return () => {
      if (released) return;
      released = true;
      const active = this.activeDiaryAiTasks.get(ownerDeviceId);
      if (active?.token !== token) return;
      active.references -= 1;
      if (active.references <= 0) this.activeDiaryAiTasks.delete(ownerDeviceId);
    };
  }

  async createDraft(input: Omit<DraftRecord, 'id'> & { id?: string }, ownerDeviceId: string) {
    if (!isRecord(input)
      || (input.id !== undefined && !isNonEmptyString(input.id))
      || (input.sourceDiaryId !== undefined && !isNonEmptyString(input.sourceDiaryId))
      || !isNonEmptyString(input.type)
      || !isNonEmptyString(input.characterId)
      || !Array.isArray(input.selectedPhotoIds)
      || !input.selectedPhotoIds.every(isNonEmptyString)
      || !SUPPORTED_DIARY_PRIVACY_SETTINGS.includes(input.privacy as typeof SUPPORTED_DIARY_PRIVACY_SETTINGS[number])
      || !Number.isSafeInteger(input.version)
      || input.version <= 0) {
      throw new DraftInputError('invalid_input', '草稿请求参数无效。');
    }
    if (!isSupportedDiaryType(input.type)) {
      throw new DraftInputError('invalid_input', 'unsupported diary type');
    }
    if (!input.sourceDiaryId && !canCreateDiaryType(input.type)) {
      throw new DraftInputError('invalid_input', 'diary type is not available for creation');
    }
    if (!isSupportedCharacterId(input.characterId)) {
      throw new DraftInputError('invalid_input', 'unsupported character id');
    }
    if (!input.sourceDiaryId && !canSelectCharacterId(input.characterId)) {
      throw new DraftInputError('invalid_input', 'character is not available for creation');
    }
    if (input.id) {
      const existing = await this.prisma.draft.findUnique({
        where: { id: input.id },
      });
      if (existing && existing.ownerDeviceId !== ownerDeviceId) {
        throw new PermissionDeniedError('draft does not belong to current device');
      }
      if (existing && existing.sourceDiaryId === null && !canCreateDiaryType(input.type)) {
        throw new DraftInputError('invalid_input', 'diary type is not available for creation');
      }
      if (existing && existing.sourceDiaryId === null && !canSelectCharacterId(input.characterId)) {
        throw new DraftInputError('invalid_input', 'character is not available for creation');
      }
    }

    const draft = input.id
      ? await this.prisma.draft.upsert({
          where: { id: input.id },
          create: {
            id: input.id,
            ownerDeviceId,
            sourceDiaryId: input.sourceDiaryId,
            type: input.type,
            characterId: input.characterId,
            selectedPhotoIds: input.selectedPhotoIds as Prisma.InputJsonValue,
            privacy: input.privacy,
            version: input.version,
          },
          update: {
            sourceDiaryId: input.sourceDiaryId,
            type: input.type,
            characterId: input.characterId,
            selectedPhotoIds: input.selectedPhotoIds as Prisma.InputJsonValue,
            privacy: input.privacy,
            version: input.version,
          },
        })
      : await this.prisma.draft.create({
          data: {
            ownerDeviceId,
            sourceDiaryId: input.sourceDiaryId,
            type: input.type,
            characterId: input.characterId,
            selectedPhotoIds: input.selectedPhotoIds as Prisma.InputJsonValue,
            privacy: input.privacy,
            version: input.version,
          },
        });

    return this.mapDraftRecord(draft);
  }

  async getDraft(id: string, ownerDeviceId: string) {
    const draft = await this.prisma.draft.findUnique({ where: { id } });
    if (!draft) return undefined;
    if (draft.ownerDeviceId !== ownerDeviceId) {
      throw new PermissionDeniedError('draft does not belong to current device');
    }
    return this.mapDraftRecord(draft);
  }

  async listDrafts(ownerDeviceId: string) {
    const drafts = await this.prisma.draft.findMany({
      where: { ownerDeviceId },
      orderBy: { createdAt: 'desc' },
    });
    return drafts.map(draft => this.mapDraftRecord(draft));
  }

  async saveDiary(input: Omit<DiaryRecord, 'id'> & { id?: string }, ownerDeviceId: string) {
    let publishedAt: Date | undefined;
    if (input.id) {
      const existing = await this.prisma.diary.findUnique({
        where: { id: input.id },
      });
      if (existing && existing.ownerDeviceId !== ownerDeviceId) {
        throw new PermissionDeniedError('diary does not belong to current device');
      }
      publishedAt = existing?.createdAt;
    }

    const requestedDate = this.normalizeDateInput(input.date);
    if (!Number.isFinite(requestedDate.getTime())) {
      throw new SaveDiaryError('invalid_input', 'diary date is invalid');
    }
    publishedAt ??= new Date();
    const diary = input.id
      ? await this.prisma.diary.upsert({
          where: { id: input.id },
          create: {
            id: input.id,
            ownerDeviceId,
            draftId: input.draftId,
            title: input.title,
            summary: input.summary,
            location: input.location,
            date: publishedAt,
            privacy: input.privacy,
            photoIds: input.photoIds as Prisma.InputJsonValue,
            publicBlockIds: input.publicBlockIds === undefined ? Prisma.JsonNull : input.publicBlockIds as Prisma.InputJsonValue,
            ...(input.contentSnapshot === undefined ? {} : { contentSnapshot: input.contentSnapshot as Prisma.InputJsonValue }),
            version: input.version,
          },
          update: {
            draftId: input.draftId,
            title: input.title,
            summary: input.summary,
            location: input.location,
            date: publishedAt,
            privacy: input.privacy,
            photoIds: input.photoIds as Prisma.InputJsonValue,
            publicBlockIds: input.publicBlockIds === undefined ? Prisma.JsonNull : input.publicBlockIds as Prisma.InputJsonValue,
            ...(input.contentSnapshot === undefined ? {} : { contentSnapshot: input.contentSnapshot as Prisma.InputJsonValue }),
            version: input.version,
          },
        })
      : await this.prisma.diary.create({
          data: {
            ownerDeviceId,
            draftId: input.draftId,
            title: input.title,
            summary: input.summary,
            location: input.location,
            date: publishedAt,
            privacy: input.privacy,
            photoIds: input.photoIds as Prisma.InputJsonValue,
            publicBlockIds: input.publicBlockIds === undefined ? Prisma.JsonNull : input.publicBlockIds as Prisma.InputJsonValue,
            ...(input.contentSnapshot === undefined ? {} : { contentSnapshot: input.contentSnapshot as Prisma.InputJsonValue }),
            version: input.version,
          },
        });

    return this.mapDiaryRecord(diary);
  }

  async saveDiaryWithCommand(input: Omit<DiaryRecord, 'id'> & {
    id?: string;
    sourceDiaryId?: string;
    sourceDiaryVersion?: number;
    idempotencyKey: string;
    contentSnapshot: DiaryContentSnapshotRecord;
  }, ownerDeviceId: string, assetHook?: DiarySaveAssetHook): Promise<SaveDiaryCommandResult> {
    if (!isRecord(input)
      || !isNonEmptyString(input.draftId)
      || !isNonEmptyString(input.idempotencyKey)
      || (input.id !== undefined && !isNonEmptyString(input.id))
      || (input.sourceDiaryId !== undefined && !isNonEmptyString(input.sourceDiaryId))
      || (input.sourceDiaryVersion !== undefined
        && (!Number.isSafeInteger(input.sourceDiaryVersion) || input.sourceDiaryVersion <= 0))
      || (input.sourceDiaryId !== undefined && input.sourceDiaryVersion === undefined)
      || (input.sourceDiaryId === undefined && input.sourceDiaryVersion !== undefined)
      || typeof input.title !== 'string'
      || typeof input.summary !== 'string'
      || typeof input.location !== 'string'
      || typeof input.date !== 'string'
      || !input.date.trim()
      || (input.publishedLocalDate !== undefined && !isValidLocalDateKey(input.publishedLocalDate))
      || !SUPPORTED_DIARY_PRIVACY_SETTINGS.includes(input.privacy as typeof SUPPORTED_DIARY_PRIVACY_SETTINGS[number])
      || !Number.isSafeInteger(input.version)
      || input.version <= 0) {
      throw new SaveDiaryError('invalid_input', 'diary save request is invalid');
    }
    if (!Array.isArray(input.publicBlockIds ?? [])
      || !(input.publicBlockIds ?? []).every(isNonEmptyString)) {
      throw new SaveDiaryError('invalid_input', 'public block ids are invalid');
    }
    assertDiaryContentSnapshot(input.contentSnapshot, input.photoIds);
    const requestedDate = this.normalizeDateInput(input.date);
    if (!Number.isFinite(requestedDate.getTime())) {
      throw new SaveDiaryError('invalid_input', 'diary date is invalid');
    }

    const sourceDiaryVersion = input.sourceDiaryVersion;
    let publishedAt: Date | undefined;
    const existingCommand = await this.prisma.saveCommand.findUnique({
      where: {
        ownerDeviceId_idempotencyKey: {
          ownerDeviceId,
          idempotencyKey: input.idempotencyKey,
        },
      },
    });
    if (existingCommand) {
      assertSaveCommandIdentity(existingCommand, input);
      const existingDiary = await this.getDiary(existingCommand.diaryId, ownerDeviceId);
      if (existingDiary) {
        return {
          diaryId: existingCommand.diaryId,
          draftId: existingCommand.draftId,
          savedVersion: existingCommand.savedVersion,
          date: existingDiary.date,
        };
      }
    }

    if (input.sourceDiaryId) {
      if (sourceDiaryVersion === undefined) {
        throw new SaveDiaryError('invalid_input', 'source diary version is required');
      }
      if (input.id && input.id !== input.sourceDiaryId) {
        throw new SaveDiaryError('invalid_input', 'diary id must match source diary id');
      }
      const sourceDiary = await this.prisma.diary.findUnique({
        where: { id: input.sourceDiaryId },
      });
      if (!sourceDiary) {
        throw new SaveDiaryError('not_found', 'source diary not found');
      }
      if (sourceDiary.ownerDeviceId !== ownerDeviceId) {
        throw new PermissionDeniedError('source diary does not belong to current device');
      }
      if (sourceDiary.version !== sourceDiaryVersion) {
        throw new SaveDiaryError('version_conflict', 'source diary version conflict');
      }
      publishedAt = sourceDiary.createdAt;
    }
    publishedAt ??= new Date();

    if (input.id) {
      const existingDiary = await this.prisma.diary.findUnique({
        where: { id: input.id },
      });
      if (existingDiary && existingDiary.ownerDeviceId !== ownerDeviceId) {
        throw new PermissionDeniedError('diary does not belong to current device');
      }
      if (existingDiary && !input.sourceDiaryId) {
        throw new SaveDiaryError('invalid_input', 'source diary is required to update an existing diary');
      }
    }

    try {
      const result = await this.prisma.$transaction(async prisma => {
        let savedDiary: Awaited<ReturnType<typeof prisma.diary.create>>;
        if (input.sourceDiaryId) {
          const expectedVersion = sourceDiaryVersion as number;
          const update = await prisma.diary.updateMany({
            where: {
              id: input.sourceDiaryId,
              ownerDeviceId,
              version: expectedVersion,
            },
            data: {
              draftId: input.draftId,
              title: input.title,
              summary: input.summary,
              location: input.location,
              date: publishedAt,
              privacy: input.privacy,
              photoIds: input.photoIds as Prisma.InputJsonValue,
              publicBlockIds: input.publicBlockIds === undefined ? Prisma.JsonNull : input.publicBlockIds as Prisma.InputJsonValue,
              ...(input.contentSnapshot === undefined ? {} : { contentSnapshot: input.contentSnapshot as Prisma.InputJsonValue }),
              version: expectedVersion + 1,
            },
          });
          if (update.count !== 1) {
            const racedCommand = await prisma.saveCommand.findUnique({
              where: {
                ownerDeviceId_idempotencyKey: {
                  ownerDeviceId,
                  idempotencyKey: input.idempotencyKey,
                },
              },
            });
            if (racedCommand) {
              assertSaveCommandIdentity(racedCommand, input);
              const racedDiary = await prisma.diary.findUnique({ where: { id: racedCommand.diaryId } });
              if (racedDiary?.ownerDeviceId === ownerDeviceId) {
                return {
                  diaryId: racedCommand.diaryId,
                  draftId: racedCommand.draftId,
                  savedVersion: racedCommand.savedVersion,
                  date: this.formatDate(racedDiary.createdAt),
                };
              }
            }
            const currentSource = await prisma.diary.findUnique({ where: { id: input.sourceDiaryId } });
            if (!currentSource) throw new SaveDiaryError('not_found', 'source diary not found');
            if (currentSource.ownerDeviceId !== ownerDeviceId) {
              throw new PermissionDeniedError('source diary does not belong to current device');
            }
            throw new SaveDiaryError('version_conflict', 'source diary version conflict');
          }
          savedDiary = await prisma.diary.findUniqueOrThrow({ where: { id: input.sourceDiaryId } });
        } else {
          savedDiary = await prisma.diary.create({
            data: {
              ...(input.id ? { id: input.id } : {}),
              ownerDeviceId,
              draftId: input.draftId,
              title: input.title,
              summary: input.summary,
              location: input.location,
              date: publishedAt,
              publishedLocalDate: input.publishedLocalDate ?? null,
              privacy: input.privacy,
              photoIds: input.photoIds as Prisma.InputJsonValue,
              publicBlockIds: input.publicBlockIds === undefined ? Prisma.JsonNull : input.publicBlockIds as Prisma.InputJsonValue,
              ...(input.contentSnapshot === undefined ? {} : { contentSnapshot: input.contentSnapshot as Prisma.InputJsonValue }),
              version: input.version,
            },
          });
        }

        await assetHook?.beforeCommit(prisma, savedDiary.id);
        await this.syncDiscoveryPublication(prisma, savedDiary);

        await prisma.saveCommand.create({
          data: {
            ownerDeviceId,
            idempotencyKey: input.idempotencyKey,
            draftId: input.draftId,
            sourceDiaryId: input.sourceDiaryId,
            sourceDiaryVersion: input.sourceDiaryVersion,
            diaryId: savedDiary.id,
            savedVersion: savedDiary.version,
          },
        });

        return {
          diaryId: savedDiary.id,
          draftId: input.draftId,
          savedVersion: savedDiary.version,
          date: this.formatDate(savedDiary.createdAt),
        };
      });

      return result;
    } catch (error) {
      await assetHook?.rollback();
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        const racedCommand = await this.prisma.saveCommand.findUnique({
          where: {
            ownerDeviceId_idempotencyKey: {
              ownerDeviceId,
              idempotencyKey: input.idempotencyKey,
            },
          },
        });
        if (racedCommand) {
          assertSaveCommandIdentity(racedCommand, input);
          const racedDiary = await this.getDiary(racedCommand.diaryId, ownerDeviceId);
          if (racedDiary) {
            return {
              diaryId: racedCommand.diaryId,
              draftId: racedCommand.draftId,
              savedVersion: racedCommand.savedVersion,
              date: racedDiary.date,
            };
          }
        }
      }
      throw error;
    }
  }

  async getSaveResult(idempotencyKey: string, ownerDeviceId: string) {
    const command = await this.prisma.saveCommand.findUnique({
      where: {
        ownerDeviceId_idempotencyKey: {
          ownerDeviceId,
          idempotencyKey,
        },
      },
    });
    if (!command) return undefined;
    const diary = await this.getDiary(command.diaryId, ownerDeviceId);
    if (!diary) return undefined;
    return {
      diaryId: diary.id,
      draftId: command.draftId,
      savedVersion: command.savedVersion,
      id: diary.id,
      date: diary.date,
    };
  }

  async getDiary(id: string, ownerDeviceId: string) {
    const diary = await this.prisma.diary.findUnique({ where: { id } });
    if (!diary) return undefined;
    if (diary.ownerDeviceId !== ownerDeviceId) {
      throw new PermissionDeniedError('diary does not belong to current device');
    }
    return this.mapDiaryRecord(diary);
  }

  async deleteDiary(id: string, ownerDeviceId: string, assetHook?: DiaryDeleteAssetHook) {
    if (!isNonEmptyString(id) || id.trim().length > 191 || !isNonEmptyString(ownerDeviceId)) {
      throw new DeleteDiaryError('invalid_input', '日记标识无效。');
    }

    try {
      await this.prisma.$transaction(async transaction => {
        const ownerDiaries = await transaction.$queryRaw<Array<{ id: string; version: number; draftId: string }>>(Prisma.sql`
          SELECT \`id\`, \`version\`, \`draftId\`
          FROM \`Diary\`
          WHERE \`ownerDeviceId\` = ${ownerDeviceId}
          ORDER BY \`id\`
          FOR UPDATE
        `);
        const diary = ownerDiaries.find(item => item.id === id);
        if (!diary) throw new DeleteDiaryError('not_found', '没有找到这篇日记。');

        await assetHook?.beforeCommit(transaction, id);

        const stories = await transaction.discoveryStory.findMany({
          where: { ownerDeviceId, sourceDiaryId: id },
          select: { id: true },
        });
        const storyIds = stories.map(story => story.id);
        if (storyIds.length) {
          await transaction.discoveryLike.deleteMany({ where: { storyId: { in: storyIds } } });
          await transaction.discoveryStory.deleteMany({ where: { id: { in: storyIds }, ownerDeviceId } });
        }

        const drafts = await transaction.draft.findMany({
          where: {
            ownerDeviceId,
            OR: [{ id: diary.draftId }, { sourceDiaryId: id }],
          },
          select: { id: true },
        });
        const draftIds = drafts.map(draft => draft.id);
        if (draftIds.length) {
          await transaction.generationJob.deleteMany({ where: { ownerDeviceId, draftId: { in: draftIds } } });
        }

        const corrections = await transaction.anchorCorrection.findMany({
          where: { ownerDeviceId, diaryId: id },
          select: { id: true },
        });
        const correctionIds = corrections.map(correction => correction.id);
        if (correctionIds.length) {
          await transaction.anchorCorrectionCommand.deleteMany({
            where: { ownerDeviceId, correctionId: { in: correctionIds } },
          });
          await transaction.anchorCorrection.deleteMany({ where: { ownerDeviceId, diaryId: id } });
        }
        await transaction.diaryAnchor.deleteMany({ where: { ownerDeviceId, diaryId: id } });
        await transaction.diaryAnchorExtraction.deleteMany({ where: { ownerDeviceId, diaryId: id } });

        const flowers = await transaction.growthFlower.findMany({
          where: { ownerDeviceId },
          select: { id: true, sourceDiaryIds: true },
        });
        const affectedFlowerIds = flowers
          .filter(flower => readJsonStringIds(flower.sourceDiaryIds).includes(id))
          .map(flower => flower.id);
        if (affectedFlowerIds.length) {
          await transaction.growthFlower.deleteMany({ where: { ownerDeviceId, id: { in: affectedFlowerIds } } });
        }

        const milestones = await transaction.growthMilestone.findMany({
          where: { ownerDeviceId },
          select: { id: true, sourceDiaryIds: true },
        });
        for (const milestone of milestones) {
          const sourceDiaryIds = readJsonStringIds(milestone.sourceDiaryIds);
          if (sourceDiaryIds.includes(id)) {
            await transaction.growthMilestone.update({
              where: { id: milestone.id },
              data: { sourceDiaryIds: sourceDiaryIds.filter(sourceId => sourceId !== id) as Prisma.InputJsonValue },
            });
          }
        }

        const recognitionRuns = await transaction.growthRecognitionRun.findMany({
          where: { ownerDeviceId },
          select: { id: true, sourceDiaryId: true, sourceDiaryRefs: true },
        });
        const affectedRunIds = recognitionRuns
          .filter(run => run.sourceDiaryId === id || hasJsonDiaryReference(run.sourceDiaryRefs, id))
          .map(run => run.id);
        if (affectedRunIds.length) {
          await transaction.growthRecognitionRun.deleteMany({
            where: { ownerDeviceId, id: { in: affectedRunIds } },
          });
        }

        // Reports summarize the full diary set, so any deletion invalidates their stored output and jobs.
        await transaction.growthReportJob.deleteMany({ where: { ownerDeviceId } });
        await transaction.growthInsightReport.deleteMany({ where: { ownerDeviceId } });

        await transaction.saveCommand.deleteMany({
          where: { ownerDeviceId, OR: [{ diaryId: id }, { sourceDiaryId: id }] },
        });
        if (draftIds.length) {
          await transaction.draft.deleteMany({ where: { ownerDeviceId, id: { in: draftIds } } });
        }
        await transaction.diary.delete({ where: { id } });
      });
    } catch (error) {
      await assetHook?.rollback();
      throw error;
    }

    await assetHook?.afterCommit();
    return { diaryId: id };
  }

  private async syncDiscoveryPublication(
    transaction: Prisma.TransactionClient,
    diary: {
      id: string;
      ownerDeviceId: string;
      title: string;
      location: string;
      date: Date;
      privacy: string;
      photoIds: Prisma.JsonValue;
      publicBlockIds: Prisma.JsonValue;
      contentSnapshot: Prisma.JsonValue | null;
      version: number;
    },
  ) {
    const existing = await transaction.discoveryStory.findUnique({
      where: { sourceDiaryId: diary.id },
    });
    if (existing && existing.ownerDeviceId !== diary.ownerDeviceId) {
      throw new PermissionDeniedError('discovery story does not belong to current device');
    }

    if (diary.privacy === 'private') {
      if (existing) {
        await transaction.discoveryStory.update({
          where: { id: existing.id },
          data: {
            publicationStatus: 'withdrawn',
            withdrawnAt: new Date(),
            title: '',
            authorDisplayName: '',
            coverUri: '',
            coverPhotoId: null,
            publicPhotoIds: [] as Prisma.InputJsonValue,
            publicContent: Prisma.JsonNull,
            location: '',
            cityKey: '',
            body: '',
          },
        });
      }
      return;
    }

    let snapshot;
    try {
      snapshot = buildDiscoveryPublicationSnapshot(diary);
    } catch (error) {
      if (error instanceof DiscoveryPublicationError) {
        throw new SaveDiaryError(error.code, error.message);
      }
      throw error;
    }

    const publishedAt = existing?.publicationStatus === 'published' && !existing.withdrawnAt
      ? existing.publishedAt
      : new Date();
    const baseData = {
      ownerDeviceId: diary.ownerDeviceId,
      sourceDiaryVersion: diary.version,
      publicationStatus: 'published',
      title: snapshot.title,
      authorDisplayName: snapshot.authorDisplayName,
      date: snapshot.date,
      location: snapshot.location,
      cityKey: snapshot.cityKey,
      body: snapshot.body,
      likesEnabled: snapshot.likesEnabled,
      publishedAt,
      withdrawnAt: null,
      coverPhotoId: snapshot.coverPhotoId,
      publicPhotoIds: snapshot.publicPhotoIds as Prisma.InputJsonValue,
      publicContent: {
        characterId: snapshot.characterId,
        blocks: snapshot.publicContent,
      } as Prisma.InputJsonValue,
    };

    if (existing) {
      await transaction.discoveryStory.update({
        where: { id: existing.id },
        data: {
          ...baseData,
          coverUri: snapshot.coverPhotoId
            ? this.discoveryPhotoUri(existing.id, snapshot.coverPhotoId)
            : '',
        },
      });
      return;
    }

    const created = await transaction.discoveryStory.create({
      data: {
        ...baseData,
        sourceDiaryId: diary.id,
        coverUri: '',
      },
    });
    if (snapshot.coverPhotoId) {
      await transaction.discoveryStory.update({
        where: { id: created.id },
        data: { coverUri: this.discoveryPhotoUri(created.id, snapshot.coverPhotoId) },
      });
    }
  }

  private discoveryPhotoUri(storyId: string, photoId: string) {
    return `/photos/discovery/${encodeURIComponent(storyId)}/photo-content?photoId=${encodeURIComponent(photoId)}`;
  }

  async updateDiaryVisibility(input: {
    diaryId: string;
    privacy: string;
    publicBlockIds?: string[];
  }, ownerDeviceId: string) {
    if (!isRecord(input)
      || !isNonEmptyString(input.diaryId)
      || typeof input.privacy !== 'string'
      || (input.publicBlockIds !== undefined
        && (!Array.isArray(input.publicBlockIds) || !input.publicBlockIds.every(isNonEmptyString)))) {
      throw new SaveDiaryError('invalid_input', 'sharing request is invalid');
    }
    if (!SUPPORTED_DIARY_PRIVACY_SETTINGS.includes(input.privacy as typeof SUPPORTED_DIARY_PRIVACY_SETTINGS[number])) {
      throw new SaveDiaryError('invalid_input', 'unsupported diary privacy setting');
    }

    return this.prisma.$transaction(async transaction => {
      const [lockedDiary] = await transaction.$queryRaw<Array<{ id: string }>>(Prisma.sql`
        SELECT \`id\` FROM \`Diary\` WHERE \`id\` = ${input.diaryId} FOR UPDATE
      `);
      if (!lockedDiary) throw new SaveDiaryError('not_found', 'diary not found');
      const diary = await transaction.diary.findUnique({ where: { id: input.diaryId } });
      if (!diary) throw new SaveDiaryError('not_found', 'diary not found');
      if (diary.ownerDeviceId !== ownerDeviceId) {
        throw new PermissionDeniedError('diary does not belong to current device');
      }

      let publicBlockIds: string[] | undefined;
      if (input.privacy !== 'private') {
        if (!Array.isArray(input.publicBlockIds)) {
          throw new SaveDiaryError('invalid_input', 'public block ids are required for non-private visibility');
        }
        publicBlockIds = [...new Set(input.publicBlockIds.map(item => item.trim()).filter(Boolean))];
        if (!publicBlockIds.length) {
          throw new SaveDiaryError('invalid_input', 'public block ids are required for non-private visibility');
        }
        const blocks = (diary.contentSnapshot as { blocks?: unknown[] } | null)?.blocks;
        if (!Array.isArray(blocks)) {
          throw new SaveDiaryError('invalid_input', 'diary content blocks are unavailable');
        }
        const publicParagraphIds = new Set(blocks
          .filter((block): block is Record<string, unknown> =>
            isRecord(block) && (block.type === 'text' || block.type === 'quote') && isNonEmptyString(block.id),
          )
          .map(block => block.id as string));
        if (publicBlockIds.some(blockId => !publicParagraphIds.has(blockId))) {
          throw new SaveDiaryError('invalid_input', 'public block ids must reference diary text or quote blocks');
        }
      }
      const updated = await transaction.diary.update({
        where: { id: input.diaryId },
        data: {
          privacy: input.privacy,
          publicBlockIds: publicBlockIds === undefined ? Prisma.JsonNull : publicBlockIds as Prisma.InputJsonValue,
        },
      });
      await this.syncDiscoveryPublication(transaction, updated);
      return this.mapDiaryRecord(updated);
    });
  }

  async rewriteDraftBlock(
    input: RewriteInputSnapshot,
    ownerDeviceId: string,
    uploads: UploadedGenerationPhoto[] = [],
  ): Promise<RewriteResultRecord> {
    if (!isRecord(input)
      || !isNonEmptyString(input.draftId)
      || !isNonEmptyString(input.blockId)
      || !Number.isSafeInteger(input.draftVersion)
      || input.draftVersion <= 0
      || !isNonEmptyString(input.characterId)
      || (input.blockType !== 'text' && input.blockType !== 'quote')
      || !isNonEmptyString(input.content)
      || !Array.isArray(input.selectedPhotoIds)
      || !input.selectedPhotoIds.every(isNonEmptyString)
      || (input.photoIds !== undefined
        && (!Array.isArray(input.photoIds) || !input.photoIds.every(isNonEmptyString)))
      || (input.contextBlocks !== undefined
        && (!Array.isArray(input.contextBlocks) || input.contextBlocks.some(block =>
          !isRecord(block)
          || !isNonEmptyString(block.id)
          || block.id === input.blockId
          || (block.type !== 'text' && block.type !== 'quote')
            || !isNonEmptyString(block.content))))) {
      throw new RewriteDraftError('invalid_input', 'rewrite request is invalid');
    }

    const policyCode = classifyDiaryGenerationInput([
      input.content,
      ...(input.contextBlocks ?? []).map(block => block.content),
    ].join('\n'));
    if (policyCode) {
      throw new RewriteDraftError(
        'invalid_input',
        getDiaryGenerationPolicyMessage(policyCode, 'input'),
      );
    }

    const taskKey = `rewrite:${input.draftId}:${input.blockId}:${++this.rewriteTaskSequence}`;
    const releaseTask = this.acquireDiaryAiTask(ownerDeviceId, taskKey);
    if (!releaseTask) {
      throw new RewriteDraftError(
        'version_conflict',
        '当前设备已有一项日记生成或重写任务正在执行，请等待完成后重试。',
      );
    }

    try {
      const draft = await this.getDraft(input.draftId, ownerDeviceId);
      if (!draft) {
        throw new RewriteDraftError('not_found', 'draft not found');
      }
      if (draft.version !== input.draftVersion) {
        throw new RewriteDraftError('version_conflict', 'draft version conflict');
      }

      const selectedPhotoIds = draft.selectedPhotoIds;
      const requestedPhotoIds = input.photoIds ?? [];
      if (requestedPhotoIds.some(photoId => !selectedPhotoIds.includes(photoId))) {
        throw new RewriteDraftError('invalid_input', 'rewrite references a photo outside the selected set');
      }
      let photos;
      try {
        photos = await this.generationPhotoStore.readUploadedPhotos(requestedPhotoIds, uploads);
      } catch (error) {
        if (error instanceof GenerationPhotoInputError) {
          throw new RewriteDraftError(error.code, error.message);
        }
        throw error;
      }

      return await this.diaryGenerationService.rewriteBlock({
        ...input,
        characterId: draft.characterId,
        selectedPhotoIds,
        photoIds: requestedPhotoIds,
      }, { photos });
    } finally {
      releaseTask();
    }
  }

  async listDiaries(ownerDeviceId: string) {
    const diaries = await this.prisma.diary.findMany({
      where: { ownerDeviceId },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    });
    return diaries.map(diary => this.mapDiaryRecord(diary));
  }

  async createGenerationJob(input: {
    draftId: string;
    draftVersion: number;
    idempotencyKey: string;
  }, ownerDeviceId: string, uploads: UploadedGenerationPhoto[] = []) {
    const restoreIdempotentJob = async () => {
      const existing = await this.prisma.generationJob.findUnique({
        where: {
          ownerDeviceId_idempotencyKey: {
            ownerDeviceId,
            idempotencyKey: input.idempotencyKey,
          },
        },
      });
      if (!existing) return undefined;
      if (existing.draftId !== input.draftId || existing.draftVersion !== input.draftVersion) {
        throw new GenerationJobError('version_conflict', '生成任务幂等键已绑定到其他草稿版本。');
      }
      return this.getGenerationJob(existing.jobId, ownerDeviceId);
    };

    const restored = await restoreIdempotentJob();
    if (restored) return restored;

    const draft = await this.getDraft(input.draftId, ownerDeviceId);
    if (!draft) {
      throw new GenerationJobError('not_found', 'draft not found');
    }
    if (draft.selectedPhotoIds.length < MIN_GENERATION_PHOTOS) {
      throw new GenerationJobError('invalid_input', '生成日记至少需要3张不同的有效照片。');
    }
    const taskKey = `generation:${input.draftId}:${input.draftVersion}:${input.idempotencyKey}`;
    const releaseTask = this.acquireDiaryAiTask(ownerDeviceId, taskKey);
    if (!releaseTask) {
      throw new GenerationJobError(
        'version_conflict',
        '当前设备已有一项日记生成或重写任务正在执行，请等待完成后重试。',
      );
    }
    let processingOwnsTask = false;
    try {
      try {
        await this.generationPhotoStore.stage(
          ownerDeviceId,
          draft.id,
          input.draftVersion,
          draft.selectedPhotoIds,
          uploads,
        );
      } catch (error) {
        await this.generationPhotoStore.cleanupGeneration(ownerDeviceId, draft.id, input.draftVersion).catch(() => undefined);
        if (error instanceof GenerationPhotoInputError) {
          throw new GenerationJobError(error.code, error.message);
        }
        throw error;
      }
      const inputSnapshot = this.buildGenerationInputSnapshot(draft, input.draftVersion);
      try {
        const job = await this.prisma.generationJob.create({
          data: {
            ownerDeviceId,
            draftId: input.draftId,
            draftVersion: input.draftVersion,
            idempotencyKey: input.idempotencyKey,
            status: 'queued',
            stage: 'queued',
            progressPercent: 0,
            attemptCount: 0,
            maxAttempts: this.resolveGenerationMaxAttempts(),
            errorCode: null,
            errorMessage: null,
            retryable: null,
            inputSnapshot: inputSnapshot as Prisma.InputJsonValue,
            progressMilestones: [{
              milestoneId: 'queued',
              stage: 'queued',
              progressPercent: 0,
              reachedAt: Date.now(),
              attemptCount: 0,
            }] as Prisma.InputJsonValue,
            result: Prisma.JsonNull,
          },
        });
        this.ensureGenerationJobProcessing(job.jobId, ownerDeviceId, taskKey, releaseTask);
        processingOwnsTask = true;
        return this.toPublicGenerationJob(this.mapGenerationJobRecord(job));
      } catch (error) {
        if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
          const raced = await restoreIdempotentJob();
          if (raced) return raced;
        }
        await this.generationPhotoStore.cleanupGeneration(ownerDeviceId, draft.id, input.draftVersion).catch(() => undefined);
        throw error;
      }
    } catch (error) {
      throw error;
    } finally {
      if (!processingOwnsTask) releaseTask();
    }
  }

  async getGenerationJob(jobId: string, ownerDeviceId: string) {
    const job = await this.prisma.generationJob.findUnique({
      where: { jobId },
    });
    if (!job) return undefined;
    if (job.ownerDeviceId !== ownerDeviceId) {
      throw new PermissionDeniedError('generation job does not belong to current device');
    }
    const current = this.mapGenerationJobRecord(job);
    if (current.status === 'cancelled' || current.status === 'failed' || current.status === 'succeeded') {
      return this.toPublicGenerationJob(current);
    }
    const taskKey = `generation:${job.draftId}:${job.draftVersion}:${job.idempotencyKey}`;
    void this.ensureGenerationJobProcessing(jobId, ownerDeviceId, taskKey);
    return this.toPublicGenerationJob(current);
  }

  async cancelGenerationJob(jobId: string, ownerDeviceId: string) {
    const job = await this.prisma.generationJob.findUnique({
      where: { jobId },
    });
    if (!job) return undefined;
    if (job.ownerDeviceId !== ownerDeviceId) {
      throw new PermissionDeniedError('generation job does not belong to current device');
    }
    const current = this.mapGenerationJobRecord(job);
    if (current.status === 'succeeded') return this.toPublicGenerationJob(current);
    const cancelled = {
      ...current,
      status: 'cancelled',
      stage: 'cancelled',
      progressPercent: Math.min(current.progressPercent ?? 0, 99),
    } satisfies StoredGenerationJobRecord;
    await this.prisma.generationJob.update({
      where: { jobId },
      data: {
        status: cancelled.status,
        stage: cancelled.stage,
        progressPercent: cancelled.progressPercent,
      },
    });
    this.processingGenerationJobs.get(jobId)?.controller.abort();
    return this.toPublicGenerationJob(cancelled);
  }

  async reset() {
    await this.abortAndWaitForGenerationJobs();
    await this.prisma.generationJob.deleteMany();
    await this.prisma.discoveryLike.deleteMany();
    await this.prisma.discoveryStory.deleteMany();
    await this.prisma.chatAnchorCorrectionCommand.deleteMany();
    await this.prisma.chatAnchorCorrection.deleteMany();
    await this.prisma.chatDailyAnchorSource.deleteMany();
    await this.prisma.chatDailyAnchor.deleteMany();
    await this.prisma.chatMessage.deleteMany();
    await this.prisma.chatTurn.deleteMany();
    await this.prisma.chatConversation.deleteMany();
    await this.prisma.growthReportJob.deleteMany();
    await this.prisma.growthInsightReport.deleteMany();
    await this.prisma.growthRecognitionRun.deleteMany();
    await this.prisma.growthMilestone.deleteMany();
    await this.prisma.growthFlower.deleteMany();
    await this.prisma.diaryAnchor.deleteMany();
    await this.prisma.diaryAnchorExtraction.deleteMany();
    await this.prisma.anchorCorrectionCommand.deleteMany();
    await this.prisma.anchorCorrection.deleteMany();
    await this.prisma.saveCommand.deleteMany();
    await this.prisma.diary.deleteMany();
    await this.prisma.draft.deleteMany();
  }

  async onModuleDestroy() {
    await this.abortAndWaitForGenerationJobs();
  }

  private readStringArray(value: Prisma.JsonValue) {
    return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : [];
  }

  private mapDraftRecord(draft: {
    id: string;
    sourceDiaryId: string | null;
    type: string;
    characterId: string;
    selectedPhotoIds: Prisma.JsonValue;
    privacy: string;
    version: number;
  }) {
    return {
      id: draft.id,
      sourceDiaryId: draft.sourceDiaryId ?? undefined,
      type: draft.type,
      characterId: draft.characterId,
      selectedPhotoIds: this.readStringArray(draft.selectedPhotoIds),
      privacy: draft.privacy,
      version: draft.version,
    } satisfies DraftRecord;
  }

  private mapDiaryRecord(diary: {
    id: string;
    draftId: string;
    title: string;
    summary: string;
    location: string;
    date: Date;
    privacy: string;
    photoIds: Prisma.JsonValue;
    publicBlockIds: Prisma.JsonValue | null;
    contentSnapshot: Prisma.JsonValue | null;
    createdAt: Date;
    version: number;
  }) {
    const invalidContentSnapshot = diary.contentSnapshot !== null
      && (typeof diary.contentSnapshot !== 'object' || Array.isArray(diary.contentSnapshot));
    return {
      id: diary.id,
      draftId: diary.draftId,
      title: diary.title,
      summary: diary.summary,
      location: diary.location,
      date: this.formatDate(diary.createdAt),
      privacy: diary.privacy,
      photoIds: this.readStringArray(diary.photoIds),
      publicBlockIds: diary.publicBlockIds === null ? undefined : this.readStringArray(diary.publicBlockIds),
      contentSnapshot: diary.contentSnapshot !== null
        && typeof diary.contentSnapshot === 'object'
        && !Array.isArray(diary.contentSnapshot)
        ? diary.contentSnapshot as unknown as DiaryContentSnapshotRecord
        : undefined,
      contentSnapshotStatus: invalidContentSnapshot ? 'invalid' as const : undefined,
      version: diary.version,
    } satisfies DiaryRecord;
  }

  private toPublicGenerationJob(job: StoredGenerationJobRecord) {
    return {
      jobId: job.jobId,
      draftId: job.draftId,
      draftVersion: job.draftVersion,
      idempotencyKey: job.idempotencyKey,
      createdAt: job.createdAt,
      status: job.status,
      stage: job.stage,
      progressPercent: job.progressPercent,
      attemptCount: job.attemptCount,
      maxAttempts: job.maxAttempts,
      errorCode: job.errorCode,
      errorMessage: job.errorMessage,
      retryable: job.retryable,
      progressMilestones: job.progressMilestones?.length ? job.progressMilestones : undefined,
      result: job.result,
    } satisfies GenerationJobRecord;
  }

  private mapGenerationJobRecord(job: {
    jobId: string;
    ownerDeviceId: string;
    draftId: string;
    draftVersion: number;
    idempotencyKey: string;
    status: string;
    stage: string;
    progressPercent: number | null;
    attemptCount: number;
    maxAttempts: number;
    errorCode: string | null;
    errorMessage: string | null;
    retryable: boolean | null;
    inputSnapshot: Prisma.JsonValue | null;
    progressMilestones?: Prisma.JsonValue | null;
    result: Prisma.JsonValue | null;
    createdAt: Date;
  }) {
    return {
      jobId: job.jobId,
      ownerDeviceId: job.ownerDeviceId,
      draftId: job.draftId,
      draftVersion: job.draftVersion,
      idempotencyKey: job.idempotencyKey,
      createdAt: job.createdAt.getTime(),
      status: job.status as StoredGenerationJobRecord['status'],
      stage: job.stage as StoredGenerationJobRecord['stage'],
      progressPercent: job.progressPercent ?? undefined,
      attemptCount: job.attemptCount,
      maxAttempts: job.maxAttempts,
      errorCode: job.errorCode === 'timeout' || job.errorCode === 'provider_failed' ? job.errorCode : undefined,
      errorMessage: job.errorMessage ?? undefined,
      retryable: job.retryable ?? undefined,
      inputSnapshot: this.readGenerationInputSnapshot(job.inputSnapshot),
      progressMilestones: readGenerationProgressMilestones(job.progressMilestones),
      result: this.readGenerationResult(job.result),
    } satisfies StoredGenerationJobRecord;
  }

  private async recordGenerationMilestone(
    jobId: string,
    milestoneId: GenerationProgressMilestoneId,
    attemptCount: number,
  ) {
    const row = await this.prisma.generationJob.findUnique({ where: { jobId } });
    if (!row) return;
    const current = this.mapGenerationJobRecord(row);
    if (current.status === 'cancelled' || current.status === 'failed' || current.status === 'succeeded') return;

    const definition = GENERATION_PROGRESS_MILESTONE_DEFINITIONS[milestoneId];
    const existing = current.progressMilestones ?? [];
    const hasMilestone = existing.some(milestone => milestone.milestoneId === milestoneId);
    const progressMilestones = hasMilestone
      ? existing
      : [...existing, {
          milestoneId,
          ...definition,
          reachedAt: Date.now(),
          attemptCount,
        }].sort((left, right) => left.progressPercent - right.progressPercent);
    const progressPercent = Math.max(current.progressPercent ?? 0, definition.progressPercent);
    const stage = progressPercent > definition.progressPercent
      ? current.stage
      : definition.stage;

    await this.prisma.generationJob.update({
      where: { jobId },
      data: {
        status: 'running',
        stage,
        progressPercent: Math.min(99, progressPercent),
        attemptCount,
        progressMilestones: progressMilestones as unknown as Prisma.InputJsonValue,
      },
    });
  }

  private readGenerationInputSnapshot(value: Prisma.JsonValue | null) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined;
    const input = value as Record<string, unknown>;
    if (
      typeof input.draftId !== 'string'
      || typeof input.draftVersion !== 'number'
      || typeof input.type !== 'string'
      || typeof input.characterId !== 'string'
      || typeof input.privacy !== 'string'
    ) {
      return undefined;
    }
    return {
      draftId: input.draftId,
      draftVersion: input.draftVersion,
      type: input.type,
      characterId: input.characterId,
      selectedPhotoIds: this.readStringArray((input.selectedPhotoIds ?? []) as Prisma.JsonValue),
      privacy: input.privacy,
      sourceDiaryId: typeof input.sourceDiaryId === 'string' ? input.sourceDiaryId : undefined,
    } satisfies GenerationInputSnapshot;
  }

  private readGenerationResult(value: Prisma.JsonValue | null) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined;
    return value as unknown as GenerationResultRecord;
  }

  private buildGenerationInputSnapshot(draft: DraftRecord, draftVersion: number) {
    return {
      draftId: draft.id,
      draftVersion,
      type: draft.type,
      characterId: draft.characterId,
      selectedPhotoIds: draft.selectedPhotoIds,
      privacy: draft.privacy,
      sourceDiaryId: draft.sourceDiaryId,
    } satisfies GenerationInputSnapshot;
  }

  private ensureGenerationJobProcessing(
    jobId: string,
    ownerDeviceId: string,
    taskKey: string,
    reservedTaskRelease?: () => void,
  ) {
    if (this.processingGenerationJobs.has(jobId)) {
      reservedTaskRelease?.();
      return;
    }
    const releaseTask = reservedTaskRelease ?? this.acquireDiaryAiTask(ownerDeviceId, taskKey);
    if (!releaseTask) return;
    const active = {
      controller: new AbortController(),
      promise: Promise.resolve(),
      releaseTask,
    };
    this.processingGenerationJobs.set(jobId, active);
    active.promise = this.processGenerationJob(jobId, active.controller.signal)
      .catch(() => {
        this.logger.error('Generation job processing stopped before reaching a terminal state.');
      })
      .finally(async () => {
        try {
          await this.cleanupTerminalGenerationPhotos(jobId);
        } finally {
          active.releaseTask();
          if (this.processingGenerationJobs.get(jobId) === active) {
            this.processingGenerationJobs.delete(jobId);
          }
        }
      });
  }

  private async cleanupTerminalGenerationPhotos(jobId: string) {
    try {
      const job = await this.prisma.generationJob.findUnique({ where: { jobId } });
      if (!job || !['cancelled', 'failed', 'succeeded'].includes(job.status)) return;
      await this.generationPhotoStore.cleanupGeneration(job.ownerDeviceId, job.draftId, job.draftVersion);
    } catch {
      this.logger.warn('Unable to clean terminal generation photo assets.');
    }
  }

  private async abortAndWaitForGenerationJobs() {
    const activeJobs = [...this.processingGenerationJobs.values()];
    activeJobs.forEach(active => active.controller.abort());
    await Promise.all(activeJobs.map(active => active.promise));
  }

  private resolveGenerationMaxAttempts() {
    const parsed = Number.parseInt(process.env.AI_PROVIDER_MAX_ATTEMPTS?.trim() ?? '', 10);
    if (!Number.isFinite(parsed) || parsed < 1) return 2;
    return parsed;
  }

  private async processGenerationJob(jobId: string, signal: AbortSignal) {
    if (signal.aborted) return;
    const queued = await this.prisma.generationJob.findUnique({ where: { jobId } });
    if (!queued || signal.aborted) return;
    const current = this.mapGenerationJobRecord(queued);
    if (current.status === 'cancelled' || current.status === 'failed' || current.status === 'succeeded') {
      return;
    }
    if (!current.inputSnapshot) {
      await this.prisma.generationJob.update({
        where: { jobId },
        data: {
          status: 'failed',
          stage: 'failed',
          progressPercent: 0,
          attemptCount: current.attemptCount,
          maxAttempts: current.maxAttempts,
          errorCode: 'provider_failed',
          errorMessage: 'generation input snapshot is missing',
          retryable: false,
          result: Prisma.JsonNull,
        },
      });
      return;
    }

    let attempt = current.attemptCount;
    const maxAttempts = current.maxAttempts > 0 ? current.maxAttempts : this.resolveGenerationMaxAttempts();

    while (attempt < maxAttempts && !signal.aborted) {
      const beforeAttempt = await this.prisma.generationJob.findUnique({ where: { jobId } });
      if (!beforeAttempt || signal.aborted) return;
      const latestBeforeAttempt = this.mapGenerationJobRecord(beforeAttempt);
      if (
        latestBeforeAttempt.status === 'cancelled'
        || latestBeforeAttempt.status === 'failed'
        || latestBeforeAttempt.status === 'succeeded'
      ) {
        return;
      }

      attempt += 1;
      await this.prisma.generationJob.update({
        where: { jobId },
        data: {
          status: 'running',
          stage: (latestBeforeAttempt.progressPercent ?? 0) === 0
            ? 'analyzing-photos'
            : latestBeforeAttempt.stage,
          progressPercent: latestBeforeAttempt.progressPercent ?? 0,
          attemptCount: attempt,
          maxAttempts,
          errorCode: null,
          errorMessage: null,
          retryable: null,
          result: Prisma.JsonNull,
        },
      });
      await new Promise(resolve => setTimeout(resolve, 50));
      if (signal.aborted) return;

      try {
        await this.recordGenerationMilestone(jobId, 'photo-processing-started', attempt);
        const photos = await this.generationPhotoStore.readForGeneration(
          current.ownerDeviceId,
          current.draftId,
          current.draftVersion,
          current.inputSnapshot.selectedPhotoIds,
        );
        await this.recordGenerationMilestone(jobId, 'photos-ready', attempt);
        const result = await this.diaryGenerationService.generate(current.inputSnapshot, {
          signal,
          photos,
          onProgress: milestoneId => this.recordGenerationMilestone(jobId, milestoneId, attempt),
        });
        await this.recordGenerationMilestone(jobId, 'result-validated', attempt);
        if (signal.aborted) return;
        const beforeFinalize = await this.prisma.generationJob.findUnique({ where: { jobId } });
        if (!beforeFinalize || signal.aborted) return;
        const latest = this.mapGenerationJobRecord(beforeFinalize);
        if (latest.status === 'cancelled' || latest.status === 'failed' || latest.status === 'succeeded') {
          return;
        }

        const beforeSuccess = await this.prisma.generationJob.findUnique({ where: { jobId } });
        if (!beforeSuccess) return;
        const terminalCheck = this.mapGenerationJobRecord(beforeSuccess);
        if (terminalCheck.status === 'cancelled' || terminalCheck.status === 'failed' || terminalCheck.status === 'succeeded') {
          return;
        }

        const completedMilestones = terminalCheck.progressMilestones ?? [];
        const progressMilestones = completedMilestones.some(item => item.milestoneId === 'completed')
          ? completedMilestones
          : [...completedMilestones, {
              milestoneId: 'completed' as const,
              ...GENERATION_PROGRESS_MILESTONE_DEFINITIONS.completed,
              reachedAt: Date.now(),
              attemptCount: attempt,
            }];
        await this.prisma.generationJob.update({
          where: { jobId },
          data: {
            status: 'succeeded',
            stage: 'completed',
            progressPercent: 100,
            attemptCount: attempt,
            maxAttempts,
            errorCode: null,
            errorMessage: null,
            retryable: null,
            progressMilestones: progressMilestones as unknown as Prisma.InputJsonValue,
            result: result as Prisma.InputJsonValue,
          },
        });
        return;
      } catch (error) {
        if (signal.aborted
          || (error instanceof DiaryGenerationProviderError && error.code === 'cancelled')) return;
        const existing = await this.prisma.generationJob.findUnique({ where: { jobId } });
        if (!existing || signal.aborted) return;
        const latest = this.mapGenerationJobRecord(existing);
        if (latest.status === 'cancelled' || latest.status === 'succeeded') {
          return;
        }

        const failure = error instanceof DiaryGenerationProviderError
          ? error
          : new DiaryGenerationProviderError(
              'provider_failed',
              error instanceof Error ? error.message : 'generation failed',
              false,
            );
        const shouldRetry = failure.retryable && attempt < maxAttempts;
        const latestProgress = latest.progressPercent ?? 0;

        await this.prisma.generationJob.update({
          where: { jobId },
          data: shouldRetry
            ? {
                status: 'running',
                stage: latest.stage,
                progressPercent: latestProgress,
                attemptCount: attempt,
                maxAttempts,
                errorCode: failure.code,
                errorMessage: failure.message,
                retryable: failure.retryable,
                result: Prisma.JsonNull,
              }
            : {
                status: 'failed',
                stage: 'failed',
                progressPercent: Math.min(99, latestProgress),
                attemptCount: attempt,
                maxAttempts,
                errorCode: failure.code,
                errorMessage: failure.message,
                retryable: failure.retryable,
                result: Prisma.JsonNull,
              },
        });

        if (!shouldRetry) return;
        await new Promise(resolve => setTimeout(resolve, 50));
      }
    }
  }

  private normalizeDateInput(value: string) {
    const match = value.match(/^(\d{4})[./-](\d{2})[./-](\d{2})/);
    if (match) return new Date(`${match[1]}-${match[2]}-${match[3]}T00:00:00.000Z`);
    return new Date(value);
  }

  private formatDate(value: Date) {
    const year = value.getUTCFullYear();
    const month = String(value.getUTCMonth() + 1).padStart(2, '0');
    const day = String(value.getUTCDate()).padStart(2, '0');
    return `${year}.${month}.${day}`;
  }

}
