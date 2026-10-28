import {
  GROWTH_INSIGHT_CONTRACT_VERSION,
  isGrowthInsightState,
  type GrowthInsightState,
} from '../contracts/growth-insight-contract';
import { ApiClient, ApiRequestError, type ApiRequestOptions, type ApiResponse } from '../services/api-client';
import {
  GrowthInsightRepositoryError,
  type GrowthInsightRepository,
} from './growth-insight-repository';

type OkEnvelope = { ok: true; version: string; data: unknown };
type ErrorEnvelope = {
  ok: false;
  error: { code: string; message: string; retryable: boolean };
};

const ERROR_CODES = new Set([
  'device_identity_required',
  'permission_denied',
  'not_found',
  'not_unlocked',
  'no_sources',
  'source_changed',
  'invalid_input',
  'timeout',
  'cancelled',
  'provider_failed',
]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isOkEnvelope(value: unknown): value is OkEnvelope {
  return isRecord(value)
    && value.ok === true
    && value.version === GROWTH_INSIGHT_CONTRACT_VERSION
    && 'data' in value;
}

function isErrorEnvelope(value: unknown): value is ErrorEnvelope {
  return isRecord(value)
    && value.ok === false
    && isRecord(value.error)
    && typeof value.error.code === 'string'
    && ERROR_CODES.has(value.error.code)
    && typeof value.error.message === 'string'
    && typeof value.error.retryable === 'boolean';
}

function asRepositoryError(error: unknown) {
  if (error instanceof GrowthInsightRepositoryError) return error;
  if (error instanceof ApiRequestError) {
    return new GrowthInsightRepositoryError(
      ERROR_CODES.has(error.code) ? error.code as GrowthInsightRepositoryError['code'] : 'provider_failed',
      error.message,
      error.retryable,
    );
  }
  return new GrowthInsightRepositoryError('provider_failed', '成长服务暂时不可用，请稍后重试。', true);
}

export class HttpGrowthInsightRepository implements GrowthInsightRepository {
  constructor(private readonly client: ApiClient) {}

  getState(options?: ApiRequestOptions) {
    return this.requestState('/growth/state', { method: 'GET' }, options);
  }

  initializeFlowers(options?: ApiRequestOptions) {
    return this.requestState('/growth/flowers/initialize', { method: 'POST' }, options);
  }

  retryFlowers(options?: ApiRequestOptions) {
    return this.requestState('/growth/flowers/retry', { method: 'POST' }, options);
  }

  ensureCurrentReport(options?: ApiRequestOptions) {
    return this.requestState('/growth/reports/ensure-current', { method: 'POST' }, options);
  }

  getCurrentReport(options?: ApiRequestOptions) {
    return this.requestState('/growth/reports/current', { method: 'GET' }, options);
  }

  retryCurrentReport(options?: ApiRequestOptions) {
    return this.requestState('/growth/reports/retry', { method: 'POST' }, options);
  }

  private async requestState(
    path: string,
    init: RequestInit,
    options?: ApiRequestOptions,
  ): Promise<GrowthInsightState> {
    let response: ApiResponse<unknown>;
    try {
      response = await this.client.request<unknown>(path, init, options);
    } catch (error) {
      throw asRepositoryError(error);
    }
    if (!response.ok || !isOkEnvelope(response.data)) {
      if (isErrorEnvelope(response.data)) {
        throw new GrowthInsightRepositoryError(
          response.data.error.code as GrowthInsightRepositoryError['code'],
          response.data.error.message,
          response.data.error.retryable,
        );
      }
      throw new GrowthInsightRepositoryError(
        'provider_failed',
        response.ok ? '成长服务返回的数据格式异常。' : `成长服务请求失败（HTTP ${response.status}）。`,
        response.status >= 500,
      );
    }
    if (!isGrowthInsightState(response.data.data)) {
      throw new GrowthInsightRepositoryError('provider_failed', '成长服务返回的数据格式异常。', false);
    }
    return response.data.data;
  }
}
