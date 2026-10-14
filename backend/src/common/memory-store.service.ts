import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { DiaryGenerationProviderError, DiaryGenerationService, type GenerationInputSnapshot, type GenerationResultRecord, type RewriteInputSnapshot, type RewriteResultRecord } from './diary-generation.service';
import { PrismaService } from './prisma.service';

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
  privacy: string;
  photoIds: string[];
  publicBlockIds?: string[];
  version: number;
};

type SaveErrorCode = 'not_found' | 'version_conflict' | 'invalid_input';
type GenerationJobErrorCode = 'not_found';
type DraftInputErrorCode = 'invalid_input';
type RewriteDraftErrorCode = 'not_found' | 'invalid_input' | 'version_conflict';

const SUPPORTED_DIARY_TYPES = ['travel', 'work', 'emotion'] as const;
const CREATABLE_DIARY_TYPES = ['travel'] as const;
const SUPPORTED_CHARACTER_IDS = [
  'character-blue',
  'character-green',
  'character-brown',
  'character-red',
  'character-brown-2',
  'character-blue-2',
] as const;
const AVAILABLE_CHARACTER_IDS = ['character-blue', 'character-green', 'character-brown'] as const;

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

export type GenerationJobRecord = {
  jobId: string;
  draftId: string;
  draftVersion: number;
  idempotencyKey: string;
  createdAt: number;
  status: 'queued' | 'running' | 'succeeded' | 'failed' | 'cancelled';
  stage: 'queued' | 'analyzing-photos' | 'drafting' | 'structuring' | 'completed' | 'failed' | 'cancelled';
  progressPercent?: number;
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
export class MemoryStoreService {
  private readonly processingGenerationJobs = new Set<string>();

  constructor(
    private readonly prisma: PrismaService,
    private readonly diaryGenerationService: DiaryGenerationService,
  ) {}

  async createDraft(input: Omit<DraftRecord, 'id'> & { id?: string }, ownerDeviceId: string) {
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
    if (input.id) {
      const existing = await this.prisma.diary.findUnique({
        where: { id: input.id },
      });
      if (existing && existing.ownerDeviceId !== ownerDeviceId) {
        throw new PermissionDeniedError('diary does not belong to current device');
      }
    }

    const date = this.normalizeDateInput(input.date);
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
            date,
            privacy: input.privacy,
            photoIds: input.photoIds as Prisma.InputJsonValue,
            publicBlockIds: input.publicBlockIds === undefined ? Prisma.JsonNull : input.publicBlockIds as Prisma.InputJsonValue,
            version: input.version,
          },
          update: {
            draftId: input.draftId,
            title: input.title,
            summary: input.summary,
            location: input.location,
            date,
            privacy: input.privacy,
            photoIds: input.photoIds as Prisma.InputJsonValue,
            publicBlockIds: input.publicBlockIds === undefined ? Prisma.JsonNull : input.publicBlockIds as Prisma.InputJsonValue,
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
            date,
            privacy: input.privacy,
            photoIds: input.photoIds as Prisma.InputJsonValue,
            publicBlockIds: input.publicBlockIds === undefined ? Prisma.JsonNull : input.publicBlockIds as Prisma.InputJsonValue,
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
  }, ownerDeviceId: string) {
    const existingCommand = await this.prisma.saveCommand.findUnique({
      where: {
        ownerDeviceId_idempotencyKey: {
          ownerDeviceId,
          idempotencyKey: input.idempotencyKey,
        },
      },
    });
    if (existingCommand) {
      const existingDiary = await this.getDiary(existingCommand.diaryId, ownerDeviceId);
      if (existingDiary) return existingDiary;
    }

    if (input.sourceDiaryId) {
      const sourceDiary = await this.prisma.diary.findUnique({
        where: { id: input.sourceDiaryId },
      });
      if (!sourceDiary) {
        throw new SaveDiaryError('not_found', 'source diary not found');
      }
      if (sourceDiary.ownerDeviceId !== ownerDeviceId) {
        throw new PermissionDeniedError('source diary does not belong to current device');
      }
      if (input.sourceDiaryVersion !== undefined && sourceDiary.version !== input.sourceDiaryVersion) {
        throw new SaveDiaryError('version_conflict', 'source diary version conflict');
      }
    }

    if (input.id) {
      const existingDiary = await this.prisma.diary.findUnique({
        where: { id: input.id },
      });
      if (existingDiary && existingDiary.ownerDeviceId !== ownerDeviceId) {
        throw new PermissionDeniedError('diary does not belong to current device');
      }
    }

    const date = this.normalizeDateInput(input.date);
    const diary = await this.prisma.$transaction(async prisma => {
      const savedDiary = input.id
        ? await prisma.diary.upsert({
            where: { id: input.id },
            create: {
              id: input.id,
              ownerDeviceId,
              draftId: input.draftId,
              title: input.title,
              summary: input.summary,
              location: input.location,
              date,
              privacy: input.privacy,
              photoIds: input.photoIds as Prisma.InputJsonValue,
              publicBlockIds: input.publicBlockIds === undefined ? Prisma.JsonNull : input.publicBlockIds as Prisma.InputJsonValue,
              version: input.version,
            },
            update: {
              draftId: input.draftId,
              title: input.title,
              summary: input.summary,
              location: input.location,
              date,
              privacy: input.privacy,
              photoIds: input.photoIds as Prisma.InputJsonValue,
              publicBlockIds: input.publicBlockIds === undefined ? Prisma.JsonNull : input.publicBlockIds as Prisma.InputJsonValue,
              version: input.version,
            },
          })
        : await prisma.diary.create({
            data: {
              ownerDeviceId,
              draftId: input.draftId,
              title: input.title,
              summary: input.summary,
              location: input.location,
              date,
              privacy: input.privacy,
              photoIds: input.photoIds as Prisma.InputJsonValue,
              publicBlockIds: input.publicBlockIds === undefined ? Prisma.JsonNull : input.publicBlockIds as Prisma.InputJsonValue,
              version: input.version,
            },
          });

      await prisma.saveCommand.create({
        data: {
          ownerDeviceId,
          idempotencyKey: input.idempotencyKey,
          draftId: input.draftId,
          sourceDiaryId: input.sourceDiaryId,
          sourceDiaryVersion: input.sourceDiaryVersion,
          diaryId: savedDiary.id,
          savedVersion: input.version,
        },
      });

      return savedDiary;
    });

    return this.mapDiaryRecord(diary);
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

  async updateDiaryVisibility(input: {
    diaryId: string;
    privacy: string;
    publicBlockIds?: string[];
  }, ownerDeviceId: string) {
    const diary = await this.prisma.diary.findUnique({
      where: { id: input.diaryId },
    });
    if (!diary) {
      throw new SaveDiaryError('not_found', 'diary not found');
    }
    if (diary.ownerDeviceId !== ownerDeviceId) {
      throw new PermissionDeniedError('diary does not belong to current device');
    }
    const publicBlockIds = input.privacy === 'private'
      ? undefined
      : input.publicBlockIds === undefined
        ? undefined
        : [...new Set(input.publicBlockIds.filter(item => typeof item === 'string' && item.trim().length > 0))];
    if (input.privacy !== 'private' && publicBlockIds !== undefined && publicBlockIds.length === 0) {
      throw new SaveDiaryError('invalid_input', 'public block ids are required for non-private visibility');
    }
    const updated = await this.prisma.diary.update({
      where: { id: input.diaryId },
      data: {
        privacy: input.privacy,
        publicBlockIds: publicBlockIds === undefined ? Prisma.JsonNull : publicBlockIds as Prisma.InputJsonValue,
      },
    });
    return this.mapDiaryRecord(updated);
  }

  async rewriteDraftBlock(input: RewriteInputSnapshot, ownerDeviceId: string): Promise<RewriteResultRecord> {
    if (input.blockType !== 'text' && input.blockType !== 'quote') {
      throw new RewriteDraftError('invalid_input', 'unsupported block type');
    }
    if (!input.content.trim()) {
      throw new RewriteDraftError('invalid_input', 'rewrite source content is empty');
    }

    const draft = await this.getDraft(input.draftId, ownerDeviceId);
    if (!draft) {
      throw new RewriteDraftError('not_found', 'draft not found');
    }
    if (draft.version !== input.draftVersion) {
      throw new RewriteDraftError('version_conflict', 'draft version conflict');
    }

    const selectedPhotoIds = draft.selectedPhotoIds;
    const scopedPhotoIds = (input.photoIds ?? []).filter(photoId => selectedPhotoIds.includes(photoId));

    return this.diaryGenerationService.rewriteBlock({
      ...input,
      characterId: draft.characterId,
      selectedPhotoIds,
      photoIds: scopedPhotoIds.length ? scopedPhotoIds : undefined,
    });
  }

  async listDiaries(ownerDeviceId: string) {
    const diaries = await this.prisma.diary.findMany({
      where: { ownerDeviceId },
      orderBy: { date: 'desc' },
    });
    return diaries.map(diary => this.mapDiaryRecord(diary));
  }

  async createGenerationJob(input: {
    draftId: string;
    draftVersion: number;
    idempotencyKey: string;
  }, ownerDeviceId: string) {
    const existing = await this.prisma.generationJob.findUnique({
      where: {
        ownerDeviceId_idempotencyKey: {
          ownerDeviceId,
          idempotencyKey: input.idempotencyKey,
        },
      },
    });
    if (existing) {
      const restored = await this.getGenerationJob(existing.jobId, ownerDeviceId);
      if (restored) return restored;
    }

    const draft = await this.getDraft(input.draftId, ownerDeviceId);
    if (!draft) {
      throw new GenerationJobError('not_found', 'draft not found');
    }
    const inputSnapshot = this.buildGenerationInputSnapshot(draft, input.draftVersion);
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
        result: Prisma.JsonNull,
      },
    });
    void this.ensureGenerationJobProcessing(job.jobId);
    return this.toPublicGenerationJob(this.mapGenerationJobRecord(job));
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
    void this.ensureGenerationJobProcessing(jobId);
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
    this.processingGenerationJobs.delete(jobId);
    return this.toPublicGenerationJob(cancelled);
  }

  async reset() {
    this.processingGenerationJobs.clear();
    await this.prisma.generationJob.deleteMany();
    await this.prisma.saveCommand.deleteMany();
    await this.prisma.diary.deleteMany();
    await this.prisma.draft.deleteMany();
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
    version: number;
  }) {
    return {
      id: diary.id,
      draftId: diary.draftId,
      title: diary.title,
      summary: diary.summary,
      location: diary.location,
      date: this.formatDate(diary.date),
      privacy: diary.privacy,
      photoIds: this.readStringArray(diary.photoIds),
      publicBlockIds: diary.publicBlockIds === null ? undefined : this.readStringArray(diary.publicBlockIds),
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
      result: this.readGenerationResult(job.result),
    } satisfies StoredGenerationJobRecord;
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

  private async ensureGenerationJobProcessing(jobId: string) {
    if (this.processingGenerationJobs.has(jobId)) return;
    this.processingGenerationJobs.add(jobId);
    void this.processGenerationJob(jobId).finally(() => {
      this.processingGenerationJobs.delete(jobId);
    });
  }

  private resolveGenerationMaxAttempts() {
    const parsed = Number.parseInt(process.env.AI_PROVIDER_MAX_ATTEMPTS?.trim() ?? '', 10);
    if (!Number.isFinite(parsed) || parsed < 1) return 2;
    return parsed;
  }

  private async processGenerationJob(jobId: string) {
    const queued = await this.prisma.generationJob.findUnique({ where: { jobId } });
    if (!queued) return;
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

    while (attempt < maxAttempts) {
      const beforeAttempt = await this.prisma.generationJob.findUnique({ where: { jobId } });
      if (!beforeAttempt) return;
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
          stage: 'analyzing-photos',
          progressPercent: 18,
          attemptCount: attempt,
          maxAttempts,
          errorCode: null,
          errorMessage: null,
          retryable: null,
          result: Prisma.JsonNull,
        },
      });
      await new Promise(resolve => setTimeout(resolve, 50));

      try {
        const result = await this.diaryGenerationService.generate(current.inputSnapshot);
        const beforeFinalize = await this.prisma.generationJob.findUnique({ where: { jobId } });
        if (!beforeFinalize) return;
        const latest = this.mapGenerationJobRecord(beforeFinalize);
        if (latest.status === 'cancelled' || latest.status === 'failed' || latest.status === 'succeeded') {
          return;
        }

        await this.prisma.generationJob.update({
          where: { jobId },
          data: {
            status: 'running',
            stage: 'structuring',
            progressPercent: 82,
            attemptCount: attempt,
            maxAttempts,
          },
        });

        const beforeSuccess = await this.prisma.generationJob.findUnique({ where: { jobId } });
        if (!beforeSuccess) return;
        const terminalCheck = this.mapGenerationJobRecord(beforeSuccess);
        if (terminalCheck.status === 'cancelled' || terminalCheck.status === 'failed' || terminalCheck.status === 'succeeded') {
          return;
        }

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
            result: result as Prisma.InputJsonValue,
          },
        });
        return;
      } catch (error) {
        const existing = await this.prisma.generationJob.findUnique({ where: { jobId } });
        if (!existing) return;
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

        await this.prisma.generationJob.update({
          where: { jobId },
          data: shouldRetry
            ? {
                status: 'running',
                stage: 'drafting',
                progressPercent: 45,
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
                progressPercent: 0,
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
