import type { PrismaService } from './prisma.service';
import { DeleteDiaryError, MemoryStoreService } from './memory-store.service';

function createService(ownerRows: Array<{ id: string; version: number; draftId: string }>) {
  const transaction = {
    $queryRaw: jest.fn(async () => ownerRows),
    discoveryStory: {
      findMany: jest.fn(async () => [{ id: 'story-1' }]),
      deleteMany: jest.fn(async () => ({ count: 1 })),
    },
    discoveryLike: { deleteMany: jest.fn(async () => ({ count: 2 })) },
    draft: {
      findMany: jest.fn(async () => [{ id: 'draft-1' }]),
      deleteMany: jest.fn(async () => ({ count: 1 })),
    },
    generationJob: { deleteMany: jest.fn(async () => ({ count: 1 })) },
    anchorCorrection: {
      findMany: jest.fn(async () => [{ id: 'correction-1' }]),
      deleteMany: jest.fn(async () => ({ count: 1 })),
    },
    anchorCorrectionCommand: { deleteMany: jest.fn(async () => ({ count: 1 })) },
    diaryAnchor: { deleteMany: jest.fn(async () => ({ count: 1 })) },
    diaryAnchorExtraction: { deleteMany: jest.fn(async () => ({ count: 1 })) },
    growthFlower: {
      findMany: jest.fn(async () => [
        { id: 'flower-affected', sourceDiaryIds: ['diary-1'] },
        { id: 'flower-other', sourceDiaryIds: ['diary-2'] },
      ]),
      deleteMany: jest.fn(async () => ({ count: 1 })),
    },
    growthMilestone: {
      findMany: jest.fn(async () => [
        { id: 'milestone-1', sourceDiaryIds: ['diary-1', 'diary-2'] },
      ]),
      update: jest.fn(async () => ({})),
    },
    growthRecognitionRun: {
      findMany: jest.fn(async () => [
        { id: 'run-diary', sourceDiaryId: 'diary-1', sourceDiaryRefs: [{ id: 'diary-1', version: 1 }] },
        { id: 'run-baseline', sourceDiaryId: null, sourceDiaryRefs: [{ id: 'diary-1', version: 1 }] },
        { id: 'run-other', sourceDiaryId: 'diary-2', sourceDiaryRefs: [{ id: 'diary-2', version: 1 }] },
      ]),
      deleteMany: jest.fn(async () => ({ count: 2 })),
    },
    growthReportJob: { deleteMany: jest.fn(async () => ({ count: 1 })) },
    growthInsightReport: { deleteMany: jest.fn(async () => ({ count: 1 })) },
    saveCommand: { deleteMany: jest.fn(async () => ({ count: 1 })) },
    diary: { delete: jest.fn(async () => ({ id: 'diary-1' })) },
  };
  const prisma = {
    $transaction: jest.fn(async (operation: (tx: typeof transaction) => unknown) => operation(transaction)),
  };
  const service = new MemoryStoreService(prisma as unknown as PrismaService, {} as never, {} as never);
  return { service, transaction, prisma };
}

describe('MemoryStoreService.deleteDiary', () => {
  test('removes one device diary and its related content while retaining milestone awards', async () => {
    const { service, transaction, prisma } = createService([
      { id: 'diary-1', version: 1, draftId: 'draft-1' },
    ]);
    const assetHook = {
      beforeCommit: jest.fn(async () => undefined),
      afterCommit: jest.fn(async () => undefined),
      rollback: jest.fn(async () => undefined),
    };

    await expect(service.deleteDiary('diary-1', 'device-1', assetHook)).resolves.toEqual({
      diaryId: 'diary-1',
    });

    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    expect(assetHook.beforeCommit).toHaveBeenCalledWith(transaction, 'diary-1');
    expect(assetHook.afterCommit).toHaveBeenCalledTimes(1);
    expect(transaction.discoveryLike.deleteMany).toHaveBeenCalledWith({ where: { storyId: { in: ['story-1'] } } });
    expect(transaction.discoveryStory.deleteMany).toHaveBeenCalledWith({
      where: { id: { in: ['story-1'] }, ownerDeviceId: 'device-1' },
    });
    expect(transaction.diaryAnchor.deleteMany).toHaveBeenCalledWith({
      where: { ownerDeviceId: 'device-1', diaryId: 'diary-1' },
    });
    expect(transaction.growthFlower.deleteMany).toHaveBeenCalledWith({
      where: { ownerDeviceId: 'device-1', id: { in: ['flower-affected'] } },
    });
    expect(transaction.growthRecognitionRun.deleteMany).toHaveBeenCalledWith({
      where: { ownerDeviceId: 'device-1', id: { in: ['run-diary', 'run-baseline'] } },
    });
    expect(transaction.growthMilestone.update).toHaveBeenCalledWith({
      where: { id: 'milestone-1' },
      data: { sourceDiaryIds: ['diary-2'] },
    });
    expect(transaction.growthInsightReport.deleteMany).toHaveBeenCalledWith({ where: { ownerDeviceId: 'device-1' } });
    expect(transaction.diary.delete).toHaveBeenCalledWith({ where: { id: 'diary-1' } });
  });

  test('does not mutate related data when the diary is absent from the current device', async () => {
    const { service, transaction } = createService([]);
    const assetHook = {
      beforeCommit: jest.fn(async () => undefined),
      afterCommit: jest.fn(async () => undefined),
      rollback: jest.fn(async () => undefined),
    };

    await expect(service.deleteDiary('diary-1', 'device-2', assetHook))
      .rejects.toBeInstanceOf(DeleteDiaryError);

    expect(assetHook.beforeCommit).not.toHaveBeenCalled();
    expect(transaction.diary.delete).not.toHaveBeenCalled();
    expect(transaction.discoveryStory.deleteMany).not.toHaveBeenCalled();
  });

  test('rolls back media metadata handling when the database transaction fails', async () => {
    const { service, transaction } = createService([
      { id: 'diary-1', version: 1, draftId: 'draft-1' },
    ]);
    transaction.discoveryStory.deleteMany.mockRejectedValueOnce(new Error('transaction failed'));
    const assetHook = {
      beforeCommit: jest.fn(async () => undefined),
      afterCommit: jest.fn(async () => undefined),
      rollback: jest.fn(async () => undefined),
    };

    await expect(service.deleteDiary('diary-1', 'device-1', assetHook)).rejects.toThrow('transaction failed');
    expect(assetHook.rollback).toHaveBeenCalledTimes(1);
    expect(assetHook.afterCommit).not.toHaveBeenCalled();
  });
});
