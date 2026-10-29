import {
  computeCurrentConsecutiveDays,
  computeLongestConsecutiveDays,
  resolveGrowthDiaryDate,
  GrowthInsightsService,
} from './growth-insights.service';
import { DeviceAiTaskCoordinator } from '../../common/device-ai-task-coordinator';

describe('growth milestone dates', () => {
  test('uses the newest continuous run only and deduplicates multiple diaries on one day', () => {
    expect(computeCurrentConsecutiveDays([
      '2026-10-01',
      '2026-10-02',
      '2026-10-02',
      '2026-10-04',
      '2026-10-05',
      'invalid',
    ])).toBe(2);
    expect(computeCurrentConsecutiveDays(['2026-10-01', '2026-10-02', '2026-10-03'])).toBe(3);
  });

  test('retains historical 30-day eligibility while reporting the newest streak separately', () => {
    const firstThirtyDays = Array.from({ length: 30 }, (_, index) =>
      new Date(Date.UTC(2026, 0, index + 1)).toISOString().slice(0, 10));
    const values = [...firstThirtyDays, '2026-03-12'];

    expect(computeCurrentConsecutiveDays(values)).toBe(1);
    expect(computeLongestConsecutiveDays(values)).toBe(30);
  });

  test('prefers device-local publish date, then persisted publish time, then ingestion time', () => {
    expect(resolveGrowthDiaryDate({
      publishedLocalDate: '2026-10-25',
      date: new Date('2026-10-24T23:30:00.000Z'),
      createdAt: new Date('2026-10-26T00:00:00.000Z'),
    })).toBe('2026-10-25');
    expect(resolveGrowthDiaryDate({
      publishedLocalDate: null,
      date: new Date('2026-10-24T23:30:00.000Z'),
      createdAt: new Date('2026-10-26T00:00:00.000Z'),
    })).toBe('2026-10-24');
    expect(resolveGrowthDiaryDate({
      publishedLocalDate: 'invalid',
      date: null as never,
      createdAt: new Date('2026-10-26T00:00:00.000Z'),
    })).toBe('2026-10-26');
    expect(resolveGrowthDiaryDate({
      publishedLocalDate: null,
      date: null as never,
      createdAt: null as never,
    })).toBeUndefined();
  });
});

describe('growth deletion source guard', () => {
  test('does not persist recognition results after a source diary is deleted', async () => {
    const diary = {
      id: 'diary-1',
      version: 1,
      title: '测试日记',
      contentSnapshot: {
        blocks: [{ id: 'block-1', type: 'text', content: '一段测试正文。' }],
      },
    };
    const run = {
      id: 'run-1',
      ownerDeviceId: 'device-1',
      status: 'pending',
      sourceDiaryRefs: [{ id: diary.id, version: diary.version }],
      sourceDiaryId: diary.id,
      sourceDiaryVersion: diary.version,
      nextBatchIndex: 0,
      batchCount: 1,
    };
    const tx = {
      $queryRaw: jest.fn(async () => []),
      diary: { findMany: jest.fn(async () => []) },
      growthRecognitionRun: { findFirst: jest.fn() },
      growthFlower: { upsert: jest.fn() },
      growthMilestone: { upsert: jest.fn() },
    };
    const prisma = {
      growthRecognitionRun: {
        findFirst: jest.fn(async () => run),
        update: jest.fn(async () => run),
        updateMany: jest.fn(async () => ({ count: 0 })),
      },
      diary: { findMany: jest.fn(async () => [diary]) },
      $transaction: jest.fn(async (operation: (transaction: typeof tx) => unknown) => operation(tx)),
    };
    const provider = {
      recognizeFlowers: jest.fn(async () => ({
        flowers: [{
          flowerId: 'pathfinder' as const,
          summary: '来源于日记的摘要。',
          sourceDiaryIds: [diary.id],
        }],
        tripDiaryIds: [diary.id],
      })),
    };
    const coordinator = {
      runBackground: jest.fn(async (_ownerDeviceId: string, task: () => Promise<unknown>) => task()),
    };
    const service = new GrowthInsightsService(
      prisma as never,
      provider as never,
      coordinator as unknown as DeviceAiTaskCoordinator,
      {} as never,
    );

    await (service as unknown as {
      processRecognitionRun: (runId: string, ownerDeviceId: string) => Promise<void>;
    }).processRecognitionRun('run-1', 'device-1');

    expect(tx.growthFlower.upsert).not.toHaveBeenCalled();
    expect(tx.growthMilestone.upsert).not.toHaveBeenCalled();
    expect(prisma.growthRecognitionRun.updateMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: 'run-1', ownerDeviceId: 'device-1', status: { in: ['pending', 'running'] } },
      data: expect.objectContaining({ status: 'failed', failureCode: 'source_changed' }),
    }));
  });
});
