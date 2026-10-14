import React from 'react';
import { Alert } from 'react-native';
import { act, fireEvent, render, waitFor } from '@testing-library/react-native';
import MonthlyScreen from '../profile/monthly';
import { createTestStore } from '../../src/test-utils/create-test-store';
import { getHistoryGroups, useAppStore } from '../../src/store/use-app-store';
import type { AppStore } from '../../src/store/use-app-store';
import type { DiaryItem } from '../../src/types/diary';

const mockRouter = {
  push: jest.fn(),
  replace: jest.fn(),
  dismissAll: jest.fn(),
  setParams: jest.fn(),
  canGoBack: jest.fn(),
  back: jest.fn(),
};

const mockParams: { month?: string } = {};

jest.mock('expo-router', () => ({
  useRouter: () => mockRouter,
  useLocalSearchParams: () => mockParams,
}));

jest.mock('../../src/components/layout/screen', () => ({
  Screen: ({ children, header }: { children: React.ReactNode; header?: React.ReactNode }) => {
    const { View } = require('react-native');
    return (
      <View>
        {header}
        {children}
      </View>
    );
  },
}));

jest.mock('../../src/components/layout/top-bar', () => ({
  TopBar: ({ title }: { title?: string }) => {
    const { Text, View } = require('react-native');
    return (
      <View>
        {title ? <Text>{title}</Text> : null}
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
    return visible ? <View accessibilityLabel={title ?? '月度合集'}>{children}</View> : null;
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

function buildMonthlySnapshot(groupId: string, diaries = useAppStore.getState().diaries) {
  const group = getHistoryGroups(diaries).find(item => item.id === groupId);
  if (!group) {
    throw new Error(`expected monthly group ${groupId} to exist`);
  }
  return {
    groupId: group.id,
    monthLabel: group.label,
    diaryIds: [...group.diaryIds],
    diaries: group.diaryIds.map(id => {
      const diary = diaries.find(item => item.id === id);
      if (!diary) {
        throw new Error(`expected diary ${id} to exist`);
      }
      return {
        id: diary.id,
        title: diary.title,
        date: diary.date,
        version: diary.version,
      };
    }),
  };
}

describe('Monthly screen', () => {
  let alertSpy: jest.SpyInstance;

  beforeEach(() => {
    resetAppStore();
    jest.clearAllMocks();
    mockParams.month = undefined;
    alertSpy = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
  });

  afterEach(() => {
    alertSpy.mockRestore();
  });

  test('preselects the requested month and only lists saved diaries from that month', async () => {
    mockParams.month = '2026-01';
    useAppStore.setState({
      diaries: [
        buildDiary({ id: 'diary-jan-1', title: '同名回忆', date: '2026.01.10' }),
        buildDiary({ id: 'diary-jan-2', title: '同名回忆', date: '2026.01.11' }),
        buildDiary({ id: 'diary-feb-1', title: '二月回忆', date: '2026.02.03' }),
      ],
    });

    const { getByLabelText, getByText, queryByText } = await render(<MonthlyScreen />);

    await waitFor(() => {
      expect(getByLabelText('2026年1月 · 月度合集')).toBeTruthy();
    });

    expect(getByLabelText('打开2026年1月合集')).toBeTruthy();
    expect(getByLabelText('打开2026年2月合集')).toBeTruthy();
    expect(getByText('2 篇回忆 · 点击翻阅')).toBeTruthy();
    expect(getByText('1 篇回忆 · 点击翻阅')).toBeTruthy();
    expect(queryByText('二月回忆')).toBeNull();
    expect(getByLabelText('打开同名回忆，2026.01.10')).toBeTruthy();
    expect(getByLabelText('打开同名回忆，2026.01.11')).toBeTruthy();
  });

  test('opens the tapped diary from the selected monthly collection', async () => {
    mockParams.month = '2026-01';
    useAppStore.setState({
      diaries: [
        buildDiary({ id: 'diary-jan-1', title: '同名回忆', date: '2026.01.10' }),
        buildDiary({ id: 'diary-jan-2', title: '同名回忆', date: '2026.01.11' }),
        buildDiary({ id: 'diary-feb-1', title: '二月回忆', date: '2026.02.03' }),
      ],
    });

    const { getByLabelText } = await render(<MonthlyScreen />);

    await waitFor(() => {
      expect(getByLabelText('打开同名回忆，2026.01.11')).toBeTruthy();
    });

    fireEvent.press(getByLabelText('打开同名回忆，2026.01.11'));

    expect(mockRouter.push).toHaveBeenCalledWith('/diary/diary-jan-2');
  });

  test('shows the recorded empty state without fake monthly groups when there are no saved diaries', async () => {
    useAppStore.setState({ diaries: [] });

    const { getByText, queryByText, queryByLabelText } = await render(<MonthlyScreen />);

    expect(getByText('先写下第一篇日记吧')).toBeTruthy();
    expect(queryByText('导出这个月的回忆')).toBeNull();
    expect(queryByLabelText('2026年1月 · 月度合集')).toBeNull();
    expect(queryByLabelText(/打开.*合集/)).toBeNull();
  });

  test('does not show a success alert when the current monthly export fails', async () => {
    mockParams.month = '2026-01';
    useAppStore.setState({
      diaries: [
        buildDiary({ id: 'diary-jan-1', title: '一月回忆一', date: '2026.01.10', version: 3 }),
        buildDiary({ id: 'diary-jan-2', title: '一月回忆二', date: '2026.01.11', version: 4 }),
      ],
      startMonthlyExport: async groupId => {
        const snapshot = buildMonthlySnapshot(groupId);
        useAppStore.setState({
          monthlyExport: {
            requestId: 1,
            status: 'running',
            groupId: snapshot.groupId,
            monthLabel: snapshot.monthLabel,
            snapshot,
          },
        });
        await Promise.resolve();
        useAppStore.setState({
          monthlyExport: {
            requestId: 1,
            status: 'failed',
            groupId: snapshot.groupId,
            monthLabel: snapshot.monthLabel,
            snapshot,
            error: '月度导出失败，请稍后重试。',
          },
        });
        return {
          ok: false as const,
          requestId: 1,
          reason: 'failed' as const,
          message: '月度导出失败，请稍后重试。',
        };
      },
    });
    const originalDiaries = useAppStore.getState().diaries.map(diary => ({ id: diary.id, title: diary.title, version: diary.version }));

    const screen = await render(<MonthlyScreen />);

    await waitFor(() => {
      expect(screen.getByLabelText('导出这个月的回忆')).toBeTruthy();
    });

    await act(async () => {
      fireEvent.press(screen.getByLabelText('导出这个月的回忆'));
      await Promise.resolve();
    });

    await waitFor(() => {
      expect(alertSpy).toHaveBeenCalledWith('导出失败', '月度导出失败，请稍后重试。');
    });

    expect(useAppStore.getState().monthlyExport.status).toBe('failed');
    expect(useAppStore.getState().diaries.map(diary => ({ id: diary.id, title: diary.title, version: diary.version }))).toEqual(originalDiaries);
    expect(alertSpy).not.toHaveBeenCalledWith('月度装订演示', expect.any(String));
  });

  test('shows the cancel action and cancellation alert for the current export', async () => {
    mockParams.month = '2026-01';
    useAppStore.setState({
      diaries: [
        buildDiary({ id: 'diary-jan-1', title: '一月回忆一', date: '2026.01.10' }),
        buildDiary({ id: 'diary-jan-2', title: '一月回忆二', date: '2026.01.11' }),
      ],
      startMonthlyExport: async groupId => {
        const snapshot = buildMonthlySnapshot(groupId);
        useAppStore.setState({
          monthlyExport: {
            requestId: 2,
            status: 'running',
            groupId: snapshot.groupId,
            monthLabel: snapshot.monthLabel,
            snapshot,
          },
        });
        return new Promise(() => {});
      },
      cancelMonthlyExport: () => {
        const current = useAppStore.getState().monthlyExport;
        useAppStore.setState({
          monthlyExport: {
            ...current,
            status: 'cancelled',
            error: '本次月度导出已取消。',
          },
        });
      },
    });

    const screen = await render(<MonthlyScreen />);

    await waitFor(() => {
      expect(screen.getByLabelText('导出这个月的回忆')).toBeTruthy();
    });

    await act(async () => {
      fireEvent.press(screen.getByLabelText('导出这个月的回忆'));
      await Promise.resolve();
    });

    await waitFor(() => {
      expect(screen.getByLabelText('取消本次导出')).toBeTruthy();
      expect(screen.getByText('正在整理 2026年1月 的成员快照...')).toBeTruthy();
    });

    await act(async () => {
      fireEvent.press(screen.getByLabelText('取消本次导出'));
      await Promise.resolve();
    });

    await waitFor(() => {
      expect(alertSpy).toHaveBeenCalledWith('已取消', '本次月度导出已取消。');
    });

    expect(useAppStore.getState().monthlyExport.status).toBe('cancelled');
    expect(screen.queryByLabelText('取消本次导出')).toBeNull();
    expect(alertSpy).not.toHaveBeenCalledWith('月度装订演示', expect.any(String));
  });

  test('shows the overwrite hint when another month is already exporting', async () => {
    const diaries = [
      buildDiary({ id: 'diary-jan-1', title: '一月回忆一', date: '2026.01.10', version: 1 }),
      buildDiary({ id: 'diary-jan-2', title: '一月回忆二', date: '2026.01.11', version: 2 }),
      buildDiary({ id: 'diary-feb-1', title: '二月回忆', date: '2026.02.03', version: 5 }),
    ];
    useAppStore.setState({ diaries });
    useAppStore.setState({
      monthlyExport: {
        requestId: 3,
        status: 'running',
        groupId: 'history-2026-01',
        monthLabel: '2026年1月',
        snapshot: buildMonthlySnapshot('history-2026-01', diaries),
      },
    });

    const screen = await render(<MonthlyScreen />);

    await waitFor(() => {
      expect(screen.getByLabelText('打开2026年1月合集')).toBeTruthy();
      expect(screen.getByLabelText('打开2026年2月合集')).toBeTruthy();
    });

    fireEvent.press(screen.getByLabelText('打开2026年1月合集'));
    await waitFor(() => {
      expect(screen.getByText('正在整理 2026年1月 的成员快照...')).toBeTruthy();
    });

    fireEvent.press(screen.getByLabelText('打开2026年2月合集'));
    await waitFor(() => {
      expect(screen.getByLabelText('2026年2月 · 月度合集')).toBeTruthy();
      expect(screen.getByLabelText('导出这个月的回忆')).toBeTruthy();
      expect(screen.getByText('当前正在整理 2026年1月 的月度合集，重新导出会覆盖这次任务。')).toBeTruthy();
    });
  });
});
