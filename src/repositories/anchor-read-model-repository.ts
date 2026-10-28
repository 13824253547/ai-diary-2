import type { ApiRequestOptions } from '../services/api-client';
import type {
  AnchorExtractionRunRecord,
  AnchorsByTagPage,
  MemoryAnchorFeedPage,
  MemoryAnchorSummary,
  ProviderAnchorResult,
} from '../contracts/anchor-read-model-contract';

export type AnchorReadRepositoryErrorCode =
  | 'permission_denied'
  | 'device_identity_required'
  | 'timeout'
  | 'cancelled'
  | 'not_found'
  | 'invalid_input'
  | 'version_conflict'
  | 'provider_failed';

export class AnchorReadRepositoryError extends Error {
  constructor(
    readonly code: AnchorReadRepositoryErrorCode,
    message: string,
    readonly retryable: boolean,
  ) {
    super(message);
    this.name = 'AnchorReadRepositoryError';
  }
}

export interface AnchorReadRepository {
  beginExtraction(input: {
    diaryId: string;
    diaryVersion: number;
    requestId: string;
    attempt: number;
  }, options?: ApiRequestOptions): Promise<AnchorExtractionRunRecord>;
  completeExtraction(input: {
    attempt: number;
    result: ProviderAnchorResult;
  }, options?: ApiRequestOptions): Promise<AnchorExtractionRunRecord>;
  failExtraction(input: {
    diaryId: string;
    diaryVersion: number;
    requestId: string;
    attempt: number;
    failureCode: 'timeout' | 'cancelled' | 'provider_failed';
  }, options?: ApiRequestOptions): Promise<AnchorExtractionRunRecord>;
  listByTag(input: {
    tagId: string;
    page?: number;
    pageSize?: 10 | 20 | 50 | 100;
  }, options?: ApiRequestOptions): Promise<AnchorsByTagPage>;
  listFeed(input?: {
    tagId?: string;
    page?: number;
    pageSize?: 10 | 20 | 50 | 100;
  }, options?: ApiRequestOptions): Promise<MemoryAnchorFeedPage>;
  getSummary(options?: ApiRequestOptions): Promise<MemoryAnchorSummary>;
}
