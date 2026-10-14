import { CORE_DIARY_CONTRACT_VERSION, isDraftContract, isGenerationJobContract, isRewriteBlockResultContract, type DraftContract, type GenerationJobContract, type MemoriesQuery, type MemoriesQueryResult, type RemoteResult, type RewriteBlockRequestContract, type RewriteBlockResultContract, type SaveDraftResult } from '../contracts/core-diary-contract';
import { ApiClient } from '../services/api-client';
import type { CoreDiaryRepository, IdentityContract } from './core-diary-repository';
import type { DiaryItem } from '../types/diary';

type OkEnvelope<T> = { ok: true; data: T };
type ErrorEnvelope = {
  ok: false;
  error: {
    code: 'permission_denied' | 'timeout' | 'cancelled' | 'not_found' | 'invalid_input' | 'version_conflict' | 'asset_unreadable' | 'provider_failed';
    message: string;
    retryable: boolean;
  };
};

export class HttpCoreDiaryRepository implements CoreDiaryRepository {
  constructor(private readonly client: ApiClient) {}

  async getIdentity(): Promise<IdentityContract> {
    return this.client.get<IdentityContract>('/identity/me');
  }

  async createDraft(input: DraftContract): Promise<RemoteResult<DraftContract>> {
    return this.requestDraftResult('/drafts', {
      method: 'POST',
      body: JSON.stringify(input),
    });
  }

  async createGenerationJob(input: {
    draftId: string;
    draftVersion: number;
    idempotencyKey: string;
  }): Promise<RemoteResult<GenerationJobContract>> {
    return this.requestGenerationJobResult('/generation/jobs', {
      method: 'POST',
      body: JSON.stringify(input),
    });
  }

  async rewriteBlock(input: RewriteBlockRequestContract): Promise<RemoteResult<RewriteBlockResultContract>> {
    return this.requestRewriteResult('/generation/rewrite', {
      method: 'POST',
      body: JSON.stringify(input),
    });
  }

  async getGenerationJob(jobId: string): Promise<RemoteResult<GenerationJobContract>> {
    return this.requestGenerationJobResult(`/generation/jobs/${jobId}`, {
      method: 'GET',
    });
  }

  async cancelGenerationJob(jobId: string): Promise<RemoteResult<GenerationJobContract>> {
    return this.requestGenerationJobResult(`/generation/jobs/${jobId}/cancel`, {
      method: 'POST',
      body: JSON.stringify({}),
    });
  }

  async saveDiary(input: {
    id?: string;
    draftId: string;
    sourceDiaryId?: string;
    sourceDiaryVersion?: number;
    idempotencyKey: string;
    title: string;
    summary: string;
    location: string;
    date: string;
    privacy: string;
    photoIds: string[];
    publicBlockIds?: string[];
    version: number;
  }): Promise<RemoteResult<SaveDraftResult & { id?: string }>> {
    return this.requestSaveResult('/diaries/save', {
      method: 'POST',
      body: JSON.stringify(input),
    });
  }

  async updateDiaryVisibility(input: {
    diaryId: string;
    privacy: string;
    publicBlockIds?: string[];
  }): Promise<RemoteResult<{
    diaryId: string;
    privacy: string;
    publicBlockIds?: string[];
  }>> {
    const response = await fetch(this.client.buildUrl('/sharing/project'), {
      headers: await this.client.getHeaders({
        'Content-Type': 'application/json',
      }),
      method: 'POST',
      body: JSON.stringify(input),
    });
    const json = await response.json() as OkEnvelope<{
      diaryId: string;
      privacy: string;
      publicBlockIds?: string[];
    }> | ErrorEnvelope;
    if (!response.ok || !json.ok) {
      const error = 'error' in json ? json.error : {
        code: 'provider_failed' as const,
        message: `HTTP ${response.status}`,
        retryable: false,
      };
      return {
        ok: false,
        version: CORE_DIARY_CONTRACT_VERSION,
        error,
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

  async getSaveResult(idempotencyKey: string): Promise<RemoteResult<SaveDraftResult & { id?: string }>> {
    return this.requestSaveResult(`/diaries/save-results/${encodeURIComponent(idempotencyKey)}`, {
      method: 'GET',
    });
  }

  async getDiary(diaryId: string): Promise<RemoteResult<DiaryItem>> {
    const response = await fetch(this.client.buildUrl(`/diaries/${encodeURIComponent(diaryId)}`), {
      headers: await this.client.getHeaders(),
      method: 'GET',
    });
    const json = await response.json() as OkEnvelope<DiaryItem> | ErrorEnvelope;
    if (!response.ok || !json.ok) {
      const error = 'error' in json ? json.error : {
        code: 'provider_failed' as const,
        message: `HTTP ${response.status}`,
        retryable: false,
      };
      return {
        ok: false,
        version: CORE_DIARY_CONTRACT_VERSION,
        error,
      };
    }
    return {
      ok: true,
      version: CORE_DIARY_CONTRACT_VERSION,
      data: json.data,
    };
  }

  async listMemories(query: MemoriesQuery): Promise<RemoteResult<MemoriesQueryResult>> {
    const search = new URLSearchParams();
    if (query.month) search.set('month', query.month);
    if (query.day) search.set('day', query.day);
    if (query.keyword) search.set('keyword', query.keyword);
    search.set('page', String(query.page));
    search.set('pageSize', String(query.pageSize));
    const response = await this.client.get<OkEnvelope<MemoriesQueryResult>>(`/memories?${search.toString()}`);
    return { ok: true, version: CORE_DIARY_CONTRACT_VERSION, data: response.data };
  }

  private async requestSaveResult(
    path: string,
    init: RequestInit,
  ): Promise<RemoteResult<SaveDraftResult & { id?: string }>> {
    const response = await fetch(this.client.buildUrl(path), {
      headers: await this.client.getHeaders({
        'Content-Type': 'application/json',
      }),
      ...init,
    });
    const json = await response.json() as OkEnvelope<{ id?: string; diaryId: string; draftId: string; savedVersion: number }> | ErrorEnvelope;
    if (!response.ok || !json.ok) {
      const error = 'error' in json ? json.error : {
        code: 'provider_failed' as const,
        message: `HTTP ${response.status}`,
        retryable: false,
      };
      return {
        ok: false,
        version: CORE_DIARY_CONTRACT_VERSION,
        error,
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
  ): Promise<RemoteResult<DraftContract>> {
    const response = await fetch(this.client.buildUrl(path), {
      headers: await this.client.getHeaders({
        'Content-Type': 'application/json',
      }),
      ...init,
    });
    const json = await response.json() as OkEnvelope<DraftContract> | ErrorEnvelope;
    if (!response.ok || !json.ok) {
      const error = 'error' in json ? json.error : {
        code: 'provider_failed' as const,
        message: `HTTP ${response.status}`,
        retryable: false,
      };
      return {
        ok: false,
        version: CORE_DIARY_CONTRACT_VERSION,
        error,
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
  ): Promise<RemoteResult<GenerationJobContract>> {
    const response = await fetch(this.client.buildUrl(path), {
      headers: await this.client.getHeaders({
        'Content-Type': 'application/json',
      }),
      ...init,
    });
    const json = await response.json() as OkEnvelope<GenerationJobContract> | ErrorEnvelope;
    if (!response.ok || !json.ok) {
      const error = 'error' in json ? json.error : {
        code: 'provider_failed' as const,
        message: `HTTP ${response.status}`,
        retryable: false,
      };
      return {
        ok: false,
        version: CORE_DIARY_CONTRACT_VERSION,
        error,
      };
    }
    return this.parseGenerationJobResult(json.data);
  }

  private async requestRewriteResult(
    path: string,
    init: RequestInit,
  ): Promise<RemoteResult<RewriteBlockResultContract>> {
    const response = await fetch(this.client.buildUrl(path), {
      headers: await this.client.getHeaders({
        'Content-Type': 'application/json',
      }),
      ...init,
    });
    const json = await response.json() as OkEnvelope<RewriteBlockResultContract> | ErrorEnvelope;
    if (!response.ok || !json.ok) {
      const error = 'error' in json ? json.error : {
        code: 'provider_failed' as const,
        message: `HTTP ${response.status}`,
        retryable: false,
      };
      return {
        ok: false,
        version: CORE_DIARY_CONTRACT_VERSION,
        error,
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
