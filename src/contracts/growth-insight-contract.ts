export const GROWTH_INSIGHT_CONTRACT_VERSION = 'growth-insight-v1';

export const GROWTH_FLOWER_IDS = ['pathfinder', 'self-awareness', 'healing'] as const;
export const GROWTH_REPORT_DIMENSION_IDS = [
  'inner-contrast',
  'cherished-connections',
  'personality-traits',
] as const;

export type GrowthFlowerId = typeof GROWTH_FLOWER_IDS[number];
export type GrowthReportDimensionId = typeof GROWTH_REPORT_DIMENSION_IDS[number];

export type GrowthSourceDiaryRef = {
  id: string;
  version: number;
};

export type GrowthFlowerRecord = {
  flowerId: GrowthFlowerId;
  title: string;
  status: 'locked' | 'bloomed';
  summary?: string;
  sourceDiaries?: GrowthSourceDiaryRef[];
  awardedAt?: string;
};

export type GrowthMilestones = {
  firstTrip: {
    achieved: boolean;
    sourceDiaryIds: string[];
  };
  streak30: {
    currentDays: number;
    targetDays: 30;
    achieved: boolean;
  };
  anchors100: {
    count?: number;
    target: 100;
    achieved?: boolean;
    unavailable?: boolean;
  };
};

export type GrowthAnalysisStatus = {
  status: 'not_started' | 'pending' | 'running' | 'succeeded' | 'failed';
  completedBatches: number;
  totalBatches: number;
  failureCode?: 'unconfigured' | 'timeout' | 'provider_failed' | 'invalid_response' | 'source_changed' | 'interrupted';
};

export type GrowthReportDimension = {
  id: GrowthReportDimensionId;
  title: string;
  content: string;
  sourceDiaryIds: string[];
};

export type GrowthReportRecord = {
  reportId: string;
  sourceVersion: string;
  sourceDiaryIds: string[];
  sourceDiaries: GrowthSourceDiaryRef[];
  sourceDiaryCount: number;
  dimensions: GrowthReportDimension[];
  generatedAt: string;
};

export type GrowthReportState = {
  unlocked: boolean;
  status: 'locked' | 'idle' | 'pending' | 'running' | 'succeeded' | 'failed' | 'stale';
  stale: boolean;
  failureCode?: 'unconfigured' | 'timeout' | 'provider_failed' | 'invalid_response' | 'source_changed' | 'interrupted';
  current?: GrowthReportRecord;
};

export type GrowthInsightState = {
  version: typeof GROWTH_INSIGHT_CONTRACT_VERSION;
  flowers: GrowthFlowerRecord[];
  flowerAnalysis: GrowthAnalysisStatus;
  milestones: GrowthMilestones;
  report: GrowthReportState;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

function isDate(value: unknown) {
  return typeof value === 'string' && Number.isFinite(Date.parse(value));
}

function isSourceDiaryRef(value: unknown): value is GrowthSourceDiaryRef {
  return isRecord(value)
    && isNonEmptyString(value.id)
    && Number.isSafeInteger(value.version)
    && (value.version as number) > 0;
}

function isGrowthReportDimension(value: unknown): value is GrowthReportDimension {
  return isRecord(value)
    && GROWTH_REPORT_DIMENSION_IDS.includes(value.id as GrowthReportDimensionId)
    && isNonEmptyString(value.title)
    && isNonEmptyString(value.content)
    && Array.from(value.content).length <= 1800
    && Array.isArray(value.sourceDiaryIds)
    && value.sourceDiaryIds.every(isNonEmptyString);
}

function validateGrowthReportRecord(value: unknown): value is GrowthReportRecord {
  if (!isRecord(value)
    || !isNonEmptyString(value.reportId)
    || !isNonEmptyString(value.sourceVersion)
    || !Array.isArray(value.sourceDiaryIds)
    || !value.sourceDiaryIds.length
    || !value.sourceDiaryIds.every(isNonEmptyString)
    || !Array.isArray(value.sourceDiaries)
    || !value.sourceDiaries.length
    || !value.sourceDiaries.every(isSourceDiaryRef)
    || !Number.isSafeInteger(value.sourceDiaryCount)
    || value.sourceDiaryCount !== value.sourceDiaries.length
    || !Array.isArray(value.dimensions)
    || value.dimensions.length !== GROWTH_REPORT_DIMENSION_IDS.length
    || !value.dimensions.every(isGrowthReportDimension)
    || !isDate(value.generatedAt)) return false;
  const sourceDiaries = value.sourceDiaries as GrowthSourceDiaryRef[];
  const dimensions = value.dimensions as GrowthReportDimension[];
  const sourceDiaryIds = value.sourceDiaryIds as string[];
  const ids = dimensions.map(item => item.id);
  return new Set(ids).size === GROWTH_REPORT_DIMENSION_IDS.length
    && new Set(sourceDiaryIds).size === sourceDiaryIds.length
    && sourceDiaryIds.length === sourceDiaries.length
    && sourceDiaries.every(source =>
      sourceDiaryIds.includes(source.id)
      &&
      dimensions.every(dimension =>
        dimension.sourceDiaryIds.every(id =>
          sourceDiaries.some(item => item.id === id)),
      ),
    );
}

export function isGrowthInsightState(value: unknown): value is GrowthInsightState {
  if (!isRecord(value)
    || value.version !== GROWTH_INSIGHT_CONTRACT_VERSION
    || !Array.isArray(value.flowers)
    || value.flowers.length !== GROWTH_FLOWER_IDS.length
    || !isRecord(value.flowerAnalysis)
    || !['not_started', 'pending', 'running', 'succeeded', 'failed'].includes(String(value.flowerAnalysis.status))
    || !Number.isSafeInteger(value.flowerAnalysis.completedBatches)
    || !Number.isSafeInteger(value.flowerAnalysis.totalBatches)
    || (value.flowerAnalysis.completedBatches as number) < 0
    || (value.flowerAnalysis.totalBatches as number) < 0
    || !isRecord(value.milestones)
    || !isRecord(value.milestones.firstTrip)
    || typeof value.milestones.firstTrip.achieved !== 'boolean'
    || !Array.isArray(value.milestones.firstTrip.sourceDiaryIds)
    || !value.milestones.firstTrip.sourceDiaryIds.every(isNonEmptyString)
    || !isRecord(value.milestones.streak30)
    || !Number.isSafeInteger(value.milestones.streak30.currentDays)
    || (value.milestones.streak30.currentDays as number) < 0
    || value.milestones.streak30.targetDays !== 30
    || typeof value.milestones.streak30.achieved !== 'boolean'
    || !isRecord(value.milestones.anchors100)
    || value.milestones.anchors100.target !== 100
    || (value.milestones.anchors100.count !== undefined
      && (!Number.isSafeInteger(value.milestones.anchors100.count)
        || (value.milestones.anchors100.count as number) < 0))
    || (value.milestones.anchors100.achieved !== undefined
      && typeof value.milestones.anchors100.achieved !== 'boolean')
    || (value.milestones.streak30.achieved !== ((value.milestones.streak30.currentDays as number) >= 30))
    || (value.milestones.anchors100.count !== undefined
      && value.milestones.anchors100.achieved !== ((value.milestones.anchors100.count as number) >= 100))
    || !isRecord(value.report)
    || typeof value.report.unlocked !== 'boolean'
    || !['locked', 'idle', 'pending', 'running', 'succeeded', 'failed', 'stale'].includes(String(value.report.status))
    || typeof value.report.stale !== 'boolean'
    || (value.report.current !== undefined && !validateGrowthReportRecord(value.report.current))) return false;

  const flowerIds = new Set<string>();
  for (const flower of value.flowers) {
    if (!isRecord(flower)
      || !GROWTH_FLOWER_IDS.includes(flower.flowerId as GrowthFlowerId)
      || flowerIds.has(flower.flowerId as string)
      || !isNonEmptyString(flower.title)
      || (flower.status !== 'locked' && flower.status !== 'bloomed')
      || (flower.summary !== undefined
        && (!isNonEmptyString(flower.summary) || Array.from(flower.summary).length > 60))
      || (flower.sourceDiaries !== undefined
        && (!Array.isArray(flower.sourceDiaries) || !flower.sourceDiaries.every(isSourceDiaryRef)))
      || (flower.awardedAt !== undefined && !isDate(flower.awardedAt))) return false;
    if (flower.status === 'bloomed'
      && (!isNonEmptyString(flower.summary)
        || !Array.isArray(flower.sourceDiaries)
        || flower.sourceDiaries.length === 0
        || !isDate(flower.awardedAt))) return false;
    flowerIds.add(flower.flowerId as string);
  }
  if (flowerIds.size !== GROWTH_FLOWER_IDS.length) return false;
  const bloomedCount = value.flowers.filter(flower =>
    isRecord(flower) && flower.status === 'bloomed').length;
  return value.report.unlocked === (bloomedCount === GROWTH_FLOWER_IDS.length)
    && (value.report.unlocked || value.report.current === undefined)
    && (value.report.unlocked ? value.report.status !== 'locked' : value.report.status === 'locked');
}

export function isGrowthReportRecord(value: unknown): value is GrowthReportRecord {
  return validateGrowthReportRecord(value);
}
