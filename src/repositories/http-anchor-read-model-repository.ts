import {
  ANCHOR_READ_MODEL_CONTRACT_VERSION,
  ANCHOR_READ_PAGE_SIZES,
  isAnchorExtractionRunRecord,
  isAnchorsByTagPage,
  type AnchorExtractionRunRecord,
  type AnchorsByTagPage,
  type ProviderAnchorResult,
} from '../contracts/anchor-read-model-contract';
import { ApiClient, ApiRequestError, type ApiRequestOptions, type ApiResponse } from '../services/api-client';
import {
  AnchorReadRepositoryError,
  type AnchorReadRepository,
} from './anchor-read-model-repository';

type OkEnvelope<T> = { ok: true; version: string; data: T };
type ErrorEnvelope = {
  ok: false;
  error: { code: string; message: string; retryable: boolean };
};

const ERROR_CODES = new Set([
  'permission_denied',
  'device_identity_required',
  'timeout',
  'cancelled',
  'not_found',
  'invalid_input',
  'version_conflict',
  'provider_failed',
]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isOkEnvelope(value: unknown): value is OkEnvelope<unknown> {
  return isRecord(value)
    && value.ok === true
    && value.version === ANCHOR_READ_MODEL_CONTRACT_VERSION
    && 'data' in value;
}

function isErrorEnvelope(value: unknown): value is ErrorEnvelope {
  if (!isRecord(value) || value.ok !== false || !isRecord(value.error)) return false;
  return typeof value.error.code === 'string'
    && ERROR_CODES.has(value.error.code)
    && typeof value.error.message === 'string'
    && typeof value.error.retryable === 'boolean';
}

function requestError(error: unknown) {
  if (error instanceof AnchorReadRepositoryError) return error;
  if (error instanceof ApiRequestError) {
    return new AnchorReadRepositoryError(error.code, error.message, error.retryable);
  }
  return new AnchorReadRepositoryError('provider_failed', '锚点服务暂时不可用，请稍后重试。', true);
}

export class HttpAnchorReadModelRepository implements AnchorReadRepository {
  constructor(private readonly client: ApiClient) {}

  async beginExtraction(input: {
    diaryId: string;
    diaryVersion: number;
    requestId: string;
    attempt: number;
  }, options?: ApiRequestOptions): Promise<AnchorExtractionRunRecord> {
    if (!input.diaryId.trim()
      || !input.requestId.trim()
      || !Number.isSafeInteger(input.diaryVersion)
      || input.diaryVersion < 1
      || !Number.isSafeInteger(input.attempt)
      || input.attempt < 1) {
      throw new AnchorReadRepositoryError('invalid_input', '锚点来源或提取轮次无效。', false);
    }
    return this.requestData(
      '/anchors/extractions/begin',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(input),
      },
      isAnchorExtractionRunRecord,
      options,
    );
  }

  async completeExtraction(input: {
    attempt: number;
    result: ProviderAnchorResult;
  }, options?: ApiRequestOptions): Promise<AnchorExtractionRunRecord> {
    if (!Number.isSafeInteger(input.attempt) || input.attempt < 1
      || input.result.source !== 'provider') {
      throw new AnchorReadRepositoryError('invalid_input', '只允许提交有效的服务端 provider 提取结果。', false);
    }
    return this.requestData(
      '/anchors/extractions/complete',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(input),
      },
      isAnchorExtractionRunRecord,
      options,
    );
  }

  async failExtraction(input: {
    diaryId: string;
    diaryVersion: number;
    requestId: string;
    attempt: number;
    failureCode: 'timeout' | 'cancelled' | 'provider_failed';
  }, options?: ApiRequestOptions): Promise<AnchorExtractionRunRecord> {
    if (!input.diaryId.trim()
      || !input.requestId.trim()
      || !Number.isSafeInteger(input.diaryVersion)
      || input.diaryVersion < 1
      || !Number.isSafeInteger(input.attempt)
      || input.attempt < 1) {
      throw new AnchorReadRepositoryError('invalid_input', '锚点失败状态信息无效。', false);
    }
    return this.requestData(
      '/anchors/extractions/failure',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(input),
      },
      isAnchorExtractionRunRecord,
      options,
    );
  }

  async listByTag(input: unknown, options?: ApiRequestOptions): Promise<AnchorsByTagPage> {
    if (typeof input !== 'object' || input === null || Array.isArray(input)) {
      throw new AnchorReadRepositoryError('invalid_input', '锚点查询条件无效。', false);
    }
    const query = input as { tagId?: unknown; page?: unknown; pageSize?: unknown };
    const tagId = query.tagId;
    const page = query.page === undefined ? 1 : query.page;
    const pageSize = query.pageSize === undefined ? 20 : query.pageSize;
    if (typeof tagId !== 'string'
      || !tagId.trim()
      || typeof page !== 'number'
      || !Number.isSafeInteger(page)
      || page < 1
      || typeof pageSize !== 'number'
      || !ANCHOR_READ_PAGE_SIZES.includes(pageSize as typeof ANCHOR_READ_PAGE_SIZES[number])) {
      throw new AnchorReadRepositoryError('invalid_input', '锚点查询必须指定有效标签和分页条件。', false);
    }
    const params = new URLSearchParams({
      tagId,
      page: String(page),
      pageSize: String(pageSize),
    });
    return this.requestData(
      `/anchors?${params.toString()}`,
      { method: 'GET' },
      (value): value is AnchorsByTagPage =>
        isAnchorsByTagPage(value)
        && value.tagId === tagId
        && value.page === page
        && value.pageSize === pageSize,
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
        throw new AnchorReadRepositoryError(
          envelope.error.code as AnchorReadRepositoryError['code'],
          envelope.error.message,
          envelope.error.retryable,
        );
      }
      throw new AnchorReadRepositoryError(
        'provider_failed',
        response.ok ? '锚点服务返回的数据格式异常。' : `请求失败（HTTP ${response.status}）。`,
        response.status >= 500,
      );
    }
    if (!isData(envelope.data)) {
      throw new AnchorReadRepositoryError('provider_failed', '锚点服务返回的数据格式异常。', false);
    }
    return envelope.data;
  }
}

export { ANCHOR_READ_MODEL_CONTRACT_VERSION };
