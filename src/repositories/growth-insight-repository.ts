import type { ApiRequestOptions } from '../services/api-client';
import type { GrowthInsightState } from '../contracts/growth-insight-contract';

export type GrowthInsightRepositoryErrorCode =
  | 'device_identity_required'
  | 'permission_denied'
  | 'not_found'
  | 'not_unlocked'
  | 'no_sources'
  | 'source_changed'
  | 'invalid_input'
  | 'timeout'
  | 'cancelled'
  | 'provider_failed';

export class GrowthInsightRepositoryError extends Error {
  constructor(
    readonly code: GrowthInsightRepositoryErrorCode,
    message: string,
    readonly retryable: boolean,
  ) {
    super(message);
    this.name = 'GrowthInsightRepositoryError';
  }
}

export interface GrowthInsightRepository {
  getState(options?: ApiRequestOptions): Promise<GrowthInsightState>;
  initializeFlowers(options?: ApiRequestOptions): Promise<GrowthInsightState>;
  retryFlowers(options?: ApiRequestOptions): Promise<GrowthInsightState>;
  ensureCurrentReport(options?: ApiRequestOptions): Promise<GrowthInsightState>;
  getCurrentReport(options?: ApiRequestOptions): Promise<GrowthInsightState>;
  retryCurrentReport(options?: ApiRequestOptions): Promise<GrowthInsightState>;
}
