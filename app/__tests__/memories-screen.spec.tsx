import React from 'react';
import { act, fireEvent, render, waitFor } from '@testing-library/react-native';
import MemoriesScreen from '../(tabs)/memories';
import type { DiaryItem } from '../../src/types/diary';
import { createTestStore } from '../../src/test-utils/create-test-store';
import { useAppStore } from '../../src/store/use-app-store';
import type { AppStore } from '../../src/store/use-app-store';

const mockRouter = {
  push: jest.fn(),
  replace: jest.fn(),
  dismissAll: jest.fn(),
  setParams: jest.fn(),
  canGoBack: jest.fn(),
  back: jest.fn(),
};

jest.mock('expo-router', () => ({
  useRouter: () => mockRouter,
  useLocalSearchParams: () => ({}),
}));

jest.mock('../../src/components/layout/screen', () => ({
  Screen: ({ children, header, footer }: { children: React.ReactNode; header?: React.ReactNode; footer?: React.ReactNode }) => {
    const { View } = require('react-native');
    return (
      <View>
      {header}
      {children}
      {footer}
      </View>
    );
  },
}));

jest.mock('../../src/components/common/bottom-sheet', () => ({
  BottomSheet: ({
    visible,
    title,
    children,
  }: {
    visible: boolean;
    title?: string;
    children: React.ReactNode;
  }) => {
    const { View } = require('react-native');
    return visible ? <View accessibilityLabel={title ?? '底部面板'}>{children}</View> : null;
  },
}));

jest.mock('../../src/components/navigation/bottom-tabs', () => ({
  BottomTabs: () => null,
}));

jest.mock('@expo/vector-icons', () => {
  const { Text: MockText } = require('react-native');
  return {
    Ionicons: ({ name }: { name: string }) => <MockText>{name}</MockText>,
  };
});

jest.mock('expo-linear-gradient', () => ({
  LinearGradient: ({ children }: { children: React.ReactNode }) => {
    const React = require('react');
    return <React.Fragment>{children}</React.Fragment>;
  },
}));

function resetAppStore() {
  const current = useAppStore.getState() as Record<string, unknown>;
  const fresh = createTestStore().store.getState() as Record<string, unknown>;
  const next = Object.fromEntries(
    Object.keys(current).map(key => [key, typeof current[key] === 'function' ? current[key] : fresh[key]]),
  );
  useAppStore.setState(next as AppStore, true);
}

function buildDiary(overrides: Partial<DiaryItem>): DiaryItem {
  return {
    id: overrides.id ?? 'diary-test',
    type: overrides.type ?? 'travel',
    status: 'ready',
    title: overrides.title ?? '测试回忆',
    subtitle: overrides.subtitle ?? '测试副标题',
    location: overrides.location ?? '厦门',
    date: overrides.date ?? '2026.01.10',
    summary: overrides.summary ?? '测试摘要',
    helperMessage: overrides.helperMessage ?? '测试提示',
    characterId: overrides.characterId ?? 'character-blue',
    companionName: overrides.companionName ?? '自己',
    privacy: overrides.privacy ?? 'private',
    photoIds: overrides.photoIds ?? ['photo-1', 'photo-2', 'photo-3'],
    coverPhotoId: overrides.coverPhotoId ?? 'photo-1',
    blocks: overrides.blocks ?? [
      {
        id: 'block-1',
        type: 'text',
        title: '测试段落',
        content: '测试内容',
        photoIds: ['photo-1'],
      },
    ],
    exportedImage: overrides.exportedImage ?? false,
    exportedPdf: overrides.exportedPdf ?? false,
    shareModes: overrides.shareModes ?? [],
    exportModes: overrides.exportModes ?? [],
    version: overrides.version ?? 1,
    createdInSession: overrides.createdInSession,
    people: overrides.people,
    posterPhotoIds: overrides.posterPhotoIds,
    publicBlockIds: overrides.publicBlockIds,
    anonymous: overrides.anonymous,
  };
}

describe('Memories screen', () => {
  beforeEach(() => {
    resetAppStore();
    useAppStore.setState({
      searchMemories: jest.fn().mockResolvedValue(undefined),
      retryMemoriesSearch: jest.fn().mockResolvedValue(undefined),
    });
    jest.clearAllMocks();
  });

  test('shows empty state for an empty remote memories source without falling back to seeded diaries', async () => {
    useAppStore.setState({
      memoriesSourceItems: [],
      memoriesItems: [],
      memoriesStatus: 'ready',
      memoriesError: undefined,
      memoriesFilterMonth: '全部',
      memoriesFilterDay: null,
      memoriesSearchKeyword: '',
      memoriesSearchVisible: false,
    });

    const { getByText, queryByText } = await render(<MemoriesScreen />);

    expect(getByText('还没有这段回忆')).toBeTruthy();
    expect(queryByText('台南慢游日记')).toBeNull();
  });

  test('month picker only lists months from the current memories source', async () => {
    useAppStore.setState({
      memoriesSourceItems: [
        buildDiary({ id: 'diary-jan', title: '一月回忆', date: '2026.01.10' }),
        buildDiary({ id: 'diary-feb', title: '二月回忆', date: '2026.02.03' }),
      ],
      memoriesItems: [
        buildDiary({ id: 'diary-jan', title: '一月回忆', date: '2026.01.10' }),
        buildDiary({ id: 'diary-feb', title: '二月回忆', date: '2026.02.03' }),
      ],
      memoriesStatus: 'ready',
      memoriesFilterMonth: '全部',
      memoriesFilterDay: null,
      memoriesSearchKeyword: '',
      memoriesSearchVisible: false,
    });

    const { getByLabelText, getByText, queryByText } = await render(<MemoriesScreen />);
    fireEvent.press(getByLabelText('选择回忆月份'));

    await waitFor(() => {
      expect(getByText('2026年1月')).toBeTruthy();
      expect(getByText('2026年2月')).toBeTruthy();
    });
    expect(queryByText('2024年9月')).toBeNull();
  });

  test('unsaved drafts do not create extra months or records in memories', async () => {
    const draftId = useAppStore.getState().beginCreation();
    useAppStore.getState().updateDraft(draftId, {
      title: '三月未保存草稿',
      date: '2026.03.08',
    });

    useAppStore.setState({
      memoriesSourceItems: [
        buildDiary({ id: 'diary-jan', title: '一月回忆', date: '2026.01.10' }),
        buildDiary({ id: 'diary-feb', title: '二月回忆', date: '2026.02.03' }),
      ],
      memoriesItems: [
        buildDiary({ id: 'diary-jan', title: '一月回忆', date: '2026.01.10' }),
        buildDiary({ id: 'diary-feb', title: '二月回忆', date: '2026.02.03' }),
      ],
      memoriesStatus: 'ready',
      memoriesFilterMonth: '全部',
      memoriesFilterDay: null,
      memoriesSearchKeyword: '',
      memoriesSearchVisible: false,
    });

    const { getByLabelText, getByText, queryByText } = await render(<MemoriesScreen />);
    fireEvent.press(getByLabelText('选择回忆月份'));

    await waitFor(() => {
      expect(getByText('2026年1月')).toBeTruthy();
      expect(getByText('2026年2月')).toBeTruthy();
    });

    expect(queryByText('2026年3月')).toBeNull();
    expect(queryByText('三月未保存草稿')).toBeNull();
  });

  test('pressing retry keeps the visible error state wired to the current retry action', async () => {
    const retryMemoriesSearch = jest.fn().mockResolvedValue(undefined);
    useAppStore.setState({
      memoriesSourceItems: [],
      memoriesItems: [],
      memoriesStatus: 'error',
      memoriesError: '网络开小差了',
      retryMemoriesSearch,
    });

    const { getByLabelText, getByText } = await render(<MemoriesScreen />);
    fireEvent.press(getByLabelText('重新加载'));

    expect(retryMemoriesSearch).toHaveBeenCalledTimes(1);
    expect(getByText('网络开小差了')).toBeTruthy();
  });

  test('opens the tapped diary detail and keeps the current filter state untouched', async () => {
    useAppStore.setState({
      memoriesSourceItems: [
        buildDiary({ id: 'diary-detail-1', title: '一月第一篇', date: '2026.01.10' }),
        buildDiary({ id: 'diary-detail-2', title: '一月第二篇', date: '2026.01.11' }),
      ],
      memoriesItems: [
        buildDiary({ id: 'diary-detail-1', title: '一月第一篇', date: '2026.01.10' }),
        buildDiary({ id: 'diary-detail-2', title: '一月第二篇', date: '2026.01.11' }),
      ],
      memoriesStatus: 'ready',
      memoriesFilterMonth: '2026.01',
      memoriesFilterDay: 11,
      memoriesSearchKeyword: '一月',
      memoriesSearchVisible: true,
    });

    const { getByLabelText } = await render(<MemoriesScreen />);
    fireEvent.press(getByLabelText('一月第二篇，2026.01.11'));

    expect(mockRouter.push).toHaveBeenCalledWith('/diary/diary-detail-2');
    expect(useAppStore.getState().memoriesFilterMonth).toBe('2026.01');
    expect(useAppStore.getState().memoriesFilterDay).toBe(11);
    expect(useAppStore.getState().memoriesSearchKeyword).toBe('一月');
  });

  test('same-title memory cards still open the tapped diary id', async () => {
    useAppStore.setState({
      memoriesSourceItems: [
        buildDiary({ id: 'diary-same-title-1', title: '同名回忆', date: '2026.01.10' }),
        buildDiary({ id: 'diary-same-title-2', title: '同名回忆', date: '2026.01.11' }),
      ],
      memoriesItems: [
        buildDiary({ id: 'diary-same-title-1', title: '同名回忆', date: '2026.01.10' }),
        buildDiary({ id: 'diary-same-title-2', title: '同名回忆', date: '2026.01.11' }),
      ],
      memoriesStatus: 'ready',
      memoriesFilterMonth: '2026.01',
      memoriesFilterDay: null,
      memoriesSearchKeyword: '',
      memoriesSearchVisible: false,
    });

    const { getByLabelText } = await render(<MemoriesScreen />);

    fireEvent.press(getByLabelText('同名回忆，2026.01.11'));

    expect(mockRouter.push).toHaveBeenCalledWith('/diary/diary-same-title-2');
  });

  test('recent memories cards use a unique label and still open the tapped diary id', async () => {
    useAppStore.setState({
      memoriesSourceItems: [
        buildDiary({ id: 'diary-recent-1', title: '刚写好的回忆', date: '2026.01.11', createdInSession: true }),
        buildDiary({ id: 'diary-recent-2', title: '更早的一篇', date: '2026.01.10' }),
      ],
      memoriesItems: [
        buildDiary({ id: 'diary-recent-1', title: '刚写好的回忆', date: '2026.01.11', createdInSession: true }),
        buildDiary({ id: 'diary-recent-2', title: '更早的一篇', date: '2026.01.10' }),
      ],
      memoriesStatus: 'ready',
      memoriesFilterMonth: '2026.01',
      memoriesFilterDay: null,
      memoriesSearchKeyword: '',
      memoriesSearchVisible: false,
    });

    const { getByLabelText } = await render(<MemoriesScreen />);

    fireEvent.press(getByLabelText('刚刚写下的回忆，刚写好的回忆，2026.01.11'));

    expect(mockRouter.push).toHaveBeenCalledWith('/diary/diary-recent-1');
    expect(useAppStore.getState().memoriesFilterMonth).toBe('2026.01');
    expect(useAppStore.getState().memoriesFilterDay).toBeNull();
  });

  test('recent and regular cards with the same title still route by their own diary ids', async () => {
    useAppStore.setState({
      memoriesSourceItems: [
        buildDiary({ id: 'diary-recent-same', title: '同名回忆', date: '2026.01.11', createdInSession: true }),
        buildDiary({ id: 'diary-list-same', title: '同名回忆', date: '2026.01.12', createdInSession: false }),
      ],
      memoriesItems: [
        buildDiary({ id: 'diary-recent-same', title: '同名回忆', date: '2026.01.11', createdInSession: true }),
        buildDiary({ id: 'diary-list-same', title: '同名回忆', date: '2026.01.12', createdInSession: false }),
      ],
      memoriesStatus: 'ready',
      memoriesFilterMonth: '2026.01',
      memoriesFilterDay: null,
      memoriesSearchKeyword: '',
      memoriesSearchVisible: false,
    });

    const { getByLabelText } = await render(<MemoriesScreen />);

    await waitFor(() => {
      expect(getByLabelText('刚刚写下的回忆，同名回忆，2026.01.11')).toBeTruthy();
      expect(getByLabelText('同名回忆，2026.01.12')).toBeTruthy();
    });

    await act(async () => {
      fireEvent.press(getByLabelText('刚刚写下的回忆，同名回忆，2026.01.11'));
    });
    expect(mockRouter.push).toHaveBeenLastCalledWith('/diary/diary-recent-same');

    await act(async () => {
      fireEvent.press(getByLabelText('同名回忆，2026.01.12'));
    });
    expect(mockRouter.push).toHaveBeenLastCalledWith('/diary/diary-list-same');
  });

  test('selecting a day keeps the filter after closing the picker and display all clears month/day', async () => {
    useAppStore.setState({
      memoriesSourceItems: [
        buildDiary({ id: 'diary-day-1', title: '一月十日', date: '2026.01.10' }),
        buildDiary({ id: 'diary-day-2', title: '一月十一日', date: '2026.01.11' }),
        buildDiary({ id: 'diary-day-3', title: '二月三日', date: '2026.02.03' }),
      ],
      memoriesItems: [
        buildDiary({ id: 'diary-day-1', title: '一月十日', date: '2026.01.10' }),
        buildDiary({ id: 'diary-day-2', title: '一月十一日', date: '2026.01.11' }),
        buildDiary({ id: 'diary-day-3', title: '二月三日', date: '2026.02.03' }),
      ],
      memoriesStatus: 'ready',
      memoriesFilterMonth: '2026.01',
      memoriesFilterDay: 10,
      memoriesSearchKeyword: '',
      memoriesSearchVisible: false,
    });

    const { getByLabelText, getByText } = await render(<MemoriesScreen />);

    fireEvent.press(getByLabelText('选择回忆月份'));
    await waitFor(() => {
      expect(getByLabelText('选择10日')).toBeTruthy();
    });
    fireEvent.press(getByLabelText('选择10日'));

    await waitFor(() => {
      expect(useAppStore.getState().memoriesFilterMonth).toBe('2026.01');
      expect(useAppStore.getState().memoriesFilterDay).toBe(10);
      expect(getByText('查看10日的回忆　·　显示全部')).toBeTruthy();
    });

    fireEvent.press(getByText('查看10日的回忆　·　显示全部'));

    expect(useAppStore.getState().memoriesFilterMonth).toBe('全部');
    expect(useAppStore.getState().memoriesFilterDay).toBeNull();
  });

  test('serializes display-format month and day filters to the query contract', async () => {
    const searchMemories = jest.fn();
    useAppStore.setState({
      memoriesSourceItems: [buildDiary({ id: 'diary-filter-date', date: '2026.02.03' })],
      memoriesItems: [buildDiary({ id: 'diary-filter-date', date: '2026.02.03' })],
      memoriesStatus: 'ready',
      memoriesFilterMonth: '2026.02',
      memoriesFilterDay: 3,
      memoriesSearchKeyword: '厦门',
      searchMemories,
    });

    await render(<MemoriesScreen />);

    await waitFor(() => {
      expect(searchMemories).toHaveBeenCalledWith({
        month: '2026-02',
        day: '2026-02-03',
        keyword: '厦门',
        page: 1,
        pageSize: 100,
      });
    });
  });

  test('reselecting a month clears the previous day filter', async () => {
    useAppStore.setState({
      memoriesSourceItems: [
        buildDiary({ id: 'diary-clear-1', title: '一月十日', date: '2026.01.10' }),
        buildDiary({ id: 'diary-clear-2', title: '二月三日', date: '2026.02.03' }),
      ],
      memoriesItems: [
        buildDiary({ id: 'diary-clear-1', title: '一月十日', date: '2026.01.10' }),
        buildDiary({ id: 'diary-clear-2', title: '二月三日', date: '2026.02.03' }),
      ],
      memoriesStatus: 'ready',
      memoriesFilterMonth: '2026.01',
      memoriesFilterDay: 10,
      memoriesSearchKeyword: '',
      memoriesSearchVisible: false,
    });

    const { getByLabelText, getByText } = await render(<MemoriesScreen />);

    fireEvent.press(getByLabelText('选择回忆月份'));
    await waitFor(() => {
      expect(getByText('2026年2月')).toBeTruthy();
    });
    fireEvent.press(getByText('2026年2月'));

    await waitFor(() => {
      expect(useAppStore.getState().memoriesFilterMonth).toBe('2026.02');
      expect(useAppStore.getState().memoriesFilterDay).toBeNull();
    });
  });

  test('switching between January, February and all memories updates the visible result set', async () => {
    const sourceItems = [
      buildDiary({ id: 'diary-month-jan-1', title: '一月回忆一', date: '2026.01.10' }),
      buildDiary({ id: 'diary-month-jan-2', title: '一月回忆二', date: '2026.01.11' }),
      buildDiary({ id: 'diary-month-feb-1', title: '二月回忆一', date: '2026.02.03' }),
    ];

    useAppStore.setState({
      memoriesSourceItems: sourceItems,
      memoriesItems: sourceItems.filter(item => item.date.startsWith('2026.01')),
      memoriesStatus: 'ready',
      memoriesFilterMonth: '2026.01',
      memoriesFilterDay: null,
      memoriesSearchKeyword: '',
      memoriesSearchVisible: false,
    });

    const { getByLabelText, getByText, queryByText } = await render(<MemoriesScreen />);

    expect(getByText('一月回忆一')).toBeTruthy();
    expect(getByText('一月回忆二')).toBeTruthy();
    expect(queryByText('二月回忆一')).toBeNull();

    fireEvent.press(getByLabelText('选择回忆月份'));
    await waitFor(() => {
      expect(getByText('2026年2月')).toBeTruthy();
    });
    fireEvent.press(getByText('2026年2月'));

    await waitFor(() => {
      expect(useAppStore.getState().memoriesFilterMonth).toBe('2026.02');
    });
    await act(async () => {
      useAppStore.setState({
        memoriesItems: sourceItems.filter(item => item.date.startsWith('2026.02')),
      });
    });
    expect(getByText('二月回忆一')).toBeTruthy();
    expect(queryByText('一月回忆一')).toBeNull();
    expect(queryByText('一月回忆二')).toBeNull();

    fireEvent.press(getByLabelText('选择回忆月份'));
    await waitFor(() => {
      expect(getByText('全部回忆')).toBeTruthy();
    });
    fireEvent.press(getByText('全部回忆'));

    await waitFor(() => {
      expect(useAppStore.getState().memoriesFilterMonth).toBe('全部');
    });
    await act(async () => {
      useAppStore.setState({
        memoriesItems: sourceItems,
      });
    });
    expect(getByText('一月回忆一')).toBeTruthy();
    expect(getByText('一月回忆二')).toBeTruthy();
    expect(getByText('二月回忆一')).toBeTruthy();
  });

  test('week bar and calendar only mark dates that have saved memories in the selected month', async () => {
    useAppStore.setState({
      memoriesSourceItems: [
        buildDiary({ id: 'diary-marker-1', title: '一月十九日', date: '2026.01.19' }),
        buildDiary({ id: 'diary-marker-2', title: '一月二十日', date: '2026.01.20' }),
      ],
      memoriesItems: [
        buildDiary({ id: 'diary-marker-1', title: '一月十九日', date: '2026.01.19' }),
        buildDiary({ id: 'diary-marker-2', title: '一月二十日', date: '2026.01.20' }),
      ],
      memoriesStatus: 'ready',
      memoriesFilterMonth: '2026.01',
      memoriesFilterDay: null,
      memoriesSearchKeyword: '',
      memoriesSearchVisible: false,
    });

    const { getByLabelText, queryByLabelText } = await render(<MemoriesScreen />);

    expect(getByLabelText('周条有回忆-2026.01-19')).toBeTruthy();
    expect(getByLabelText('周条有回忆-2026.01-20')).toBeTruthy();
    expect(queryByLabelText('周条有回忆-2026.01-21')).toBeNull();

    fireEvent.press(getByLabelText('选择回忆月份'));
    await waitFor(() => {
      expect(getByLabelText('月历有回忆-2026.01-19')).toBeTruthy();
      expect(getByLabelText('月历有回忆-2026.01-20')).toBeTruthy();
    });
    expect(queryByLabelText('月历有回忆-2026.01-21')).toBeNull();
  });

  test('recent memories group follows current results and hides while searching or showing all months', async () => {
    useAppStore.setState({
      memoriesSourceItems: [
        buildDiary({ id: 'recent-1', title: '刚写完的旅行', date: '2026.01.10', createdInSession: true }),
        buildDiary({ id: 'recent-2', title: '旧的旅行', date: '2026.01.08', createdInSession: false }),
        buildDiary({ id: 'recent-3', title: '二月新回忆', date: '2026.02.03', createdInSession: true }),
      ],
      memoriesItems: [
        buildDiary({ id: 'recent-1', title: '刚写完的旅行', date: '2026.01.10', createdInSession: true }),
        buildDiary({ id: 'recent-2', title: '旧的旅行', date: '2026.01.08', createdInSession: false }),
      ],
      memoriesStatus: 'ready',
      memoriesFilterMonth: '2026.01',
      memoriesFilterDay: null,
      memoriesSearchKeyword: '',
      memoriesSearchVisible: false,
    });

    const screen = await render(<MemoriesScreen />);

    expect(screen.getByText('刚刚写下的回忆')).toBeTruthy();
    expect(screen.getAllByText('刚写完的旅行')).toHaveLength(2);
    expect(screen.queryByText('二月新回忆')).toBeNull();

    await act(async () => {
      useAppStore.setState({
        memoriesSearchKeyword: '旅行',
      });
    });
    await waitFor(() => {
      expect(screen.queryByText('刚刚写下的回忆')).toBeNull();
      expect(screen.getAllByText('刚写完的旅行')).toHaveLength(1);
    });

    await act(async () => {
      useAppStore.setState({
        memoriesSearchKeyword: '',
        memoriesFilterMonth: '全部',
      });
    });
    await waitFor(() => {
      expect(screen.queryByText('刚刚写下的回忆')).toBeNull();
      expect(screen.getAllByText('刚写完的旅行')).toHaveLength(1);
    });
  });

  test('opens the postcard application page from the memories photo entry', async () => {
    useAppStore.setState({
      memoriesSourceItems: [],
      memoriesItems: [],
      memoriesStatus: 'ready',
      memoriesFilterMonth: '全部',
      memoriesFilterDay: null,
      memoriesSearchKeyword: '',
      memoriesSearchVisible: false,
    });
    const screen = await render(<MemoriesScreen />);

    fireEvent.press(screen.getByText('选择真实照片 ›').parent!);

    expect(mockRouter.push).toHaveBeenCalledWith('/postcard/apply');
  });
});
