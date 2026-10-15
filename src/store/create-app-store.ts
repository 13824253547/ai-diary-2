import { create, type StoreApi, type UseBoundStore } from 'zustand';
import { companionCandidates } from '../mocks/companions';
import { diaryTypeOptions, generationPhases } from '../mocks/creation';
import { mockCharacters } from '../mocks/characters';
import { mockDiaries, historyGroups } from '../mocks/diaries';
import { mockPhotos } from '../mocks/photos';
import { appConfig } from '../config/app-config';
import type { DiaryContentContract, GenerationJobContract, MemoriesQuery, RewriteBlockRequestContract } from '../contracts/core-diary-contract';
import { createBackendCoreDiaryRepository } from './adapters/backend-core-diary-adapter';
import type { AppStoreAdapters, PersistedDraftsSnapshot } from './adapters/types';
import { shareOptions } from '../mocks/share-options';
import type { GenerationPhase, DiaryTypeOption } from '../types/creation';
import type { ChatMessage, DiaryCharacter, DiaryDraft, DiaryItem, DiaryPerson, DiaryPhoto, DiaryPrivacy, DiaryType, GenerationStage, ShareMode } from '../types/diary';
import { buildGeneratedDiary, buildGeneratedDiaryFromResult, canGenerate, cloneDiary, getDiaryStatistics, getHistoryGroups, getPeopleForPhotos, MIN_SELECTED_PHOTOS, normalizeDiaryPhotos, publicParagraphs, sanitizePhotoIds } from './diary-domain';
import { createLocalDraftSnapshotStore } from '../services/draft-snapshot-storage';
import { getPhotoPermissionStatus, type PhotoPermissionStatus } from '../services/photo-permission';
import { exportMonthlyCollection, MonthlyExportAbortedError, type MonthlyExportResult, type MonthlyExportService, type MonthlyExportSnapshot } from '../services/monthly-export';
import { canSelectCharacterId, isSupportedCharacterId } from '../types/character-capabilities';
import { canCreateDiaryType } from '../types/diary-capabilities';

export type AppStoreDeps = {
  now?: () => number;
  createId?: (prefix: string) => string;
  photos?: DiaryPhoto[];
  diaries?: DiaryItem[];
  characters?: DiaryCharacter[];
  companions?: typeof companionCandidates;
  shareOptions?: typeof shareOptions;
  diaryTypeOptions?: DiaryTypeOption[];
  generationPhases?: GenerationPhase[];
  adapters?: AppStoreAdapters;
  monthlyExporter?: MonthlyExportService;
};

type DiaryVisibilitySaveResult =
  | { ok: true; privacy: DiaryPrivacy; publicBlockIds?: string[] }
  | { ok: false; reason: 'not_found' | 'invalid_input' | 'save_failed'; message: string };

type MonthlyExportState = {
  requestId: number;
  status: 'idle' | 'running' | 'succeeded' | 'failed' | 'cancelled';
  groupId?: string;
  monthLabel?: string;
  snapshot?: MonthlyExportSnapshot;
  result?: MonthlyExportResult;
  error?: string;
};

type MonthlyExportActionResult =
  | { ok: true; requestId: number; result: MonthlyExportResult }
  | {
      ok: false;
      requestId: number;
      reason: 'not_found' | 'failed' | 'cancelled' | 'superseded';
      message: string;
    };

export type AppStore = {
  currentStep: CreationStep;
  hasPhotoPermission: boolean;
  photoPermissionStatus: PhotoPermissionStatus;
  photoCatalogVersion: number;
  selectedType: DiaryType;
  selectedCharacterId: string;
  selectedPhotoIds: string[];
  currentDiaryId: string;
  generationPhaseIndex: number;
  companionName: string;
  photos: DiaryPhoto[];
  diaries: DiaryItem[];
  issueLog: string[];
  activeDraftId?: string;
  drafts: Record<string, DiaryDraft>;
  chatMessages: ChatMessage[];
  likedDiscoveryIds: string[];
  materialPhotoIds: string[];
  correctedAnchors: Record<string, string>;
  flowerUnlocked: boolean;
  hydratedPhotoPermission: boolean;
  hydratedDrafts: boolean;
  hydratedMemories: boolean;
  savingDraftIds: string[];
  memoriesSourceItems: DiaryItem[];
  memoriesItems: DiaryItem[];
  memoriesTotal: number;
  memoriesStatus: 'idle' | 'loading' | 'ready' | 'error';
  memoriesError?: string;
  memoriesFilterMonth: string;
  memoriesFilterDay: number | null;
  memoriesSearchKeyword: string;
  memoriesSearchVisible: boolean;
  monthlyExport: MonthlyExportState;
  beginCreation: () => string;
  beginEdit: (diaryId: string) => string | undefined;
  updateDraft: (draftId: string, patch: Partial<DiaryItem>) => void;
  setDraftPhotos: (draftId: string, photoIds: string[]) => void;
  setDraftCharacter: (draftId: string, characterId: string, options?: { preserveContent?: boolean }) => void;
  setDraftPersonName: (draftId: string, personId: string, name: string) => void;
  finalizeDraftPeopleNaming: (draftId: string) => Promise<
    | { ok: true }
    | { ok: false; message: string }
  >;
  updateDraftBlock: (draftId: string, blockId: string, content: string) => void;
  setDraftBlockPhotos: (draftId: string, blockId: string, photoIds: string[]) => void;
  rewriteDraftBlock: (draftId: string, blockId: string) => void;
  startGeneration: (draftId: string) => number | undefined;
  advanceDraftGeneration: (draftId: string, round: number, progress: number) => void;
  finishGeneration: (draftId: string, round: number) => void;
  pauseGeneration: (draftId: string, round: number) => void;
  refreshDraftGeneration: (draftId: string, round: number) => Promise<void>;
  saveDraft: (draftId: string) => Promise<string | undefined>;
  submitDraft: (draftId: string) => Promise<
    | { ok: true; diaryId: string; destination: 'detail' | 'complete' }
    | { ok: false; reason: 'needs_regeneration' | 'source_missing' | 'version_conflict' | 'save_failed' | 'pending'; message: string }
  >;
  discardDraft: (draftId: string) => void;
  savePrivacy: (diaryId: string, privacy: DiaryPrivacy, publicBlockIds?: string[]) => boolean;
  setDiaryVisibility: (diaryId: string, privacy: DiaryPrivacy, publicBlockIds?: string[]) => Promise<DiaryVisibilitySaveResult>;
  recordShareDemo: (diaryId: string, mode: ShareMode) => boolean;
  confirmShareDelivery: (input: { diaryId: string; mode: ShareMode; operationId: string; version: number }) => boolean;
  sendChat: (text: string) => void;
  toggleDiscoveryLike: (id: string) => void;
  addMaterialPhoto: (id: string) => void;
  correctAnchor: (id: string, text: string) => void;
  setFlowerUnlocked: (value: boolean) => void;
  setCurrentStep: (step: CreationStep) => void;
  setPhotoPermissionStatus: (status: PhotoPermissionStatus, options?: { advanceToAlbum?: boolean }) => void;
  grantPhotoPermission: () => void;
  selectType: (type: DiaryType) => void;
  selectCharacter: (characterId: string) => void;
  togglePhoto: (photoId: string) => void;
  setCompanionName: (name: string) => void;
  resetCreation: () => void;
  advanceGeneration: () => void;
  completeGeneration: () => void;
  setCurrentDiaryId: (diaryId: string) => void;
  updateDiaryText: (diaryId: string, content: string) => Promise<string | undefined>;
  setDiaryPrivacy: (diaryId: string, privacy: DiaryPrivacy) => void;
  markShared: (diaryId: string, mode: ShareMode) => void;
  logIssue: (message: string) => void;
  registerPhotos: (photos: DiaryPhoto[]) => void;
  hydratePhotoPermission: () => Promise<void>;
  hydrateDrafts: () => Promise<void>;
  hydrateMemories: () => Promise<void>;
  readDiaryById: (diaryId: string) => Promise<
    | { ok: true; diary: DiaryItem }
    | { ok: false; reason: 'not_found' | 'load_failed'; message: string }
  >;
  startMonthlyExport: (groupId: string) => Promise<MonthlyExportActionResult>;
  cancelMonthlyExport: () => void;
  setMemoriesFilters: (patch: {
    month?: string;
    day?: number | null;
    searchKeyword?: string;
    searchVisible?: boolean;
  }) => void;
  searchMemories: (query: MemoriesQuery) => Promise<void>;
  retryMemoriesSearch: () => Promise<void>;
};

export type AppStoreHook = UseBoundStore<StoreApi<AppStore>>;

type CreationStep = import('../types/creation').CreationStep;

const platforms: ShareMode[] = ['wechat', 'moments', 'xiaohongshu', 'weibo', 'x'];

function clonePhotoAsset(photo: DiaryPhoto): DiaryPhoto {
  return {
    ...photo,
    personIds: photo.personIds ? [...photo.personIds] : undefined,
    faceRects: photo.faceRects?.map(rect => ({ ...rect })),
  };
}

export function createDefaultAppStoreDeps(overrides: AppStoreDeps = {}): Required<AppStoreDeps> {
  const now = overrides.now ?? (() => Date.now());
  let nextSequence = 1;
  const backendRepository = appConfig.backendEnabled && !process.env.JEST_WORKER_ID ? createBackendCoreDiaryRepository() : undefined;
  const draftSnapshotStore = !process.env.JEST_WORKER_ID ? createLocalDraftSnapshotStore() : undefined;

  return {
    now,
    createId: overrides.createId ?? ((prefix: string) => `${prefix}-${now()}-${nextSequence++}`),
    photos: overrides.photos ?? mockPhotos,
    diaries: overrides.diaries ?? mockDiaries,
    characters: overrides.characters ?? mockCharacters,
    companions: overrides.companions ?? companionCandidates,
    shareOptions: overrides.shareOptions ?? shareOptions,
    diaryTypeOptions: overrides.diaryTypeOptions ?? diaryTypeOptions,
    generationPhases: overrides.generationPhases ?? generationPhases,
    monthlyExporter: overrides.monthlyExporter ?? exportMonthlyCollection,
    adapters: overrides.adapters ?? {
      diaryRepository: backendRepository,
      memoriesRepository: backendRepository,
      draftSnapshotStore,
    },
  };
}

export function createAppStore(deps: AppStoreDeps = createDefaultAppStoreDeps()): AppStoreHook {
  const resolved = createDefaultAppStoreDeps(deps);
  const availableCharacters = resolved.characters.filter(character => canSelectCharacterId(character.id));
  const initialCharacter = availableCharacters[0]?.id ?? resolved.characters[0]?.id ?? 'character-blue';
  const fallbackProgressByStage: Record<GenerationJobContract['stage'], number> = {
    queued: 5,
    'analyzing-photos': 18,
    drafting: 48,
    structuring: 82,
    completed: 100,
    failed: 0,
    cancelled: 0,
  };
  const DRAFT_SNAPSHOT_VERSION = 1 as const;
  const isGrantedPhotoPermission = (status: PhotoPermissionStatus) => status === 'full' || status === 'limited';

  const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null;
  const isStringArray = (value: unknown): value is string[] => Array.isArray(value) && value.every(item => typeof item === 'string');
  const isBoolean = (value: unknown): value is boolean => typeof value === 'boolean';

  const restoreDraftFromSnapshot = (value: unknown, photos: DiaryPhoto[]): DiaryDraft | undefined => {
    if (!isRecord(value) || !isRecord(value.diary) || !isRecord(value.generation)) return undefined;
    if (typeof value.id !== 'string' || typeof value.diary.id !== 'string') return undefined;
    if (typeof value.diary.title !== 'string' || typeof value.diary.summary !== 'string') return undefined;
    if (typeof value.diary.location !== 'string' || typeof value.diary.date !== 'string') return undefined;
    if (
      typeof value.diary.type !== 'string'
      || typeof value.diary.characterId !== 'string'
      || !isSupportedCharacterId(value.diary.characterId)
    ) return undefined;
    if (typeof value.diary.status !== 'string' || typeof value.diary.privacy !== 'string') return undefined;
    if (!isStringArray(value.selectedPhotoIds) || !isStringArray(value.diary.photoIds)) return undefined;
    if (!Array.isArray(value.diary.blocks) || !Array.isArray(value.people)) return undefined;
    if (typeof value.generation.round !== 'number' || typeof value.generation.progress !== 'number' || typeof value.generation.status !== 'string') return undefined;
    if (!isBoolean(value.dirty)) return undefined;

    const rawPeople = value.people.filter(isRecord);
    const people: DiaryPerson[] = rawPeople
      .filter(person => typeof person.id === 'string' && typeof person.name === 'string' && isStringArray(person.photoIds) && typeof person.avatarPhotoId === 'string')
      .map(person => ({
        id: person.id as string,
        name: person.name as string,
        photoIds: sanitizePhotoIds(person.photoIds as string[], photos),
        avatarPhotoId: person.avatarPhotoId as string,
        aliases: isStringArray(person.aliases) ? [...new Set(person.aliases)] : undefined,
      }))
      .filter(person => person.photoIds.length > 0);

    const selectedPhotoIds = sanitizePhotoIds(value.selectedPhotoIds, photos);
    const diaryPhotoIds = sanitizePhotoIds(value.diary.photoIds, photos);
    const diary = normalizeDiaryPhotos({
      id: value.diary.id,
      type: value.diary.type as DiaryType,
      status: value.diary.status as DiaryItem['status'],
      title: value.diary.title,
      subtitle: typeof value.diary.subtitle === 'string' ? value.diary.subtitle : '',
      location: value.diary.location,
      date: value.diary.date,
      summary: value.diary.summary,
      helperMessage: typeof value.diary.helperMessage === 'string' ? value.diary.helperMessage : '',
      characterId: value.diary.characterId,
      companionName: typeof value.diary.companionName === 'string' ? value.diary.companionName : '自己',
      privacy: value.diary.privacy as DiaryPrivacy,
      photoIds: diaryPhotoIds.length ? diaryPhotoIds : selectedPhotoIds,
      coverPhotoId: typeof value.diary.coverPhotoId === 'string' ? value.diary.coverPhotoId : '',
      blocks: value.diary.blocks as DiaryItem['blocks'],
      exportedImage: isBoolean(value.diary.exportedImage) ? value.diary.exportedImage : false,
      exportedPdf: isBoolean(value.diary.exportedPdf) ? value.diary.exportedPdf : false,
      shareModes: isStringArray(value.diary.shareModes) ? value.diary.shareModes as ShareMode[] : [],
      exportModes: isStringArray(value.diary.exportModes) ? value.diary.exportModes as ShareMode[] : [],
      version: typeof value.diary.version === 'number' ? value.diary.version : undefined,
      publicBlockIds: isStringArray(value.diary.publicBlockIds) ? value.diary.publicBlockIds : undefined,
      posterPhotoIds: isStringArray(value.diary.posterPhotoIds) ? sanitizePhotoIds(value.diary.posterPhotoIds, photos) : undefined,
      people,
      createdInSession: isBoolean(value.diary.createdInSession) ? value.diary.createdInSession : true,
      anonymous: isBoolean(value.diary.anonymous) ? value.diary.anonymous : undefined,
    }, selectedPhotoIds);

    return {
      id: value.id,
      sourceDiaryId: typeof value.sourceDiaryId === 'string' ? value.sourceDiaryId : undefined,
      diary,
      selectedPhotoIds,
      people: diary.people ?? people,
      generation: {
        round: value.generation.round,
        progress: value.generation.progress,
        status: value.generation.status as DiaryDraft['generation']['status'],
        remoteJobId: typeof value.generation.remoteJobId === 'string' ? value.generation.remoteJobId : undefined,
        remoteStage: typeof value.generation.remoteStage === 'string' ? value.generation.remoteStage as GenerationStage : undefined,
        errorMessage: typeof value.generation.errorMessage === 'string' ? value.generation.errorMessage : undefined,
      },
      dirty: value.dirty,
      savedDiaryId: typeof value.savedDiaryId === 'string' ? value.savedDiaryId : undefined,
    };
  };

  return create<AppStore>((set, get) => {
    let memoriesRequestVersion = 0;
    let nextMonthlyExportRequestId = 1;
    let activeMonthlyExportController: AbortController | undefined;
    const pendingDiscardDraftIds = new Set<string>();
    const pendingVisibilityRequests = new Map<string, Promise<DiaryVisibilitySaveResult>>();
    const confirmedShareOperations = new Map<string, string>();
    const pendingRewriteRequestIds = new Map<string, number>();
    const pendingRewriteFingerprints = new Map<string, string>();
    let nextRewriteRequestId = 1;
    let draftSnapshotHydrationFailed = false;
    const applyPhotoPermissionStatus = (
      status: PhotoPermissionStatus,
      options?: { hydrated?: boolean; advanceToAlbum?: boolean },
    ) => {
      const granted = isGrantedPhotoPermission(status);
      set(state => ({
        hasPhotoPermission: granted,
        photoPermissionStatus: status,
        hydratedPhotoPermission: options?.hydrated ?? state.hydratedPhotoPermission,
        currentStep: options?.advanceToAlbum && granted
          ? 'album'
          : !granted && state.currentStep === 'album'
            ? 'permission'
            : state.currentStep,
      }));
    };
    const generationStageRank: Record<GenerationStage, number> = {
      queued: 0,
      'analyzing-photos': 1,
      drafting: 2,
      structuring: 3,
      completed: 4,
      failed: 4,
      cancelled: 4,
    };
    const applyShareRecord = (diaryId: string, mode: ShareMode) => {
      set(state => ({
        diaries: state.diaries.map(item => item.id !== diaryId ? item : platforms.includes(mode)
          ? { ...item, shareModes: [...new Set([...item.shareModes, mode])] }
          : { ...item, exportModes: [...new Set([...(item.exportModes ?? []), mode])], exportedPdf: item.exportedPdf || mode === 'pdf', exportedImage: item.exportedImage || ['save', 'image', 'poster'].includes(mode) }),
      }));
    };
    const getConfirmedShareScope = (input: { diaryId: string; mode: ShareMode; version: number }) => `${input.diaryId}::${input.version}::${input.mode}`;

    const buildMemoryDiaryItem = (input: { id: string; title: string; summary: string; location: string; date: string; privacy: DiaryPrivacy; photoIds: string[]; version: number; contentSnapshot?: DiaryContentContract }) => {
      const existing = get().diaries.find(item => item.id === input.id);
      const content = input.contentSnapshot;
      const photos = get().photos;
      const coverPhotoId = content?.coverPhotoId ?? input.photoIds[0] ?? existing?.coverPhotoId ?? photos[0]?.id ?? '';
      return normalizeDiaryPhotos({
        id: input.id,
        type: content?.type ?? existing?.type ?? 'travel',
        status: 'ready',
        title: input.title,
        subtitle: content?.subtitle ?? existing?.subtitle ?? '后端同步回忆',
        location: input.location,
        date: input.date,
        summary: input.summary,
        helperMessage: content?.helperMessage ?? existing?.helperMessage ?? '',
        characterId: content?.characterId ?? existing?.characterId ?? resolved.characters[0]?.id ?? 'character-blue',
        companionName: content?.companionName ?? existing?.companionName ?? '自己',
        privacy: input.privacy,
        photoIds: input.photoIds,
        version: input.version,
        coverPhotoId,
        blocks: content?.blocks ?? [],
        exportedImage: existing?.exportedImage ?? false,
        exportedPdf: existing?.exportedPdf ?? false,
        shareModes: existing?.shareModes ?? [],
        exportModes: existing?.exportModes ?? [],
        createdInSession: existing?.createdInSession ?? false,
        people: content?.people ?? existing?.people,
        posterPhotoIds: content?.posterPhotoIds ?? existing?.posterPhotoIds,
        publicBlockIds: existing?.publicBlockIds,
      }, input.photoIds);
    };

    const normalizeDiaryVisibility = (
      diaryId: string,
      privacy: DiaryPrivacy,
      publicBlockIds?: string[],
    ):
      | { ok: true; ids?: string[] }
      | { ok: false; reason: 'not_found' | 'invalid_input'; message: string } => {
      const diary = get().diaries.find(item => item.id === diaryId);
      if (!diary) {
        return {
          ok: false,
          reason: 'not_found',
          message: '没有找到这篇日记。',
        };
      }
      const allowed = new Set(publicParagraphs(diary).map(block => block.id));
      const ids = publicBlockIds === undefined
        ? undefined
        : [...new Set(publicBlockIds)].filter(id => allowed.has(id));
      if (privacy !== 'private' && ids !== undefined && ids.length === 0) {
        return {
          ok: false,
          reason: 'invalid_input',
          message: '至少公开一段内容',
        };
      }
      return { ok: true, ids };
    };

    const applyDiaryVisibility = (
      diaryId: string,
      privacy: DiaryPrivacy,
      publicBlockIds?: string[],
    ) => {
      const nextPublicBlockIds = privacy === 'private' ? undefined : publicBlockIds;
      const mergeItems = (items: DiaryItem[]) => items.map(item => item.id === diaryId
        ? { ...item, privacy, publicBlockIds: nextPublicBlockIds }
        : item);
      set(state => ({
        diaries: mergeItems(state.diaries),
        memoriesSourceItems: mergeItems(state.memoriesSourceItems),
        memoriesItems: mergeItems(state.memoriesItems),
      }));
    };

    const applyGenerationSnapshot = (draftId: string, round: number, snapshot: GenerationJobContract) => {
      mutateDraft(draftId, draft => {
        if (draft.generation.round !== round) return draft;
        if (draft.generation.status === 'idle' || draft.generation.status === 'failed' || draft.generation.status === 'cancelled' || draft.generation.status === 'complete') {
          return draft;
        }

        if (snapshot.status === 'failed' || snapshot.status === 'cancelled') {
          return {
            ...draft,
            diary: { ...draft.diary, status: 'draft' },
            generation: {
              ...draft.generation,
              status: snapshot.status,
              progress: Math.max(draft.generation.progress, Math.min(99, snapshot.progressPercent ?? fallbackProgressByStage[snapshot.stage])),
              remoteJobId: snapshot.jobId,
              remoteStage: snapshot.stage,
              errorMessage: snapshot.errorMessage ?? (snapshot.status === 'failed' ? '生成失败，请稍后重试。' : '本次生成已取消。'),
            },
          };
        }

        if (snapshot.status === 'succeeded' || snapshot.stage === 'completed') {
          const generatedDiary = snapshot.result ? buildGeneratedDiaryFromResult(draft, snapshot.result) : undefined;
          if (!generatedDiary) {
            return {
              ...draft,
              diary: { ...draft.diary, status: 'draft' },
              generation: {
                ...draft.generation,
                status: 'failed',
                progress: Math.max(draft.generation.progress, 99),
                remoteJobId: snapshot.jobId,
                remoteStage: 'failed',
                errorMessage: '生成结果结构无效，请重新生成。',
              },
            };
          }
          return {
            ...draft,
            diary: generatedDiary,
            people: generatedDiary.people ?? [],
            generation: {
              round,
              progress: 100,
              status: 'complete',
              remoteJobId: snapshot.jobId,
              remoteStage: 'completed',
            },
            dirty: true,
          };
        }

        const currentStage = draft.generation.remoteStage;
        if (
          currentStage
          && generationStageRank[snapshot.stage] < generationStageRank[currentStage]
        ) {
          return draft;
        }

        return {
          ...draft,
          diary: { ...draft.diary, status: 'generating' },
          generation: {
            ...draft.generation,
            status: 'running',
            progress: Math.max(draft.generation.progress, Math.min(99, snapshot.progressPercent ?? fallbackProgressByStage[snapshot.stage])),
            remoteJobId: snapshot.jobId,
            remoteStage: snapshot.stage,
            errorMessage: undefined,
          },
        };
      });
    };

    const applyGenerationFailure = (
      draftId: string,
      round: number,
      failure: {
        status: 'failed' | 'cancelled';
        stage?: GenerationJobContract['stage'];
        progress?: number;
        message: string;
      },
    ) => {
      mutateDraft(draftId, draft => {
        if (draft.generation.round !== round) return draft;
        if (draft.generation.status === 'complete') return draft;
        return {
          ...draft,
          diary: { ...draft.diary, status: 'draft' },
          generation: {
            ...draft.generation,
            status: failure.status,
            progress: Math.max(
              draft.generation.progress,
              Math.min(99, failure.progress ?? fallbackProgressByStage[failure.stage ?? 'failed']),
            ),
            remoteStage: failure.stage ?? (failure.status === 'cancelled' ? 'cancelled' : 'failed'),
            errorMessage: failure.message,
          },
        };
      });
    };

    const syncDraftToRemote = async (draft: DiaryDraft) => {
      const repository = resolved.adapters.diaryRepository;
      if (!repository) return;
        try {
          const result = await repository.createDraft({
            id: draft.id,
            sourceDiaryId: draft.sourceDiaryId,
            type: draft.diary.type,
            characterId: draft.diary.characterId,
            selectedPhotoIds: draft.selectedPhotoIds,
            privacy: draft.diary.privacy,
            version: draft.generation.round,
          });
          if (!result.ok) get().logIssue(`草稿同步失败：${result.error.message}`);
        } catch (error) {
          get().logIssue(`草稿同步失败：${error instanceof Error ? error.message : 'unknown error'}`);
        }
    };

    const syncGenerationToRemote = async (draftId: string, round: number) => {
      const repository = resolved.adapters.diaryRepository;
      if (!repository) return;
      try {
        const result = await repository.createGenerationJob({
          draftId,
          draftVersion: round,
          idempotencyKey: `${draftId}-round-${round}`,
        });
        if (!result.ok) {
          if (result.error.code === 'not_found') {
            applyGenerationFailure(draftId, round, {
              status: 'failed',
              stage: 'failed',
              message: '当前草稿尚未同步完成，请稍后重试。',
            });
            get().logIssue(`生成任务创建失败：${result.error.message}`);
            return;
          }
          if (result.error.code === 'permission_denied') {
            applyGenerationFailure(draftId, round, {
              status: 'failed',
              stage: 'failed',
              message: '当前设备无法发起该生成任务，请返回后重试。',
            });
            get().logIssue(`生成任务创建失败：${result.error.message}`);
            return;
          }
          if (result.error.code === 'timeout') {
            applyGenerationFailure(draftId, round, {
              status: 'failed',
              stage: 'failed',
              message: '生成超时，请稍后重试。',
            });
            get().logIssue(`生成任务创建失败：${result.error.message}`);
            return;
          }
          applyGenerationFailure(draftId, round, {
            status: 'failed',
            stage: 'failed',
            message: result.error.code === 'provider_failed' ? '生成结果异常，请稍后重试。' : result.error.message,
          });
          get().logIssue(`生成任务创建失败：${result.error.message}`);
          return;
        }
        const current = get().drafts[draftId];
        if (!current || current.generation.round !== round || current.generation.status !== 'running') {
          void cancelGenerationOnRemote(draftId, round, result.data.jobId);
          return;
        }
        applyGenerationSnapshot(draftId, round, result.data);
      } catch (error) {
        applyGenerationFailure(draftId, round, {
          status: 'failed',
          stage: 'failed',
          message: '生成启动失败，请检查网络后重试。',
        });
        get().logIssue(`生成任务创建失败：${error instanceof Error ? error.message : 'unknown error'}`);
      }
    };

    const cancelGenerationOnRemote = async (draftId: string, round: number, jobId?: string) => {
      if (!jobId) return;
      const repository = resolved.adapters.diaryRepository;
      if (!repository?.cancelGenerationJob) return;
      const current = get().drafts[draftId];
      if (current && current.generation.round === round && current.generation.remoteJobId && current.generation.remoteJobId !== jobId) return;
      try {
        const result = await repository.cancelGenerationJob(jobId);
        if (!result.ok) {
          get().logIssue(`生成任务取消失败：${result.error.message}`);
        }
      } catch (error) {
        get().logIssue(`生成任务取消失败：${error instanceof Error ? error.message : 'unknown error'}`);
      }
    };

    const syncRewriteToRemote = async (input: RewriteBlockRequestContract & { requestId: number }) => {
      const repository = resolved.adapters.diaryRepository;
      const key = rewriteRequestKey(input.draftId, input.blockId);
      if (!repository?.rewriteBlock) {
        clearPendingRewriteRequest(input.draftId, input.blockId);
        return;
      }
      try {
        const result = await repository.rewriteBlock(input);
        if (!result.ok) {
          if (pendingRewriteRequestIds.get(key) === input.requestId) {
            clearPendingRewriteRequest(input.draftId, input.blockId);
            get().logIssue(`段落重写失败：${result.error.message}`);
          }
          return;
        }
        if (pendingRewriteRequestIds.get(key) !== input.requestId) return;
        const currentDraft = get().drafts[input.draftId];
        const currentBlock = currentDraft?.diary.blocks.find(block => block.id === input.blockId);
        if (!currentDraft || !currentBlock || currentBlock.type === 'photo') {
          clearPendingRewriteRequest(input.draftId, input.blockId);
          return;
        }
        if (currentBlock.content !== input.content) {
          clearPendingRewriteRequest(input.draftId, input.blockId);
          return;
        }
        replaceDraftBlockContent(input.draftId, input.blockId, result.data.content, { preserveRewriteRequest: true });
        clearPendingRewriteRequest(input.draftId, input.blockId);
      } catch (error) {
        if (pendingRewriteRequestIds.get(key) === input.requestId) {
          clearPendingRewriteRequest(input.draftId, input.blockId);
          get().logIssue(`段落重写失败：${error instanceof Error ? error.message : 'unknown error'}`);
        }
      }
    };

    const mutateDraft = (draftId: string, transform: (draft: DiaryDraft) => DiaryDraft) => {
      const draft = get().drafts[draftId];
      if (!draft || draft.savedDiaryId) return;
      const nextDraft = transform(draft);
      if (nextDraft === draft) return;
      set(state => ({ drafts: { ...state.drafts, [draftId]: nextDraft } }));
      void persistDraftSnapshot();
      void syncDraftToRemote(nextDraft);
    };

    const rewriteRequestKey = (draftId: string, blockId: string) => `${draftId}:${blockId}`;

    const clearPendingRewriteRequest = (draftId: string, blockId: string) => {
      const key = rewriteRequestKey(draftId, blockId);
      pendingRewriteRequestIds.delete(key);
      pendingRewriteFingerprints.delete(key);
    };

    const clearPendingRewriteRequests = (draftId: string) => {
      const prefix = `${draftId}:`;
      for (const key of [...pendingRewriteRequestIds.keys()]) {
        if (key.startsWith(prefix)) {
          pendingRewriteRequestIds.delete(key);
          pendingRewriteFingerprints.delete(key);
        }
      }
    };

    const replaceDraftBlockContent = (
      draftId: string,
      blockId: string,
      content: string,
      options?: { preserveRewriteRequest?: boolean },
    ) => {
      if (!options?.preserveRewriteRequest) {
        clearPendingRewriteRequest(draftId, blockId);
      }
      mutateDraft(draftId, draft => {
        const blocks = draft.diary.blocks.map(block => block.id !== blockId ? block : block.type === 'photo' ? { ...block, caption: content } : { ...block, content });
        const first = blocks.find(block => block.type === 'text');
        return { ...draft, dirty: true, diary: { ...draft.diary, blocks, summary: first && 'content' in first ? first.content.slice(0, 88) : draft.diary.summary } };
      });
    };

    const buildMemoriesQueryFromState = (): MemoriesQuery => {
      const state = get();
      const selectedMonth = state.memoriesFilterMonth === '全部'
        ? undefined
        : state.memoriesFilterMonth;
      const selectedDay = state.memoriesFilterDay && selectedMonth
        ? `${selectedMonth}.${String(state.memoriesFilterDay).padStart(2, '0')}`
        : undefined;
      const keyword = state.memoriesSearchKeyword.trim() || undefined;
      return {
        month: selectedMonth,
        day: selectedDay,
        keyword,
        page: 1,
        pageSize: 100,
      };
    };

    const buildMonthlyExportSnapshot = (groupId: string): MonthlyExportSnapshot | undefined => {
      const groups = getHistoryGroups(get().diaries);
      const group = groups.find(item => item.id === groupId);
      if (!group) return undefined;
      const diaries = group.diaryIds
        .map(id => get().diaries.find(item => item.id === id))
        .filter((diary): diary is DiaryItem => Boolean(diary))
        .map(diary => ({
          id: diary.id,
          title: diary.title,
          date: diary.date,
          version: diary.version,
        }));
      if (diaries.length !== group.diaryIds.length) {
        return undefined;
      }
      return {
        groupId: group.id,
        monthLabel: group.label,
        diaryIds: [...group.diaryIds],
        diaries,
      };
    };

    const persistDraftSnapshot = async () => {
      const snapshotStore = resolved.adapters.draftSnapshotStore;
      if (!snapshotStore || !get().hydratedDrafts || draftSnapshotHydrationFailed) return;

      const persistedDrafts: Record<string, DiaryDraft> = Object.fromEntries(
        Object.entries(get().drafts).filter(([draftId, draft]) => !draft.savedDiaryId && !pendingDiscardDraftIds.has(draftId)),
      );
      const currentActiveDraftId = get().activeDraftId;
      const activeDraftId = currentActiveDraftId && persistedDrafts[currentActiveDraftId] ? currentActiveDraftId : undefined;

      if (Object.keys(persistedDrafts).length === 0) {
        await snapshotStore.clear();
        return;
      }

      const snapshot: PersistedDraftsSnapshot = {
        version: DRAFT_SNAPSHOT_VERSION,
        activeDraftId,
        drafts: persistedDrafts,
      };
      await snapshotStore.save(snapshot);
    };

    return {
      currentStep: 'home',
      hasPhotoPermission: false,
      photoPermissionStatus: 'unknown',
      photoCatalogVersion: 0,
      selectedType: 'travel',
      selectedCharacterId: initialCharacter,
      selectedPhotoIds: [],
      currentDiaryId: 'diary-1',
      generationPhaseIndex: 0,
      companionName: '',
      photos: [...resolved.photos],
      diaries: resolved.diaries.map(cloneDiary),
      issueLog: [],
      drafts: {},
      chatMessages: [{ id: 'chat-welcome', role: 'assistant', text: '嘿，今天过得怎么样？\n我一直在这里，想听听你的小故事。' }],
      likedDiscoveryIds: [],
      materialPhotoIds: resolved.photos.slice(0, 6).map(photo => photo.id),
      correctedAnchors: {},
      flowerUnlocked: false,
      hydratedPhotoPermission: false,
      hydratedDrafts: false,
      hydratedMemories: false,
      savingDraftIds: [],
      memoriesSourceItems: resolved.adapters.memoriesRepository ? [] : resolved.diaries.map(cloneDiary),
      memoriesItems: [],
      memoriesTotal: 0,
      memoriesStatus: 'idle',
      memoriesError: undefined,
      memoriesFilterMonth: '全部',
      memoriesFilterDay: null,
      memoriesSearchKeyword: '',
      memoriesSearchVisible: false,
      monthlyExport: {
        requestId: 0,
        status: 'idle',
      },
      beginCreation: () => {
        const id = resolved.createId('draft');
        const photoIds: string[] = [];
        const diary = cloneDiary(resolved.diaries[0]);
        const people = getPeopleForPhotos(photoIds, get().photos);
        const draft: DiaryDraft = {
          id,
          diary: {
            ...diary,
            id: '',
            status: 'draft',
            photoIds,
            people,
            companionName: '',
            privacy: 'private',
            shareModes: [],
            exportModes: [],
            exportedImage: false,
            exportedPdf: false,
            publicBlockIds: undefined,
            createdInSession: true,
            blocks: [],
          },
          selectedPhotoIds: photoIds,
          people,
          generation: { round: 0, progress: 0, status: 'idle' },
          dirty: false,
        };
        set(state => ({
          activeDraftId: id,
          drafts: { ...state.drafts, [id]: draft },
          selectedPhotoIds: photoIds,
          selectedCharacterId: initialCharacter,
          selectedType: 'travel',
          companionName: '',
          generationPhaseIndex: 0,
          currentStep: state.hasPhotoPermission ? 'album' : 'permission',
        }));
        void persistDraftSnapshot();
        void syncDraftToRemote(draft);
        return id;
      },
      beginEdit: diaryId => {
        const diary = get().diaries.find(item => item.id === diaryId);
        if (!diary) return undefined;
        const existing = Object.values(get().drafts).find(draft => draft.sourceDiaryId === diaryId && !draft.savedDiaryId);
        if (existing) {
          set({
            activeDraftId: existing.id,
            currentStep: 'edit',
            selectedType: existing.diary.type,
            selectedCharacterId: existing.diary.characterId,
          });
          void persistDraftSnapshot();
          return existing.id;
        }
        const id = resolved.createId('draft');
        const people = getPeopleForPhotos(diary.photoIds, get().photos, diary.people);
        const draft: DiaryDraft = {
          id,
          sourceDiaryId: diaryId,
          diary: cloneDiary(diary),
          selectedPhotoIds: [...diary.photoIds],
          people,
          generation: { round: 0, progress: 100, status: 'complete' },
          dirty: false,
        };
        set(state => ({
          activeDraftId: id,
          currentDiaryId: diaryId,
          currentStep: 'edit',
          selectedPhotoIds: [...diary.photoIds],
          selectedCharacterId: diary.characterId,
          selectedType: diary.type,
          drafts: { ...state.drafts, [id]: draft },
        }));
        void persistDraftSnapshot();
        void syncDraftToRemote(draft);
        return id;
      },
      updateDraft: (id, patch) => mutateDraft(id, draft => ({ ...draft, dirty: true, diary: cloneDiary({ ...draft.diary, ...patch, id: draft.diary.id }) })),
      setDraftPhotos: (id, incoming) => {
        const photos = get().photos;
        const photoIds = sanitizePhotoIds(incoming, photos);
        mutateDraft(id, draft => {
          if (photoIds.join('|') === draft.selectedPhotoIds.join('|')) return draft;
          const people = getPeopleForPhotos(photoIds, photos, draft.people);
          const diary = normalizeDiaryPhotos({ ...draft.diary, photoIds, people }, photoIds);
          return {
            ...draft,
            selectedPhotoIds: photoIds,
            people,
            diary: { ...diary, status: draft.sourceDiaryId ? diary.status : 'draft' },
            dirty: true,
            generation: draft.sourceDiaryId ? draft.generation : {
              round: draft.generation.round + 1,
              progress: 0,
              status: 'idle',
              remoteJobId: undefined,
              remoteStage: undefined,
              errorMessage: undefined,
            },
          };
        });
        if (get().activeDraftId === id) set({ selectedPhotoIds: photoIds });
      },
      setDraftCharacter: (id, characterId, options) => {
        if (!canSelectCharacterId(characterId)) return;
        mutateDraft(id, draft => {
          if (draft.diary.characterId === characterId) return draft;
          const invalidate = !draft.sourceDiaryId && !options?.preserveContent && draft.generation.status !== 'idle';
          return {
            ...draft,
            dirty: true,
            diary: { ...draft.diary, characterId, status: invalidate ? 'draft' : draft.diary.status },
            generation: invalidate ? {
              round: draft.generation.round + 1,
              progress: 0,
              status: 'idle',
              remoteJobId: undefined,
              remoteStage: undefined,
              errorMessage: undefined,
            } : draft.generation,
          };
        });
        if (get().activeDraftId === id) set({ selectedCharacterId: characterId });
      },
      setDraftPersonName: (id, personId, name) => mutateDraft(id, draft => {
        const old = draft.people.find(person => person.id === personId);
        if (!old) return draft;
        const people = draft.people.map(person => person.id === personId ? { ...person, name, aliases: [...new Set([...(person.aliases ?? []), person.name.trim(), name.trim()].filter(Boolean))] } : person);
        const nextName = name.trim() || '同行人';
        return { ...draft, people, dirty: true, diary: { ...draft.diary, people, companionName: personId === 'person-self' ? draft.diary.companionName : nextName } };
      }),
      finalizeDraftPeopleNaming: async id => {
        const draft = get().drafts[id];
        if (!draft) {
          return {
            ok: false,
            message: '没有找到待命名的人物。',
          };
        }
        try {
          await persistDraftSnapshot();
          return { ok: true };
        } catch (error) {
          const message = error instanceof Error ? error.message : 'unknown error';
          get().logIssue(`人物命名保存失败：${message}`);
          return {
            ok: false,
            message: '名字还没保存成功，请稍后重试。',
          };
        }
      },
      updateDraftBlock: (id, blockId, content) => replaceDraftBlockContent(id, blockId, content),
      setDraftBlockPhotos: (id, blockId, incoming) => mutateDraft(id, draft => {
        if (!draft.diary.blocks.some(block => block.id === blockId && block.type !== 'photo')) return draft;
        const photos = get().photos;
        const photoIds = sanitizePhotoIds(incoming, photos);
        const all = [...new Set([...draft.selectedPhotoIds, ...photoIds])];
        const people = getPeopleForPhotos(all, photos, draft.people);
        const target = draft.diary.blocks.find(block => block.id === blockId);
        const previousRefs = new Set(target && 'photoIds' in target ? target.photoIds ?? [] : []);
        const blocks = draft.diary.blocks.flatMap(block => {
          if (block.id === blockId && block.type !== 'photo') return [{ ...block, photoIds }];
          if (block.type === 'photo' && block.relatedBlockId === blockId) return photoIds[0] ? [{ ...block, photoId: photoIds[0] }] : [];
          if (block.type === 'photo' && !block.relatedBlockId && previousRefs.has(block.photoId) && !photoIds.includes(block.photoId)) return [];
          return [block];
        });
        return { ...draft, dirty: true, selectedPhotoIds: all, people, diary: normalizeDiaryPhotos({ ...draft.diary, people, photoIds: all, blocks }) };
      }),
      rewriteDraftBlock: (id, blockId) => {
        const draft = get().drafts[id];
        const block = draft?.diary.blocks.find(item => item.id === blockId);
        if (!draft || !block || block.type === 'photo') return;
        const repository = resolved.adapters.diaryRepository;
        if (!repository?.rewriteBlock) return;
        const key = rewriteRequestKey(id, blockId);
        const sourceContent = block.content;
        if (!sourceContent.trim()) return;
        const fingerprint = `${draft.generation.round}:${sourceContent}`;
        if (pendingRewriteFingerprints.get(key) === fingerprint) return;
        const requestId = nextRewriteRequestId++;
        pendingRewriteRequestIds.set(key, requestId);
        pendingRewriteFingerprints.set(key, fingerprint);
        void syncRewriteToRemote({
          requestId,
          draftId: id,
          blockId,
          draftVersion: draft.generation.round,
          characterId: draft.diary.characterId,
          blockType: block.type,
          content: sourceContent,
          selectedPhotoIds: draft.selectedPhotoIds,
          photoIds: 'photoIds' in block ? block.photoIds ?? [] : undefined,
        });
      },
      startGeneration: id => {
        const draft = get().drafts[id];
        if (!draft || draft.savedDiaryId || !canGenerate(draft.selectedPhotoIds)) return undefined;
        if (draft.generation.status === 'running') return draft.generation.round;
        const unresolvedCreate = draft.generation.status === 'failed'
          && draft.generation.remoteJobId === undefined
          && draft.generation.remoteStage === 'failed';
        const round = unresolvedCreate ? draft.generation.round : draft.generation.round + 1;
        mutateDraft(id, current => ({
          ...current,
          diary: { ...current.diary, status: 'generating' },
          generation: {
            round,
            progress: 0,
            status: 'running',
            remoteJobId: undefined,
            remoteStage: 'queued',
            errorMessage: undefined,
          },
        }));
        set({ currentStep: 'generating', generationPhaseIndex: 0 });
        void syncGenerationToRemote(id, round);
        return round;
      },
      advanceDraftGeneration: (id, round, progress) => mutateDraft(id, draft => draft.generation.round !== round || draft.generation.status !== 'running' ? draft : {
        ...draft,
        generation: {
          ...draft.generation,
          progress: Math.max(draft.generation.progress, Math.min(99, progress)),
        },
      }),
      finishGeneration: (id, round) => mutateDraft(id, draft => {
        if (draft.generation.round !== round || draft.generation.status !== 'running') return draft;
        const diary = buildGeneratedDiary(draft);
        return {
          ...draft,
          diary,
          people: diary.people ?? [],
          generation: {
            ...draft.generation,
            round,
            progress: 100,
            status: 'complete',
            remoteStage: 'completed',
            errorMessage: undefined,
          },
          dirty: true,
        };
      }),
      pauseGeneration: (id, round) => {
        const current = get().drafts[id];
        if (current?.generation.round === round && current.generation.status === 'running') {
          void cancelGenerationOnRemote(id, round, current.generation.remoteJobId);
        }
        mutateDraft(id, draft => draft.generation.round !== round || draft.generation.status !== 'running' ? draft : {
          ...draft,
          diary: { ...draft.diary, status: 'draft' },
          generation: {
            round: round + 1,
            progress: 0,
            status: 'idle',
            remoteJobId: undefined,
            remoteStage: undefined,
            errorMessage: undefined,
          },
        });
      },
      refreshDraftGeneration: async (id, round) => {
        const draft = get().drafts[id];
        const repository = resolved.adapters.diaryRepository;
        if (!draft || !repository || draft.generation.round !== round || draft.generation.status !== 'running' || !draft.generation.remoteJobId) {
          return;
        }
        try {
          const result = await repository.getGenerationJob(draft.generation.remoteJobId);
          if (!result.ok) {
            if (result.error.code === 'not_found') {
              applyGenerationFailure(id, round, {
                status: 'failed',
                stage: 'failed',
                message: '生成任务已失效，请重新生成。',
              });
              return;
            }
            if (result.error.code === 'permission_denied') {
              applyGenerationFailure(id, round, {
                status: 'failed',
                stage: 'failed',
                message: '当前设备无法继续读取该生成任务，请重新生成。',
              });
              return;
            }
            if (result.error.code === 'cancelled') {
              applyGenerationFailure(id, round, {
                status: 'cancelled',
                stage: 'cancelled',
                message: '本次生成已取消。',
              });
              return;
            }
            if (result.error.code === 'timeout') {
              applyGenerationFailure(id, round, {
                status: 'failed',
                stage: 'failed',
                message: '生成超时，请稍后重试。',
              });
              return;
            }
            if (result.error.code === 'provider_failed') {
              applyGenerationFailure(id, round, {
                status: 'failed',
                stage: 'failed',
                message: '生成失败，请稍后重试。',
              });
              return;
            }
            get().logIssue(`生成任务同步失败：${result.error.message}`);
            return;
          }
          applyGenerationSnapshot(id, round, result.data);
        } catch (error) {
          applyGenerationFailure(id, round, {
            status: 'failed',
            stage: 'failed',
            message: '生成失败，请检查网络后重试。',
          });
          get().logIssue(`生成任务同步失败：${error instanceof Error ? error.message : 'unknown error'}`);
        }
      },
      saveDraft: async id => {
        const result = await get().submitDraft(id);
        return result.ok ? result.diaryId : undefined;
      },
      submitDraft: async id => {
        const draft = get().drafts[id];
        if (!draft) {
          return {
            ok: false,
            reason: 'save_failed',
            message: '没有找到这篇草稿。',
          };
        }
        if (get().savingDraftIds.includes(id)) {
          return {
            ok: false,
            reason: 'pending',
            message: '正在保存，请稍候。',
          };
        }
        if (draft.savedDiaryId) {
          return {
            ok: true,
            diaryId: draft.savedDiaryId,
            destination: draft.sourceDiaryId ? 'detail' : 'complete',
          };
        }
        if (!draft.sourceDiaryId && (draft.generation.status !== 'complete' || !canGenerate(draft.selectedPhotoIds))) {
          return {
            ok: false,
            reason: 'needs_regeneration',
            message: '照片已更新，重新生成后就可以保存。',
          };
        }
        if (draft.sourceDiaryId && !get().diaries.some(diary => diary.id === draft.sourceDiaryId)) {
          return {
            ok: false,
            reason: 'source_missing',
            message: '原日记已不存在，请返回回忆列表确认后再处理。',
          };
        }

        const repository = resolved.adapters.diaryRepository;
        const targetDiaryId = draft.sourceDiaryId ?? resolved.createId('diary');
        const sourceDiaryVersion = draft.sourceDiaryId ? (draft.diary.version ?? 0) : undefined;
        const savedVersion = sourceDiaryVersion !== undefined ? sourceDiaryVersion + 1 : draft.generation.round;
        const photos = get().photos;
        const people = draft.people.map(person => ({ ...person, name: person.name.trim() || (person.id === 'person-self' ? '我' : '同行人') }));
        const normalizedDiary = cloneDiary(normalizeDiaryPhotos({
          ...draft.diary,
          id: targetDiaryId,
          status: 'ready',
          people,
          version: savedVersion,
        }, sanitizePhotoIds(draft.selectedPhotoIds, photos)));
        const destination: 'detail' | 'complete' = draft.sourceDiaryId ? 'detail' : 'complete';
        const finishLocalSave = (savedDiaryId: string, savedVersion: number) => {
          const diary = cloneDiary({
            ...normalizedDiary,
            id: savedDiaryId,
            version: savedVersion,
          });
          clearPendingRewriteRequests(id);
          const shouldDropDraft = pendingDiscardDraftIds.has(id);
          if (shouldDropDraft) pendingDiscardDraftIds.delete(id);
          set(state => {
            const { [id]: discardedDraft, ...remainingDrafts } = state.drafts;
            void discardedDraft;
            return {
              diaries: draft.sourceDiaryId ? state.diaries.map(item => item.id === savedDiaryId ? diary : item) : [diary, ...state.diaries],
              memoriesSourceItems: draft.sourceDiaryId
                ? state.memoriesSourceItems.map(item => item.id === savedDiaryId ? diary : item)
                : [diary, ...state.memoriesSourceItems],
              currentDiaryId: shouldDropDraft ? state.currentDiaryId : savedDiaryId,
              currentStep: shouldDropDraft ? state.currentStep : 'detail',
              activeDraftId: state.activeDraftId === id ? undefined : state.activeDraftId,
              drafts: shouldDropDraft
                ? remainingDrafts
                : { ...state.drafts, [id]: { ...draft, diary, dirty: false, savedDiaryId: savedDiaryId } },
            };
          });
          void persistDraftSnapshot();
          return {
            ok: true as const,
            diaryId: savedDiaryId,
            destination,
          };
        };

        if (!repository) {
          return finishLocalSave(targetDiaryId, savedVersion);
        }

        set(state => ({ savingDraftIds: [...new Set([...state.savingDraftIds, id])] }));
        const idempotencyKey = `${draft.id}-save-${draft.generation.round}`;
        try {
          const result = await repository.saveDiary({
            id: targetDiaryId,
            draftId: draft.id,
            sourceDiaryId: draft.sourceDiaryId,
            sourceDiaryVersion,
            idempotencyKey,
            title: normalizedDiary.title,
            summary: normalizedDiary.summary,
            location: normalizedDiary.location,
            date: normalizedDiary.date,
            privacy: normalizedDiary.privacy,
            photoIds: normalizedDiary.photoIds,
            version: savedVersion,
            contentSnapshot: {
              type: normalizedDiary.type,
              subtitle: normalizedDiary.subtitle,
              helperMessage: normalizedDiary.helperMessage,
              characterId: normalizedDiary.characterId,
              companionName: normalizedDiary.companionName,
              coverPhotoId: normalizedDiary.coverPhotoId,
              blocks: normalizedDiary.blocks,
              posterPhotoIds: normalizedDiary.posterPhotoIds,
              people: normalizedDiary.people,
            },
          });
          if (result.ok) {
            return finishLocalSave(result.data.id ?? result.data.diaryId, result.data.savedVersion);
          }
          if (result.error.code === 'version_conflict') {
            get().logIssue('日记保存失败：原日记已有新版本，请重新进入编辑后再处理。');
            return {
              ok: false,
              reason: 'version_conflict',
              message: '这篇日记已经有新版本了，当前草稿已保留，请重新进入编辑后再处理。',
            };
          }
          if (result.error.code === 'not_found') {
            get().logIssue('日记保存失败：原日记已不存在，请返回回忆列表确认后再处理。');
            return {
              ok: false,
              reason: 'source_missing',
              message: '原日记已不存在，请返回回忆列表确认后再处理。',
            };
          }
          if (result.error.retryable && (result.error.code === 'timeout' || result.error.code === 'provider_failed')) {
            try {
              const recovered = await repository.getSaveResult(idempotencyKey);
              if (recovered.ok) {
                return finishLocalSave(recovered.data.id ?? recovered.data.diaryId, recovered.data.savedVersion);
              }
            } catch {
              // Keep the working draft; the same idempotency key remains available for a later retry.
            }
          }
          get().logIssue(`日记保存失败：${result.error.message}`);
          return {
            ok: false,
            reason: 'save_failed',
            message: result.error.message,
          };
        } catch (error) {
          try {
            const recovered = await repository.getSaveResult(idempotencyKey);
            if (recovered.ok) {
              return finishLocalSave(recovered.data.id ?? recovered.data.diaryId, recovered.data.savedVersion);
            }
          } catch (recoveryError) {
            void recoveryError;
          }
          const message = error instanceof Error ? error.message : 'unknown error';
          get().logIssue(`日记保存失败：${message}`);
          return {
            ok: false,
            reason: 'save_failed',
            message,
          };
        } finally {
          set(state => ({
            savingDraftIds: state.savingDraftIds.filter(draftId => draftId !== id),
          }));
          if (pendingDiscardDraftIds.has(id)) {
            pendingDiscardDraftIds.delete(id);
            set(state => {
              const { [id]: discarded, ...drafts } = state.drafts;
              void discarded;
              return {
                drafts,
                activeDraftId: state.activeDraftId === id ? undefined : state.activeDraftId,
              };
            });
            void persistDraftSnapshot();
          }
        }
      },
      discardDraft: id => {
        const draft = get().drafts[id];
        clearPendingRewriteRequests(id);
        if (draft?.generation.status === 'running') {
          void cancelGenerationOnRemote(id, draft.generation.round, draft.generation.remoteJobId);
        }
        if (get().savingDraftIds.includes(id)) {
          pendingDiscardDraftIds.add(id);
          set(state => ({
            activeDraftId: state.activeDraftId === id ? undefined : state.activeDraftId,
          }));
          void persistDraftSnapshot();
          return;
        }
        set(state => {
        const { [id]: discarded, ...drafts } = state.drafts;
        void discarded;
        return { drafts, activeDraftId: state.activeDraftId === id ? undefined : state.activeDraftId };
        });
        void persistDraftSnapshot();
      },
      savePrivacy: (diaryId, privacy, publicBlockIds) => {
        const normalized = normalizeDiaryVisibility(diaryId, privacy, publicBlockIds);
        if (!normalized.ok) return false;
        applyDiaryVisibility(diaryId, privacy, normalized.ids);
        return true;
      },
      setDiaryVisibility: async (id, privacy, ids) => {
        const normalized = normalizeDiaryVisibility(id, privacy, ids);
        if (!normalized.ok) {
          return normalized;
        }
        const existingRequest = pendingVisibilityRequests.get(id);
        if (existingRequest) {
          return existingRequest;
        }
        const repository = resolved.adapters.diaryRepository;
        const request = (async (): Promise<DiaryVisibilitySaveResult> => {
          if (!repository?.updateDiaryVisibility) {
            applyDiaryVisibility(id, privacy, normalized.ids);
            return {
              ok: true,
              privacy,
              publicBlockIds: privacy === 'private' ? undefined : normalized.ids,
            };
          }
          try {
            const result = await repository.updateDiaryVisibility({
              diaryId: id,
              privacy,
              publicBlockIds: normalized.ids,
            });
            if (!result.ok) {
              const message = result.error.code === 'not_found'
                ? '没有找到这篇日记。'
                : result.error.code === 'invalid_input'
                  ? '至少公开一段内容'
                  : result.error.code === 'permission_denied'
                    ? '当前设备无法修改这篇日记。'
                    : '公开范围保存失败，请稍后重试。';
              get().logIssue(`公开范围保存失败：${result.error.message}`);
              return {
                ok: false,
                reason: result.error.code === 'not_found' ? 'not_found' : result.error.code === 'invalid_input' ? 'invalid_input' : 'save_failed',
                message,
              };
            }
            const nextPrivacy = result.data.privacy as DiaryPrivacy;
            const nextPublicBlockIds = nextPrivacy === 'private'
              ? undefined
              : result.data.publicBlockIds;
            applyDiaryVisibility(id, nextPrivacy, nextPublicBlockIds);
            return {
              ok: true,
              privacy: nextPrivacy,
              publicBlockIds: nextPublicBlockIds,
            };
          } catch (error) {
            const message = error instanceof Error ? error.message : 'unknown error';
            get().logIssue(`公开范围保存失败：${message}`);
            return {
              ok: false,
              reason: 'save_failed',
              message: '公开范围保存失败，请稍后重试。',
            };
          } finally {
            pendingVisibilityRequests.delete(id);
          }
        })();
        pendingVisibilityRequests.set(id, request);
        return request;
      },
      recordShareDemo: (diaryId, mode) => {
        const diary = get().diaries.find(item => item.id === diaryId);
        if (!diary || (platforms.includes(mode) && diary.privacy === 'private')) return false;
        applyShareRecord(diaryId, mode);
        return true;
      },
      confirmShareDelivery: ({ diaryId, mode, operationId, version }) => {
        const diary = get().diaries.find(item => item.id === diaryId);
        const currentVersion = diary?.version ?? 0;
        if (!diary || currentVersion !== version || (platforms.includes(mode) && diary.privacy === 'private')) return false;
        const scope = getConfirmedShareScope({ diaryId, mode, version: currentVersion });
        const existingScope = confirmedShareOperations.get(operationId);
        if (existingScope) return existingScope === scope;
        confirmedShareOperations.set(operationId, scope);
        applyShareRecord(diaryId, mode);
        return true;
      },
      sendChat: text => {
        const message = text.trim();
        if (!message) return;
        const reply = /累|难过|伤心|烦|压力/.test(message)
          ? '辛苦啦。先停下来，深呼吸一下吧。我会陪着你，慢慢说就好。🍊'
          : /旅行|台南|照片|日记/.test(message)
            ? '听起来是一段值得收藏的回忆！把照片和小故事放进日记，下次翻开时，快乐还会再来一次。🍊'
            : /谢谢|开心|快乐|喜欢/.test(message)
              ? '听到你这样说，我也好开心。把这份小小的幸福记下来吧！🍊'
              : '嗯嗯，我在认真听。今天还有哪个瞬间，让你想多停留一会儿呢？🍊';
        set(state => ({ chatMessages: [...state.chatMessages, { id: resolved.createId('chat'), role: 'user', text: message }, { id: resolved.createId('chat'), role: 'assistant', text: reply }] }));
      },
      toggleDiscoveryLike: id => set(state => ({ likedDiscoveryIds: state.likedDiscoveryIds.includes(id) ? state.likedDiscoveryIds.filter(item => item !== id) : [...state.likedDiscoveryIds, id] })),
      addMaterialPhoto: id => {
        if (get().photos.some(photo => photo.id === id)) {
          set(state => ({ materialPhotoIds: [...new Set([...state.materialPhotoIds, id])] }));
        }
      },
      correctAnchor: (id, text) => { if (text.trim()) set(state => ({ correctedAnchors: { ...state.correctedAnchors, [id]: text.trim() } })); },
      setFlowerUnlocked: flowerUnlocked => set({ flowerUnlocked }),
      setCurrentStep: currentStep => set({ currentStep }),
      setPhotoPermissionStatus: (status, options) => applyPhotoPermissionStatus(status, { advanceToAlbum: options?.advanceToAlbum }),
      grantPhotoPermission: () => applyPhotoPermissionStatus('full', { advanceToAlbum: true, hydrated: true }),
      selectType: selectedType => {
        if (!canCreateDiaryType(selectedType)) return;
        set({ selectedType, currentStep: 'template' });
        const id = get().activeDraftId;
        if (id) get().updateDraft(id, { type: selectedType });
      },
      selectCharacter: selectedCharacterId => {
        if (!canSelectCharacterId(selectedCharacterId)) return;
        set({ selectedCharacterId, currentStep: 'character' });
        const id = get().activeDraftId;
        if (id) get().setDraftCharacter(id, selectedCharacterId);
      },
      togglePhoto: photoId => {
        const ids = get().selectedPhotoIds;
        const next = ids.includes(photoId) ? ids.filter(id => id !== photoId) : [...ids, photoId];
        const draftId = get().activeDraftId;
        if (draftId) get().setDraftPhotos(draftId, next);
        else set({ selectedPhotoIds: sanitizePhotoIds(next, get().photos) });
      },
      setCompanionName: companionName => {
        set({ companionName });
        const id = get().activeDraftId;
        if (id) {
          const person = get().drafts[id]?.people.find(item => item.id !== 'person-self');
          if (person) get().setDraftPersonName(id, person.id, companionName);
        }
      },
      resetCreation: () => { get().beginCreation(); },
      advanceGeneration: () => set(state => ({ generationPhaseIndex: Math.min(state.generationPhaseIndex + 1, resolved.generationPhases.length - 1) })),
      completeGeneration: () => {
        const id = get().activeDraftId;
        if (!id) return;
        const round = get().startGeneration(id);
        if (round !== undefined) get().finishGeneration(id, round);
      },
      setCurrentDiaryId: currentDiaryId => { if (get().diaries.some(diary => diary.id === currentDiaryId)) set({ currentDiaryId }); },
      updateDiaryText: async (diaryId, content) => {
        const id = get().beginEdit(diaryId);
        if (!id) return undefined;
        const block = get().drafts[id].diary.blocks.find(item => item.type === 'text');
        if (block) get().updateDraftBlock(id, block.id, content);
        return get().saveDraft(id);
      },
      setDiaryPrivacy: (id, privacy) => { get().savePrivacy(id, privacy); },
      markShared: (id, mode) => {
        const diary = get().diaries.find(item => item.id === id);
        if (!diary) return;
        get().confirmShareDelivery({
          diaryId: id,
          mode,
          version: diary.version ?? 0,
          operationId: resolved.createId('share-confirmed'),
        });
      },
      logIssue: message => set(state => ({ issueLog: [...state.issueLog, message] })),
      registerPhotos: photos => {
        if (!photos.length) return;
        set(state => {
          const nextById = new Map(state.photos.map(photo => [photo.id, photo]));
          let changed = false;
          for (const photo of photos) {
            const incoming = clonePhotoAsset(photo);
            const existing = nextById.get(photo.id);
            nextById.set(photo.id, existing ? { ...existing, ...incoming } : incoming);
            changed = true;
          }
          return changed
            ? { photos: [...nextById.values()], photoCatalogVersion: state.photoCatalogVersion + 1 }
            : state;
        });
      },
      hydratePhotoPermission: async () => {
        if (get().hydratedPhotoPermission) return;
        try {
          const result = await getPhotoPermissionStatus();
          applyPhotoPermissionStatus(result.status, { hydrated: true });
        } catch (error) {
          applyPhotoPermissionStatus('unknown', { hydrated: true });
          get().logIssue(`相册权限状态同步失败：${error instanceof Error ? error.message : 'unknown error'}`);
        }
      },
      hydrateDrafts: async () => {
        if (get().hydratedDrafts) return;
        const snapshotStore = resolved.adapters.draftSnapshotStore;
        if (!snapshotStore) {
          set({ hydratedDrafts: true });
          return;
        }

        try {
          const rawSnapshot = await snapshotStore.load();
          if (
            isRecord(rawSnapshot)
            && typeof rawSnapshot.version === 'number'
            && Number.isInteger(rawSnapshot.version)
            && rawSnapshot.version !== DRAFT_SNAPSHOT_VERSION
          ) {
            draftSnapshotHydrationFailed = true;
            set({ hydratedDrafts: true });
            get().logIssue(`本地草稿快照版本 ${rawSnapshot.version} 暂不支持；已保留原数据，未清理或覆盖。`);
            return;
          }
          if (!isRecord(rawSnapshot) || rawSnapshot.version !== DRAFT_SNAPSHOT_VERSION || !isRecord(rawSnapshot.drafts)) {
            if (rawSnapshot !== undefined) {
              await snapshotStore.clear();
              get().logIssue('本地草稿快照已损坏，已跳过无效恢复数据。');
            }
            set({ hydratedDrafts: true });
            if (Object.keys(get().drafts).length > 0) await persistDraftSnapshot();
            return;
          }

          const photos = get().photos;
          const restoredEntries = Object.entries(rawSnapshot.drafts)
            .map(([draftId, value]) => [draftId, restoreDraftFromSnapshot(value, photos)] as const);
          const restoredDrafts = Object.fromEntries(
            restoredEntries.filter((entry): entry is [string, DiaryDraft] => Boolean(entry[1]) && !entry[1]?.savedDiaryId),
          );
          const droppedCount = restoredEntries.length - Object.keys(restoredDrafts).length;
          const activeDraftId = typeof rawSnapshot.activeDraftId === 'string' && restoredDrafts[rawSnapshot.activeDraftId]
            ? rawSnapshot.activeDraftId
            : undefined;
          const activeDraft = activeDraftId ? restoredDrafts[activeDraftId] : undefined;

          if (Object.keys(restoredDrafts).length === 0) {
            await snapshotStore.clear();
            if (droppedCount > 0) get().logIssue('本地草稿快照包含无效记录，已清理损坏草稿。');
            set({ hydratedDrafts: true });
            if (Object.keys(get().drafts).length > 0) await persistDraftSnapshot();
            return;
          }

          set(state => ({
            hydratedDrafts: true,
            drafts: { ...state.drafts, ...restoredDrafts },
            activeDraftId: state.activeDraftId ?? activeDraftId,
            selectedPhotoIds: activeDraft?.selectedPhotoIds ?? state.selectedPhotoIds,
            selectedCharacterId: activeDraft?.diary.characterId ?? state.selectedCharacterId,
            selectedType: activeDraft?.diary.type ?? state.selectedType,
            companionName: activeDraft?.diary.companionName ?? state.companionName,
            currentStep: activeDraft
              ? (activeDraft.generation.status === 'running' ? 'generating' : 'edit')
              : state.currentStep,
          }));

          if (droppedCount > 0) get().logIssue('本地草稿快照中的损坏记录已被隔离，其他有效草稿已恢复。');
          await persistDraftSnapshot();
          Object.values(restoredDrafts).forEach(draft => {
            void syncDraftToRemote(draft);
          });
        } catch (error) {
          draftSnapshotHydrationFailed = true;
          set({ hydratedDrafts: true });
          get().logIssue(`本地草稿恢复失败：${error instanceof Error ? error.message : 'unknown error'}`);
        }
      },
      hydrateMemories: async () => {
        if (get().hydratedMemories) return;
        const repository = resolved.adapters.memoriesRepository;
        if (!repository) {
          set(state => ({
            hydratedMemories: true,
            memoriesSourceItems: state.memoriesSourceItems.length ? state.memoriesSourceItems : state.diaries,
          }));
          return;
        }
        try {
          const result = await repository.listMemories({ page: 1, pageSize: 100 });
          if (!result.ok) {
            get().logIssue(`回忆同步失败：${result.error.message}`);
            return;
          }
          const remoteDiaries = result.data.items.map(item => buildMemoryDiaryItem({
            id: item.id,
            title: item.title,
            summary: item.summary,
            location: item.location,
            date: item.date,
            privacy: item.privacy,
            photoIds: item.photoIds,
            version: item.version,
            contentSnapshot: item.contentSnapshot,
          }));
          set(state => {
            const merged = [...state.diaries];
            for (const remoteDiary of remoteDiaries) {
              const index = merged.findIndex(item => item.id === remoteDiary.id);
              if (index >= 0) merged[index] = remoteDiary;
              else merged.unshift(remoteDiary);
            }
            return {
              diaries: merged,
              hydratedMemories: true,
              memoriesSourceItems: remoteDiaries,
              memoriesItems: state.memoriesStatus === 'idle' ? remoteDiaries : state.memoriesItems,
              memoriesTotal: state.memoriesStatus === 'idle' ? remoteDiaries.length : state.memoriesTotal,
            };
          });
        } catch (error) {
          get().logIssue(`回忆同步失败：${error instanceof Error ? error.message : 'unknown error'}`);
        }
      },
      readDiaryById: async diaryId => {
        const localDiary = get().diaries.find(item => item.id === diaryId);
        const repository = resolved.adapters.diaryRepository;
        if (!repository?.getDiary) {
          return localDiary
            ? { ok: true as const, diary: localDiary }
            : { ok: false as const, reason: 'not_found', message: '没有找到这篇日记。' };
        }

        try {
          const result = await repository.getDiary(diaryId);
          if (!result.ok) {
            if (result.error.code === 'not_found' || result.error.code === 'permission_denied') {
              return { ok: false as const, reason: 'not_found', message: '没有找到这篇日记。' };
            }
            get().logIssue(`读取日记失败：${result.error.message}`);
            return { ok: false as const, reason: 'load_failed', message: result.error.message };
          }

          const diary = normalizeDiaryPhotos(result.data, result.data.photoIds);
          set(state => {
            const mergeItems = (items: DiaryItem[]) => {
              const next = [...items];
              const index = next.findIndex(item => item.id === diary.id);
              if (index >= 0) next[index] = diary;
              else next.unshift(diary);
              return next;
            };
            return {
              diaries: mergeItems(state.diaries),
              memoriesSourceItems: mergeItems(state.memoriesSourceItems),
              memoriesItems: state.memoriesStatus === 'ready' ? mergeItems(state.memoriesItems) : state.memoriesItems,
            };
          });
          return { ok: true as const, diary };
        } catch (error) {
          const message = error instanceof Error ? error.message : 'unknown error';
          get().logIssue(`读取日记失败：${message}`);
          return { ok: false as const, reason: 'load_failed', message };
        }
      },
      startMonthlyExport: async groupId => {
        const snapshot = buildMonthlyExportSnapshot(groupId);
        if (!snapshot) {
          return {
            ok: false as const,
            requestId: 0,
            reason: 'not_found',
            message: '当前月份合集已失效，请返回后重试。',
          };
        }

        activeMonthlyExportController?.abort();
        const controller = new AbortController();
        activeMonthlyExportController = controller;
        const requestId = nextMonthlyExportRequestId++;

        set({
          monthlyExport: {
            requestId,
            status: 'running',
            groupId: snapshot.groupId,
            monthLabel: snapshot.monthLabel,
            snapshot,
          },
        });

        try {
          const result = await resolved.monthlyExporter(snapshot, { signal: controller.signal });
          const current = get().monthlyExport;
          if (current.requestId !== requestId) {
            return {
              ok: false as const,
              requestId,
              reason: 'superseded',
              message: 'stale monthly export ignored',
            };
          }
          set({
            monthlyExport: {
              ...current,
              status: 'succeeded',
              result,
              error: undefined,
            },
          });
          return {
            ok: true as const,
            requestId,
            result,
          };
        } catch (error) {
          const current = get().monthlyExport;
          const aborted = controller.signal.aborted || error instanceof MonthlyExportAbortedError;
          if (current.requestId !== requestId) {
            return {
              ok: false as const,
              requestId,
              reason: 'superseded',
              message: 'stale monthly export ignored',
            };
          }
          if (aborted) {
            set({
              monthlyExport: {
                ...current,
                status: 'cancelled',
                result: undefined,
                error: '本次月度导出已取消。',
              },
            });
            return {
              ok: false as const,
              requestId,
              reason: 'cancelled',
              message: '本次月度导出已取消。',
            };
          }
          const message = error instanceof Error ? error.message : 'unknown error';
          get().logIssue(`月度装订导出失败：${message}`);
          set({
            monthlyExport: {
              ...current,
              status: 'failed',
              result: undefined,
              error: '月度导出失败，请稍后重试。',
            },
          });
          return {
            ok: false as const,
            requestId,
            reason: 'failed',
            message: '月度导出失败，请稍后重试。',
          };
        } finally {
          if (activeMonthlyExportController === controller) {
            activeMonthlyExportController = undefined;
          }
        }
      },
      cancelMonthlyExport: () => {
        activeMonthlyExportController?.abort();
      },
      setMemoriesFilters: patch => set(state => ({
        memoriesFilterMonth: patch.month ?? state.memoriesFilterMonth,
        memoriesFilterDay: patch.day !== undefined ? patch.day : state.memoriesFilterDay,
        memoriesSearchKeyword: patch.searchKeyword ?? state.memoriesSearchKeyword,
        memoriesSearchVisible: patch.searchVisible ?? state.memoriesSearchVisible,
      })),
      searchMemories: async query => {
        const requestVersion = ++memoriesRequestVersion;
        const repository = resolved.adapters.memoriesRepository;
        set(state => ({
          memoriesStatus: 'loading',
          memoriesError: undefined,
          memoriesItems: state.memoriesStatus === 'idle' ? state.diaries : state.memoriesItems,
        }));

        if (!repository) {
          const month = query.month?.replaceAll('-', '.');
          const day = query.day?.replaceAll('-', '.');
          const keyword = query.keyword?.trim();
          const items = get().diaries.filter(item => {
            const matchesMonth = !month || item.date.startsWith(month);
            const matchesDay = !day || item.date === day;
            const matchesKeyword = !keyword
              || item.title.includes(keyword)
              || item.summary.includes(keyword)
              || item.location.includes(keyword);
            return matchesMonth && matchesDay && matchesKeyword;
          });
          if (requestVersion !== memoriesRequestVersion) return;
          set({
            memoriesSourceItems: query.month || query.day || query.keyword ? get().memoriesSourceItems : items,
            memoriesItems: items,
            memoriesTotal: items.length,
            memoriesStatus: 'ready',
            memoriesError: undefined,
          });
          return;
        }

        try {
          const result = await repository.listMemories(query);
          if (requestVersion !== memoriesRequestVersion) return;
          if (!result.ok) {
            set({
              memoriesStatus: 'error',
              memoriesError: result.error.message,
            });
            get().logIssue(`回忆查询失败：${result.error.message}`);
            return;
          }
          const items = result.data.items.map(item => buildMemoryDiaryItem({
            id: item.id,
            title: item.title,
            summary: item.summary,
            location: item.location,
            date: item.date,
            privacy: item.privacy,
            photoIds: item.photoIds,
            version: item.version,
            contentSnapshot: item.contentSnapshot,
          }));
          set({
            memoriesSourceItems: query.month || query.day || query.keyword ? get().memoriesSourceItems : items,
            memoriesItems: items,
            memoriesTotal: result.data.total,
            memoriesStatus: 'ready',
            memoriesError: undefined,
          });
        } catch (error) {
          if (requestVersion !== memoriesRequestVersion) return;
          const message = error instanceof Error ? error.message : 'unknown error';
          set({
            memoriesStatus: 'error',
            memoriesError: message,
          });
          get().logIssue(`回忆查询失败：${message}`);
        }
      },
      retryMemoriesSearch: async () => {
        await get().searchMemories(buildMemoriesQueryFromState());
      },
    };
  });
}

export function createAppSelectors(store: AppStoreHook, deps: AppStoreDeps = createDefaultAppStoreDeps()) {
  const resolved = createDefaultAppStoreDeps(deps);
  const availableCharacters = resolved.characters.filter(character => canSelectCharacterId(character.id));
  return {
    diaryTypes: resolved.diaryTypeOptions,
    characters: resolved.characters,
    availableCharacters,
    companions: resolved.companions,
    get photos() { return store.getState().photos; },
    historyGroups,
    generationPhases: resolved.generationPhases,
    shareOptions: resolved.shareOptions,
    minSelectedPhotos: MIN_SELECTED_PHOTOS,
    maxSelectedPhotos: resolved.photos.length,
    getDiaryById(diaryId: string) { return store.getState().diaries.find(diary => diary.id === diaryId); },
    getPhotoById(photoId: string) { return store.getState().photos.find(photo => photo.id === photoId); },
    getHistoryGroups,
    getStats: getDiaryStatistics,
  };
}
