import { MemoryStoreService } from './memory-store.service';
import type { DiaryGenerationService } from './diary-generation.service';
import type { PrismaService } from './prisma.service';
import type { TemporaryGenerationPhotoStore } from './temporary-generation-photo-store';

describe('MemoryStoreService diary publication date', () => {
  afterEach(() => {
    jest.useRealTimers();
  });

  test('maps and sorts memories by the saved diary creation date', async () => {
    const createdAt = new Date('2026-04-25T15:30:00.000Z');
    const prisma = {
      diary: {
        findMany: jest.fn().mockResolvedValue([{
          id: 'diary-1',
          draftId: 'draft-1',
          title: '旅行日记',
          summary: '旅途片段。',
          location: '未知地点',
          date: new Date('2026-01-13T00:00:00.000Z'),
          createdAt,
          privacy: 'private',
          photoIds: ['photo-1'],
          publicBlockIds: null,
          contentSnapshot: null,
          version: 1,
        }]),
      },
    } as unknown as PrismaService;
    const store = new MemoryStoreService(
      prisma,
      {} as DiaryGenerationService,
      {} as TemporaryGenerationPhotoStore,
    );

    const diaries = await store.listDiaries('device-1');

    expect(prisma.diary.findMany).toHaveBeenCalledWith({
      where: { ownerDeviceId: 'device-1' },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    });
    expect(diaries[0].date).toBe('2026.04.25');
  });

  test('stores the first publication date instead of the submitted photo date', async () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-04-25T15:30:00.000Z'));
    const transaction = {
      diary: {
        create: jest.fn(async ({ data }: { data: { id?: string; date: Date; version: number } }) => ({
          id: data.id ?? 'diary-1',
          createdAt: data.date,
          version: data.version,
        })),
      },
      saveCommand: { create: jest.fn().mockResolvedValue(undefined) },
    };
    const prisma = {
      saveCommand: { findUnique: jest.fn().mockResolvedValue(null) },
      diary: { findUnique: jest.fn().mockResolvedValue(null) },
      $transaction: jest.fn(async (operation: (tx: typeof transaction) => Promise<unknown>) => operation(transaction)),
    } as unknown as PrismaService;
    const store = new MemoryStoreService(
      prisma,
      {} as DiaryGenerationService,
      {} as TemporaryGenerationPhotoStore,
    );

    const result = await store.saveDiaryWithCommand({
      draftId: 'draft-1',
      idempotencyKey: 'draft-1-save-1',
      title: '旅行日记',
      summary: '旅途片段。',
      location: '未知地点',
      date: '2026.01.13',
      privacy: 'private',
      photoIds: ['photo-1', 'photo-2', 'photo-3'],
      version: 1,
      contentSnapshot: {
        type: 'travel',
        subtitle: '',
        helperMessage: '',
        characterId: 'character-blue',
        companionName: '自己',
        coverPhotoId: 'photo-1',
        blocks: [{
          id: 'block-1',
          type: 'text',
          content: '一段旅途记忆。',
          photoIds: ['photo-1'],
        }],
      },
    }, 'device-1');

    expect(transaction.diary.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ date: new Date('2026-04-25T15:30:00.000Z') }),
    }));
    expect(result.date).toBe('2026.04.25');
  });

  test('preserves the first publication date when an existing diary is edited', async () => {
    const createdAt = new Date('2026-04-25T15:30:00.000Z');
    const sourceDiary = {
      id: 'diary-1',
      ownerDeviceId: 'device-1',
      version: 3,
      createdAt,
    };
    const transaction = {
      diary: {
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
        findUniqueOrThrow: jest.fn().mockResolvedValue({
          id: 'diary-1',
          createdAt,
          version: 4,
        }),
      },
      saveCommand: { create: jest.fn().mockResolvedValue(undefined) },
    };
    const prisma = {
      saveCommand: { findUnique: jest.fn().mockResolvedValue(null) },
      diary: { findUnique: jest.fn().mockResolvedValue(sourceDiary) },
      $transaction: jest.fn(async (operation: (tx: typeof transaction) => Promise<unknown>) => operation(transaction)),
    } as unknown as PrismaService;
    const store = new MemoryStoreService(
      prisma,
      {} as DiaryGenerationService,
      {} as TemporaryGenerationPhotoStore,
    );

    const result = await store.saveDiaryWithCommand({
      id: 'diary-1',
      draftId: 'draft-1',
      sourceDiaryId: 'diary-1',
      sourceDiaryVersion: 3,
      idempotencyKey: 'draft-1-save-4',
      title: '更新后的旅行日记',
      summary: '旅途片段。',
      location: '未知地点',
      date: '2026.01.13',
      privacy: 'private',
      photoIds: ['photo-1', 'photo-2', 'photo-3'],
      version: 4,
      contentSnapshot: {
        type: 'travel',
        subtitle: '',
        helperMessage: '',
        characterId: 'character-blue',
        companionName: '自己',
        coverPhotoId: 'photo-1',
        blocks: [{
          id: 'block-1',
          type: 'text',
          content: '更新后的正文。',
          photoIds: ['photo-1'],
        }],
      },
    }, 'device-1');

    expect(transaction.diary.updateMany).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ date: createdAt }),
    }));
    expect(result.date).toBe('2026.04.25');
  });
});
