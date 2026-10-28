import {
  GROWTH_FLOWER_IDS,
  GROWTH_INSIGHT_CONTRACT_VERSION,
  type GrowthInsightState,
} from '../../contracts/growth-insight-contract';
import { ApiClient } from '../../services/api-client';
import { GrowthInsightRepositoryError } from '../growth-insight-repository';
import { HttpGrowthInsightRepository } from '../http-growth-insight-repository';

function growthState(): GrowthInsightState {
  return {
    version: GROWTH_INSIGHT_CONTRACT_VERSION,
    flowers: GROWTH_FLOWER_IDS.map((flowerId, index) => ({
      flowerId,
      title: ['人生旷野的寻路者', '觉察自我的思考者', '压力迷茫的疗愈者'][index],
      status: 'locked',
    })),
    flowerAnalysis: { status: 'not_started', completedBatches: 0, totalBatches: 0 },
    milestones: {
      firstTrip: { achieved: false, sourceDiaryIds: [] },
      streak30: { currentDays: 0, targetDays: 30, achieved: false },
      anchors100: { count: 0, target: 100, achieved: false },
    },
    report: { unlocked: false, status: 'locked', stale: false },
  };
}

describe('HttpGrowthInsightRepository', () => {
  test('loads growth state and starts idempotent server operations without sending diary content', async () => {
    const requestMock = jest.fn(async (_path: string, _init: RequestInit) => ({
      ok: true,
      status: 200,
      data: { ok: true, version: GROWTH_INSIGHT_CONTRACT_VERSION, data: growthState() },
    }));
    const client = {
      request: requestMock,
    } as unknown as ApiClient;
    const repository = new HttpGrowthInsightRepository(client);

    await repository.getState();
    await repository.initializeFlowers();
    await repository.retryFlowers();
    await repository.ensureCurrentReport();
    await repository.getCurrentReport();
    await repository.retryCurrentReport();

    expect(requestMock).toHaveBeenNthCalledWith(1, '/growth/state', { method: 'GET' }, undefined);
    expect(requestMock).toHaveBeenNthCalledWith(2, '/growth/flowers/initialize', { method: 'POST' }, undefined);
    expect(requestMock).toHaveBeenNthCalledWith(3, '/growth/flowers/retry', { method: 'POST' }, undefined);
    expect(requestMock).toHaveBeenNthCalledWith(4, '/growth/reports/ensure-current', { method: 'POST' }, undefined);
    expect(requestMock).toHaveBeenNthCalledWith(5, '/growth/reports/current', { method: 'GET' }, undefined);
    expect(requestMock).toHaveBeenNthCalledWith(6, '/growth/reports/retry', { method: 'POST' }, undefined);
    for (const [, init] of requestMock.mock.calls) {
      expect(init).not.toHaveProperty('body');
    }
  });

  test('rejects malformed growth state and preserves server authorization errors', async () => {
    const malformed = {
      request: jest.fn(async () => ({
        ok: true,
        status: 200,
        data: { ok: true, version: GROWTH_INSIGHT_CONTRACT_VERSION, data: { unlocked: true } },
      })),
    } as unknown as ApiClient;
    const repository = new HttpGrowthInsightRepository(malformed);
    await expect(repository.getState()).rejects.toMatchObject({ code: 'provider_failed' });

    const locked = {
      request: jest.fn(async () => ({
        ok: false,
        status: 403,
        data: {
          ok: false,
          error: { code: 'not_unlocked', message: 'Report remains locked.', retryable: false },
        },
      })),
    } as unknown as ApiClient;
    await expect(new HttpGrowthInsightRepository(locked).ensureCurrentReport())
      .rejects.toBeInstanceOf(GrowthInsightRepositoryError);
    await expect(new HttpGrowthInsightRepository(locked).ensureCurrentReport())
      .rejects.toMatchObject({ code: 'not_unlocked', retryable: false });
  });
});
