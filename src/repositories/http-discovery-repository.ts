import {
  DISCOVERY_CONTRACT_VERSION,
  DISCOVERY_PAGE_SIZES,
  isDiscoveryLikeState,
  isDiscoveryStoriesPage,
  isDiscoveryStoryContract,
  type DiscoveryLikeState,
  type DiscoveryStoriesPage,
  type DiscoveryStoriesQuery,
  type DiscoveryStoryContract,
} from '../contracts/discovery-contract';
import { ApiClient, ApiRequestError, type ApiRequestOptions, type ApiResponse } from '../services/api-client';
import { DiscoveryRepositoryError, type DiscoveryRepository } from './discovery-repository';

type OkEnvelope<T> = { ok: true; data: T };
type ErrorEnvelope = {
  ok: false;
  error: {
    code: string;
    message: string;
    retryable: boolean;
  };
};

const ERROR_CODES = new Set([
  'permission_denied',
  'device_identity_required',
  'timeout',
  'cancelled',
  'not_found',
  'invalid_input',
  'interaction_not_available',
  'provider_failed',
]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isOkEnvelope(value: unknown): value is OkEnvelope<unknown> {
  return isRecord(value) && value.ok === true && 'data' in value;
}

function isErrorEnvelope(value: unknown): value is ErrorEnvelope {
  if (!isRecord(value) || value.ok !== false || !isRecord(value.error)) return false;
  return typeof value.error.code === 'string'
    && ERROR_CODES.has(value.error.code)
    && typeof value.error.message === 'string'
    && typeof value.error.retryable === 'boolean';
}

function requestError(error: unknown) {
  if (error instanceof DiscoveryRepositoryError) return error;
  if (error instanceof ApiRequestError) {
    return new DiscoveryRepositoryError(error.code, error.message, error.retryable);
  }
  return new DiscoveryRepositoryError('provider_failed', '网络请求失败，请稍后重试。', true);
}

export class HttpDiscoveryRepository implements DiscoveryRepository {
  constructor(private readonly client: ApiClient) {}

  async listStories(query: DiscoveryStoriesQuery, options?: ApiRequestOptions): Promise<DiscoveryStoriesPage> {
    if ((query.category !== 'latest' && query.category !== 'same-city')
      || !Number.isSafeInteger(query.page)
      || query.page < 1
      || !DISCOVERY_PAGE_SIZES.includes(query.pageSize)
      || (query.keyword !== undefined && typeof query.keyword !== 'string')
      || (query.category === 'same-city'
        && (typeof query.city !== 'string' || !query.city.trim() || query.city.length > 191))) {
      throw new DiscoveryRepositoryError('invalid_input', '发现列表查询条件无效。', false);
    }
    const params = new URLSearchParams({
      category: query.category,
      page: String(query.page),
      pageSize: String(query.pageSize),
    });
    if (query.category === 'same-city') params.set('city', query.city!.trim());
    if (query.keyword !== undefined) params.set('keyword', query.keyword);
    return this.requestData(`/discovery/stories?${params.toString()}`, { method: 'GET' }, isDiscoveryStoriesPage, options);
  }

  async getStory(storyId: unknown, options?: ApiRequestOptions): Promise<DiscoveryStoryContract> {
    if (typeof storyId !== 'string' || !storyId.trim()) {
      throw new DiscoveryRepositoryError('invalid_input', '故事标识无效。', false);
    }
    return this.requestData(
      `/discovery/stories/${encodeURIComponent(storyId)}`,
      { method: 'GET' },
      (value): value is DiscoveryStoryContract =>
        isDiscoveryStoryContract(value) && value.id === storyId,
      options,
    );
  }

  async setLike(storyId: unknown, liked: unknown, options?: ApiRequestOptions): Promise<DiscoveryLikeState> {
    if (typeof storyId !== 'string' || !storyId.trim() || typeof liked !== 'boolean') {
      throw new DiscoveryRepositoryError('invalid_input', '点赞目标无效。', false);
    }
    return this.requestData(
      `/discovery/stories/${encodeURIComponent(storyId)}/like`,
      {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ liked }),
      },
      (value): value is DiscoveryLikeState =>
        isDiscoveryLikeState(value) && value.storyId === storyId,
      options,
    );
  }

  private async requestData<T>(
    path: string,
    init: RequestInit,
    isData: (value: unknown) => value is T,
    options?: ApiRequestOptions,
  ): Promise<T> {
    let response: ApiResponse<unknown>;
    try {
      response = await this.client.request<unknown>(path, init, options);
    } catch (error) {
      throw requestError(error);
    }

    const envelope = response.data;
    if (!response.ok || !isOkEnvelope(envelope)) {
      if (isErrorEnvelope(envelope)) {
        throw new DiscoveryRepositoryError(
          envelope.error.code as DiscoveryRepositoryError['code'],
          envelope.error.message,
          envelope.error.retryable,
        );
      }
      throw new DiscoveryRepositoryError(
        'provider_failed',
        response.ok ? '服务器返回的数据格式异常。' : `请求失败（HTTP ${response.status}）。`,
        response.status >= 500,
      );
    }
    if (!isData(envelope.data)) {
      throw new DiscoveryRepositoryError('provider_failed', '服务器返回的数据格式异常。', false);
    }
    return envelope.data;
  }
}

export { DISCOVERY_CONTRACT_VERSION };
