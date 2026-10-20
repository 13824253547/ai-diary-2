import {
  InsightReportProviderError,
  type InsightReportRequest,
  type InsightReportResult,
} from '../../services/insight-report-provider';
import { INSIGHT_REPORT_CONTRACT_VERSION } from '../../contracts/insight-report-contract';
import { createTestStore } from '../../test-utils/create-test-store';

function buildReport(request: InsightReportRequest, source: 'mock' | 'provider' = 'provider'): InsightReportResult {
  return {
    version: INSIGHT_REPORT_CONTRACT_VERSION,
    requestId: request.requestId,
    sourceVersion: request.sourceVersion,
    source,
    sourceDiaryIds: request.sourceDiaries.map(diary => diary.id),
    dimensions: [
      { id: 'inner-contrast', title: '内在的小矛盾', content: '基于当前来源生成的测试内容。' },
      { id: 'cherished-connections', title: '真正珍视的东西', content: '基于当前来源生成的测试内容。' },
      { id: 'personality-traits', title: '正在形成的特质', content: '基于当前来源生成的测试内容。' },
    ],
  };
}

describe('GRW-006 insight report generation business', () => {
  test('does not request a report before the store unlock is granted', async () => {
    const generate = jest.fn(async (request: InsightReportRequest) => buildReport(request));
    const { store } = createTestStore({
      insightReportProvider: { generate },
    });

    const result = await store.getState().generateInsightReport();

    expect(result).toMatchObject({ ok: false, reason: 'not_unlocked' });
    expect(generate).not.toHaveBeenCalled();
    expect(store.getState().insightReportGeneration.status).toBe('idle');
  });

  test('records an explicitly marked development mock report with its source IDs', async () => {
    const { store } = createTestStore();
    store.getState().setFlowerUnlocked(true);

    const result = await store.getState().generateInsightReport();

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.report.source).toBe('mock');
    expect(result.report.dimensions).toHaveLength(3);
    expect(result.report.sourceDiaryIds.length).toBeGreaterThan(0);
    expect(store.getState().insightReportGeneration).toMatchObject({
      status: 'succeeded',
      requestId: result.requestId,
      sourceVersion: result.report.sourceVersion,
    });
  });

  test('deduplicates concurrent requests for the same source version', async () => {
    const generate = jest.fn(async (request: InsightReportRequest) => {
      await Promise.resolve();
      return buildReport(request);
    });
    const { store } = createTestStore({
      insightReportProvider: { generate },
    });
    store.getState().setFlowerUnlocked(true);

    const [first, second] = await Promise.all([
      store.getState().generateInsightReport(),
      store.getState().generateInsightReport(),
    ]);

    expect(generate).toHaveBeenCalledTimes(1);
    expect(first).toEqual(second);
  });

  test('discards an older report response after the source version changes', async () => {
    const resolvers = new Map<string, (result: InsightReportResult) => void>();
    const generate = jest.fn((request: InsightReportRequest) => new Promise<InsightReportResult>(resolve => {
      resolvers.set(request.requestId, result => resolve(result));
    }));
    const { store } = createTestStore({
      insightReportProvider: { generate },
    });
    store.getState().setFlowerUnlocked(true);

    const firstRequest = store.getState().generateInsightReport();
    await Promise.resolve();
    const firstId = store.getState().insightReportGeneration.requestId;
    if (!firstId) throw new Error('first report request was not created');

    const firstDiary = store.getState().diaries[0];
    if (!firstDiary) throw new Error('missing diary fixture');
    store.setState({
      diaries: [{ ...firstDiary, version: (firstDiary.version ?? 0) + 1 }, ...store.getState().diaries.slice(1)],
    });
    const secondRequest = store.getState().generateInsightReport();
    await Promise.resolve();
    const secondId = store.getState().insightReportGeneration.requestId;
    if (!secondId) throw new Error('second report request was not created');

    const secondCall = generate.mock.calls[1]?.[0];
    const firstCall = generate.mock.calls[0]?.[0];
    if (!firstCall || !secondCall) throw new Error('report provider calls were not captured');
    resolvers.get(secondId)?.(buildReport(secondCall));
    const secondResult = await secondRequest;
    resolvers.get(firstId)?.(buildReport(firstCall));
    const firstResult = await firstRequest;

    expect(secondResult.ok).toBe(true);
    expect(firstResult).toMatchObject({ ok: false, reason: 'stale' });
    expect(store.getState().insightReportGeneration).toMatchObject({
      status: 'succeeded',
      requestId: secondId,
    });
  });

  test('keeps a provider failure stale when its source changed in flight', async () => {
    let rejectProvider: ((error: unknown) => void) | undefined;
    const generate = jest.fn(() => new Promise<InsightReportResult>((_resolve, reject) => {
      rejectProvider = reject;
    }));
    const { store } = createTestStore({
      insightReportProvider: { generate },
    });
    store.getState().setFlowerUnlocked(true);

    const pending = store.getState().generateInsightReport();
    await Promise.resolve();
    const diary = store.getState().diaries[0];
    if (!diary) throw new Error('missing diary fixture');
    store.setState({
      diaries: [{ ...diary, version: (diary.version ?? 0) + 1 }, ...store.getState().diaries.slice(1)],
    });
    rejectProvider?.(new InsightReportProviderError('provider_failed', 'late old-version failure'));

    await expect(pending).resolves.toMatchObject({ ok: false, reason: 'stale' });
    expect(store.getState().insightReportGeneration).toMatchObject({
      status: 'stale',
      errorCode: 'stale',
    });
  });

  test('settles report cancellation even when the provider ignores AbortSignal', async () => {
    const generate = jest.fn(() => new Promise<InsightReportResult>(() => {}));
    const { store } = createTestStore({
      insightReportProvider: { generate },
    });
    store.getState().setFlowerUnlocked(true);

    const pending = store.getState().generateInsightReport();
    await Promise.resolve();
    const requestId = store.getState().insightReportGeneration.requestId;
    if (!requestId) throw new Error('report request was not created');
    expect(generate).toHaveBeenCalledTimes(1);

    store.getState().cancelInsightReport(requestId);

    await expect(pending).resolves.toMatchObject({
      ok: false,
      requestId,
      reason: 'cancelled',
    });
    expect(store.getState().insightReportGeneration).toMatchObject({
      status: 'cancelled',
      requestId,
    });
  });

  test('fails closed on provider errors and malformed report structure', async () => {
    const failedStore = createTestStore({
      insightReportProvider: {
        generate: async () => {
          throw new InsightReportProviderError('provider_failed', 'private provider detail');
        },
      },
    });
    failedStore.store.getState().setFlowerUnlocked(true);
    const failure = await failedStore.store.getState().generateInsightReport();
    expect(failure).toMatchObject({ ok: false, reason: 'provider_failed' });
    expect(failedStore.store.getState().insightReportGeneration.status).toBe('failed');

    const malformedStore = createTestStore({
      insightReportProvider: {
        generate: async request => ({ ...buildReport(request), dimensions: [] }),
      },
    });
    malformedStore.store.getState().setFlowerUnlocked(true);
    const malformed = await malformedStore.store.getState().generateInsightReport();
    expect(malformed).toMatchObject({ ok: false, reason: 'provider_failed' });
    expect(malformedStore.store.getState().insightReportGeneration.status).toBe('failed');
  });
});
