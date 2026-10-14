import React from 'react';
import { fireEvent, render, waitFor } from '@testing-library/react-native';
import CompleteScreen from '../create/complete';
import DetailScreen from '../diary/[id]';
import { createTestStore } from '../../src/test-utils/create-test-store';
import { useAppStore } from '../../src/store/use-app-store';
import type { AppStore } from '../../src/store/use-app-store';

const mockRouter = {
  push: jest.fn(),
  replace: jest.fn(),
  dismissAll: jest.fn(),
  setParams: jest.fn(),
  canGoBack: jest.fn(() => false),
  back: jest.fn(),
};

const mockParams: { id?: string; diaryId?: string } = {};
const createDeferred = <T,>() => {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>(res => {
    resolve = res;
  });
  return { promise, resolve };
};

jest.mock('expo-router', () => ({
  useRouter: () => mockRouter,
  useLocalSearchParams: () => mockParams,
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
  TopBar: ({ onBackPress, trailing }: { onBackPress?: () => void; trailing?: React.ReactNode }) => {
    const { Pressable, Text, View } = require('react-native');
    return (
      <View>
        <Pressable accessibilityLabel="返回" onPress={onBackPress}>
          <Text>返回</Text>
        </Pressable>
        {trailing}
      </View>
    );
  },
}));

jest.mock('../../src/components/common/design-ui', () => ({
  Empty: ({ title, detail }: { title?: string; detail?: string }) => {
    const { Text, View } = require('react-native');
    return (
      <View>
        <Text>{title ?? '空'}</Text>
        {detail ? <Text>{detail}</Text> : null}
      </View>
    );
  },
}));

jest.mock('../../src/components/common/button', () => ({
  Button: ({ label, onPress }: { label: string; onPress?: () => void }) => {
    const { Pressable, Text } = require('react-native');
    return (
      <Pressable accessibilityRole="button" accessibilityLabel={label} onPress={onPress}>
        <Text>{label}</Text>
      </Pressable>
    );
  },
}));

jest.mock('../../src/components/diary/photo', () => ({
  Photo: ({ id }: { id: string }) => {
    const { Text } = require('react-native');
    return <Text>{`图片:${id}`}</Text>;
  },
}));

jest.mock('../../src/components/diary/diary-paper', () => ({
  DiaryPaper: ({ diary }: { diary: { id: string; title: string; summary: string } }) => {
    const { Text, View } = require('react-native');
    return (
      <View>
        <Text>{`日记卡片:${diary.id}`}</Text>
        <Text>{diary.title}</Text>
        <Text>{diary.summary}</Text>
      </View>
    );
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

describe('Saved diary screens', () => {
  beforeEach(() => {
    resetAppStore();
    jest.clearAllMocks();
    mockParams.id = undefined;
    mockParams.diaryId = undefined;
  });

  test('complete screen reads title, summary and photos from the saved diary', async () => {
    useAppStore.setState(state => ({
      diaries: [
        {
          ...state.diaries[0],
          id: 'diary-complete-1',
          title: '刚保存完成的日记',
          summary: '完成页应该展示这段真实摘要。',
          photoIds: ['photo-1', 'photo-2', 'photo-3'],
        },
        ...state.diaries.filter(item => item.id !== 'diary-complete-1'),
      ],
    }));
    mockParams.diaryId = 'diary-complete-1';

    const screen = await render(<CompleteScreen />);

    expect(screen.getByText(/刚保存完成的日记/)).toBeTruthy();
    expect(screen.getByText('完成页应该展示这段真实摘要。')).toBeTruthy();
    expect(screen.getByText('图片:photo-1')).toBeTruthy();
    expect(screen.getByText('图片:photo-2')).toBeTruthy();
    expect(screen.getByText('图片:photo-3')).toBeTruthy();

    fireEvent.press(screen.getByLabelText('查看我的日记 ✦'));
    expect(mockRouter.replace).toHaveBeenCalledWith('/diary/diary-complete-1');
  });

  test('detail screen reads the saved diary content after edit success', async () => {
    useAppStore.setState(state => ({
      diaries: state.diaries.map(item => item.id === 'diary-1'
        ? {
            ...item,
            title: '编辑后生效的新标题',
            summary: '详情页应该读到编辑后的摘要。',
            helperMessage: '这条锚点提示也要跟着已保存内容出现。',
          }
        : item),
    }));
    mockParams.id = 'diary-1';

    const screen = await render(<DetailScreen />);

    expect(screen.getByText('日记卡片:diary-1')).toBeTruthy();
    expect(screen.getByText('编辑后生效的新标题')).toBeTruthy();
    expect(screen.getByText('详情页应该读到编辑后的摘要。')).toBeTruthy();
    expect(screen.getByText('这条锚点提示也要跟着已保存内容出现。')).toBeTruthy();
  });

  test('detail screen can still read a historical emotion diary', async () => {
    mockParams.id = 'diary-3';

    const screen = await render(<DetailScreen />);

    expect(screen.getByText('日记卡片:diary-3')).toBeTruthy();
    expect(screen.getByText('给平凡日子的一束花')).toBeTruthy();
    expect(screen.getByText('路过花店的时候，给自己买了一束小雏菊。')).toBeTruthy();
    expect(screen.getByText('照顾好自己的小情绪，也是一件了不起的事。')).toBeTruthy();
  });

  test('detail screen does not treat an unsaved draft id as a real diary id', async () => {
    const draftId = useAppStore.getState().beginCreation();
    const round = useAppStore.getState().startGeneration(draftId)!;
    useAppStore.getState().finishGeneration(draftId, round);
    mockParams.id = draftId;

    const screen = await render(<DetailScreen />);

    expect(screen.getByText('没有找到这篇日记')).toBeTruthy();
    expect(screen.getByText('它可能还没有保存，或已被移出回忆。')).toBeTruthy();
    expect(screen.queryByText(`日记卡片:${draftId}`)).toBeNull();
  });

  test('detail screen keeps reading the tapped diary id even when another diary shares the same title', async () => {
    useAppStore.setState(state => ({
      diaries: state.diaries.map(item => {
        if (item.id === 'diary-1') {
          return {
            ...item,
            title: '同名的旅途日记',
            summary: '这是第一篇同名日记。',
            helperMessage: '第一篇的锚点提示。',
            photoIds: ['photo-1', 'photo-2', 'photo-3'],
          };
        }
        if (item.id === 'diary-2') {
          return {
            ...item,
            title: '同名的旅途日记',
            summary: '这是第二篇同名日记。',
            helperMessage: '第二篇的锚点提示。',
            photoIds: ['photo-11', 'photo-12', 'photo-1'],
          };
        }
        return item;
      }),
    }));
    mockParams.id = 'diary-2';

    const screen = await render(<DetailScreen />);

    expect(screen.getByText('日记卡片:diary-2')).toBeTruthy();
    expect(screen.getByText('这是第二篇同名日记。')).toBeTruthy();
    expect(screen.getByText('第二篇的锚点提示。')).toBeTruthy();
    expect(screen.queryByText('日记卡片:diary-1')).toBeNull();
    expect(screen.queryByText('这是第一篇同名日记。')).toBeNull();
    expect(screen.queryByText('第一篇的锚点提示。')).toBeNull();
  });

  test('detail back keeps the memories filters intact when returning to the memories context', async () => {
    mockRouter.canGoBack.mockReturnValue(true);
    useAppStore.setState({
      memoriesFilterMonth: '2026.01',
      memoriesFilterDay: 11,
      memoriesSearchKeyword: '海边',
      memoriesSearchVisible: true,
    });
    mockParams.id = 'diary-2';

    const screen = await render(<DetailScreen />);

    fireEvent.press(screen.getByLabelText('返回'));

    expect(mockRouter.back).toHaveBeenCalledTimes(1);
    expect(mockRouter.replace).not.toHaveBeenCalledWith('/(tabs)/memories');
    expect(useAppStore.getState().memoriesFilterMonth).toBe('2026.01');
    expect(useAppStore.getState().memoriesFilterDay).toBe(11);
    expect(useAppStore.getState().memoriesSearchKeyword).toBe('海边');
  });

  test('detail back falls back to the memories tab when no navigation history exists', async () => {
    mockRouter.canGoBack.mockReturnValue(false);
    useAppStore.setState({
      memoriesFilterMonth: '2026.01',
      memoriesFilterDay: 11,
      memoriesSearchKeyword: '海边',
      memoriesSearchVisible: true,
    });
    mockParams.id = 'diary-2';

    const screen = await render(<DetailScreen />);

    fireEvent.press(screen.getByLabelText('返回'));

    expect(mockRouter.back).not.toHaveBeenCalled();
    expect(mockRouter.replace).toHaveBeenCalledWith('/(tabs)/memories');
    expect(useAppStore.getState().memoriesFilterMonth).toBe('2026.01');
    expect(useAppStore.getState().memoriesFilterDay).toBe(11);
    expect(useAppStore.getState().memoriesSearchKeyword).toBe('海边');
  });

  test('detail screen reloads the saved diary when only a memory summary placeholder exists', async () => {
    useAppStore.setState(state => ({
      diaries: state.diaries.map(item => item.id === 'diary-1'
        ? {
            ...item,
            title: '回忆列表里的摘要标题',
            summary: '这里只是回忆列表摘要。',
            blocks: [
              {
                id: 'diary-1-summary',
                type: 'text',
                title: '这段回忆',
                content: '这里只是回忆列表摘要。',
                photoIds: ['photo-1'],
              },
            ],
          }
        : item),
      readDiaryById: jest.fn().mockResolvedValue({
        ok: true,
        diary: {
          ...useAppStore.getState().diaries.find(item => item.id === 'diary-1')!,
          title: '远端补全后的真实标题',
          summary: '远端补全后的摘要。',
        },
      }),
    }));
    mockParams.id = 'diary-1';

    const screen = await render(<DetailScreen />);

    await waitFor(() => expect(screen.getByText('远端补全后的真实标题')).toBeTruthy());
    expect(screen.getByText('远端补全后的摘要。')).toBeTruthy();
  });

  test('detail screen shows a reloadable error when the saved diary read fails', async () => {
    const readDiaryById = jest
      .fn()
      .mockResolvedValueOnce({ ok: false, reason: 'load_failed', message: '后端暂时不可用' })
      .mockResolvedValueOnce({
        ok: true,
        diary: {
          ...useAppStore.getState().diaries[0],
          id: 'diary-reload-1',
          title: '重新加载后读到了这篇日记',
          summary: '这次请求恢复正常。',
        },
      });
    useAppStore.setState({ readDiaryById });
    mockParams.id = 'diary-reload-1';

    const screen = await render(<DetailScreen />);

    await waitFor(() => expect(screen.getByText('暂时没把这篇日记读出来')).toBeTruthy());
    expect(screen.getByText('后端暂时不可用')).toBeTruthy();

    fireEvent.press(screen.getByLabelText('重新加载'));
    await waitFor(() => expect(screen.getByText('重新加载后读到了这篇日记')).toBeTruthy());
    expect(readDiaryById).toHaveBeenCalledTimes(2);
  });

  test('detail screen ignores an older delayed read after route switch', async () => {
    useAppStore.setState(state => ({
      diaries: state.diaries.map(item => (item.id === 'diary-1' || item.id === 'diary-2')
        ? {
            ...item,
            blocks: [
              {
                id: `${item.id}-summary`,
                type: 'text',
                title: '这段回忆',
                content: `${item.title}的摘要占位`,
                photoIds: [item.photoIds[0]],
              },
            ],
          }
        : item),
    }));
    const first = createDeferred<{ ok: true; diary: AppStore['diaries'][number] }>();
    const second = createDeferred<{ ok: true; diary: AppStore['diaries'][number] }>();
    useAppStore.setState({
      readDiaryById: jest.fn((id: string) => {
        if (id === 'diary-1') return first.promise;
        return second.promise;
      }),
    });

    mockParams.id = 'diary-1';
    const screen = await render(<DetailScreen />);

    mockParams.id = 'diary-2';
    await screen.rerender(<DetailScreen />);

    second.resolve({
      ok: true,
      diary: {
        ...useAppStore.getState().diaries.find(item => item.id === 'diary-2')!,
        title: '当前应该显示第二篇日记',
        summary: '第二篇日记的内容先返回。',
      },
    });
    await waitFor(() => expect(screen.getByText('当前应该显示第二篇日记')).toBeTruthy());

    first.resolve({
      ok: true,
      diary: {
        ...useAppStore.getState().diaries.find(item => item.id === 'diary-1')!,
        title: '迟到的第一篇日记',
        summary: '这条结果不该覆盖当前详情。',
      },
    });

    await waitFor(() => expect(screen.queryByText('迟到的第一篇日记')).toBeNull());
    expect(screen.getByText('当前应该显示第二篇日记')).toBeTruthy();
  });

  test('complete screen falls back to empty state when diary id is missing', async () => {
    mockParams.diaryId = 'diary-not-found';

    const screen = await render(<CompleteScreen />);

    expect(screen.getByText('日记尚未保存')).toBeTruthy();
    expect(screen.queryByText('查看我的日记 ✦')).toBeNull();
  });
});
