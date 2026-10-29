import { create, type StoreApi, type UseBoundStore } from 'zustand';
import { diaryTypeOptions, generationPhases } from '../mocks/creation';
import { mockCharacters } from '../mocks/characters';
import { appConfig } from '../config/app-config';
import { isDiaryContentContractForPhotoIds, isGenerationProgressMilestoneHistory, isGenerationResultForSelectedPhotoIds, type GenerationJobContract, type MemoriesQuery, type RewriteBlockRequestContract } from '../contracts/core-diary-contract';
import {
  AI_IMAGE_GENERATION_CONTRACT_VERSION,
  isAIImageGenerationRequest,
  isAIImageGenerationResultForRequest,
} from '../contracts/ai-image-generation-contract';
import {
  INSIGHT_REPORT_CONTRACT_VERSION,
  isInsightReportRequest,
  isInsightReportResultForRequest,
} from '../contracts/insight-report-contract';
import type { GrowthInsightState } from '../contracts/growth-insight-contract';
import { createBackendCoreDiaryRepository } from './adapters/backend-core-diary-adapter';
import { createBackendDiscoveryRepository } from './adapters/backend-discovery-adapter';
import { createBackendAnchorCorrectionRepository } from './adapters/backend-anchor-correction-adapter';
import { createBackendAnchorReadModelRepository } from './adapters/backend-anchor-read-model-adapter';
import { createBackendPetChatRepository } from './adapters/backend-pet-chat-adapter';
import { createBackendGrowthInsightRepository } from './adapters/backend-growth-insight-adapter';
import { ensureDeviceIdentity } from '../services/device-identity';
import type { AppStoreAdapters, PersistedDraftsSnapshot } from './adapters/types';
import type { PetChatConversation } from '../contracts/pet-chat-contract';
import { PetChatRepositoryError } from '../repositories/pet-chat-repository';
import { shareOptions } from '../mocks/share-options';
import type { GenerationPhase, DiaryTypeOption } from '../types/creation';
import type { ChatMessage, ChatTurnRequest, DiaryCharacter, DiaryDraft, DiaryItem, DiaryPerson, DiaryPhoto, DiaryPrivacy, DiaryType, GenerationProgressMilestone, GenerationStage, ShareMode } from '../types/diary';
import { buildGeneratedDiary, buildGeneratedDiaryFromResult, canGenerate, cloneDiary, getDiaryStatistics, getHistoryGroups, getPeopleForPhotos, MIN_SELECTED_PHOTOS, normalizeDiaryPhotos, publicParagraphs, sanitizePhotoIds } from './diary-domain';
import { createLocalDraftSnapshotStore } from '../services/draft-snapshot-storage';
import { logDevDiagnostic } from '../services/dev-diagnostics';
import { PROVIDER_REQUEST_CLIENT_TIMEOUT_MS } from '../services/api-client';
import {
  importDevicePhotoAssets,
  type DevicePhotoAssetImportResult,
  type DevicePhotoAssetImporter,
} from '../services/photo-library';
import { createUnconfiguredChatReplyProvider, type ChatReply, type ChatReplyProvider } from '../services/chat-reply-provider';
import { AIImageGenerationError, createUnconfiguredAIImageGenerationProvider, hasReadableImageSource, type AIImageGenerationProvider } from '../services/ai-image-generation-provider';
import { createHttpAIImageGenerationProvider } from '../services/http-ai-image-generation-provider';
import { InsightReportProviderError, createUnconfiguredInsightReportProvider, type InsightReportProvider, type InsightReportResult } from '../services/insight-report-provider';
import { getPhotoPermissionStatus, type PhotoPermissionStatus } from '../services/photo-permission';
import { listSavedDiaryPhotoAssets } from '../services/material-photo-api';
import {
  MAX_MATERIAL_LIBRARY_PHOTOS,
  MAX_MATERIAL_PHOTOS_PER_UPLOAD,
} from '../contracts/material-photo-contract';
import { cleanupDiaryPhotoUploads, prepareDiaryPhotoUploads } from '../services/diary-photo-upload';
import { exportMonthlyCollection, MonthlyExportAbortedError, type MonthlyExportResult, type MonthlyExportService, type MonthlyExportSnapshot } from '../services/monthly-export';
import { canSelectCharacterId, isSupportedCharacterId } from '../types/character-capabilities';
import { canCreateDiaryType } from '../types/diary-capabilities';
import type { GenerationPhotoUpload } from '../repositories/core-diary-repository';

type DiaryPhotoUploadPreparer = (
  photoIds: string[],
  catalog: DiaryPhoto[],
) => Promise<GenerationPhotoUpload[]>;

function getRewriteContextBlocks(draft: DiaryDraft, excludedBlockId: string) {
  return draft.diary.blocks
    .filter((block): block is Extract<typeof block, { type: 'text' | 'quote' }> =>
      (block.type === 'text' || block.type === 'quote') && block.id !== excludedBlockId)
    .map(block => ({ id: block.id, type: block.type, content: block.content }));
}

function getDeviceLocalDateKey(timestamp: number) {
  const date = new Date(timestamp);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export type AppStoreDeps = {
  now?: () => number;
  createId?: (prefix: string) => string;
  photos?: DiaryPhoto[];
  diaries?: DiaryItem[];
  characters?: DiaryCharacter[];
  shareOptions?: typeof shareOptions;
  diaryTypeOptions?: DiaryTypeOption[];
  generationPhases?: GenerationPhase[];
  adapters?: AppStoreAdapters;
  monthlyExporter?: MonthlyExportService;
  chatReplyProvider?: ChatReplyProvider;
  aiImageGenerationProvider?: AIImageGenerationProvider;
  insightReportProvider?: InsightReportProvider;
  devicePhotoImporter?: DevicePhotoAssetImporter;
  diaryPhotoUploadPreparer?: DiaryPhotoUploadPreparer;
};

type DiaryVisibilitySaveResult =
  | { ok: true; privacy: DiaryPrivacy; publicBlockIds?: string[] }
  | { ok: false; reason: 'not_found' | 'invalid_input' | 'publication_blocked' | 'save_failed'; message: string };

type DiaryDeleteActionResult =
  | { ok: true; diaryId: string }
  | { ok: false; reason: 'not_found' | 'busy' | 'delete_failed'; message: string };

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

type AIImageGenerationRequestState = {
  id: string;
  description: string;
  attempt: number;
  status: 'pending' | 'succeeded' | 'failed' | 'cancelled' | 'stale';
  source?: 'mock' | 'provider';
  photoId?: string;
  errorCode?: 'invalid_input' | 'cancelled' | 'provider_failed';
};

type AIImageGenerationActionResult =
  | { ok: true; requestId: string; photoId: string; source: 'mock' | 'provider' }
  | { ok: false; requestId?: string; reason: 'invalid_input' | 'cancelled' | 'provider_failed'; message: string };

type InsightReportGenerationState = {
  status: 'idle' | 'running' | 'succeeded' | 'failed' | 'cancelled' | 'stale';
  requestId?: string;
  sourceVersion?: string;
  report?: InsightReportResult;
  errorCode?: 'not_unlocked' | 'no_sources' | 'cancelled' | 'provider_failed' | 'stale';
};

type InsightReportActionResult =
  | { ok: true; requestId: string; report: InsightReportResult }
  | { ok: false; requestId?: string; reason: 'not_unlocked' | 'no_sources' | 'cancelled' | 'provider_failed' | 'stale'; message: string };

type MaterialPhotoImportActionResult =
  | { ok: true; photoIds: string[] }
  | {
      ok: false;
      reason: 'invalid_input' | 'permission_unavailable' | 'permission_denied' | 'asset_unreadable' | 'identity_conflict' | 'provider_failed';
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
  chatConversationId?: string;
  chatTurnRequests: ChatTurnRequest[];
  chatHistoryStatus: 'idle' | 'loading' | 'ready' | 'error';
  likedDiscoveryIds: string[];
  materialPhotoIds: string[];
  aiImageGenerationRequests: AIImageGenerationRequestState[];
  insightReportGeneration: InsightReportGenerationState;
  growthInsights?: GrowthInsightState;
  growthInsightsStatus: 'idle' | 'loading' | 'ready' | 'error';
  growthInsightsError?: string;
  correctedAnchors: Record<string, string>;
  flowerUnlocked: boolean;
  hydratedPhotoPermission: boolean;
  hydratedDrafts: boolean;
  hydratedMemories: boolean;
  savingDraftIds: string[];
  rewritingDraftBlockKeys: string[];
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
  restartGenerationWithCharacter: (draftId: string, characterId: string) => Promise<boolean>;
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
  deleteDiary: (diaryId: string) => Promise<DiaryDeleteActionResult>;
  confirmShareDelivery: (input: { diaryId: string; mode: ShareMode; operationId: string; version: number }) => boolean;
  sendChat: (text: string) => void;
  loadChatConversation: (conversationId: string) => Promise<boolean>;
  restoreLatestChatConversation: () => Promise<boolean>;
  retryChat: (requestId: string) => void;
  toggleDiscoveryLike: (id: string) => void;
  addMaterialPhoto: (id: string) => void;
  syncMaterialPhotos: (photos: DiaryPhoto[]) => boolean;
  removeMaterialPhotos: (photoIds: string[]) => void;
  importDevicePhotosToMaterials: (photoIds: string[]) => Promise<MaterialPhotoImportActionResult>;
  generateMaterialImage: (description: string) => Promise<AIImageGenerationActionResult>;
  cancelMaterialImageGeneration: (requestId: string) => void;
  generateInsightReport: () => Promise<InsightReportActionResult>;
  cancelInsightReport: (requestId: string) => void;
  correctAnchor: (id: string, text: string) => void;
  setFlowerUnlocked: (value: boolean) => void;
  loadGrowthInsights: () => Promise<GrowthInsightState | undefined>;
  initializeGrowthFlowers: () => Promise<GrowthInsightState | undefined>;
  retryGrowthFlowers: () => Promise<GrowthInsightState | undefined>;
  ensureCurrentGrowthReport: () => Promise<GrowthInsightState | undefined>;
  retryGrowthReport: () => Promise<GrowthInsightState | undefined>;
  setCurrentStep: (step: CreationStep) => void;
  setPhotoPermissionStatus: (status: PhotoPermissionStatus, options?: { advanceToAlbum?: boolean }) => void;
  grantPhotoPermission: () => void;
  selectType: (type: DiaryType) => void;
  selectCharacter: (characterId: string) => void;
  togglePhoto: (photoId: string) => void;
  setCompanionName: (name: string) => void;
  resetCreation: () => void;
  advanceGeneration: () => void;
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

function createBlankDiary(now: number, characterId: string): DiaryItem {
  return {
    id: '',
    type: 'travel',
    status: 'draft',
    title: '',
    subtitle: '',
    location: '',
    date: new Date(now).toISOString().slice(0, 10).replace(/-/g, '.'),
    summary: '',
    helperMessage: '',
    characterId,
    companionName: '',
    privacy: 'private',
    photoIds: [],
    coverPhotoId: '',
    blocks: [],
    exportedImage: false,
    exportedPdf: false,
    shareModes: [],
    exportModes: [],
    version: 1,
  };
}

export function createDefaultAppStoreDeps(overrides: AppStoreDeps = {}): Required<AppStoreDeps> {
  const now = overrides.now ?? (() => Date.now());
  let nextSequence = 1;
  const backendRepository = appConfig.backendEnabled && !process.env.JEST_WORKER_ID ? createBackendCoreDiaryRepository() : undefined;
  const backendDiscoveryRepository = appConfig.backendEnabled && !process.env.JEST_WORKER_ID ? createBackendDiscoveryRepository() : undefined;
  const backendAnchorCorrectionRepository = appConfig.backendEnabled && !process.env.JEST_WORKER_ID
    ? createBackendAnchorCorrectionRepository()
    : undefined;
  const backendAnchorReadRepository = appConfig.backendEnabled && !process.env.JEST_WORKER_ID
    ? createBackendAnchorReadModelRepository()
    : undefined;
  const backendPetChatRepository = appConfig.backendEnabled && !process.env.JEST_WORKER_ID
    ? createBackendPetChatRepository()
    : undefined;
  const backendGrowthInsightRepository = appConfig.backendEnabled && !process.env.JEST_WORKER_ID
    ? createBackendGrowthInsightRepository()
    : undefined;
  const draftSnapshotStore = !process.env.JEST_WORKER_ID ? createLocalDraftSnapshotStore() : undefined;

  return {
    now,
    createId: overrides.createId ?? ((prefix: string) => `${prefix}-${now()}-${nextSequence++}`),
    photos: overrides.photos ?? [],
    diaries: overrides.diaries ?? [],
    characters: overrides.characters ?? mockCharacters,
    shareOptions: overrides.shareOptions ?? shareOptions,
    diaryTypeOptions: overrides.diaryTypeOptions ?? diaryTypeOptions,
    generationPhases: overrides.generationPhases ?? generationPhases,
    monthlyExporter: overrides.monthlyExporter ?? exportMonthlyCollection,
    chatReplyProvider: overrides.chatReplyProvider
      ?? createUnconfiguredChatReplyProvider(),
    aiImageGenerationProvider: overrides.aiImageGenerationProvider
      ?? (appConfig.backendEnabled && !process.env.JEST_WORKER_ID
        ? createHttpAIImageGenerationProvider()
        : createUnconfiguredAIImageGenerationProvider()),
    insightReportProvider: overrides.insightReportProvider
      ?? createUnconfiguredInsightReportProvider(),
    devicePhotoImporter: overrides.devicePhotoImporter ?? importDevicePhotoAssets,
    diaryPhotoUploadPreparer: overrides.diaryPhotoUploadPreparer ?? prepareDiaryPhotoUploads,
    adapters: overrides.adapters ?? {
      diaryRepository: backendRepository,
      memoriesRepository: backendRepository,
      discoveryRepository: backendDiscoveryRepository,
      anchorCorrectionRepository: backendAnchorCorrectionRepository,
      anchorReadRepository: backendAnchorReadRepository,
      petChatRepository: backendPetChatRepository,
      growthInsightRepository: backendGrowthInsightRepository,
      draftSnapshotStore,
    },
  };
}

export function createAppStore(deps: AppStoreDeps = createDefaultAppStoreDeps()): AppStoreHook {
  const resolved = createDefaultAppStoreDeps(deps);
  const availableCharacters = resolved.characters.filter(character => canSelectCharacterId(character.id));
  const initialCharacter = availableCharacters[0]?.id ?? resolved.characters[0]?.id ?? 'character-blue';
  const fallbackProgressByStage: Record<GenerationJobContract['stage'], number> = {
    queued: 0,
    'analyzing-photos': 0,
    drafting: 25,
    structuring: 80,
    completed: 100,
    failed: 0,
    cancelled: 0,
  };
  const DRAFT_SNAPSHOT_VERSION = 1 as const;
  const isGrantedPhotoPermission = (status: PhotoPermissionStatus) => status === 'full' || status === 'limited';

  const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null;
  const isStringArray = (value: unknown): value is string[] => Array.isArray(value) && value.every(item => typeof item === 'string');
  const isBoolean = (value: unknown): value is boolean => typeof value === 'boolean';
  const awaitImageOperation = <T>(operation: () => Promise<T>, signal: AbortSignal) => {
    if (signal.aborted) {
      return Promise.reject(new AIImageGenerationError('cancelled', 'image generation cancelled'));
    }
    let removeAbortListener: (() => void) | undefined;
    const aborted = new Promise<never>((_, reject) => {
      const onAbort = () => reject(new AIImageGenerationError('cancelled', 'image generation cancelled'));
      signal.addEventListener('abort', onAbort, { once: true });
      removeAbortListener = () => signal.removeEventListener('abort', onAbort);
      if (signal.aborted) onAbort();
    });
    if (signal.aborted) {
      return aborted.finally(() => removeAbortListener?.());
    }
    let work: Promise<T>;
    try {
      work = Promise.resolve(operation());
    } catch (error) {
      work = Promise.reject(error);
    }
    return Promise.race([work, aborted]).finally(() => removeAbortListener?.());
  };
  const awaitInsightReportOperation = <T>(operation: () => Promise<T>, signal: AbortSignal) => {
    if (signal.aborted) {
      return Promise.reject(new InsightReportProviderError('cancelled', 'insight report generation cancelled'));
    }
    let removeAbortListener: (() => void) | undefined;
    const aborted = new Promise<never>((_, reject) => {
      const onAbort = () => reject(new InsightReportProviderError('cancelled', 'insight report generation cancelled'));
      signal.addEventListener('abort', onAbort, { once: true });
      removeAbortListener = () => signal.removeEventListener('abort', onAbort);
      if (signal.aborted) onAbort();
    });
    let work: Promise<T>;
    try {
      work = Promise.resolve(operation());
    } catch (error) {
      work = Promise.reject(error);
    }
    return Promise.race([work, aborted]).finally(() => removeAbortListener?.());
  };

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
        progressMilestones: isGenerationProgressMilestoneHistory(value.generation.progressMilestones)
          ? value.generation.progressMilestones as GenerationProgressMilestone[]
          : undefined,
        errorMessage: typeof value.generation.errorMessage === 'string' ? value.generation.errorMessage : undefined,
      },
      dirty: value.dirty,
      editRevision: Number.isSafeInteger(value.editRevision) && (value.editRevision as number) >= 0
        ? value.editRevision as number
        : 0,
      savedDiaryId: typeof value.savedDiaryId === 'string' ? value.savedDiaryId : undefined,
    };
  };

  return create<AppStore>((set, get) => {
    let memoriesRequestVersion = 0;
    let chatHistoryRequestVersion = 0;
    let chatHistoryDeviceId: string | undefined;
    let pendingChatRestore: Promise<boolean> | undefined;
    let growthRequestVersion = 0;
    let nextMonthlyExportRequestId = 1;
    let activeMonthlyExportController: AbortController | undefined;
    const pendingImageGenerations = new Map<string, {
      requestId: string;
      promise: Promise<AIImageGenerationActionResult>;
    }>();
    const imageGenerationControllers = new Map<string, AbortController>();
    const pendingInsightReports = new Map<string, {
      requestId: string;
      promise: Promise<InsightReportActionResult>;
    }>();
    const insightReportControllers = new Map<string, AbortController>();
    let activeInsightReportRequestId: string | undefined;
    const pendingDiscardDraftIds = new Set<string>();
    const pendingVisibilityRequests = new Map<string, Promise<DiaryVisibilitySaveResult>>();
    const pendingDiaryDeletionRequests = new Map<string, Promise<DiaryDeleteActionResult>>();
    const deletedDiaryIds = new Set<string>();
    const confirmedShareOperations = new Map<string, string>();
    const pendingRewriteRequestIds = new Map<string, number>();
    const pendingRewriteFingerprints = new Map<string, string>();
    let nextRewriteRequestId = 1;
    let draftSnapshotHydrationFailed = false;
    let draftSnapshotWriteQueue: Promise<void> = Promise.resolve();
    const runGrowthRequest = async (
      request: () => Promise<GrowthInsightState>,
    ): Promise<GrowthInsightState | undefined> => {
      const requestVersion = ++growthRequestVersion;
      set({ growthInsightsStatus: 'loading', growthInsightsError: undefined });
      try {
        const state = await request();
        if (requestVersion === growthRequestVersion) {
          set({
            growthInsights: state,
            growthInsightsStatus: 'ready',
            growthInsightsError: undefined,
          });
        }
        return state;
      } catch (error) {
        if (requestVersion === growthRequestVersion) {
          const message = error instanceof Error ? error.message : '成长内容暂时无法读取，请稍后重试。';
          set({ growthInsightsStatus: 'error', growthInsightsError: message });
          get().logIssue(`成长内容读取失败：${message}`);
        }
        return undefined;
      }
    };
    const buildInsightReportSourceSnapshot = () => {
      const sourceDiaries = get().diaries
        .map(diary => ({
          id: diary.id,
          version: diary.version ?? 0,
          title: diary.title,
          summary: diary.summary,
        }))
        .sort((left, right) => left.id.localeCompare(right.id));
      const sourceVersion = JSON.stringify(sourceDiaries.map(diary => [
        diary.id,
        diary.version,
        diary.title,
        diary.summary,
      ]));
      return { sourceDiaries, sourceVersion };
    };
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

    const buildMemoryDiaryItem = (input: { id: string; title: string; summary: string; location: string; date: string; privacy: DiaryPrivacy; photoIds: string[]; publicBlockIds?: string[]; version: number; contentSnapshot?: unknown; contentSnapshotStatus?: 'invalid' }) => {
      const existing = get().diaries.find(item => item.id === input.id);
      const content = isDiaryContentContractForPhotoIds(input.contentSnapshot, input.photoIds)
        ? input.contentSnapshot
        : undefined;
      if (input.contentSnapshotStatus === 'invalid'
        || (input.contentSnapshot !== undefined && input.contentSnapshot !== null && !content)) {
        get().logIssue(`回忆正文快照损坏，已隔离内容：${input.id}`);
      }
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
        publicBlockIds: input.publicBlockIds,
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

    const applyGenerationSnapshot = (
      draftId: string,
      round: number,
      snapshot: GenerationJobContract,
      expectedJobId?: string,
    ) => {
      const current = get().drafts[draftId];
      if (!current
        || current.generation.round !== round
        || (expectedJobId !== undefined && current.generation.remoteJobId !== expectedJobId)) return;
      if (snapshot.draftId !== draftId
        || snapshot.draftVersion !== round
        || snapshot.idempotencyKey !== `${draftId}-round-${round}`
        || (expectedJobId !== undefined && snapshot.jobId !== expectedJobId)) {
        applyGenerationFailure(draftId, round, {
          status: 'failed',
          stage: 'failed',
          message: expectedJobId ? '生成失败，请稍后重试。' : '生成结果异常，请稍后重试。',
        });
        get().logIssue('生成任务响应与当前草稿或任务不匹配。');
        return;
      }
      if (
        snapshot.status === 'succeeded'
        && !isGenerationResultForSelectedPhotoIds(snapshot.result, current.selectedPhotoIds)
      ) {
        applyGenerationFailure(draftId, round, {
          status: 'failed',
          stage: 'failed',
          message: '生成结果结构无效，请重新生成。',
        });
        get().logIssue('生成任务结果没有按照片顺序生成一图一正文。');
        return;
      }
      const sameJob = current.generation.remoteJobId === snapshot.jobId;
      const milestoneOrder: GenerationProgressMilestone['milestoneId'][] = [
        'queued',
        'photo-processing-started',
        'photos-ready',
        'provider-submitted',
        'provider-response-received',
        'result-validated',
        'completed',
      ];
      const milestoneById = new Map<GenerationProgressMilestone['milestoneId'], GenerationProgressMilestone>();
      if (sameJob) {
        current.generation.progressMilestones?.forEach(milestone => milestoneById.set(milestone.milestoneId, milestone));
      }
      snapshot.progressMilestones?.forEach(milestone => {
        const existing = milestoneById.get(milestone.milestoneId);
        if (!existing || milestone.reachedAt < existing.reachedAt) {
          milestoneById.set(milestone.milestoneId, milestone);
        }
      });
      const progressMilestones = milestoneOrder
        .map(milestoneId => milestoneById.get(milestoneId))
        .filter((milestone): milestone is GenerationProgressMilestone => Boolean(milestone));
      const snapshotProgress = snapshot.progressPercent ?? fallbackProgressByStage[snapshot.stage];
      if (
        snapshot.status === 'failed'
        || snapshot.status === 'cancelled'
        || current.generation.remoteStage !== snapshot.stage
        || current.generation.progress < snapshotProgress
      ) {
        logDevDiagnostic(snapshot.status === 'failed' ? 'warn' : 'info', 'generation.job.snapshot', {
          status: snapshot.status,
          phase: snapshot.stage,
          progressPercent: snapshotProgress,
          attempt: snapshot.attemptCount ?? 0,
          attemptLimit: snapshot.maxAttempts ?? 0,
          outcome: snapshot.errorCode ?? 'none',
          retryable: snapshot.retryable ?? false,
        });
      }
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
              progressMilestones,
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
                progressMilestones,
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
              progressMilestones,
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
            progressMilestones,
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
      if (!repository) return false;
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
        if (!result.ok) {
          get().logIssue(`草稿同步失败：${result.error.message}`);
          return false;
        }
        return true;
      } catch (error) {
        get().logIssue(`草稿同步失败：${error instanceof Error ? error.message : 'unknown error'}`);
        return false;
      }
    };

    const syncGenerationToRemote = async (draftId: string, round: number) => {
      const repository = resolved.adapters.diaryRepository;
      if (!repository) return;
      let photoUploads: GenerationPhotoUpload[] = [];
      try {
        const draft = get().drafts[draftId];
        if (!draft || draft.generation.round !== round || draft.generation.status !== 'running') return;
        const currentDraft = draft;
        try {
          photoUploads = await resolved.diaryPhotoUploadPreparer(currentDraft.selectedPhotoIds, get().photos);
        } catch (error) {
          applyGenerationFailure(draftId, round, {
            status: 'failed',
            stage: 'failed',
            message: error instanceof Error ? error.message : '所选照片暂时无法处理，请返回相册重新选择。',
          });
          get().logIssue('生成任务创建失败：所选照片无法读取或上传。');
          return;
        }
        const result = await repository.createGenerationJob({
          draftId,
          draftVersion: round,
          idempotencyKey: `${draftId}-round-${round}`,
        }, { timeoutMs: 120_000 }, photoUploads);
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
          if (result.error.code === 'asset_unreadable') {
            applyGenerationFailure(draftId, round, {
              status: 'failed',
              stage: 'failed',
              message: '照片读取失败，请返回相册重新选择后重试。',
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
      } finally {
        await cleanupDiaryPhotoUploads(photoUploads);
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

    const buildRewriteFingerprint = (
      draft: DiaryDraft,
      block: DiaryDraft['diary']['blocks'][number],
    ) => {
      if (block.type === 'photo') return undefined;
      return JSON.stringify({
        draftVersion: draft.generation.round,
        characterId: draft.diary.characterId,
        blockId: block.id,
        blockType: block.type,
        content: block.content,
        selectedPhotoIds: draft.selectedPhotoIds,
        photoIds: block.photoIds ?? [],
        contextBlocks: getRewriteContextBlocks(draft, block.id),
      });
    };

    const syncRewriteToRemote = async (
      input: RewriteBlockRequestContract & {
        requestId: number;
        fingerprint: string;
      },
    ) => {
      const repository = resolved.adapters.diaryRepository;
      const key = rewriteRequestKey(input.draftId, input.blockId);
      if (!repository?.rewriteBlock) {
        clearPendingRewriteRequest(input.draftId, input.blockId);
        return;
      }
      let photoUploads: GenerationPhotoUpload[] = [];
      try {
        photoUploads = await resolved.diaryPhotoUploadPreparer(input.photoIds ?? [], get().photos);
        const request: RewriteBlockRequestContract = {
          draftId: input.draftId,
          blockId: input.blockId,
          draftVersion: input.draftVersion,
          characterId: input.characterId,
          blockType: input.blockType,
          content: input.content,
          selectedPhotoIds: input.selectedPhotoIds,
          photoIds: input.photoIds ?? [],
          contextBlocks: input.contextBlocks,
        };
        const result = await repository.rewriteBlock(request, {
          timeoutMs: PROVIDER_REQUEST_CLIENT_TIMEOUT_MS,
        }, photoUploads);
        if (!result.ok) {
          if (pendingRewriteRequestIds.get(key) === input.requestId) {
            clearPendingRewriteRequest(input.draftId, input.blockId);
            get().logIssue(`段落重写失败：${result.error.message}`);
          }
          return;
        }
        if (pendingRewriteRequestIds.get(key) !== input.requestId) return;
        if (
          result.data.draftId !== input.draftId
          || result.data.blockId !== input.blockId
          || result.data.draftVersion !== input.draftVersion
          || result.data.blockType !== input.blockType
        ) {
          clearPendingRewriteRequest(input.draftId, input.blockId);
          get().logIssue('段落重写结果与当前请求不匹配。');
          return;
        }
        const currentDraft = get().drafts[input.draftId];
        const currentBlock = currentDraft?.diary.blocks.find(block => block.id === input.blockId);
        if (!currentDraft || !currentBlock || currentBlock.type === 'photo') {
          clearPendingRewriteRequest(input.draftId, input.blockId);
          return;
        }
        if (
          currentBlock.content !== input.content
          || buildRewriteFingerprint(currentDraft, currentBlock) !== input.fingerprint
        ) {
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
      } finally {
        await cleanupDiaryPhotoUploads(photoUploads);
      }
    };

    const mutateDraft = (
      draftId: string,
      transform: (draft: DiaryDraft) => DiaryDraft,
      options?: { syncRemote?: boolean },
    ) => {
      const draft = get().drafts[draftId];
      if (!draft || draft.savedDiaryId) return undefined;
      const transformedDraft = transform(draft);
      if (transformedDraft === draft) return draft;
      const nextDraft = { ...transformedDraft, editRevision: (draft.editRevision ?? 0) + 1 };
      set(state => ({ drafts: { ...state.drafts, [draftId]: nextDraft } }));
      persistDraftSnapshotInBackground();
      if (options?.syncRemote !== false) void syncDraftToRemote(nextDraft);
      return nextDraft;
    };

    const rewriteRequestKey = (draftId: string, blockId: string) =>
      `${encodeURIComponent(draftId)}:${encodeURIComponent(blockId)}`;

    const clearPendingRewriteRequest = (draftId: string, blockId: string) => {
      const key = rewriteRequestKey(draftId, blockId);
      pendingRewriteRequestIds.delete(key);
      pendingRewriteFingerprints.delete(key);
      set(state => state.rewritingDraftBlockKeys.includes(key)
        ? { rewritingDraftBlockKeys: state.rewritingDraftBlockKeys.filter(item => item !== key) }
        : state);
    };

    const clearPendingRewriteRequests = (draftId: string) => {
      const prefix = `${encodeURIComponent(draftId)}:`;
      for (const key of [...pendingRewriteRequestIds.keys()]) {
        if (key.startsWith(prefix)) {
          pendingRewriteRequestIds.delete(key);
          pendingRewriteFingerprints.delete(key);
        }
      }
      set(state => state.rewritingDraftBlockKeys.some(key => key.startsWith(prefix))
        ? { rewritingDraftBlockKeys: state.rewritingDraftBlockKeys.filter(key => !key.startsWith(prefix)) }
        : state);
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
        : state.memoriesFilterMonth.replaceAll('.', '-');
      const selectedDay = state.memoriesFilterDay && selectedMonth
        ? `${selectedMonth}-${String(state.memoriesFilterDay).padStart(2, '0')}`
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

    const persistDraftSnapshot = () => {
      const snapshotStore = resolved.adapters.draftSnapshotStore;
      if (!snapshotStore || !get().hydratedDrafts || draftSnapshotHydrationFailed) return Promise.resolve();

      const persistedDrafts: Record<string, DiaryDraft> = Object.fromEntries(
        Object.entries(get().drafts).filter(([draftId, draft]) => !draft.savedDiaryId && !pendingDiscardDraftIds.has(draftId)),
      );
      const currentActiveDraftId = get().activeDraftId;
      const activeDraftId = currentActiveDraftId && persistedDrafts[currentActiveDraftId] ? currentActiveDraftId : undefined;

      const snapshot = Object.keys(persistedDrafts).length > 0
        ? {
            version: DRAFT_SNAPSHOT_VERSION,
            activeDraftId,
            drafts: persistedDrafts,
          } satisfies PersistedDraftsSnapshot
        : undefined;
      const operation = draftSnapshotWriteQueue.catch(() => undefined).then(async () => {
        if (snapshot) {
          await snapshotStore.save(snapshot);
        } else {
          await snapshotStore.clear();
        }
      });
      draftSnapshotWriteQueue = operation.catch(() => undefined);
      return operation;
    };

    const persistDraftSnapshotInBackground = () => {
      void persistDraftSnapshot().catch(error => {
        get().logIssue(`本地草稿快照保存失败：${error instanceof Error ? error.message : 'unknown error'}`);
      });
    };

    const applyChatReply = (requestId: string, attempt: number, result: ChatReply) => {
      const request = get().chatTurnRequests.find(item => item.id === requestId);
      if (!request || request.attempt !== attempt || request.status !== 'pending') return;
      if (get().chatConversationId !== request.conversationId) {
        set(state => ({
          chatTurnRequests: state.chatTurnRequests.map(item => item.id === requestId
            ? { ...item, status: 'stale' }
            : item),
        }));
        return;
      }

      const assistantMessage: ChatMessage = {
        id: resolved.createId('chat'),
        conversationId: request.conversationId,
        requestId,
        providerRequestId: result.providerRequestId,
        role: 'assistant',
        source: result.source,
        text: result.text,
      };
      set(state => {
        const chatMessagesWithoutStatus = state.chatMessages.filter(message =>
          !(message.role === 'assistant'
            && message.requestId === requestId
            && (message.source === 'pending' || message.source === 'failed')),
        );
        if (chatMessagesWithoutStatus.some(message => message.role === 'assistant' && message.requestId === requestId)) {
          return {
            chatMessages: chatMessagesWithoutStatus,
            chatTurnRequests: state.chatTurnRequests.map(item => item.id === requestId
              ? { ...item, status: 'completed', source: result.source, providerRequestId: result.providerRequestId }
              : item),
          };
        }

        const userIndex = chatMessagesWithoutStatus.findIndex(message => message.id === request.userMessageId);
        if (userIndex < 0) {
          return {
            chatMessages: chatMessagesWithoutStatus,
            chatTurnRequests: state.chatTurnRequests.map(item => item.id === requestId
              ? { ...item, status: 'stale' }
              : item),
          };
        }

        const chatMessages = [...chatMessagesWithoutStatus];
        chatMessages.splice(userIndex + 1, 0, assistantMessage);
        return {
          chatMessages,
          chatTurnRequests: state.chatTurnRequests.map(item => item.id === requestId
            ? { ...item, status: 'completed', source: result.source, providerRequestId: result.providerRequestId }
            : item),
        };
      });
    };

    const appendChatReplyDelta = (requestId: string, attempt: number, delta: string) => {
      if (!delta) return;
      const request = get().chatTurnRequests.find(item => item.id === requestId);
      if (!request || request.attempt !== attempt || request.status !== 'pending'
        || get().chatConversationId !== request.conversationId) return;
      set(state => ({
        chatMessages: state.chatMessages.map(message =>
          message.role === 'assistant'
          && message.requestId === requestId
          && message.source === 'pending'
            ? { ...message, text: message.text + delta }
            : message,
        ),
      }));
    };

    const failChatReply = (requestId: string, attempt: number, error: unknown) => {
      const request = get().chatTurnRequests.find(item => item.id === requestId);
      if (!request || request.attempt !== attempt || request.status !== 'pending') return;
      const code = error instanceof PetChatRepositoryError ? error.code : 'provider_failed';
      const blocked = code === 'out_of_scope' || code === 'unsafe_request' || code === 'chat_busy';
      const text = code === 'out_of_scope'
        ? '小橘主要陪你聊日常、心情和旅行回忆，暂不提供代码、小说或商业内容创作。'
        : code === 'unsafe_request'
          ? '这个请求可能带来伤害，我不能提供相关方法。如果你正遇到困难，我可以陪你聊聊，也请联系身边可信任的人。'
          : code === 'chat_busy'
            ? '小橘正在回复上一条消息，等这次回复完成后再继续吧。'
            : code === 'timeout'
              ? '小橘回复超时了，点这里重试。'
              : '小橘刚刚没有连上，点这里重试。';
      set(state => {
        const statusMessageIndex = state.chatMessages.findIndex(message =>
          message.role === 'assistant'
          && message.requestId === requestId
          && (message.source === 'pending' || message.source === 'failed'),
        );
        const chatMessages = [...state.chatMessages];
        const failedMessage: ChatMessage = {
          id: `chat-status-${requestId}`,
          conversationId: request.conversationId,
          requestId,
          role: 'assistant',
          source: blocked ? 'blocked' : 'failed',
          text,
        };
        if (statusMessageIndex >= 0) {
          chatMessages[statusMessageIndex] = failedMessage;
        } else {
          const userIndex = chatMessages.findIndex(message => message.id === request.userMessageId);
          if (userIndex >= 0) chatMessages.splice(userIndex + 1, 0, failedMessage);
        }
        return {
          chatMessages,
          chatTurnRequests: state.chatTurnRequests.map(item => item.id === requestId
            ? { ...item, status: blocked ? 'blocked' : 'failed', error: code }
            : item),
          issueLog: blocked ? state.issueLog : [...state.issueLog, `聊天回复失败：${code}`],
        };
      });
    };

    const applyPetChatConversation = (conversation: PetChatConversation, allowSwitch = false) => {
      if (!allowSwitch && get().chatConversationId !== conversation.id) return false;
      const current = get();
      const serverRequestIds = new Set(conversation.turns.map(turn => turn.requestId));
      const currentConversationRequests = current.chatTurnRequests.filter(
        request => request.conversationId === conversation.id,
      );
      const currentRequestIds = new Set(currentConversationRequests.map(request => request.id));
      const localOnlyRequests = currentConversationRequests.filter(request => !serverRequestIds.has(request.id));
      const requestOrder = currentConversationRequests.map(request => request.id);
      for (const turn of conversation.turns) {
        if (!currentRequestIds.has(turn.requestId)) requestOrder.push(turn.requestId);
      }
      const serverMessagesByRequest = new Map<string, typeof conversation.messages>();
      for (const message of conversation.messages) {
        const messages = serverMessagesByRequest.get(message.requestId) ?? [];
        messages.push(message);
        serverMessagesByRequest.set(message.requestId, messages);
      }
      const turnsByRequest = new Map(conversation.turns.map(turn => [turn.requestId, turn]));
      const chatMessages: ChatMessage[] = current.chatMessages.filter(message => message.source === 'welcome');
      for (const requestId of requestOrder) {
        const turn = turnsByRequest.get(requestId);
        const serverMessages = serverMessagesByRequest.get(requestId);
        if (serverMessages) {
          chatMessages.push(...serverMessages.map(message => ({
            id: message.id,
            conversationId: message.conversationId,
            requestId: message.requestId,
            providerRequestId: message.providerRequestId,
            role: message.role,
            source: message.source,
            text: message.text,
          })));
        } else {
          chatMessages.push(...current.chatMessages.filter(message =>
            message.conversationId === conversation.id && message.requestId === requestId,
          ));
        }
        if (!turn) continue;
        const userMessage = serverMessages?.find(message => message.role === 'user');
        if (!userMessage) continue;
        if (turn.status !== 'pending' && turn.status !== 'failed') continue;
        chatMessages.push({
          id: `chat-status-${turn.requestId}`,
          conversationId: conversation.id,
          requestId: turn.requestId,
          role: 'assistant',
          source: turn.status,
          text: turn.status === 'pending'
            ? ''
            : turn.failureCode === 'timeout'
              ? '小橘回复超时了，点这里重试。'
              : '小橘刚刚没有连上，点这里重试。',
        });
      }
      set({
        chatMessages,
        chatConversationId: conversation.id,
        chatTurnRequests: [
          ...requestOrder.map(requestId => {
            const turn = turnsByRequest.get(requestId);
            if (turn) {
              const currentRequest = currentConversationRequests.find(item => item.id === turn.requestId);
              return {
                id: turn.requestId,
                conversationId: conversation.id,
                userMessageId: turn.userMessageId,
                attempt: turn.attempt,
                deviceLocalDate: turn.deviceLocalDate ?? currentRequest?.deviceLocalDate,
                status: turn.status,
                source: turn.source,
                providerRequestId: turn.providerRequestId,
                error: turn.failureCode,
              } satisfies ChatTurnRequest;
            }
            return localOnlyRequests.find(request => request.id === requestId)!;
          }),
        ],
      });
      return true;
    };

    const bindChatHistoryDevice = (deviceId: string) => {
      if (chatHistoryDeviceId && chatHistoryDeviceId !== deviceId) {
        set({ chatMessages: [], chatConversationId: undefined, chatTurnRequests: [] });
      }
      chatHistoryDeviceId = deviceId;
    };

    const requestPersistedChatReply = async (requestId: string, retry: boolean) => {
      const chatRequest = get().chatTurnRequests.find(item => item.id === requestId);
      const userMessage = chatRequest
        ? get().chatMessages.find(item => item.id === chatRequest.userMessageId)
        : undefined;
      const repository = resolved.adapters.petChatRepository;
      if (!chatRequest || !userMessage || !repository) return;

      let attempt = chatRequest.attempt;
      try {
        let conversation: PetChatConversation | undefined;
        if (retry) {
          try {
            conversation = await repository.getConversation(chatRequest.conversationId);
          } catch (error) {
            if (!(error instanceof PetChatRepositoryError) || error.code !== 'not_found') throw error;
          }
        }

        if (!conversation) {
          conversation = await repository.beginTurn({
            conversationId: chatRequest.conversationId,
            requestId,
            userMessageId: chatRequest.userMessageId,
            text: userMessage.text,
            deviceLocalDate: chatRequest.deviceLocalDate,
          });
        } else {
          let serverTurn = conversation.turns.find(item => item.requestId === requestId);
          if (!serverTurn) {
            conversation = await repository.beginTurn({
              conversationId: chatRequest.conversationId,
              requestId,
              userMessageId: chatRequest.userMessageId,
              text: userMessage.text,
              deviceLocalDate: chatRequest.deviceLocalDate,
            });
            serverTurn = conversation.turns.find(item => item.requestId === requestId);
          }
          if (!serverTurn) throw new PetChatRepositoryError('provider_failed', '聊天请求状态缺失。', false);
          if (serverTurn.status === 'failed') {
            conversation = await repository.retryTurn({
              conversationId: chatRequest.conversationId,
              requestId,
              nextAttempt: serverTurn.attempt + 1,
            });
          } else if (serverTurn.status === 'completed') {
            applyPetChatConversation(conversation);
            return;
          }
        }

        if (!applyPetChatConversation(conversation)) return;
        let serverTurn = conversation.turns.find(item => item.requestId === requestId);
        if (!serverTurn) throw new PetChatRepositoryError('provider_failed', '聊天请求状态缺失。', false);
        if (serverTurn.status !== 'pending') return;
        attempt = serverTurn.attempt;
        const result = await repository.generateReply({
          conversationId: chatRequest.conversationId,
          requestId,
          attempt,
        }, undefined, delta => appendChatReplyDelta(requestId, attempt, delta));
        applyPetChatConversation(result);
      } catch (error) {
        failChatReply(requestId, get().chatTurnRequests.find(item => item.id === requestId)?.attempt ?? attempt, error);
      }
    };

    const receiveChatReply = (requestId: string, attempt: number, value: unknown) => {
      if (
        !isRecord(value)
        || typeof value.text !== 'string'
        || !value.text.trim()
        || (value.source !== 'mock' && value.source !== 'provider')
        || (value.providerRequestId !== undefined && typeof value.providerRequestId !== 'string')
      ) {
        failChatReply(requestId, attempt, new Error('invalid provider response'));
        return;
      }
      applyChatReply(requestId, attempt, {
        text: value.text,
        source: value.source,
        providerRequestId: value.providerRequestId as string | undefined,
      });
    };

    const requestChatReply = (requestId: string, retry = false) => {
      const chatRequest = get().chatTurnRequests.find(item => item.id === requestId);
      const userMessage = chatRequest
        ? get().chatMessages.find(item => item.id === chatRequest.userMessageId)
        : undefined;
      if (!chatRequest || !userMessage || chatRequest.status !== 'pending') return;
      if (resolved.adapters.petChatRepository) {
        void requestPersistedChatReply(requestId, retry);
        return;
      }

      const attempt = chatRequest.attempt;
      try {
        const result = resolved.chatReplyProvider.reply({
          conversationId: chatRequest.conversationId,
          requestId,
          attempt,
          text: userMessage.text,
        });
        if (result && typeof (result as Promise<ChatReply>).then === 'function') {
          void Promise.resolve(result).then(
            reply => receiveChatReply(requestId, attempt, reply),
            error => failChatReply(requestId, attempt, error),
          );
        } else {
          receiveChatReply(requestId, attempt, result);
        }
      } catch (error) {
        failChatReply(requestId, attempt, error);
      }
    };

    return {
      currentStep: 'home',
      hasPhotoPermission: false,
      photoPermissionStatus: 'unknown',
      photoCatalogVersion: 0,
      selectedType: 'travel',
      selectedCharacterId: initialCharacter,
      selectedPhotoIds: [],
      currentDiaryId: resolved.diaries[0]?.id ?? '',
      generationPhaseIndex: 0,
      companionName: '',
      photos: [...resolved.photos],
      diaries: resolved.diaries.map(cloneDiary),
      issueLog: [],
      drafts: {},
      chatMessages: [],
      chatConversationId: undefined,
      chatTurnRequests: [],
      chatHistoryStatus: resolved.adapters.petChatRepository ? 'idle' : 'ready',
      likedDiscoveryIds: [],
      materialPhotoIds: [],
      aiImageGenerationRequests: [],
      insightReportGeneration: { status: 'idle' },
      growthInsights: undefined,
      growthInsightsStatus: 'idle',
      growthInsightsError: undefined,
      correctedAnchors: {},
      flowerUnlocked: false,
      hydratedPhotoPermission: false,
      hydratedDrafts: false,
      hydratedMemories: false,
      savingDraftIds: [],
      rewritingDraftBlockKeys: [],
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
        const diary = createBlankDiary(resolved.now(), initialCharacter);
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
          editRevision: 0,
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
        persistDraftSnapshotInBackground();
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
          persistDraftSnapshotInBackground();
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
          editRevision: 0,
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
        persistDraftSnapshotInBackground();
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
              progressMilestones: undefined,
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
              progressMilestones: undefined,
              errorMessage: undefined,
            } : draft.generation,
          };
        });
        if (get().activeDraftId === id) set({ selectedCharacterId: characterId });
      },
      restartGenerationWithCharacter: async (id, characterId) => {
        if (!canSelectCharacterId(characterId)) return false;
        const current = get().drafts[id];
        if (!current || current.savedDiaryId) return false;
        if (current.diary.characterId === characterId) return true;
        const expectedRevision = current.editRevision ?? 0;
        const updatedDraft: DiaryDraft = {
          ...current,
          editRevision: expectedRevision + 1,
          dirty: true,
          diary: { ...current.diary, characterId, status: 'draft' },
          generation: {
            ...current.generation,
            progress: 0,
            status: 'idle',
            remoteJobId: undefined,
            remoteStage: undefined,
            progressMilestones: undefined,
            errorMessage: undefined,
          },
        };
        if (!await syncDraftToRemote(updatedDraft)) return false;

        const latest = get().drafts[id];
        if (!latest || (latest.editRevision ?? 0) !== expectedRevision) {
          if (latest) await syncDraftToRemote(latest);
          return false;
        }
        set(state => ({
          drafts: { ...state.drafts, [id]: updatedDraft },
          ...(state.activeDraftId === id ? { selectedCharacterId: characterId } : {}),
        }));
        persistDraftSnapshotInBackground();
        return true;
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
        const photoIds = sanitizePhotoIds(incoming, photos).slice(0, 1);
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
        const fingerprint = buildRewriteFingerprint(draft, block);
        if (!fingerprint) return;
        if (pendingRewriteFingerprints.get(key) === fingerprint) return;
        const requestId = nextRewriteRequestId++;
        pendingRewriteRequestIds.set(key, requestId);
        pendingRewriteFingerprints.set(key, fingerprint);
        set(state => state.rewritingDraftBlockKeys.includes(key)
          ? state
          : { rewritingDraftBlockKeys: [...state.rewritingDraftBlockKeys, key] });
        void syncRewriteToRemote({
          requestId,
          fingerprint,
          draftId: id,
          blockId,
          draftVersion: draft.generation.round,
          characterId: draft.diary.characterId,
          blockType: block.type,
          content: sourceContent,
          selectedPhotoIds: draft.selectedPhotoIds,
          photoIds: 'photoIds' in block ? block.photoIds ?? [] : [],
          contextBlocks: getRewriteContextBlocks(draft, block.id),
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
            progressMilestones: undefined,
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
        if (!process.env.JEST_WORKER_ID) return draft;
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
            progressMilestones: undefined,
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
          const expectedJobId = draft.generation.remoteJobId;
          const result = await repository.getGenerationJob(expectedJobId);
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
          applyGenerationSnapshot(id, round, result.data, expectedJobId);
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
        const finishLocalSave = (savedDiaryId: string, savedVersion: number, publishedDate?: string) => {
          const effectivePublishedDate = publishedDate
            ?? (draft.sourceDiaryId
              ? draft.diary.date
              : new Date(resolved.now()).toISOString().slice(0, 10).replace(/-/g, '.'));
          const diary = cloneDiary({
            ...normalizedDiary,
            id: savedDiaryId,
            date: effectivePublishedDate,
            version: savedVersion,
          });
          clearPendingRewriteRequests(id);
          const shouldDropDraft = pendingDiscardDraftIds.has(id);
          const latestDraft = get().drafts[id];
          const hasNewerEdits = Boolean(
            latestDraft
            && !shouldDropDraft
            && (latestDraft.editRevision ?? 0) > (draft.editRevision ?? 0),
          );
          if (shouldDropDraft) pendingDiscardDraftIds.delete(id);
          set(state => {
            const { [id]: discardedDraft, ...remainingDrafts } = state.drafts;
            void discardedDraft;
            const rebasedDraft = hasNewerEdits && latestDraft
              ? {
                  ...latestDraft,
                  sourceDiaryId: savedDiaryId,
                  diary: cloneDiary({ ...latestDraft.diary, id: savedDiaryId, version: savedVersion }),
                  dirty: true,
                  savedDiaryId: undefined,
                }
              : undefined;
            return {
              diaries: draft.sourceDiaryId ? state.diaries.map(item => item.id === savedDiaryId ? diary : item) : [diary, ...state.diaries],
              memoriesSourceItems: draft.sourceDiaryId
                ? state.memoriesSourceItems.map(item => item.id === savedDiaryId ? diary : item)
                : [diary, ...state.memoriesSourceItems],
              currentDiaryId: shouldDropDraft || hasNewerEdits ? state.currentDiaryId : savedDiaryId,
              currentStep: shouldDropDraft || hasNewerEdits ? state.currentStep : 'detail',
              activeDraftId: !hasNewerEdits && state.activeDraftId === id ? undefined : state.activeDraftId,
              drafts: shouldDropDraft
                ? remainingDrafts
                : {
                    ...state.drafts,
                    [id]: rebasedDraft ?? { ...draft, diary, dirty: false, savedDiaryId },
                  },
            };
          });
          persistDraftSnapshotInBackground();
          if (hasNewerEdits && !shouldDropDraft) {
            return {
              ok: false as const,
              reason: 'pending' as const,
              message: '较早版本已保存，新的修改仍保留在草稿中。',
            };
          }
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
        const idempotencyKey = `${draft.id}-save-${draft.sourceDiaryId ?? 'new'}-${sourceDiaryVersion ?? 0}-${draft.generation.round}-${draft.editRevision ?? 0}`;
        const locallyReadablePhotoIds = normalizedDiary.photoIds.filter(photoId => {
          const photo = photos.find(item => item.id === photoId);
          return Boolean(photo && /^(file|content):\/\//i.test(photo.localUri ?? photo.uri ?? ''));
        });
        let photoUploads: GenerationPhotoUpload[] = [];
        let saveRequestStarted = false;
        try {
          if (locallyReadablePhotoIds.length) {
            photoUploads = await resolved.diaryPhotoUploadPreparer(locallyReadablePhotoIds, photos);
          }
          saveRequestStarted = true;
          const saveInput = {
            id: targetDiaryId,
            draftId: draft.id,
            sourceDiaryId: draft.sourceDiaryId,
            sourceDiaryVersion,
            idempotencyKey,
            title: normalizedDiary.title,
            summary: normalizedDiary.summary,
            location: normalizedDiary.location,
            date: normalizedDiary.date,
            publishedLocalDate: getDeviceLocalDateKey(resolved.now()),
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
          };
          const result = photoUploads.length
            ? await repository.saveDiary(saveInput, undefined, photoUploads)
            : await repository.saveDiary(saveInput);
          if (result.ok) {
            return finishLocalSave(result.data.id ?? result.data.diaryId, result.data.savedVersion, result.data.date);
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
                return finishLocalSave(recovered.data.id ?? recovered.data.diaryId, recovered.data.savedVersion, recovered.data.date);
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
          if (saveRequestStarted) {
            try {
              const recovered = await repository.getSaveResult(idempotencyKey);
              if (recovered.ok) {
                return finishLocalSave(recovered.data.id ?? recovered.data.diaryId, recovered.data.savedVersion, recovered.data.date);
              }
            } catch (recoveryError) {
              void recoveryError;
            }
          }
          const message = error instanceof Error ? error.message : 'unknown error';
          get().logIssue(`日记保存失败：${message}`);
          return {
            ok: false,
            reason: 'save_failed',
            message,
          };
        } finally {
          await cleanupDiaryPhotoUploads(photoUploads);
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
            persistDraftSnapshotInBackground();
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
          persistDraftSnapshotInBackground();
          return;
        }
        set(state => {
        const { [id]: discarded, ...drafts } = state.drafts;
        void discarded;
        return { drafts, activeDraftId: state.activeDraftId === id ? undefined : state.activeDraftId };
        });
        persistDraftSnapshotInBackground();
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
                  : result.error.code === 'publication_blocked'
                    ? result.error.message
                  : result.error.code === 'permission_denied'
                    ? '当前设备无法修改这篇日记。'
                    : '公开范围保存失败，请稍后重试。';
              get().logIssue(`公开范围保存失败：${result.error.message}`);
              return {
                ok: false,
                reason: result.error.code === 'not_found'
                  ? 'not_found'
                  : result.error.code === 'invalid_input'
                    ? 'invalid_input'
                    : result.error.code === 'publication_blocked'
                      ? 'publication_blocked'
                      : 'save_failed',
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
      deleteDiary: async id => {
        const existingRequest = pendingDiaryDeletionRequests.get(id);
        if (existingRequest) return existingRequest;

        const request = (async (): Promise<DiaryDeleteActionResult> => {
          const diary = get().diaries.find(item => item.id === id);
          if (!diary) {
            return { ok: false, reason: 'not_found', message: '没有找到这篇日记。' };
          }
          const linkedDrafts = Object.values(get().drafts).filter(draft =>
            draft.sourceDiaryId === id || draft.savedDiaryId === id,
          );
          if (linkedDrafts.some(draft => get().savingDraftIds.includes(draft.id))) {
            return { ok: false, reason: 'busy', message: '这篇日记正在保存，请稍后再删除。' };
          }

          const repository = resolved.adapters.diaryRepository;
          if (repository && !repository.deleteDiary) {
            return { ok: false, reason: 'delete_failed', message: '删除服务暂不可用，请稍后重试。' };
          }
          try {
            if (repository?.deleteDiary) {
              const result = await repository.deleteDiary(id);
              if (!result.ok) {
                const message = result.error.code === 'not_found' || result.error.code === 'permission_denied'
                  ? '没有找到这篇日记。'
                  : '删除失败，请稍后重试。';
                get().logIssue(`日记删除失败：${result.error.message}`);
                return {
                  ok: false,
                  reason: result.error.code === 'not_found' ? 'not_found' : 'delete_failed',
                  message,
                };
              }
            }

        deletedDiaryIds.add(id);
        memoriesRequestVersion += 1;
        growthRequestVersion += 1;
        for (const controller of insightReportControllers.values()) controller.abort();
        insightReportControllers.clear();
        pendingInsightReports.clear();
        activeInsightReportRequestId = undefined;

        const draftsToRemove = Object.values(get().drafts).filter(draft =>
          draft.sourceDiaryId === id || draft.savedDiaryId === id,
        );
        for (const draft of draftsToRemove) {
              clearPendingRewriteRequests(draft.id);
              if (draft.generation.status === 'running') {
                void cancelGenerationOnRemote(draft.id, draft.generation.round, draft.generation.remoteJobId);
              }
            }
        const removedDraftIds = new Set(draftsToRemove.map(draft => draft.id));
            const exportState = get().monthlyExport;
            if (exportState.snapshot?.diaryIds.includes(id)) {
              activeMonthlyExportController?.abort();
              activeMonthlyExportController = undefined;
              set({
                monthlyExport: {
                  requestId: nextMonthlyExportRequestId++,
                  status: 'cancelled',
                  error: '关联日记已删除，本次导出已取消。',
                },
              });
            }
            set(state => {
              const photos = state.photos.filter(photo => photo.diaryId !== id);
              const drafts = Object.fromEntries(
                Object.entries(state.drafts).filter(([draftId]) => !removedDraftIds.has(draftId)),
              );
              const wasInMemories = state.memoriesItems.some(item => item.id === id);
              return {
                diaries: state.diaries.filter(item => item.id !== id),
                memoriesSourceItems: state.memoriesSourceItems.filter(item => item.id !== id),
                memoriesItems: state.memoriesItems.filter(item => item.id !== id),
                memoriesTotal: Math.max(0, state.memoriesTotal - (wasInMemories ? 1 : 0)),
                photos,
                photoCatalogVersion: photos.length === state.photos.length
                  ? state.photoCatalogVersion
                  : state.photoCatalogVersion + 1,
                drafts,
                activeDraftId: state.activeDraftId && removedDraftIds.has(state.activeDraftId)
                  ? undefined
                  : state.activeDraftId,
                savingDraftIds: state.savingDraftIds.filter(draftId => !removedDraftIds.has(draftId)),
                currentDiaryId: state.currentDiaryId === id ? '' : state.currentDiaryId,
                growthInsights: undefined,
                growthInsightsStatus: 'idle',
                growthInsightsError: undefined,
                insightReportGeneration: { status: 'idle' },
                correctedAnchors: {},
              };
            });
            persistDraftSnapshotInBackground();
            return { ok: true, diaryId: id };
          } catch (error) {
            get().logIssue(`日记删除失败：${error instanceof Error ? error.message : 'unknown error'}`);
            return { ok: false, reason: 'delete_failed', message: '删除失败，请稍后重试。' };
          }
        })().finally(() => {
          pendingDiaryDeletionRequests.delete(id);
        });
        pendingDiaryDeletionRequests.set(id, request);
        return request;
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
        const state = get();
        if (state.chatHistoryStatus !== 'ready'
          || state.chatTurnRequests.some(request => request.status === 'pending')) return;
        ++chatHistoryRequestVersion;
        const conversationId = state.chatConversationId ?? resolved.createId('chat-session');
        const requestId = resolved.createId('chat-request');
        const userMessageId = resolved.createId('chat');
        const deviceLocalDate = getDeviceLocalDateKey(resolved.now());
        set(current => ({
          chatConversationId: conversationId,
          chatMessages: [...current.chatMessages, {
            id: userMessageId,
            conversationId,
            requestId,
            role: 'user',
            text: message,
          }, {
            id: `chat-status-${requestId}`,
            conversationId,
            requestId,
            role: 'assistant',
            source: 'pending',
            text: '',
          }],
          chatTurnRequests: [...current.chatTurnRequests, {
            id: requestId,
            conversationId,
            userMessageId,
            attempt: 1,
            deviceLocalDate,
            status: 'pending',
          }],
        }));
        requestChatReply(requestId);
      },
      loadChatConversation: async conversationId => {
        if (!conversationId.trim() || get().chatTurnRequests.some(request => request.status === 'pending')) {
          return false;
        }
        const repository = resolved.adapters.petChatRepository;
        if (!repository) return false;
        const requestVersion = ++chatHistoryRequestVersion;
        set({ chatHistoryStatus: 'loading' });
        try {
          const deviceId = await ensureDeviceIdentity();
          if (requestVersion !== chatHistoryRequestVersion) return false;
          bindChatHistoryDevice(deviceId);
          const conversation = await repository.getConversation(conversationId);
          if (requestVersion !== chatHistoryRequestVersion) return false;
          const currentDeviceId = await ensureDeviceIdentity();
          if (currentDeviceId !== deviceId) {
            bindChatHistoryDevice(currentDeviceId);
            set({ chatHistoryStatus: 'error' });
            return false;
          }
          if (get().chatTurnRequests.some(request => request.status === 'pending')) {
            set({ chatHistoryStatus: 'ready' });
            return false;
          }
          const loaded = applyPetChatConversation(conversation, true);
          set({ chatHistoryStatus: 'ready' });
          return loaded;
        } catch {
          if (requestVersion === chatHistoryRequestVersion) {
            set({ chatHistoryStatus: 'error' });
            get().logIssue('聊天记录加载失败，请稍后重试。');
          }
          return false;
        }
      },
      restoreLatestChatConversation: () => {
        const repository = resolved.adapters.petChatRepository;
        if (!repository) {
          set({ chatHistoryStatus: 'ready' });
          return Promise.resolve(false);
        }
        if (pendingChatRestore) return pendingChatRestore;
        const requestVersion = ++chatHistoryRequestVersion;
        set({ chatHistoryStatus: 'loading' });
        const request = (async () => {
          try {
            const deviceId = await ensureDeviceIdentity();
            if (requestVersion !== chatHistoryRequestVersion) return false;
            bindChatHistoryDevice(deviceId);
            if (get().chatConversationId || get().chatTurnRequests.some(turn => turn.status === 'pending')) {
              set({ chatHistoryStatus: 'ready' });
              return true;
            }
            const page = await repository.listConversations({ page: 1, pageSize: 10 });
            if (requestVersion !== chatHistoryRequestVersion || get().chatConversationId) return false;
            const listedDeviceId = await ensureDeviceIdentity();
            if (listedDeviceId !== deviceId) {
              bindChatHistoryDevice(listedDeviceId);
              set({ chatHistoryStatus: 'error' });
              return false;
            }
            const latestId = page.items.find(item => item.messageCount > 0)?.id;
            const conversation = latestId ? await repository.getConversation(latestId) : undefined;
            if (requestVersion !== chatHistoryRequestVersion
              || get().chatConversationId
              || get().chatTurnRequests.some(turn => turn.status === 'pending')) return false;
            const currentDeviceId = await ensureDeviceIdentity();
            if (currentDeviceId !== deviceId) {
              bindChatHistoryDevice(currentDeviceId);
              set({ chatHistoryStatus: 'error' });
              return false;
            }
            if (conversation) applyPetChatConversation(conversation, true);
            set({ chatHistoryStatus: 'ready' });
            return Boolean(conversation);
          } catch {
            if (requestVersion === chatHistoryRequestVersion) {
              set({ chatHistoryStatus: 'error' });
              get().logIssue('聊天记录加载失败，请稍后重试。');
            }
            return false;
          }
        })();
        pendingChatRestore = request;
        void request.finally(() => {
          if (pendingChatRestore === request) pendingChatRestore = undefined;
        });
        return request;
      },
      retryChat: requestId => {
        const state = get();
        if (state.chatHistoryStatus !== 'ready'
          || state.chatTurnRequests.some(item => item.status === 'pending')) return;
        const current = state.chatTurnRequests.find(item => item.id === requestId);
        if (!current || current.status !== 'failed' || current.conversationId !== get().chatConversationId) return;
        set(state => ({
          chatMessages: state.chatMessages.map(message =>
            message.role === 'assistant'
            && message.requestId === requestId
            && message.source === 'failed'
              ? { ...message, source: 'pending', text: '' }
              : message,
          ),
          chatTurnRequests: state.chatTurnRequests.map(item => item.id === requestId
            ? { ...item, attempt: item.attempt + 1, status: 'pending', error: undefined }
            : item),
        }));
        requestChatReply(requestId, true);
      },
      toggleDiscoveryLike: id => set(state => ({ likedDiscoveryIds: state.likedDiscoveryIds.includes(id) ? state.likedDiscoveryIds.filter(item => item !== id) : [...state.likedDiscoveryIds, id] })),
      addMaterialPhoto: id => {
        const state = get();
        if (state.photos.some(photo => photo.id === id)
          && (state.materialPhotoIds.includes(id)
            || state.materialPhotoIds.length < MAX_MATERIAL_LIBRARY_PHOTOS)) {
          set(state => ({ materialPhotoIds: [...new Set([...state.materialPhotoIds, id])] }));
        }
      },
      syncMaterialPhotos: photos => {
        if (!Array.isArray(photos)
          || photos.length > MAX_MATERIAL_LIBRARY_PHOTOS
          || photos.some(photo =>
            !photo
            || typeof photo.id !== 'string'
            || !photo.id.trim()
            || !((photo.source === 'device' && !photo.generationRequestId)
              || (photo.source === 'generated'
                && photo.generationSource === 'provider'
                && typeof photo.generationRequestId === 'string'
                && photo.generationRequestId.trim()
                && typeof photo.generationPrompt === 'string'
                && photo.generationPrompt.trim()
                && photo.sourceAssetId === photo.generationRequestId))
            || !(photo.localUri ?? photo.uri)?.trim())
          || new Set(photos.map(photo => photo.id)).size !== photos.length) {
          return false;
        }
        set(state => {
          const photosById = new Map(state.photos.map(photo => [photo.id, photo]));
          for (const photo of photos) {
            const current = photosById.get(photo.id);
            photosById.set(photo.id, clonePhotoAsset(current ? { ...current, ...photo } : photo));
          }
          return {
            photos: [...photosById.values()],
            materialPhotoIds: photos.map(photo => photo.id),
            photoCatalogVersion: state.photoCatalogVersion + (photos.length ? 1 : 0),
          };
        });
        return true;
      },
      removeMaterialPhotos: photoIds => {
        if (!Array.isArray(photoIds) || !photoIds.length) return;
        const removed = new Set(photoIds);
        set(state => ({ materialPhotoIds: state.materialPhotoIds.filter(id => !removed.has(id)) }));
      },
      importDevicePhotosToMaterials: async photoIds => {
        if (!Array.isArray(photoIds) || photoIds.length === 0
          || photoIds.length > MAX_MATERIAL_PHOTOS_PER_UPLOAD
          || photoIds.some(id => typeof id !== 'string' || !id.trim())) {
          return { ok: false, reason: 'invalid_input', message: '请选择有效的照片。' };
        }
        const requestedIds = [...new Set(photoIds.map(id => id.trim()))];
        const current = get();
        if (current.materialPhotoIds.length + requestedIds.length > MAX_MATERIAL_LIBRARY_PHOTOS) {
          return { ok: false, reason: 'invalid_input', message: '素材库最多保存 100 张照片，请先删除部分素材。' };
        }
        let result: DevicePhotoAssetImportResult;
        try {
          result = await resolved.devicePhotoImporter(requestedIds);
        } catch {
          return { ok: false, reason: 'provider_failed', message: '照片导入失败，请稍后重试。' };
        }
        if (!result || typeof result !== 'object' || typeof result.ok !== 'boolean') {
          return { ok: false, reason: 'provider_failed', message: '照片导入服务返回的数据无效。' };
        }
        if (!result.ok) return result;
        if (!Array.isArray(result.photos)) {
          return { ok: false, reason: 'asset_unreadable', message: '无法确认所选照片，请重新选择后再试。' };
        }
        if (result.photos.some(photo =>
          !photo
          || typeof photo !== 'object'
          || typeof photo.id !== 'string'
          || !photo.id.trim()
          || photo.source !== 'device'
          || typeof photo.title !== 'string'
          || typeof photo.location !== 'string'
          || typeof photo.date !== 'string'
          || typeof (photo.localUri ?? photo.uri) !== 'string'
          || !(photo.localUri ?? photo.uri)?.trim())) {
          return { ok: false, reason: 'asset_unreadable', message: '无法确认所选照片，请重新选择后再试。' };
        }

        const importedIds = result.photos.map(photo => photo.id);
        if (result.photos.length !== requestedIds.length
          || new Set(importedIds).size !== requestedIds.length
          || importedIds.some(id => !requestedIds.includes(id))
          || result.photos.some(photo =>
            photo.source !== 'device'
            || !(photo.localUri ?? photo.uri)?.trim()
            || !photo.id.trim())) {
          return { ok: false, reason: 'asset_unreadable', message: '无法确认所选照片，请重新选择后再试。' };
        }

        const currentPhotos = get().photos;
        const currentById = new Map(currentPhotos.map(photo => [photo.id, photo]));
        if (result.photos.some(photo => {
          const current = currentById.get(photo.id);
          return current && current.source !== 'device';
        })) {
          return { ok: false, reason: 'identity_conflict', message: '照片标识与现有素材冲突，未导入任何照片。' };
        }

        set(state => {
          const photosById = new Map(state.photos.map(photo => [photo.id, photo]));
          let catalogChanged = false;
          for (const photo of result.photos) {
            const existing = photosById.get(photo.id);
            const refreshed = existing ? { ...existing, ...photo } : photo;
            const unchanged = existing
              && existing.uri === refreshed.uri
              && existing.localUri === refreshed.localUri
              && existing.title === refreshed.title
              && existing.location === refreshed.location
              && existing.date === refreshed.date
              && existing.width === refreshed.width
              && existing.height === refreshed.height
              && existing.filename === refreshed.filename;
            if (unchanged) continue;
            photosById.set(photo.id, clonePhotoAsset(refreshed));
            catalogChanged = true;
          }
          const materialPhotoIds = [...new Set([...state.materialPhotoIds, ...requestedIds])];
          return {
            ...(catalogChanged
              ? { photos: [...photosById.values()], photoCatalogVersion: state.photoCatalogVersion + 1 }
              : {}),
            materialPhotoIds,
          };
        });
        return { ok: true, photoIds: requestedIds };
      },
      generateMaterialImage: description => {
        const normalizedDescription = description.trim();
        if (!normalizedDescription) {
          return Promise.resolve({
            ok: false,
            reason: 'invalid_input',
            message: '请先描述想生成的画面。',
          });
        }
        if (get().materialPhotoIds.length >= MAX_MATERIAL_LIBRARY_PHOTOS) {
          return Promise.resolve({
            ok: false,
            reason: 'invalid_input',
            message: '素材库已满，请先删除部分照片。',
          });
        }
        const inflight = pendingImageGenerations.get(normalizedDescription);
        if (inflight) return inflight.promise;

        const requestId = resolved.createId('image-generation');
        const controller = new AbortController();
        imageGenerationControllers.set(requestId, controller);
        set(state => {
          const completed = state.aiImageGenerationRequests
            .filter(item => item.status !== 'pending')
            .slice(-19);
          const pending = state.aiImageGenerationRequests.filter(item => item.status === 'pending');
          return {
            aiImageGenerationRequests: [
              ...completed,
              ...pending,
              { id: requestId, description: normalizedDescription, attempt: 1, status: 'pending' },
            ],
          };
        });

        const promise: Promise<AIImageGenerationActionResult> = (async () => {
          await Promise.resolve();
          const isCancelled = () => controller.signal.aborted
            || get().aiImageGenerationRequests.find(item => item.id === requestId)?.status !== 'pending';
          if (isCancelled()) {
            imageGenerationControllers.delete(requestId);
            if (pendingImageGenerations.get(normalizedDescription)?.requestId === requestId) {
              pendingImageGenerations.delete(normalizedDescription);
            }
            return {
              ok: false,
              requestId,
              reason: 'cancelled',
              message: '本次配图生成已取消。',
            };
          }
          try {
            const request = {
              version: AI_IMAGE_GENERATION_CONTRACT_VERSION,
              requestId,
              attempt: 1,
              description: normalizedDescription,
              generatedAt: new Date(resolved.now()).toISOString(),
              signal: controller.signal,
            };
            if (!isAIImageGenerationRequest(request)) {
              throw new AIImageGenerationError('provider_failed', '配图请求格式无效');
            }
            const result = await awaitImageOperation(
              () => resolved.aiImageGenerationProvider.generate(request),
              controller.signal,
            );
            const currentRequest = get().aiImageGenerationRequests.find(item => item.id === requestId);
            if (controller.signal.aborted || currentRequest?.status !== 'pending') {
              return {
                ok: false,
                requestId,
                reason: 'cancelled',
                message: '本次配图生成已取消。',
              };
            }

            const photo = result?.photo;
            if (
              !isAIImageGenerationResultForRequest(result, request)
              || !hasReadableImageSource(photo)
            ) {
              throw new AIImageGenerationError('provider_failed', '生成结果无效');
            }

            const assetReadable = await awaitImageOperation(
              () => resolved.aiImageGenerationProvider.isAssetReadable(photo),
              controller.signal,
            );
            const latestRequest = get().aiImageGenerationRequests.find(item => item.id === requestId);
            if (controller.signal.aborted || latestRequest?.status !== 'pending') {
              return {
                ok: false,
                requestId,
                reason: 'cancelled',
                message: '本次配图生成已取消。',
              };
            }
            if (!assetReadable) {
              throw new AIImageGenerationError('provider_failed', '生成图片不可读取');
            }
            if (get().materialPhotoIds.length >= MAX_MATERIAL_LIBRARY_PHOTOS) {
              set(state => ({
                aiImageGenerationRequests: state.aiImageGenerationRequests.map(item => item.id === requestId
                  ? { ...item, status: 'failed', errorCode: 'invalid_input' }
                  : item),
              }));
              return {
                ok: false,
                requestId,
                reason: 'invalid_input',
                message: '素材库已满，请先删除部分照片。',
              };
            }

            const existingPhoto = get().photos.find(item => item.id === photo.id);
            if (existingPhoto && existingPhoto.generationRequestId !== requestId) {
              throw new AIImageGenerationError('provider_failed', '生成图片标识冲突');
            }

            get().registerPhotos([photo]);
            get().addMaterialPhoto(photo.id);
            set(state => ({
              aiImageGenerationRequests: state.aiImageGenerationRequests.map(item => item.id === requestId
                ? { ...item, status: 'succeeded', source: result.source, photoId: photo.id }
                : item),
            }));
            return { ok: true, requestId, photoId: photo.id, source: result.source };
          } catch (error) {
            const reason = error instanceof AIImageGenerationError && error.code === 'cancelled'
              ? 'cancelled'
              : error instanceof AIImageGenerationError && error.code === 'limit_exceeded'
                ? 'invalid_input'
                : 'provider_failed';
            const currentRequest = get().aiImageGenerationRequests.find(item => item.id === requestId);
            if (currentRequest?.status === 'pending') {
              set(state => ({
                aiImageGenerationRequests: state.aiImageGenerationRequests.map(item => item.id === requestId
                  ? { ...item, status: reason === 'cancelled' ? 'cancelled' : 'failed', errorCode: reason }
                  : item),
              }));
            }
            return {
              ok: false,
              requestId,
              reason,
              message: reason === 'cancelled'
                ? '本次配图生成已取消。'
                : reason === 'invalid_input'
                  ? '素材库已满，请先删除部分照片。'
                  : '配图暂时无法生成，请稍后重试。',
            };
          } finally {
            imageGenerationControllers.delete(requestId);
            if (pendingImageGenerations.get(normalizedDescription)?.requestId === requestId) {
              pendingImageGenerations.delete(normalizedDescription);
            }
          }
        })();
        pendingImageGenerations.set(normalizedDescription, { requestId, promise });
        return promise;
      },
      cancelMaterialImageGeneration: requestId => {
        const currentRequest = get().aiImageGenerationRequests.find(item => item.id === requestId);
        if (!currentRequest || currentRequest.status !== 'pending') return;
        imageGenerationControllers.get(requestId)?.abort();
        set(state => ({
          aiImageGenerationRequests: state.aiImageGenerationRequests.map(item => item.id === requestId
            ? { ...item, status: 'cancelled', errorCode: 'cancelled' }
            : item),
        }));
      },
      generateInsightReport: () => {
        if (!get().flowerUnlocked) {
          return Promise.resolve({
            ok: false,
            reason: 'not_unlocked',
            message: '专属洞察报告尚未解锁。',
          });
        }
        const { sourceDiaries, sourceVersion } = buildInsightReportSourceSnapshot();
        if (sourceDiaries.length === 0) {
          return Promise.resolve({
            ok: false,
            reason: 'no_sources',
            message: '目前还没有可用于整理报告的日记。',
          });
        }

        const existing = pendingInsightReports.get(sourceVersion);
        if (existing && get().insightReportGeneration.status === 'running'
          && get().insightReportGeneration.requestId === existing.requestId) {
          return existing.promise;
        }

        const previousRequestId = activeInsightReportRequestId;
        if (previousRequestId) insightReportControllers.get(previousRequestId)?.abort();
        const requestId = resolved.createId('insight-report');
        const request = {
          version: INSIGHT_REPORT_CONTRACT_VERSION,
          requestId,
          sourceVersion,
          sourceDiaries,
        };
        const controller = new AbortController();
        activeInsightReportRequestId = requestId;
        insightReportControllers.set(requestId, controller);
        set({
          insightReportGeneration: {
            status: 'running',
            requestId,
            sourceVersion,
          },
        });

        const promise: Promise<InsightReportActionResult> = (async () => {
          await Promise.resolve();
          try {
            if (!isInsightReportRequest(request)) {
              throw new InsightReportProviderError('provider_failed', '报告请求结构无效');
            }
            const result = await awaitInsightReportOperation(
              () => resolved.insightReportProvider.generate({ ...request, signal: controller.signal }),
              controller.signal,
            );
            const current = get().insightReportGeneration;
            if (
              controller.signal.aborted
              || activeInsightReportRequestId !== requestId
              || current.requestId !== requestId
              || current.status !== 'running'
            ) {
              return {
                ok: false,
                requestId,
                reason: current.status === 'cancelled' ? 'cancelled' : 'stale',
                message: current.status === 'cancelled' ? '本次报告生成已取消。' : '报告来源已更新，请重新生成。',
              };
            }
            if (buildInsightReportSourceSnapshot().sourceVersion !== sourceVersion) {
              set({
                insightReportGeneration: {
                  status: 'stale',
                  requestId,
                  sourceVersion,
                  errorCode: 'stale',
                },
              });
              return {
                ok: false,
                requestId,
                reason: 'stale',
                message: '报告来源已更新，请重新生成。',
              };
            }

            if (!isInsightReportResultForRequest(result, request)) {
              throw new InsightReportProviderError('provider_failed', '报告结果结构无效');
            }

            set({
              insightReportGeneration: {
                status: 'succeeded',
                requestId,
                sourceVersion,
                report: result,
              },
            });
            return { ok: true, requestId, report: result };
          } catch (error) {
            const current = get().insightReportGeneration;
            const sourceChanged = buildInsightReportSourceSnapshot().sourceVersion !== sourceVersion;
            const requestSuperseded = activeInsightReportRequestId !== requestId
              || current.requestId !== requestId;
            const explicitlyCancelled = current.requestId === requestId
              && current.status === 'cancelled';
            const providerCancelled = error instanceof InsightReportProviderError
              && error.code === 'cancelled';
            const reason = explicitlyCancelled || (providerCancelled && !sourceChanged && !requestSuperseded)
              ? 'cancelled'
              : sourceChanged || requestSuperseded
                ? 'stale'
                : 'provider_failed';
            if (activeInsightReportRequestId === requestId
              && current.requestId === requestId
              && current.status === 'running') {
              set({
                insightReportGeneration: {
                  status: reason === 'cancelled' ? 'cancelled' : reason === 'stale' ? 'stale' : 'failed',
                  requestId,
                  sourceVersion,
                  errorCode: reason,
                },
              });
            }
            return {
              ok: false,
              requestId,
              reason,
              message: reason === 'cancelled'
                ? '本次报告生成已取消。'
                : reason === 'stale'
                  ? '报告来源已更新，请重新生成。'
                  : '专属洞察报告暂时无法生成，请稍后重试。',
            };
          } finally {
            insightReportControllers.delete(requestId);
            if (activeInsightReportRequestId === requestId) activeInsightReportRequestId = undefined;
            if (pendingInsightReports.get(sourceVersion)?.requestId === requestId) {
              pendingInsightReports.delete(sourceVersion);
            }
          }
        })();
        pendingInsightReports.set(sourceVersion, { requestId, promise });
        return promise;
      },
      cancelInsightReport: requestId => {
        const current = get().insightReportGeneration;
        if (current.requestId !== requestId || current.status !== 'running') return;
        insightReportControllers.get(requestId)?.abort();
        activeInsightReportRequestId = undefined;
        set({
          insightReportGeneration: {
            status: 'cancelled',
            requestId,
            sourceVersion: current.sourceVersion,
            errorCode: 'cancelled',
          },
        });
      },
      correctAnchor: (id, text) => { if (text.trim()) set(state => ({ correctedAnchors: { ...state.correctedAnchors, [id]: text.trim() } })); },
      setFlowerUnlocked: flowerUnlocked => set({ flowerUnlocked }),
      loadGrowthInsights: () => runGrowthRequest(() => {
        const repository = resolved.adapters.growthInsightRepository;
        if (!repository) throw new Error('成长服务暂未配置，请稍后重试。');
        return repository.getState();
      }),
      initializeGrowthFlowers: () => runGrowthRequest(() => {
        const repository = resolved.adapters.growthInsightRepository;
        if (!repository) throw new Error('成长服务暂未配置，请稍后重试。');
        return repository.initializeFlowers();
      }),
      retryGrowthFlowers: () => runGrowthRequest(() => {
        const repository = resolved.adapters.growthInsightRepository;
        if (!repository) throw new Error('成长服务暂未配置，请稍后重试。');
        return repository.retryFlowers();
      }),
      ensureCurrentGrowthReport: () => runGrowthRequest(() => {
        const repository = resolved.adapters.growthInsightRepository;
        if (!repository) throw new Error('洞察报告服务暂未配置，请稍后重试。');
        return repository.ensureCurrentReport();
      }),
      retryGrowthReport: () => runGrowthRequest(() => {
        const repository = resolved.adapters.growthInsightRepository;
        if (!repository) throw new Error('洞察报告服务暂未配置，请稍后重试。');
        return repository.retryCurrentReport();
      }),
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
        const requestVersion = ++memoriesRequestVersion;
        const repository = resolved.adapters.memoriesRepository;
        if (!repository) {
          set(state => ({
            hydratedMemories: true,
            memoriesSourceItems: state.memoriesSourceItems.length ? state.memoriesSourceItems : state.diaries,
          }));
          return;
        }
        set({ memoriesStatus: 'loading', memoriesError: undefined });
        try {
          const query = { page: 1, pageSize: 100 };
          const result = repository.listAllMemories
            ? await repository.listAllMemories(query)
            : await repository.listMemories(query);
          if (requestVersion !== memoriesRequestVersion) return;
          if (!result.ok) {
            get().logIssue(`回忆同步失败：${result.error.message}`);
            set({ memoriesStatus: 'error', memoriesError: '日记暂时无法加载，请稍后重试。' });
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
            publicBlockIds: item.publicBlockIds,
            version: item.version,
            contentSnapshot: item.contentSnapshot,
            contentSnapshotStatus: item.contentSnapshotStatus,
          }));
          const diaryPhotos = await listSavedDiaryPhotoAssets(remoteDiaries.map(diary => diary.id));
          if (requestVersion !== memoriesRequestVersion) return;
          set(state => {
            const merged = [...state.diaries];
            const photosById = new Map(state.photos.map(photo => [photo.id, photo]));
            diaryPhotos.forEach(photo => photosById.set(photo.id, clonePhotoAsset(photo)));
            for (const remoteDiary of remoteDiaries) {
              const index = merged.findIndex(item => item.id === remoteDiary.id);
              if (index >= 0) merged[index] = remoteDiary;
              else merged.unshift(remoteDiary);
            }
            return {
              diaries: merged,
              ...(diaryPhotos.length ? {
                photos: [...photosById.values()],
                photoCatalogVersion: state.photoCatalogVersion + 1,
              } : {}),
              hydratedMemories: true,
              memoriesSourceItems: remoteDiaries,
              memoriesItems: state.memoriesStatus === 'idle' || state.memoriesStatus === 'loading'
                ? remoteDiaries
                : state.memoriesItems,
              memoriesTotal: state.memoriesStatus === 'idle' || state.memoriesStatus === 'loading'
                ? remoteDiaries.length
                : state.memoriesTotal,
              memoriesStatus: state.memoriesStatus === 'idle' || state.memoriesStatus === 'loading'
                ? 'ready'
                : state.memoriesStatus,
            };
          });
        } catch (error) {
          if (requestVersion !== memoriesRequestVersion) return;
          get().logIssue(`回忆同步失败：${error instanceof Error ? error.message : 'unknown error'}`);
          set({ memoriesStatus: 'error', memoriesError: '日记暂时无法加载，请稍后重试。' });
        }
      },
      readDiaryById: async diaryId => {
        if (deletedDiaryIds.has(diaryId)) {
          return { ok: false as const, reason: 'not_found', message: '没有找到这篇日记。' };
        }
        const localDiary = get().diaries.find(item => item.id === diaryId);
        const repository = resolved.adapters.diaryRepository;
        if (!repository?.getDiary) {
          return localDiary
            ? { ok: true as const, diary: localDiary }
            : { ok: false as const, reason: 'not_found', message: '没有找到这篇日记。' };
        }

        try {
          const result = await repository.getDiary(diaryId);
          if (deletedDiaryIds.has(diaryId)) {
            return { ok: false as const, reason: 'not_found', message: '没有找到这篇日记。' };
          }
          if (!result.ok) {
            if (result.error.code === 'not_found' || result.error.code === 'permission_denied') {
              return { ok: false as const, reason: 'not_found', message: '没有找到这篇日记。' };
            }
            get().logIssue(`读取日记失败：${result.error.message}`);
            return { ok: false as const, reason: 'load_failed', message: result.error.message };
          }

          const diary = normalizeDiaryPhotos(result.data, result.data.photoIds);
          let diaryPhotos: Awaited<ReturnType<typeof listSavedDiaryPhotoAssets>> = [];
          try {
            diaryPhotos = await listSavedDiaryPhotoAssets([diaryId]);
          } catch (error) {
            get().logIssue(`日记照片副本读取失败：${error instanceof Error ? error.message : 'unknown error'}`);
          }
          if (deletedDiaryIds.has(diaryId)) {
            return { ok: false as const, reason: 'not_found', message: '没有找到这篇日记。' };
          }
          set(state => {
            const mergeItems = (items: DiaryItem[]) => {
              const next = [...items];
              const index = next.findIndex(item => item.id === diary.id);
              if (index >= 0) next[index] = diary;
              else next.unshift(diary);
              return next;
            };
            const photosById = new Map(state.photos.map(photo => [photo.id, photo]));
            diaryPhotos.forEach(photo => photosById.set(photo.id, clonePhotoAsset(photo)));
            return {
              diaries: mergeItems(state.diaries),
              memoriesSourceItems: mergeItems(state.memoriesSourceItems),
              memoriesItems: state.memoriesStatus === 'ready' ? mergeItems(state.memoriesItems) : state.memoriesItems,
              ...(diaryPhotos.length ? {
                photos: [...photosById.values()],
                photoCatalogVersion: state.photoCatalogVersion + 1,
              } : {}),
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
          const result = repository.listAllMemories
            ? await repository.listAllMemories(query)
            : await repository.listMemories(query);
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
            publicBlockIds: item.publicBlockIds,
            version: item.version,
            contentSnapshot: item.contentSnapshot,
            contentSnapshotStatus: item.contentSnapshotStatus,
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
    get photos() { return store.getState().photos; },
    get historyGroups() { return getHistoryGroups(store.getState().diaries); },
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
