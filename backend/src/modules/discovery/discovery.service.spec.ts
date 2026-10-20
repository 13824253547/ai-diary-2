import { DiscoveryService, DiscoveryStoryError } from './discovery.service';
import { PrismaService } from '../../common/prisma.service';

const publishedStory = {
  id: 'story-1',
  title: '旧城散步',
  authorDisplayName: '旅行者',
  coverUri: 'https://assets.example/story-1.png',
  date: new Date('2026-09-12T00:00:00.000Z'),
  location: '台南',
  body: '沿着旧街慢慢走。',
  likesEnabled: true,
  publicationStatus: 'published',
  publishedAt: new Date('2026-09-13T00:00:00.000Z'),
  withdrawnAt: null,
  _count: { likes: 3 },
  likes: [{ ownerDeviceId: 'device-1' }],
};

function createService() {
  const transaction = {
    $queryRaw: jest.fn().mockResolvedValue([{ id: 'story-1', likesEnabled: true }]),
    discoveryStory: {
      findFirst: jest.fn(),
    },
    discoveryLike: {
      upsert: jest.fn(),
      deleteMany: jest.fn(),
      count: jest.fn(),
      findUnique: jest.fn(),
    },
  };
  const prisma = {
    discoveryStory: {
      findMany: jest.fn().mockResolvedValue([publishedStory]),
      findFirst: jest.fn().mockResolvedValue(null),
      count: jest.fn().mockResolvedValue(1),
    },
    $transaction: jest.fn(async input => (
      typeof input === 'function'
        ? input(transaction)
        : Promise.all(input)
    )),
  } as unknown as PrismaService;
  return {
    service: new DiscoveryService(prisma),
    prisma,
    transaction,
  };
}

describe('DiscoveryService', () => {
  test('lists only explicitly published snapshots with stable latest ordering and owner like state', async () => {
    const { service, prisma } = createService();

    const result = await service.listStories({
      keyword: '旧城',
      page: 2,
      pageSize: 10,
      category: 'latest',
    }, 'device-1');

    expect(result).toMatchObject({
      items: [{
        id: 'story-1',
        title: '旧城散步',
        author: '旅行者',
        body: '沿着旧街慢慢走。',
        likeCount: 3,
        liked: true,
      }],
      page: 2,
      pageSize: 10,
      total: 1,
    });
    expect(prisma.discoveryStory.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: {
        publicationStatus: 'published',
        publishedAt: { not: null },
        withdrawnAt: null,
        OR: [
          { title: { contains: '旧城' } },
          { location: { contains: '旧城' } },
          { authorDisplayName: { contains: '旧城' } },
        ],
      },
      orderBy: [{ date: 'desc' }, { id: 'desc' }],
      skip: 10,
      take: 10,
    }));
  });

  test('rejects unresolved categories and invalid page sizes', async () => {
    const { service, prisma } = createService();

    await expect(service.listStories({
      page: 1,
      pageSize: 20,
      category: 'recommended' as 'latest',
    }, 'device-1')).rejects.toMatchObject({ code: 'invalid_input' });
    await expect(service.listStories({
      page: Number.MAX_SAFE_INTEGER,
      pageSize: 100,
      category: 'latest',
    }, 'device-1')).rejects.toMatchObject({ code: 'invalid_input' });
    await expect(service.listStories({
      page: 1,
      pageSize: 15,
      category: 'latest',
    }, 'device-1')).rejects.toMatchObject({ code: 'invalid_input' });
    await expect(service.listStories({
      page: 1,
      pageSize: 20,
      category: undefined as unknown as 'latest',
    }, 'device-1')).rejects.toMatchObject({ code: 'invalid_input' });
    expect(prisma.discoveryStory.findMany).not.toHaveBeenCalled();
  });

  test('rejects malformed query objects and non-string keywords before querying', async () => {
    const { service, prisma } = createService();

    await expect(service.listStories(null as never, 'device-1'))
      .rejects.toMatchObject({ code: 'invalid_input' });
    await expect(service.listStories({
      page: 1,
      pageSize: 20,
      category: 'latest',
      keyword: ['first', 'second'] as never,
    }, 'device-1')).rejects.toMatchObject({ code: 'invalid_input' });

    expect(prisma.discoveryStory.findMany).not.toHaveBeenCalled();
    expect(prisma.discoveryStory.count).not.toHaveBeenCalled();
  });

  test('returns not found for unpublished, withdrawn, or missing stories', async () => {
    const { service, prisma } = createService();
    jest.mocked(prisma.discoveryStory.findMany).mockResolvedValue([]);
    jest.mocked(prisma.discoveryStory.count).mockResolvedValue(0);

    const list = await service.listStories({ page: 1, pageSize: 20, category: 'latest' }, 'device-1');
    expect(list.items).toEqual([]);
    await expect(service.getStory('story-private', 'device-1'))
      .rejects.toBeInstanceOf(DiscoveryStoryError);
    expect(prisma.discoveryStory.findFirst).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        id: 'story-private',
        publicationStatus: 'published',
        publishedAt: { not: null },
        withdrawnAt: null,
      }),
    }));
  });

  test.each([null, '', '   '])('rejects malformed story IDs before querying (%j)', async storyId => {
    const { service, prisma } = createService();

    await expect(service.getStory(storyId, 'device-1'))
      .rejects.toMatchObject({ code: 'invalid_input' });
    expect(prisma.discoveryStory.findFirst).not.toHaveBeenCalled();
  });

  test('uses a device-scoped unique relation for idempotent target-state likes', async () => {
    const { service, transaction } = createService();
    transaction.discoveryStory.findFirst.mockResolvedValue(publishedStory);
    transaction.discoveryLike.count.mockResolvedValue(4);
    transaction.discoveryLike.findUnique.mockResolvedValue({ storyId: 'story-1' });

    const result = await service.setLike('story-1', 'device-1', true);

    expect(transaction.$queryRaw).toHaveBeenCalledTimes(1);
    expect(transaction.$queryRaw.mock.invocationCallOrder[0])
      .toBeLessThan(transaction.discoveryLike.upsert.mock.invocationCallOrder[0]);
    expect(transaction.discoveryLike.upsert).toHaveBeenCalledWith({
      where: { storyId_ownerDeviceId: { storyId: 'story-1', ownerDeviceId: 'device-1' } },
      create: { storyId: 'story-1', ownerDeviceId: 'device-1' },
      update: {},
    });
    expect(result).toEqual({ storyId: 'story-1', liked: true, likeCount: 4 });
  });

  test.each([
    [null, 'device-1', true],
    ['story-1', '', true],
    ['story-1', 'device-1', 'true'],
  ])('rejects malformed like input before starting a transaction (%j)', async (storyId, ownerDeviceId, liked) => {
    const { service, prisma } = createService();

    await expect(service.setLike(storyId, ownerDeviceId, liked))
      .rejects.toMatchObject({ code: 'invalid_input' });
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  test('does not write a like for an unpublished or like-disabled story', async () => {
    const { service, transaction } = createService();
    transaction.$queryRaw.mockResolvedValue([{ id: 'story-1', likesEnabled: false }]);

    await expect(service.setLike('story-1', 'device-1', true))
      .rejects.toMatchObject({ code: 'interaction_not_available' });
    expect(transaction.discoveryLike.upsert).not.toHaveBeenCalled();
    expect(transaction.discoveryLike.deleteMany).not.toHaveBeenCalled();
  });

  test('returns not found when the story is no longer published before acquiring the write lock', async () => {
    const { service, transaction } = createService();
    transaction.$queryRaw.mockResolvedValue([]);

    await expect(service.setLike('story-1', 'device-1', true))
      .rejects.toMatchObject({ code: 'not_found' });
    expect(transaction.discoveryLike.upsert).not.toHaveBeenCalled();
    expect(transaction.discoveryLike.deleteMany).not.toHaveBeenCalled();
  });
});
