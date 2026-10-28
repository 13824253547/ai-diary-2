import React from 'react';
import { cleanup, fireEvent, render, waitFor } from '@testing-library/react-native';
import InsightsEntry from '../profile/insights';
import { createTestStore } from '../../src/test-utils/create-test-store';
import { useAppStore } from '../../src/store/use-app-store';
import type { AppStore } from '../../src/store/use-app-store';
import {
  GROWTH_FLOWER_IDS,
  GROWTH_INSIGHT_CONTRACT_VERSION,
  type GrowthInsightState,
} from '../../src/contracts/growth-insight-contract';

const mockRouter = { push: jest.fn(), back: jest.fn(), replace: jest.fn(), canGoBack: jest.fn(() => true) };

jest.mock('expo-router', () => ({ useRouter: () => mockRouter }));
jest.mock('@expo/vector-icons', () => ({ Ionicons: () => null }));
jest.mock('../../src/components/profile/growth-screen', () => ({
  GrowthScreen: ({ children, header }: { children: React.ReactNode; header?: React.ReactNode }) => {
    const { View } = require('react-native');
    return <View>{header}{children}</View>;
  },
}));
jest.mock('../../src/components/profile/growth-artwork', () => ({
  GrowthArtwork: ({ onFlowerPress }: { onFlowerPress?: () => void }) => {
    const { Pressable, Text } = require('react-native');
    return <Pressable accessibilityRole="button" accessibilityLabel="成长树花朵" onPress={onFlowerPress}><Text>成长树</Text></Pressable>;
  },
}));
jest.mock('../../src/store/use-app-store', () => {
  const { createTestStore } = require('../../src/test-utils/create-test-store');
  const { store, selectors } = createTestStore();
  return { useAppStore: store, appSelectors: selectors, getDiaryStatistics: () => ({ diaries: 4, photos: 0, days: 0, companions: 0 }) };
});

function makeState(): GrowthInsightState {
  return {
    version: GROWTH_INSIGHT_CONTRACT_VERSION,
    flowers: GROWTH_FLOWER_IDS.map((flowerId, index) => ({
      flowerId,
      title: ['人生旷野的寻路者', '觉察自我的思考者', '压力迷茫的疗愈者'][index],
      status: index === 0 ? 'bloomed' : 'locked',
      ...(index === 0 ? {
        summary: '你愿意继续探索新的方向。',
        sourceDiaries: [{ id: 'diary-1', version: 1 }],
        awardedAt: '2026-10-26T00:00:00.000Z',
      } : {}),
    })),
    flowerAnalysis: { status: 'succeeded', completedBatches: 1, totalBatches: 1 },
    milestones: {
      firstTrip: { achieved: false, sourceDiaryIds: [] },
      streak30: { currentDays: 3, targetDays: 30, achieved: false },
      anchors100: { count: 5, target: 100, achieved: false },
    },
    report: { unlocked: false, status: 'locked', stale: false },
  };
}

function resetStore() {
  const current = useAppStore.getState() as Record<string, unknown>;
  const fresh = createTestStore().store.getState() as Record<string, unknown>;
  useAppStore.setState(
    Object.fromEntries(Object.keys(current).map(key => [key, typeof current[key] === 'function' ? current[key] : fresh[key]])) as AppStore,
    true,
  );
}

describe('Growth tree entry', () => {
  beforeEach(() => {
    resetStore();
    jest.clearAllMocks();
  });

  afterEach(() => cleanup());

  test('uses the server flower count and unlock status', async () => {
    const growth = makeState();
    const loadGrowthInsights = jest.fn(async () => {
      useAppStore.setState({ growthInsights: growth, growthInsightsStatus: 'ready' });
      return growth;
    });
    useAppStore.setState({ loadGrowthInsights });

    const screen = await render(<InsightsEntry />);
    await waitFor(() => expect(screen.getByText('1/3 朵记忆花 · 继续记录，等待花朵绽放')).toBeTruthy());
    fireEvent.press(screen.getByLabelText('查看记忆花朵'));
    expect(mockRouter.push).toHaveBeenCalledWith('/profile/flowers');
  });

  test('does not show a fixed progress count when the service is unavailable', async () => {
    const loadGrowthInsights = jest.fn(async () => {
      useAppStore.setState({ growthInsights: undefined, growthInsightsStatus: 'error', growthInsightsError: '成长服务暂不可用。' });
      return undefined;
    });
    useAppStore.setState({ loadGrowthInsights });

    const screen = await render(<InsightsEntry />);
    await waitFor(() => expect(screen.getByText('成长服务暂不可用。')).toBeTruthy());
    expect(screen.queryByText(/0\/3|2\/3|3\/3/)).toBeNull();
  });
});
