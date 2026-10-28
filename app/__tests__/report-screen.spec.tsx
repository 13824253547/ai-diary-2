import React from 'react';
import { cleanup, fireEvent, render, waitFor } from '@testing-library/react-native';
import ReportScreen from '../profile/report';
import { createTestStore } from '../../src/test-utils/create-test-store';
import { useAppStore } from '../../src/store/use-app-store';
import type { AppStore } from '../../src/store/use-app-store';
import {
  GROWTH_FLOWER_IDS,
  GROWTH_INSIGHT_CONTRACT_VERSION,
  GROWTH_REPORT_DIMENSION_IDS,
  type GrowthInsightState,
} from '../../src/contracts/growth-insight-contract';

const mockRouter = { back: jest.fn(), replace: jest.fn() };

jest.mock('expo-router', () => ({
  useRouter: () => mockRouter,
  useFocusEffect: (effect: () => void | (() => void)) => {
    const { useEffect } = require('react');
    useEffect(effect, [effect]);
  },
}));

jest.mock('@expo/vector-icons', () => ({ Ionicons: () => null }));

jest.mock('../../src/components/profile/growth-screen', () => ({
  GrowthScreen: ({ children, header }: { children: React.ReactNode; header?: React.ReactNode }) => {
    const { View } = require('react-native');
    return <View>{header}{children}</View>;
  },
}));

jest.mock('../../src/components/common/button', () => ({
  Button: ({ label, onPress }: { label: string; onPress?: () => void }) => {
    const { Pressable, Text } = require('react-native');
    return <Pressable accessibilityRole="button" accessibilityLabel={label} onPress={onPress}><Text>{label}</Text></Pressable>;
  },
}));

jest.mock('../../src/components/common/support-ui', () => ({
  EmptyResult: ({ title, children }: { title: string; children?: React.ReactNode }) => {
    const { Text, View } = require('react-native');
    return <View><Text>{title}</Text>{children}</View>;
  },
}));

jest.mock('../../src/store/use-app-store', () => {
  const { createTestStore } = require('../../src/test-utils/create-test-store');
  const { store, selectors } = createTestStore();
  return { useAppStore: store, appSelectors: selectors };
});

function state(overrides: Partial<GrowthInsightState> = {}): GrowthInsightState {
  return {
    version: GROWTH_INSIGHT_CONTRACT_VERSION,
    flowers: GROWTH_FLOWER_IDS.map((flowerId, index) => ({
      flowerId,
      title: ['人生旷野的寻路者', '觉察自我的思考者', '压力迷茫的疗愈者'][index],
      status: 'bloomed',
      summary: '有日记来源支持的花朵总结。',
      sourceDiaries: [{ id: 'diary-1', version: 1 }],
      awardedAt: '2026-10-26T00:00:00.000Z',
    })),
    flowerAnalysis: { status: 'succeeded', completedBatches: 1, totalBatches: 1 },
    milestones: {
      firstTrip: { achieved: true, sourceDiaryIds: ['diary-1'] },
      streak30: { currentDays: 30, targetDays: 30, achieved: true },
      anchors100: { count: 100, target: 100, achieved: true },
    },
    report: { unlocked: true, status: 'succeeded', stale: false },
    ...overrides,
  };
}

function withReport(reportStatus: 'succeeded' | 'running' | 'failed' = 'succeeded'): GrowthInsightState {
  return state({
    report: {
      unlocked: true,
      status: reportStatus,
      stale: reportStatus === 'running',
      current: {
        reportId: 'report-1',
        sourceVersion: 'source-version-1',
        sourceDiaryIds: ['diary-1'],
        sourceDiaries: [{ id: 'diary-1', version: 1 }],
        sourceDiaryCount: 1,
        dimensions: GROWTH_REPORT_DIMENSION_IDS.map((id, index) => ({
          id,
          title: ['内在的小矛盾', '真正珍视的东西', '正在形成的特质'][index],
          content: `这是第 ${index + 1} 条来自日记的真实观察。`,
          sourceDiaryIds: ['diary-1'],
        })),
        generatedAt: '2026-10-26T00:00:00.000Z',
      },
    },
  });
}

function resetStore() {
  const current = useAppStore.getState() as Record<string, unknown>;
  const fresh = createTestStore().store.getState() as Record<string, unknown>;
  useAppStore.setState(
    Object.fromEntries(Object.keys(current).map(key => [key, typeof current[key] === 'function' ? current[key] : fresh[key]])) as AppStore,
    true,
  );
}

describe('Report screen', () => {
  beforeEach(() => {
    resetStore();
    jest.clearAllMocks();
  });

  afterEach(() => cleanup());

  test('blocks direct access while the server says flowers are locked', async () => {
    const locked = state({
      flowers: GROWTH_FLOWER_IDS.map((flowerId, index) => ({
        flowerId,
        title: ['人生旷野的寻路者', '觉察自我的思考者', '压力迷茫的疗愈者'][index],
        status: 'locked',
      })),
      report: { unlocked: false, status: 'locked', stale: false },
    });
    const ensureCurrentGrowthReport = jest.fn();
    useAppStore.setState({
      growthInsights: locked,
      loadGrowthInsights: jest.fn(async () => locked),
      ensureCurrentGrowthReport,
    });
    const screen = await render(<ReportScreen />);

    await waitFor(() => expect(screen.getByText('专属洞察报告尚未解锁')).toBeTruthy());
    expect(screen.queryByText('这是第 1 条来自日记的真实观察。')).toBeNull();
    expect(ensureCurrentGrowthReport).not.toHaveBeenCalled();
    fireEvent.press(screen.getByLabelText('返回记忆花朵'));
    expect(mockRouter.replace).toHaveBeenCalledWith('/profile/flowers');
  });

  test('ensures a current report on entry and renders the server result and source count', async () => {
    const unlocked = withReport();
    const ensureCurrentGrowthReport = jest.fn(async () => unlocked);
    useAppStore.setState({
      growthInsights: unlocked,
      loadGrowthInsights: jest.fn(async () => unlocked),
      ensureCurrentGrowthReport,
    });

    const screen = await render(<ReportScreen />);
    await waitFor(() => expect(ensureCurrentGrowthReport).toHaveBeenCalledTimes(1));
    expect(screen.getByText('基于你的 1 篇日记生成')).toBeTruthy();
    expect(screen.getByText('这是第 1 条来自日记的真实观察。')).toBeTruthy();
    expect(screen.getByText(/按设备身份隔离保存/)).toBeTruthy();
  });

  test('keeps the last successful report visible while a new source version updates', async () => {
    const updating = withReport('running');
    useAppStore.setState({
      growthInsights: updating,
      loadGrowthInsights: jest.fn(async () => updating),
      ensureCurrentGrowthReport: jest.fn(async () => updating),
    });

    const screen = await render(<ReportScreen />);
    await waitFor(() => expect(screen.getByText('正在更新报告，先为你保留上次的成功版本。')).toBeTruthy());
    expect(screen.getByText('这是第 1 条来自日记的真实观察。')).toBeTruthy();
  });

  test('offers an explicit retry after failure without discarding the last report', async () => {
    const failed = withReport('failed');
    const retryGrowthReport = jest.fn(async () => failed);
    useAppStore.setState({
      growthInsights: failed,
      loadGrowthInsights: jest.fn(async () => failed),
      ensureCurrentGrowthReport: jest.fn(async () => failed),
      retryGrowthReport,
    });

    const screen = await render(<ReportScreen />);
    await waitFor(() => expect(screen.getByText('这次没有生成新报告；之前成功的报告仍会保留。')).toBeTruthy());
    expect(screen.getByText('这是第 1 条来自日记的真实观察。')).toBeTruthy();
    fireEvent.press(screen.getByLabelText('重试生成报告'));
    expect(retryGrowthReport).toHaveBeenCalledTimes(1);
  });
});
