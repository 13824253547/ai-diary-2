import { DeviceAiTaskCoordinator } from '../../common/device-ai-task-coordinator';
import { PrismaService } from '../../common/prisma.service';
import { AnchorReadModelService } from './anchor-read-model.service';
import { ArkMemoryAnchorProvider } from './ark-memory-anchor-provider';
import { DiaryAnchorGenerationService } from './diary-anchor-generation.service';

function createService(snapshot: unknown) {
  const diaryAnchorExtraction = {
    findUnique: jest.fn().mockResolvedValue(null),
    upsert: jest.fn().mockResolvedValue({ status: 'skipped' }),
  };
  const transaction = {
    $queryRaw: jest.fn().mockResolvedValue([{ id: 'diary-1' }]),
    diaryAnchorExtraction,
  };
  const prisma = {
    diary: {
      findFirst: jest.fn().mockResolvedValue({ contentSnapshot: snapshot }),
    },
    diaryAnchorExtraction,
    $transaction: jest.fn(async (operation: (tx: typeof transaction) => unknown) => operation(transaction)),
  } as unknown as PrismaService;
  const readModel = {
    beginExtraction: jest.fn().mockResolvedValue({
      diaryId: 'diary-1',
      diaryVersion: 3,
      requestId: 'request-1',
      attempt: 1,
      status: 'pending',
      anchors: [],
    }),
    completeExtraction: jest.fn().mockResolvedValue({ status: 'succeeded' }),
    failExtraction: jest.fn().mockResolvedValue({ status: 'failed' }),
  } as unknown as AnchorReadModelService;
  const provider = {
    summarize: jest.fn().mockResolvedValue({
      tagId: 'mountains',
      excerpt: '小橘记得海边的风让你感到放松。',
    }),
  } as unknown as ArkMemoryAnchorProvider;
  const taskCoordinator = {
    runBackground: jest.fn(async (_ownerDeviceId: string, task: () => Promise<unknown>) => task()),
  } as unknown as DeviceAiTaskCoordinator;

  return {
    prisma,
    readModel,
    provider,
    taskCoordinator,
    transaction,
    service: new DiaryAnchorGenerationService(prisma, readModel, provider, taskCoordinator),
  };
}

describe('DiaryAnchorGenerationService', () => {
  test('summarizes the full saved source and records every contributing text/quote block', async () => {
    const blocks = [
      { id: 'block-1', type: 'text', content: '海边的风很舒服。' },
      { id: 'block-photo', type: 'photo', photoId: 'photo-1' },
      { id: 'block-2', type: 'quote', content: '我们沿着岸边走了很久。' },
    ];
    const harness = createService({ blocks });

    await harness.service.processDiaryVersion('device-1', 'diary-1', 3);

    expect(harness.provider.summarize).toHaveBeenCalledWith({
      kind: 'diary',
      blocks: [
        { id: 'block-1', type: 'text', content: '海边的风很舒服。' },
        { id: 'block-2', type: 'quote', content: '我们沿着岸边走了很久。' },
      ],
    });
    expect(harness.readModel.completeExtraction).toHaveBeenCalledWith(expect.objectContaining({
      attempt: 1,
      result: expect.objectContaining({
        diaryId: 'diary-1',
        diaryVersion: 3,
        source: 'provider',
        anchors: [expect.objectContaining({
          tagId: 'mountains',
          sourceBlockId: 'block-1',
          sourceBlockIds: ['block-1', 'block-2'],
          excerpt: '小橘记得海边的风让你感到放松。',
        })],
      }),
    }), 'device-1', expect.any(Symbol));
  });

  test('records no-source diaries as skipped without a provider request', async () => {
    const harness = createService({
      blocks: [
        { id: 'photo-block', type: 'photo', photoId: 'photo-1' },
        { id: 'empty-text', type: 'text', content: '  ' },
      ],
    });

    await harness.service.processDiaryVersion('device-1', 'diary-1', 3);

    expect(harness.provider.summarize).not.toHaveBeenCalled();
    expect(harness.prisma.diaryAnchorExtraction.upsert).toHaveBeenCalledWith(expect.objectContaining({
      create: expect.objectContaining({
        status: 'skipped',
        failureCode: 'no_source',
        attempt: 0,
      }),
    }));
  });

  test('does not persist a skipped extraction after the source diary is deleted', async () => {
    const harness = createService({
      blocks: [{ id: 'photo-block', type: 'photo', photoId: 'photo-1' }],
    });
    harness.transaction.$queryRaw.mockResolvedValueOnce([]);

    await harness.service.processDiaryVersion('device-1', 'diary-1', 3);

    expect(harness.transaction.diaryAnchorExtraction.upsert).not.toHaveBeenCalled();
    expect(harness.provider.summarize).not.toHaveBeenCalled();
  });
});
