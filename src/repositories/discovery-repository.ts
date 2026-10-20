import type { ApiRequestOptions } from '../services/api-client';
import type {
  DiscoveryLikeState,
  DiscoveryStoriesPage,
  DiscoveryStoriesQuery,
  DiscoveryStoryContract,
} from '../contracts/discovery-contract';

export type DiscoveryRepositoryErrorCode =
  | 'permission_denied'
  | 'device_identity_required'
  | 'timeout'
  | 'cancelled'
  | 'not_found'
  | 'invalid_input'
  | 'interaction_not_available'
  | 'provider_failed';

export class DiscoveryRepositoryError extends Error {
  constructor(
    readonly code: DiscoveryRepositoryErrorCode,
    message: string,
    readonly retryable: boolean,
  ) {
    super(message);
    this.name = 'DiscoveryRepositoryError';
  }
}

export interface DiscoveryRepository {
  listStories(query: DiscoveryStoriesQuery, options?: ApiRequestOptions): Promise<DiscoveryStoriesPage>;
  getStory(storyId: string, options?: ApiRequestOptions): Promise<DiscoveryStoryContract>;
  setLike(storyId: string, liked: boolean, options?: ApiRequestOptions): Promise<DiscoveryLikeState>;
}
