export const DISCOVERY_CONTRACT_VERSION = 'discovery-read-v1';
export const DISCOVERY_PAGE_SIZES = [10, 20, 50, 100] as const;

export type DiscoveryStoriesQuery = {
  category: 'latest';
  keyword?: string;
  page: number;
  pageSize: typeof DISCOVERY_PAGE_SIZES[number];
};

export type DiscoveryStoryContract = {
  id: string;
  title: string;
  author: string;
  coverUri: string;
  date: string;
  location: string;
  body: string;
  likesEnabled: boolean;
  likeCount: number;
  liked: boolean;
};

export type DiscoveryStoriesPage = {
  items: DiscoveryStoryContract[];
  page: number;
  pageSize: typeof DISCOVERY_PAGE_SIZES[number];
  total: number;
};

export type DiscoveryLikeState = {
  storyId: string;
  liked: boolean;
  likeCount: number;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

export function isDiscoveryStoryContract(value: unknown): value is DiscoveryStoryContract {
  return isRecord(value)
    && isNonEmptyString(value.id)
    && typeof value.title === 'string'
    && typeof value.author === 'string'
    && isNonEmptyString(value.coverUri)
    && typeof value.date === 'string'
    && Number.isFinite(Date.parse(value.date))
    && typeof value.location === 'string'
    && typeof value.body === 'string'
    && typeof value.likesEnabled === 'boolean'
    && Number.isSafeInteger(value.likeCount)
    && (value.likeCount as number) >= 0
    && typeof value.liked === 'boolean';
}

export function isDiscoveryStoriesPage(value: unknown): value is DiscoveryStoriesPage {
  return isRecord(value)
    && Array.isArray(value.items)
    && value.items.every(isDiscoveryStoryContract)
    && Number.isSafeInteger(value.page)
    && (value.page as number) > 0
    && DISCOVERY_PAGE_SIZES.includes(value.pageSize as typeof DISCOVERY_PAGE_SIZES[number])
    && Number.isSafeInteger(value.total)
    && (value.total as number) >= 0
    && value.items.length <= (value.pageSize as number);
}

export function isDiscoveryLikeState(value: unknown): value is DiscoveryLikeState {
  return isRecord(value)
    && isNonEmptyString(value.storyId)
    && typeof value.liked === 'boolean'
    && Number.isSafeInteger(value.likeCount)
    && (value.likeCount as number) >= 0;
}
