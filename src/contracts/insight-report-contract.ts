export const INSIGHT_REPORT_CONTRACT_VERSION = 'insight-report-v1';

export const INSIGHT_REPORT_DIMENSION_IDS = [
  'inner-contrast',
  'cherished-connections',
  'personality-traits',
] as const;

export type InsightReportSourceDiaryContract = {
  id: string;
  version: number;
  title: string;
  summary: string;
};

export type InsightReportRequestContract = {
  version: typeof INSIGHT_REPORT_CONTRACT_VERSION;
  requestId: string;
  sourceVersion: string;
  sourceDiaries: InsightReportSourceDiaryContract[];
};

export type InsightReportDimensionContract = {
  id: typeof INSIGHT_REPORT_DIMENSION_IDS[number];
  title: string;
  content: string;
};

export type InsightReportResultContract = {
  version: typeof INSIGHT_REPORT_CONTRACT_VERSION;
  requestId: string;
  sourceVersion: string;
  source: 'mock' | 'provider';
  sourceDiaryIds: string[];
  dimensions: InsightReportDimensionContract[];
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

export function isInsightReportRequest(value: unknown): value is InsightReportRequestContract {
  if (!isRecord(value)
    || value.version !== INSIGHT_REPORT_CONTRACT_VERSION
    || !isNonEmptyString(value.requestId)
    || !isNonEmptyString(value.sourceVersion)
    || !Array.isArray(value.sourceDiaries)
    || value.sourceDiaries.length === 0) return false;

  const ids = new Set<string>();
  for (const diary of value.sourceDiaries) {
    if (!isRecord(diary)
      || !isNonEmptyString(diary.id)
      || ids.has(diary.id)
      || !Number.isSafeInteger(diary.version)
      || (diary.version as number) < 0
      || typeof diary.title !== 'string'
      || typeof diary.summary !== 'string') return false;
    ids.add(diary.id);
  }
  return true;
}

export function isInsightReportResultForRequest(
  value: unknown,
  request: Pick<InsightReportRequestContract, 'requestId' | 'sourceVersion' | 'sourceDiaries'>,
): value is InsightReportResultContract {
  if (!isRecord(value)
    || value.version !== INSIGHT_REPORT_CONTRACT_VERSION
    || value.requestId !== request.requestId
    || value.sourceVersion !== request.sourceVersion
    || (value.source !== 'mock' && value.source !== 'provider')
    || !Array.isArray(value.sourceDiaryIds)
    || value.sourceDiaryIds.length === 0
    || !Array.isArray(value.dimensions)
    || value.dimensions.length !== INSIGHT_REPORT_DIMENSION_IDS.length) return false;

  const allowedSourceIds = new Set(request.sourceDiaries.map(diary => diary.id));
  const resultSourceIds = new Set<string>();
  for (const sourceId of value.sourceDiaryIds) {
    if (!isNonEmptyString(sourceId) || resultSourceIds.has(sourceId) || !allowedSourceIds.has(sourceId)) return false;
    resultSourceIds.add(sourceId);
  }

  const dimensionIds = new Set<string>();
  for (const dimension of value.dimensions) {
    if (!isRecord(dimension)
      || !INSIGHT_REPORT_DIMENSION_IDS.includes(dimension.id as typeof INSIGHT_REPORT_DIMENSION_IDS[number])
      || dimensionIds.has(dimension.id as string)
      || !isNonEmptyString(dimension.title)
      || !isNonEmptyString(dimension.content)) return false;
    dimensionIds.add(dimension.id as string);
  }
  return dimensionIds.size === INSIGHT_REPORT_DIMENSION_IDS.length;
}
