import {
  INSIGHT_REPORT_CONTRACT_VERSION,
  INSIGHT_REPORT_DIMENSION_IDS,
  type InsightReportDimensionContract,
  type InsightReportRequestContract,
  type InsightReportResultContract,
  type InsightReportSourceDiaryContract,
} from '../contracts/insight-report-contract';

export type InsightReportSourceDiary = InsightReportSourceDiaryContract;

export type InsightReportRequest = InsightReportRequestContract & {
  signal?: AbortSignal;
};

export type InsightReportDimension = InsightReportDimensionContract;
export type InsightReportResult = InsightReportResultContract;

export type InsightReportProvider = {
  generate: (request: InsightReportRequest) => Promise<InsightReportResult>;
};

export class InsightReportProviderError extends Error {
  constructor(
    readonly code: 'cancelled' | 'provider_failed',
    message: string,
  ) {
    super(message);
  }
}

const DIMENSION_TITLES = ['内在的小矛盾', '真正珍视的东西', '正在形成的特质'];

export function createMockInsightReportProvider(): InsightReportProvider {
  return {
    async generate(request) {
      if (request.signal?.aborted) {
        throw new InsightReportProviderError('cancelled', 'insight report generation cancelled');
      }
      await Promise.resolve();
      if (request.signal?.aborted) {
        throw new InsightReportProviderError('cancelled', 'insight report generation cancelled');
      }
      const titles = request.sourceDiaries.slice(0, 2).map(diary => diary.title.trim()).filter(Boolean);
      const sourceHint = titles.length ? `「${titles.join('」「')}」等回忆` : '当前回忆';
      return {
        version: INSIGHT_REPORT_CONTRACT_VERSION,
        requestId: request.requestId,
        sourceVersion: request.sourceVersion,
        source: 'mock',
        sourceDiaryIds: request.sourceDiaries.map(diary => diary.id),
        dimensions: INSIGHT_REPORT_DIMENSION_IDS.map((id, index) => ({
          id,
          title: DIMENSION_TITLES[index],
          content: `基于${sourceHint}整理的开发态示例洞察，不能作为真实 AI 质量结果。`,
        })),
      };
    },
  };
}

export function createUnconfiguredInsightReportProvider(): InsightReportProvider {
  return {
    async generate() {
      throw new InsightReportProviderError('provider_failed', 'insight report provider is not configured');
    },
  };
}
