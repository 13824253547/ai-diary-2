import { CORE_DIARY_CONTRACT_VERSION, isCreateGenerationJobRequestContract, isDiaryContentContractForPhotoIds, isDraftContract, isGenerationJobContract, isMemoriesQuery, isRewriteBlockResultContract, MEMORIES_PAGE_SIZES, type CreateGenerationJobRequestContract, type DiaryContract, type DraftContract, type GenerationJobContract, type MemoriesQuery, type MemoriesQueryResult, type RemoteError, type RemoteResult, type RewriteBlockRequestContract, type RewriteBlockResultContract, type SaveDiaryRequestContract, type SaveDraftResult } from '../contracts/core-diary-contract';
import { ApiClient, ApiRequestError, type ApiRequestOptions, type ApiResponse } from '../services/api-client';
import type { CoreDiaryRepository, GenerationPhotoUpload, IdentityContract } from './core-diary-repository';
import type { DiaryItem } from '../types/diary';

type OkEnvelope<T> = { ok: true; data: T };
type ErrorEnvelope = {
  ok: false;
  error: {
    code: 'permission_denied' | 'device_identity_required' | 'timeout' | 'cancelled' | 'not_found' | 'invalid_input' | 'version_conflict' | 'asset_unreadable' | 'provider_failed';
    message: string;
    retryable: boolean;
  };
};

const ERROR_CODES = new Set<ErrorEnvelope['error']['code']>([
  'permission_denied',
  'device_identity_required',
  'timeout',
  'cancelled',
  'not_found',
  'invalid_input',
  'version_conflict',
  'asset_unreadable',
  'provider_failed',
]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

function isOkEnvelope<T>(value: unknown): value is OkEnvelope<T> {
  return isRecord(value) && value.ok === true && 'data' in value;
}

function isErrorEnvelope(value: unknown): value is ErrorEnvelope {
  if (!isRecord(value) || value.ok !== false || !isRecord(value.error)) return false;
  const error = value.error;
  return typeof error.code === 'string'
    && ERROR_CODES.has(error.code as ErrorEnvelope['error']['code'])
    && typeof error.message === 'string'
    && typeof error.retryable === 'boolean';
}

function requestFailure<T>(error: unknown): RemoteResult<T> {
  const remoteError: RemoteError = error instanceof ApiRequestError
    ? {
        code: error.code,
        message: error.message,
        retryable: error.retryable,
      }
    : {
        code: 'provider_failed',
        message: '网络请求失败，请稍后重试。',
        retryable: true,
      };
  return {
    ok: false,
    version: CORE_DIARY_CONTRACT_VERSION,
    error: remoteError,
  };
}

function responseError(response: ApiResponse<unknown>): RemoteError {
  const json = response.data;
  if (isErrorEnvelope(json)) return json.error;
  return {
    code: 'provider_failed',
    message: response.ok ? '服务器返回的数据格式异常。' : `请求失败（HTTP ${response.status}）。`,
    retryable: false,
  };
}

function buildDiaryItem(value: unknown): DiaryItem | undefined {
  if (!isRecord(value)) return undefined;
  const data = value as unknown as DiaryContract;
  const content = data.contentSnapshot;
  if (!isDiaryContentContractForPhotoIds(content, data.photoIds)) return undefined;
  return {
    ...content,
    id: data.id,
    status: 'ready',
    title: data.title,
    location: data.location,
    date: data.date,
    summary: data.summary,
    privacy: data.privacy,
    photoIds: data.photoIds,
    version: data.version,
    publicBlockIds: data.publicBlockIds,
    exportedImage: false,
    exportedPdf: false,
    shareModes: [],
    exportModes: [],
    createdInSession: false,
  };
}

function buildPhotoMultipartBody(
  fields: Record<string, unknown>,
  photos: GenerationPhotoUpload[],
) {
  const form = new FormData();
  for (const [key, value] of Object.entries(fields)) {
    if (value === undefined) continue;
    form.append(key, typeof value === 'string' ? value : JSON.stringify(value));
  }
  photos.forEach((photo, index) => {
    const extension = photo.mimeType === 'image/jpeg'
      ? 'jpg'
      : photo.mimeType.split('/')[1] || 'img';
    const file = {
      uri: photo.uri,
      name: `photo-${String(index + 1).padStart(3, '0')}.${extension}`,
      type: photo.mimeType,
    };
    form.append('photos', file as unknown as Blob);
  });
  return form;
}

export class HttpCoreDiaryRepository implements CoreDiaryRepository {
  constructor(private readonly client: ApiClient) {}

  async getIdentity(options?: ApiRequestOptions): Promise<IdentityContract> {
    return this.client.get<IdentityContract>('/identity/me', options);
  }

  async createDraft(input: DraftContract, options?: ApiRequestOptions): Promise<RemoteResult<DraftContract>> {
    return this.requestDraftResult('/drafts', {
      method: 'POST',
      body: JSON.stringify(input),
    }, options);
  }

  async createGenerationJob(
    input: CreateGenerationJobRequestContract,
    options?: ApiRequestOptions,
    photos?: GenerationPhotoUpload[],
  ): Promise<RemoteResult<GenerationJobContract>> {
    if (!isCreateGenerationJobRequestContract(input)) {
      return {
        ok: false,
        version: CORE_DIARY_CONTRACT_VERSION,
        error: { code: 'invalid_input', message: '生成任务请求参数无效。', retryable: false },
      };
    }
    const body = photos === undefined ? JSON.stringify(input) : buildPhotoMultipartBody({
      ...input,
      photoMetadata: photos.map(({ photoId, date }) => ({ photoId, date })),
    }, photos);
    return this.requestGenerationJobResult('/generation/jobs', {
      method: 'POST',
      headers: photos === undefined ? { 'Content-Type': 'application/json' } : {},
      body,
    }, photos === undefined ? options : { ...options, transport: 'xhr' }, job =>
      job.draftId === input.draftId
      && job.draftVersion === input.draftVersion
      && job.idempotencyKey === input.idempotencyKey);
  }

  async rewriteBlock(
    input: RewriteBlockRequestContract,
    options?: ApiRequestOptions,
    photos?: GenerationPhotoUpload[],
  ): Promise<RemoteResult<RewriteBlockResultContract>> {
    const body = photos === undefined
      ? JSON.stringify(input)
      : buildPhotoMultipartBody({
          ...input,
          photoIds: input.photoIds ?? [],
          selectedPhotoIds: input.selectedPhotoIds,
          contextBlocks: input.contextBlocks ?? [],
          photoMetadata: photos.map(({ photoId, date }) => ({ photoId, date })),
        }, photos);
    return this.requestRewriteResult('/generation/rewrite', {
      method: 'POST',
      headers: photos === undefined ? { 'Content-Type': 'application/json' } : {},
      body,
    }, photos === undefined ? options : { ...options, transport: 'xhr' }, input);
  }

  async getGenerationJob(jobId: string, options?: ApiRequestOptions): Promise<RemoteResult<GenerationJobContract>> {
    if (!isNonEmptyString(jobId)) return this.invalidGenerationJobRequest();
    return this.requestGenerationJobResult(`/generation/jobs/${encodeURIComponent(jobId)}`, {
      method: 'GET',
    }, options, job => job.jobId === jobId);
  }

  async cancelGenerationJob(jobId: string, options?: ApiRequestOptions): Promise<RemoteResult<GenerationJobContract>> {
    if (!isNonEmptyString(jobId)) return this.invalidGenerationJobRequest();
    return this.requestGenerationJobResult(`/generation/jobs/${encodeURIComponent(jobId)}/cancel`, {
      method: 'POST',
      body: JSON.stringify({}),
    }, options, job => job.jobId === jobId);
  }

  async saveDiary(
    input: SaveDiaryRequestContract,
    options?: ApiRequestOptions,
    photos?: GenerationPhotoUpload[],
  ): Promise<RemoteResult<SaveDraftResult & { id?: string }>> {
    const multipart = photos !== undefined;
    const body = multipart
      ? buildPhotoMultipartBody({
          ...input,
          photoMetadata: photos.map(({ photoId, date }) => ({ photoId, date })),
        }, photos)
      : JSON.stringify(input);
    return this.requestSaveResult('/diaries/save', {
      method: 'POST',
      headers: multipart ? {} : { 'Content-Type': 'application/json' },
      body,
    }, multipart ? { ...options, transport: 'xhr' } : options);
  }

  async updateDiaryVisibility(input: {
    diaryId: string;
    privacy: string;
    publicBlockIds?: string[];
  }, options?: ApiRequestOptions): Promise<RemoteResult<{
    diaryId: string;
    privacy: string;
    publicBlockIds?: string[];
  }>> {
    let response: ApiResponse<OkEnvelope<{
      diaryId: string;
      privacy: string;
      publicBlockIds?: string[];
    }> | ErrorEnvelope>;
    try {
      response = await this.client.request('/sharing/project', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(input),
      }, options);
    } catch (error) {
      return requestFailure(error);
    }
    const json = response.data;
    if (!response.ok || !isOkEnvelope<{ diaryId: string; privacy: string; publicBlockIds?: string[] }>(json)) {
      return {
        ok: false,
        version: CORE_DIARY_CONTRACT_VERSION,
        error: responseError(response),
      };
    }
    return {
      ok: true,
      version: CORE_DIARY_CONTRACT_VERSION,
      data: {
        diaryId: json.data.diaryId,
        privacy: json.data.privacy,
        publicBlockIds: Array.isArray(json.data.publicBlockIds)
          ? json.data.publicBlockIds.filter((item): item is string => typeof item === 'string')
          : undefined,
      },
    };
  }

  async getSaveResult(idempotencyKey: string, options?: ApiRequestOptions): Promise<RemoteResult<SaveDraftResult & { id?: string }>> {
    return this.requestSaveResult(`/diaries/save-results/${encodeURIComponent(idempotencyKey)}`, {
      method: 'GET',
    }, options);
  }

  async getDiary(diaryId: unknown, options?: ApiRequestOptions): Promise<RemoteResult<DiaryItem>> {
    if (typeof diaryId !== 'string' || !diaryId.trim()) {
      return {
        ok: false,
        version: CORE_DIARY_CONTRACT_VERSION,
        error: {
          code: 'invalid_input',
          message: '日记标识无效。',
          retryable: false,
        },
      };
    }
    let response: ApiResponse<OkEnvelope<DiaryContract> | ErrorEnvelope>;
    try {
      response = await this.client.request(`/diaries/${encodeURIComponent(diaryId)}`, {
        method: 'GET',
      }, options);
    } catch (error) {
      return requestFailure(error);
    }
    const json = response.data;
    if (!response.ok || !isOkEnvelope<DiaryContract>(json)) {
      return {
        ok: false,
        version: CORE_DIARY_CONTRACT_VERSION,
        error: responseError(response),
      };
    }
    const diary = buildDiaryItem(json.data);
    if (!diary) {
      return {
        ok: false,
        version: CORE_DIARY_CONTRACT_VERSION,
        error: {
          code: 'provider_failed',
          message: 'diary response is missing a valid content snapshot',
          retryable: false,
        },
      };
    }
    if (diary.id !== diaryId) {
      return {
        ok: false,
        version: CORE_DIARY_CONTRACT_VERSION,
        error: {
          code: 'provider_failed',
          message: '服务器返回的日记标识与请求不一致。',
          retryable: false,
        },
      };
    }
    return {
      ok: true,
      version: CORE_DIARY_CONTRACT_VERSION,
      data: diary,
    };
  }

  async listMemories(query: MemoriesQuery, options?: ApiRequestOptions): Promise<RemoteResult<MemoriesQueryResult>> {
    if (!isMemoriesQuery(query)) return this.invalidMemoriesQueryResult();
    const search = new URLSearchParams();
    if (query.month) search.set('month', query.month);
    if (query.day) search.set('day', query.day);
    if (query.keyword) search.set('keyword', query.keyword);
    search.set('page', String(query.page));
    search.set('pageSize', String(query.pageSize));
    let response: ApiResponse<OkEnvelope<MemoriesQueryResult> | ErrorEnvelope>;
    try {
      response = await this.client.request(`/memories?${search.toString()}`, {
        method: 'GET',
      }, options);
    } catch (error) {
      return requestFailure(error);
    }
    if (!response.ok || !isOkEnvelope<MemoriesQueryResult>(response.data)) {
      return {
        ok: false,
        version: CORE_DIARY_CONTRACT_VERSION,
        error: responseError(response),
      };
    }
    return { ok: true, version: CORE_DIARY_CONTRACT_VERSION, data: response.data.data };
  }

  async listAllMemories(query: MemoriesQuery, options?: ApiRequestOptions): Promise<RemoteResult<MemoriesQueryResult>> {
    if (!isMemoriesQuery(query)) return this.invalidMemoriesQueryResult();
    const pageSize = query.pageSize;
    if (!MEMORIES_PAGE_SIZES.includes(pageSize as typeof MEMORIES_PAGE_SIZES[number])) {
      return {
        ok: false,
        version: CORE_DIARY_CONTRACT_VERSION,
        error: { code: 'invalid_input', message: 'unsupported memories page size', retryable: false },
      };
    }

    const first = await this.listMemories({ ...query, page: 1 }, options);
    if (!first.ok) return first;
    const { total } = first.data;
    if (
      first.data.page !== 1
      || first.data.pageSize !== pageSize
      || !Number.isSafeInteger(total)
      || total < 0
      || !Array.isArray(first.data.items)
      || first.data.items.length > total
    ) {
      return this.invalidMemoriesPaginationResult();
    }

    const items = [...first.data.items];
    const itemIds = new Set(items.map(item => item.id));
    const pageCount = Math.ceil(total / pageSize);
    for (let page = 2; page <= pageCount; page += 1) {
      const next = await this.listMemories({ ...query, page, pageSize }, options);
      if (!next.ok) return next;
      if (
        next.data.page !== page
        || next.data.pageSize !== pageSize
        || next.data.total !== total
        || !Array.isArray(next.data.items)
        || next.data.items.length === 0
      ) {
        return this.invalidMemoriesPaginationResult();
      }
      if (next.data.items.some(item => itemIds.has(item.id))) {
        return this.invalidMemoriesPaginationResult();
      }
      next.data.items.forEach(item => itemIds.add(item.id));
      items.push(...next.data.items);
    }

    if (items.length !== total) return this.invalidMemoriesPaginationResult();
    return {
      ok: true,
      version: CORE_DIARY_CONTRACT_VERSION,
      data: { items, page: 1, pageSize, total },
    };
  }

  private invalidMemoriesPaginationResult(): RemoteResult<MemoriesQueryResult> {
    return {
      ok: false,
      version: CORE_DIARY_CONTRACT_VERSION,
      error: {
        code: 'provider_failed',
        message: 'memories pagination response is inconsistent',
        retryable: true,
      },
    };
  }

  private invalidMemoriesQueryResult(): RemoteResult<MemoriesQueryResult> {
    return {
      ok: false,
      version: CORE_DIARY_CONTRACT_VERSION,
      error: {
        code: 'invalid_input',
        message: 'memories query contains an invalid date or pagination value',
        retryable: false,
      },
    };
  }

  private async requestSaveResult(
    path: string,
    init: RequestInit,
    options?: ApiRequestOptions,
  ): Promise<RemoteResult<SaveDraftResult & { id?: string }>> {
    let response: ApiResponse<OkEnvelope<{ id?: string; diaryId: string; draftId: string; savedVersion: number; date?: string }> | ErrorEnvelope>;
    try {
      response = await this.client.request(path, {
        headers: init.headers ?? { 'Content-Type': 'application/json' },
        ...init,
      }, options);
    } catch (error) {
      return requestFailure(error);
    }
    const json = response.data;
    if (!response.ok || !isOkEnvelope<DiaryContract>(json)) {
      return {
        ok: false,
        version: CORE_DIARY_CONTRACT_VERSION,
        error: responseError(response),
      };
    }
    return {
      ok: true,
      version: CORE_DIARY_CONTRACT_VERSION,
      data: {
        diaryId: json.data.diaryId ?? json.data.id ?? '',
        draftId: json.data.draftId,
        savedVersion: json.data.savedVersion,
        id: json.data.id ?? json.data.diaryId,
        ...(typeof json.data.date === 'string' && /^\d{4}\.\d{2}\.\d{2}$/.test(json.data.date)
          ? { date: json.data.date }
          : {}),
      },
    };
  }

  private async requestDraftResult(
    path: string,
    init: RequestInit,
    options?: ApiRequestOptions,
  ): Promise<RemoteResult<DraftContract>> {
    let response: ApiResponse<OkEnvelope<DraftContract> | ErrorEnvelope>;
    try {
      response = await this.client.request(path, {
        headers: {
          'Content-Type': 'application/json',
        },
        ...init,
      }, options);
    } catch (error) {
      return requestFailure(error);
    }
    const json = response.data;
    if (!response.ok || !isOkEnvelope<DraftContract>(json)) {
      return {
        ok: false,
        version: CORE_DIARY_CONTRACT_VERSION,
        error: responseError(response),
      };
    }
    if (!isDraftContract(json.data)) {
      return {
        ok: false,
        version: CORE_DIARY_CONTRACT_VERSION,
        error: {
          code: 'provider_failed',
          message: 'draft response is invalid',
          retryable: false,
        },
      };
    }
    return {
      ok: true,
      version: CORE_DIARY_CONTRACT_VERSION,
      data: json.data,
    };
  }

  private async requestGenerationJobResult(
    path: string,
    init: RequestInit,
    options?: ApiRequestOptions,
    matchesRequest?: (job: GenerationJobContract) => boolean,
  ): Promise<RemoteResult<GenerationJobContract>> {
    let response: ApiResponse<OkEnvelope<GenerationJobContract> | ErrorEnvelope>;
    try {
      response = await this.client.request(path, {
        headers: init.headers ?? { 'Content-Type': 'application/json' },
        ...init,
      }, options);
    } catch (error) {
      return requestFailure(error);
    }
    const json = response.data;
    if (!response.ok || !isOkEnvelope<GenerationJobContract>(json)) {
      return {
        ok: false,
        version: CORE_DIARY_CONTRACT_VERSION,
        error: responseError(response),
      };
    }
    const parsed = this.parseGenerationJobResult(json.data);
    if (!parsed.ok || !matchesRequest || matchesRequest(parsed.data)) return parsed;
    return {
      ok: false,
      version: CORE_DIARY_CONTRACT_VERSION,
      error: {
        code: 'provider_failed',
        message: 'generation job response does not match the request',
        retryable: false,
      },
    };
  }

  private invalidGenerationJobRequest(): RemoteResult<GenerationJobContract> {
    return {
      ok: false,
      version: CORE_DIARY_CONTRACT_VERSION,
      error: {
        code: 'invalid_input',
        message: 'generation job ID is invalid',
        retryable: false,
      },
    };
  }

  private async requestRewriteResult(
    path: string,
    init: RequestInit,
    options?: ApiRequestOptions,
    expected?: Pick<RewriteBlockRequestContract, 'draftId' | 'blockId' | 'draftVersion' | 'blockType'>,
  ): Promise<RemoteResult<RewriteBlockResultContract>> {
    let response: ApiResponse<OkEnvelope<RewriteBlockResultContract> | ErrorEnvelope>;
    try {
      response = await this.client.request(path, {
        headers: init.headers ?? { 'Content-Type': 'application/json' },
        ...init,
      }, options);
    } catch (error) {
      return requestFailure(error);
    }
    const json = response.data;
    if (!response.ok || !isOkEnvelope<RewriteBlockResultContract>(json)) {
      return {
        ok: false,
        version: CORE_DIARY_CONTRACT_VERSION,
        error: responseError(response),
      };
    }
    if (!isRewriteBlockResultContract(json.data)) {
      return {
        ok: false,
        version: CORE_DIARY_CONTRACT_VERSION,
        error: {
          code: 'provider_failed',
          message: 'rewrite result response is invalid',
          retryable: false,
        },
      };
    }
    if (
      expected
      && (
        json.data.draftId !== expected.draftId
        || json.data.blockId !== expected.blockId
        || json.data.draftVersion !== expected.draftVersion
        || json.data.blockType !== expected.blockType
      )
    ) {
      return {
        ok: false,
        version: CORE_DIARY_CONTRACT_VERSION,
        error: {
          code: 'provider_failed',
          message: 'rewrite result response does not match the request',
          retryable: false,
        },
      };
    }
    return {
      ok: true,
      version: CORE_DIARY_CONTRACT_VERSION,
      data: json.data,
    };
  }

  private parseGenerationJobResult(data: unknown): RemoteResult<GenerationJobContract> {
    if (!isGenerationJobContract(data)) {
      return {
        ok: false,
        version: CORE_DIARY_CONTRACT_VERSION,
        error: {
          code: 'provider_failed',
          message: 'generation job response is invalid',
          retryable: false,
        },
      };
    }
    return {
      ok: true,
      version: CORE_DIARY_CONTRACT_VERSION,
      data,
    };
  }
}
