import React from 'react';
import { cleanup, fireEvent, render, waitFor } from '@testing-library/react-native';
import FlowersScreen from '../profile/flowers';
import { createTestStore } from '../../src/test-utils/create-test-store';
import { useAppStore } from '../../src/store/use-app-store';
import type { AppStore } from '../../src/store/use-app-store';
import {
  GROWTH_FLOWER_IDS,
  GROWTH_INSIGHT_CONTRACT_VERSION,
  type GrowthInsightState,
} from '../../src/contracts/growth-insight-contract';

const mockRouter = { push: jest.fn(), back: jest.fn(), replace: jest.fn(), canGoBack: jest.fn(() => true) };
const baselineState: GrowthInsightState = {
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

jest.mock('expo-router', () => ({
  useRouter: () => mockRouter,
}));

jest.mock('expo-linear-gradient', () => {
  const { View } = require('react-native');
  return { LinearGradient: View };
});

jest.mock('@expo/vector-icons', () => ({
  Ionicons: () => null,
}));

jest.mock('../../src/components/profile/growth-screen', () => ({
  GrowthScreen: ({ children, header }: { children: React.ReactNode; header?: React.ReactNode }) => {
    const { View } = require('react-native');
    return <View>{header}{children}</View>;
  },
}));

jest.mock('../../src/components/profile/growth-artwork', () => ({
  GrowthArtwork: ({ flowerStates }: { flowerStates?: Record<string, boolean> }) => {
    const { Text } = require('react-native');
    return <Text accessibilityLabel="记忆花朵图稿">{JSON.stringify(flowerStates)}</Text>;
  },
}));

jest.mock('../../src/components/layout/top-bar', () => ({
  TopBar: ({ title }: { title: string }) => {
    const { Text } = require('react-native');
    return <Text>{title}</Text>;
  },
}));

jest.mock('../../src/components/common/button', () => ({
  Button: ({ label, onPress }: { label: string; onPress?: () => void }) => {
    const { Pressable, Text } = require('react-native');
    return <Pressable accessibilityRole="button" accessibilityLabel={label} onPress={onPress}><Text>{label}</Text></Pressable>;
  },
}));

jest.mock('../../src/store/use-app-store', () => {
  const { createTestStore } = require('../../src/test-utils/create-test-store');
  const { store, selectors } = createTestStore();
  return { useAppStore: store, appSelectors: selectors };
});

function resetStore() {
  const current = useAppStore.getState() as Record<string, unknown>;
  const fresh = createTestStore().store.getState() as Record<string, unknown>;
  useAppStore.setState(
    Object.fromEntries(Object.keys(current).map(key => [key, typeof current[key] === 'function' ? current[key] : fresh[key]])) as AppStore,
    true,
  );
}

describe('Flowers screen', () => {
  beforeEach(() => {
    resetStore();
    jest.clearAllMocks();
  });

  afterEach(() => cleanup());

  test('starts the one-time full diary recognition on first entry and shows real milestones', async () => {
    const running: GrowthInsightState = {
      ...baselineState,
      flowerAnalysis: { status: 'running', completedBatches: 1, totalBatches: 3 },
      milestones: {
        firstTrip: { achieved: true, sourceDiaryIds: ['diary-trip'] },
        streak30: { currentDays: 12, targetDays: 30, achieved: false },
        anchors100: { count: 21, target: 100, achieved: false },
      },
    };
    const loadGrowthInsights = jest.fn(async () => baselineState);
    const initializeGrowthFlowers = jest.fn(async () => {
      useAppStore.setState({ growthInsights: running, growthInsightsStatus: 'ready' });
      return running;
    });
    useAppStore.setState({
      growthInsights: baselineState,
      growthInsightsStatus: 'ready',
      loadGrowthInsights,
      initializeGrowthFlowers,
    });

    const screen = await render(<FlowersScreen />);

    await waitFor(() => {
      expect(initializeGrowthFlowers).toHaveBeenCalledTimes(1);
      expect(screen.getByText(/1\/3/)).toBeTruthy();
      expect(screen.getByText('已从日记中找到旅行回忆')).toBeTruthy();
      expect(screen.getByText('12/30 天')).toBeTruthy();
      expect(screen.getByText('21/100')).toBeTruthy();
    });
  });

  test('shows AI summaries for awarded flowers and only opens the report after server unlock', async () => {
    const unlocked: GrowthInsightState = {
      ...baselineState,
      flowers: GROWTH_FLOWER_IDS.map((flowerId, index) => ({
        flowerId,
        title: ['人生旷野的寻路者', '觉察自我的思考者', '压力迷茫的疗愈者'][index],
        status: 'bloomed',
        summary: `有日记来源支持的花朵总结 ${index + 1}`,
        sourceDiaries: [{ id: `diary-${index + 1}`, version: 1 }],
        awardedAt: '2026-10-26T00:00:00.000Z',
      })),
      flowerAnalysis: { status: 'succeeded', completedBatches: 1, totalBatches: 1 },
      report: { unlocked: true, status: 'succeeded', stale: false },
    };
    const loadGrowthInsights = jest.fn(async () => unlocked);
    useAppStore.setState({ growthInsights: unlocked, growthInsightsStatus: 'ready', loadGrowthInsights });

    const screen = await render(<FlowersScreen />);
    await waitFor(() => expect(screen.getByText('有日记来源支持的花朵总结 1')).toBeTruthy());
    expect(screen.getByText('集满 3 朵花可解锁专属洞察报告（3/3）')).toBeTruthy();
    fireEvent.press(screen.getByLabelText('查看专属洞察报告'));
    expect(mockRouter.push).toHaveBeenCalledWith('/profile/report');
  });
});
