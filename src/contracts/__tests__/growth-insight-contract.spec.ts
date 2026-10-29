import {
  GROWTH_FLOWER_IDS,
  GROWTH_INSIGHT_CONTRACT_VERSION,
  GROWTH_REPORT_DIMENSION_IDS,
  isGrowthInsightState,
  type GrowthInsightState,
} from '../growth-insight-contract';

function state(overrides: Partial<GrowthInsightState> = {}): GrowthInsightState {
  return {
    version: GROWTH_INSIGHT_CONTRACT_VERSION,
    flowers: GROWTH_FLOWER_IDS.map((flowerId, index) => ({
      flowerId,
      title: ['人生旷野的寻路者', '觉察自我的思考者', '压力迷茫的疗愈者'][index],
      status: 'locked',
    })),
    flowerAnalysis: {
      status: 'succeeded',
      completedBatches: 1,
      totalBatches: 1,
    },
    milestones: {
      firstTrip: { achieved: false, sourceDiaryIds: [] },
      streak30: { currentDays: 4, targetDays: 30, achieved: false },
      anchors100: { count: 3, target: 100, achieved: false },
    },
    report: { unlocked: false, status: 'locked', stale: false },
    ...overrides,
  };
}

describe('growth insight runtime contract', () => {
  test('accepts the real locked state and an evidence-bound unlocked report', () => {
    expect(isGrowthInsightState(state())).toBe(true);
    const unlocked = state({
      flowers: GROWTH_FLOWER_IDS.map(flowerId => ({
        flowerId,
        title: '已有来源依据的主题',
        status: 'bloomed',
        summary: '你愿意在变化中继续寻找方向。',
        sourceDiaries: [{ id: 'diary-1', version: 2 }],
        awardedAt: '2026-10-26T00:00:00.000Z',
      })),
      milestones: {
        firstTrip: { achieved: true, sourceDiaryIds: ['diary-1'] },
        streak30: { currentDays: 30, targetDays: 30, achieved: true },
        anchors100: { count: 100, target: 100, achieved: true },
      },
      report: {
        unlocked: true,
        status: 'succeeded',
        stale: false,
        current: {
          reportId: 'report-1',
          sourceVersion: 'source-v1',
          sourceDiaryIds: ['diary-1'],
          sourceDiaries: [{ id: 'diary-1', version: 2 }],
          sourceDiaryCount: 1,
          dimensions: GROWTH_REPORT_DIMENSION_IDS.map((id, index) => ({
            id,
            title: ['内在的小矛盾', '真正珍视的东西', '正在形成的特质'][index],
            content: '这是一段基于日记证据的谨慎观察。',
            sourceDiaryIds: ['diary-1'],
          })),
          generatedAt: '2026-10-26T00:00:00.000Z',
        },
      },
    });
    expect(isGrowthInsightState(unlocked)).toBe(true);
  });

  test('rejects unlocked state without three awarded flowers and rejects foreign report sources', () => {
    expect(isGrowthInsightState(state({
      report: { unlocked: true, status: 'succeeded', stale: false },
    }))).toBe(false);

    const invalid = state({
      flowers: GROWTH_FLOWER_IDS.map(flowerId => ({
        flowerId,
        title: '主题',
        status: 'bloomed',
        summary: '有依据的短说明',
        sourceDiaries: [{ id: 'diary-1', version: 1 }],
        awardedAt: '2026-10-26T00:00:00.000Z',
      })),
      milestones: {
        firstTrip: { achieved: true, sourceDiaryIds: ['diary-1'] },
        streak30: { currentDays: 30, targetDays: 30, achieved: true },
        anchors100: { count: 100, target: 100, achieved: true },
      },
      report: {
        unlocked: true,
        status: 'succeeded',
        stale: false,
        current: {
          reportId: 'report-1',
          sourceVersion: 'source-v1',
          sourceDiaryIds: ['diary-1'],
          sourceDiaries: [{ id: 'diary-1', version: 1 }],
          sourceDiaryCount: 1,
          dimensions: GROWTH_REPORT_DIMENSION_IDS.map((id, index) => ({
            id,
            title: ['内在的小矛盾', '真正珍视的东西', '正在形成的特质'][index],
            content: '有来源支持的观察。',
            sourceDiaryIds: [index === 1 ? 'foreign-diary' : 'diary-1'],
          })),
          generatedAt: '2026-10-26T00:00:00.000Z',
        },
      },
    });
    expect(isGrowthInsightState(invalid)).toBe(false);
  });

  test('requires each flower and report unlock to match its mapped milestone', () => {
    const mismatched = state({
      flowers: GROWTH_FLOWER_IDS.map((flowerId, index) => ({
        flowerId,
        title: ['人生旷野的寻路者', '觉察自我的思考者', '压力迷茫的疗愈者'][index],
        status: flowerId === 'pathfinder' ? 'bloomed' : 'locked',
        ...(flowerId === 'pathfinder' ? { awardedAt: '2026-10-26T00:00:00.000Z' } : {}),
      })),
      milestones: {
        firstTrip: { achieved: false, sourceDiaryIds: [] },
        streak30: { currentDays: 12, targetDays: 30, achieved: false },
        anchors100: { count: 9, target: 100, achieved: false },
      },
    });

    expect(isGrowthInsightState(mismatched)).toBe(false);
  });

  test('allows completed milestones to remain awarded after current progress drops', () => {
    const retained = state({
      flowers: GROWTH_FLOWER_IDS.map((flowerId, index) => ({
        flowerId,
        title: ['人生旷野的寻路者', '觉察自我的思考者', '压力迷茫的疗愈者'][index],
        status: flowerId === 'self-awareness' ? 'bloomed' : 'locked',
        ...(flowerId === 'self-awareness' ? { awardedAt: '2026-10-26T00:00:00.000Z' } : {}),
      })),
      milestones: {
        firstTrip: { achieved: false, sourceDiaryIds: [] },
        streak30: { currentDays: 1, targetDays: 30, achieved: true },
        anchors100: { count: 9, target: 100, achieved: false },
      },
    });

    expect(isGrowthInsightState(retained)).toBe(true);
  });
});
