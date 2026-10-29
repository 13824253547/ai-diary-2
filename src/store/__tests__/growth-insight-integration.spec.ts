import { createAppStore } from '../create-app-store';
import {
  GROWTH_FLOWER_IDS,
  GROWTH_INSIGHT_CONTRACT_VERSION,
  type GrowthInsightState,
} from '../../contracts/growth-insight-contract';
import type { GrowthInsightRepository } from '../../repositories/growth-insight-repository';

function makeState(bloomed: readonly string[] = []): GrowthInsightState {
  return {
    version: GROWTH_INSIGHT_CONTRACT_VERSION,
    flowers: GROWTH_FLOWER_IDS.map((flowerId, index) => ({
      flowerId,
      title: ['人生旷野的寻路者', '觉察自我的思考者', '压力迷茫的疗愈者'][index],
      status: bloomed.includes(flowerId) ? 'bloomed' : 'locked',
      ...(bloomed.includes(flowerId) ? {
        summary: '你愿意从真实经历里继续认识自己。',
        sourceDiaries: [{ id: 'diary-1', version: 1 }],
        awardedAt: '2026-10-26T00:00:00.000Z',
      } : {}),
    })),
    flowerAnalysis: { status: 'succeeded', completedBatches: 1, totalBatches: 1 },
    milestones: {
      firstTrip: { achieved: bloomed.includes('pathfinder'), sourceDiaryIds: bloomed.includes('pathfinder') ? ['diary-1'] : [] },
      streak30: {
        currentDays: bloomed.includes('self-awareness') ? 30 : 4,
        targetDays: 30,
        achieved: bloomed.includes('self-awareness'),
      },
      anchors100: {
        count: bloomed.includes('healing') ? 100 : 4,
        target: 100,
        achieved: bloomed.includes('healing'),
      },
    },
    report: { unlocked: bloomed.length === 3, status: bloomed.length === 3 ? 'idle' : 'locked', stale: false },
  };
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>(nextResolve => { resolve = nextResolve; });
  return { promise, resolve };
}

describe('Growth insight Store integration', () => {
  test('routes baseline and report actions through the device-scoped repository state', async () => {
    const result = makeState(GROWTH_FLOWER_IDS);
    const repository: GrowthInsightRepository = {
      getState: jest.fn(async () => result),
      initializeFlowers: jest.fn(async () => result),
      retryFlowers: jest.fn(async () => result),
      ensureCurrentReport: jest.fn(async () => result),
      getCurrentReport: jest.fn(async () => result),
      retryCurrentReport: jest.fn(async () => result),
    };
    const store = createAppStore({ adapters: { growthInsightRepository: repository } });

    await expect(store.getState().initializeGrowthFlowers()).resolves.toEqual(result);
    await expect(store.getState().ensureCurrentGrowthReport()).resolves.toEqual(result);
    expect(repository.initializeFlowers).toHaveBeenCalledTimes(1);
    expect(repository.ensureCurrentReport).toHaveBeenCalledTimes(1);
    expect(store.getState().growthInsightsStatus).toBe('ready');
    expect(store.getState().growthInsights?.report.unlocked).toBe(true);
  });

  test('ignores a late growth state response after a newer request succeeds', async () => {
    const old = deferred<GrowthInsightState>();
    const newest = makeState(GROWTH_FLOWER_IDS);
    const repository: GrowthInsightRepository = {
      getState: jest.fn()
        .mockReturnValueOnce(old.promise)
        .mockResolvedValueOnce(newest),
      initializeFlowers: jest.fn(async () => newest),
      retryFlowers: jest.fn(async () => newest),
      ensureCurrentReport: jest.fn(async () => newest),
      getCurrentReport: jest.fn(async () => newest),
      retryCurrentReport: jest.fn(async () => newest),
    };
    const store = createAppStore({ adapters: { growthInsightRepository: repository } });
    const staleRequest = store.getState().loadGrowthInsights();
    await store.getState().loadGrowthInsights();
    old.resolve(makeState());
    await staleRequest;

    expect(store.getState().growthInsights).toEqual(newest);
    expect(store.getState().growthInsightsStatus).toBe('ready');
  });

  test('fails closed without a configured growth repository', async () => {
    const store = createAppStore({ adapters: {} });
    await expect(store.getState().loadGrowthInsights()).resolves.toBeUndefined();
    expect(store.getState().growthInsights).toBeUndefined();
    expect(store.getState().growthInsightsStatus).toBe('error');
  });
});
