import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { normalizeDiscoveryCity } from '../../common/discovery-publication';
import { PrismaService } from '../../common/prisma.service';

export const DISCOVERY_PAGE_SIZES = [10, 20, 50, 100] as const;

export type DiscoveryListQuery = {
  keyword?: string;
  page: number;
  pageSize: number;
  category: 'latest' | 'same-city';
  city?: string;
};

export class DiscoveryStoryError extends Error {
  constructor(
    readonly code: 'not_found' | 'invalid_input' | 'interaction_not_available',
    message: string,
  ) {
    super(message);
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function toStoryResponse(
  story: {
    id: string;
    title: string;
    authorDisplayName: string;
    coverUri: string;
    coverPhotoId: string | null;
    sourceDiaryId: string | null;
    publicContent: Prisma.JsonValue | null;
    date: Date;
    location: string;
    body: string;
    likesEnabled: boolean;
    _count?: { likes: number };
    likes?: Array<{ ownerDeviceId: string }>;
  },
  ownerDeviceId: string,
) {
  const photoUri = (photoId: string) =>
    `/photos/discovery/${encodeURIComponent(story.id)}/photo-content?photoId=${encodeURIComponent(photoId)}`;
  const content = story.publicContent;
  const publishedBlocks = Array.isArray(content)
    ? content
    : isRecord(content) && Array.isArray(content.blocks) ? content.blocks : [];
  const characterId = isRecord(content) && typeof content.characterId === 'string'
    ? content.characterId
    : 'character-blue';
  const blocks = publishedBlocks.flatMap(block => {
    if (!isRecord(block)
      || typeof block.id !== 'string'
      || (block.type !== 'text' && block.type !== 'quote')
      || typeof block.content !== 'string') return [];
    const photos = Array.isArray(block.photos)
      ? block.photos.flatMap(photo =>
          isRecord(photo) && typeof photo.photoId === 'string' && typeof photo.caption === 'string'
            ? [{ photoId: photo.photoId, caption: photo.caption, uri: photoUri(photo.photoId) }]
            : [])
      : [];
    return [{
      id: block.id,
      type: block.type,
      ...(typeof block.title === 'string' ? { title: block.title } : {}),
      content: block.content,
      photos,
    }];
  });
  return {
    id: story.id,
    title: story.title,
    author: story.authorDisplayName,
    coverUri: story.sourceDiaryId && story.coverPhotoId
      ? photoUri(story.coverPhotoId)
      : story.coverUri,
    date: story.date.toISOString(),
    location: story.location,
    body: story.body,
    blocks,
    characterId,
    likesEnabled: story.likesEnabled,
    likeCount: story._count?.likes ?? 0,
    liked: story.likes?.some(like => like.ownerDeviceId === ownerDeviceId) ?? false,
  };
}

@Injectable()
export class DiscoveryService {
  constructor(private readonly prisma: PrismaService) {}

  async listStories(query: DiscoveryListQuery, ownerDeviceId: string) {
    if (!query || typeof query !== 'object' || Array.isArray(query)) {
      throw new DiscoveryStoryError('invalid_input', 'discovery query is invalid');
    }
    if (!Number.isSafeInteger(query.page) || query.page < 1) {
      throw new DiscoveryStoryError('invalid_input', 'page must be a positive integer');
    }
    if (!DISCOVERY_PAGE_SIZES.includes(query.pageSize as typeof DISCOVERY_PAGE_SIZES[number])) {
      throw new DiscoveryStoryError('invalid_input', 'unsupported discovery page size');
    }
    if (query.category !== 'latest' && query.category !== 'same-city') {
      throw new DiscoveryStoryError('invalid_input', 'discovery category is not available');
    }
    if (query.keyword !== undefined && typeof query.keyword !== 'string') {
      throw new DiscoveryStoryError('invalid_input', 'keyword must be a string');
    }
    const cityKey = query.category === 'same-city' ? normalizeDiscoveryCity(query.city) : '';
    if (query.category === 'same-city' && !cityKey) {
      throw new DiscoveryStoryError('invalid_input', 'a valid city is required for same-city stories');
    }

    const keyword = query.keyword?.trim();
    const where = {
      publicationStatus: 'published',
      publishedAt: { not: null },
      withdrawnAt: null,
      ...(query.category === 'same-city' ? { cityKey } : {}),
      ...(keyword
        ? {
            OR: [
              { title: { contains: keyword } },
              { location: { contains: keyword } },
              { authorDisplayName: { contains: keyword } },
            ],
          }
        : {}),
    };
    const skip = (query.page - 1) * query.pageSize;
    if (!Number.isSafeInteger(skip)) {
      throw new DiscoveryStoryError('invalid_input', 'discovery page is out of range');
    }
    const [stories, total] = await this.prisma.$transaction([
      this.prisma.discoveryStory.findMany({
        where,
        orderBy: [{ date: 'desc' }, { id: 'desc' }],
        skip,
        take: query.pageSize,
        include: {
          _count: { select: { likes: true } },
          likes: { where: { ownerDeviceId } },
        },
      }),
      this.prisma.discoveryStory.count({ where }),
    ]);

    return {
      items: stories.map(story => toStoryResponse(story, ownerDeviceId)),
      page: query.page,
      pageSize: query.pageSize,
      total,
    };
  }

  async getStory(storyId: unknown, ownerDeviceId: string) {
    if (typeof storyId !== 'string' || !storyId.trim()) {
      throw new DiscoveryStoryError('invalid_input', 'story ID is invalid');
    }
    const story = await this.prisma.discoveryStory.findFirst({
      where: {
        id: storyId,
        publicationStatus: 'published',
        publishedAt: { not: null },
        withdrawnAt: null,
      },
      include: {
        _count: { select: { likes: true } },
        likes: { where: { ownerDeviceId } },
      },
    });
    if (!story) throw new DiscoveryStoryError('not_found', 'discovery story not found');
    return toStoryResponse(story, ownerDeviceId);
  }

  async setLike(storyId: unknown, ownerDeviceId: unknown, liked: unknown) {
    if (typeof storyId !== 'string' || !storyId.trim()
      || typeof ownerDeviceId !== 'string' || !ownerDeviceId.trim()
      || typeof liked !== 'boolean') {
      throw new DiscoveryStoryError('invalid_input', 'like request is invalid');
    }
    return this.prisma.$transaction(async transaction => {
      const [story] = await transaction.$queryRaw<Array<{ id: string; likesEnabled: boolean }>>(Prisma.sql`
        SELECT \`id\`, \`likesEnabled\`
        FROM \`DiscoveryStory\`
        WHERE \`id\` = ${storyId}
          AND \`publicationStatus\` = 'published'
          AND \`publishedAt\` IS NOT NULL
          AND \`withdrawnAt\` IS NULL
        FOR UPDATE
      `);
      if (!story) throw new DiscoveryStoryError('not_found', 'discovery story not found');
      if (!story.likesEnabled) {
        throw new DiscoveryStoryError('interaction_not_available', 'likes are not enabled for this story');
      }

      if (liked) {
        await transaction.discoveryLike.upsert({
          where: { storyId_ownerDeviceId: { storyId, ownerDeviceId } },
          create: { storyId, ownerDeviceId },
          update: {},
        });
      } else {
        await transaction.discoveryLike.deleteMany({
          where: { storyId, ownerDeviceId },
        });
      }

      const [likeCount, relation] = await Promise.all([
        transaction.discoveryLike.count({ where: { storyId } }),
        transaction.discoveryLike.findUnique({
          where: { storyId_ownerDeviceId: { storyId, ownerDeviceId } },
          select: { storyId: true },
        }),
      ]);
      return {
        storyId,
        liked: relation !== null,
        likeCount,
      };
    });
  }
}
