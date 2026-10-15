import { CORE_DIARY_CONTRACT_VERSION, isDiaryContentContract, isDraftContract, isGenerationJobContract, isRewriteBlockResultContract, type DiaryContract, type DraftContract, type GenerationJobContract, type MemoriesQuery, type MemoriesQueryResult, type RemoteError, type RemoteResult, type RewriteBlockRequestContract, type RewriteBlockResultContract, type SaveDiaryRequestContract, type SaveDraftResult } from '../contracts/core-diary-contract';
import { ApiClient, ApiRequestError, type ApiRequestOptions, type ApiResponse } from '../services/api-client';
import type { CoreDiaryRepository, IdentityContract } from './core-diary-repository';
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
  if (!isDiaryContentContract(content)) return undefined;
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

  async createGenerationJob(input: {
    draftId: string;
    draftVersion: number;
    idempotencyKey: string;
  }, options?: ApiRequestOptions): Promise<RemoteResult<GenerationJobContract>> {
    return this.requestGenerationJobResult('/generation/jobs', {
      method: 'POST',
      body: JSON.stringify(input),
    }, options);
  }

  async rewriteBlock(input: RewriteBlockRequestContract, options?: ApiRequestOptions): Promise<RemoteResult<RewriteBlockResultContract>> {
    return this.requestRewriteResult('/generation/rewrite', {
      method: 'POST',
      body: JSON.stringify(input),
    }, options);
  }

  async getGenerationJob(jobId: string, options?: ApiRequestOptions): Promise<RemoteResult<GenerationJobContract>> {
    return this.requestGenerationJobResult(`/generation/jobs/${jobId}`, {
      method: 'GET',
    }, options);
  }

  async cancelGenerationJob(jobId: string, options?: ApiRequestOptions): Promise<RemoteResult<GenerationJobContract>> {
    return this.requestGenerationJobResult(`/generation/jobs/${jobId}/cancel`, {
      method: 'POST',
      body: JSON.stringify({}),
    }, options);
  }

  async saveDiary(input: SaveDiaryRequestContract, options?: ApiRequestOptions): Promise<RemoteResult<SaveDraftResult & { id?: string }>> {
    return this.requestSaveResult('/diaries/save', {
      method: 'POST',
      body: JSON.stringify(input),
    }, options);
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

  async getDiary(diaryId: string, options?: ApiRequestOptions): Promise<RemoteResult<DiaryItem>> {
    let response: ApiResponse<OkEnvelope<DiaryContract> | ErrorEnvelope>;
    try {
      response = await this.client.request(`/diaries/${encodeURIComponent(diaryId)}`, {
        method: 'GET',
      }, options);
    } catch (error) {
      return requestFailure(error);
    }
    const json = response.data;
    if (!response.ok || !isOkEnvelope<{ id?: string; diaryId: string; draftId: string; savedVersion: number }>(json)) {
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
    return {
      ok: true,
      version: CORE_DIARY_CONTRACT_VERSION,
      data: diary,
    };
  }

  async listMemories(query: MemoriesQuery, options?: ApiRequestOptions): Promise<RemoteResult<MemoriesQueryResult>> {
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

  private async requestSaveResult(
    path: string,
    init: RequestInit,
    options?: ApiRequestOptions,
  ): Promise<RemoteResult<SaveDraftResult & { id?: string }>> {
    let response: ApiResponse<OkEnvelope<{ id?: string; diaryId: string; draftId: string; savedVersion: number }> | ErrorEnvelope>;
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
  ): Promise<RemoteResult<GenerationJobContract>> {
    let response: ApiResponse<OkEnvelope<GenerationJobContract> | ErrorEnvelope>;
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
    if (!response.ok || !isOkEnvelope<GenerationJobContract>(json)) {
      return {
        ok: false,
        version: CORE_DIARY_CONTRACT_VERSION,
        error: responseError(response),
      };
    }
    return this.parseGenerationJobResult(json.data);
  }

  private async requestRewriteResult(
    path: string,
    init: RequestInit,
    options?: ApiRequestOptions,
  ): Promise<RemoteResult<RewriteBlockResultContract>> {
    let response: ApiResponse<OkEnvelope<RewriteBlockResultContract> | ErrorEnvelope>;
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
