import React from 'react';
import { cleanup, fireEvent, render, waitFor } from '@testing-library/react-native';
import PrivacyScreen from '../share/privacy';
import { createTestStore } from '../../src/test-utils/create-test-store';
import { publicParagraphs, useAppStore } from '../../src/store/use-app-store';
import type { AppStore } from '../../src/store/use-app-store';

const mockRouter = {
  back: jest.fn(),
  push: jest.fn(),
};

const mockParams: { diaryId?: string; returnTo?: string } = {};
const actualSetDiaryVisibility = useAppStore.getState().setDiaryVisibility;

jest.mock('expo-router', () => ({
  useRouter: () => mockRouter,
  useLocalSearchParams: () => mockParams,
}));

jest.mock('@expo/vector-icons', () => {
  const { Text } = require('react-native');
  return {
    Ionicons: ({ name }: { name: string }) => <Text>{name}</Text>,
  };
});

jest.mock('../../src/components/common/button', () => ({
  Button: ({ label, onPress, disabled }: { label: string; onPress?: () => void; disabled?: boolean }) => {
    const { Pressable, Text } = require('react-native');
    return (
      <Pressable accessibilityRole="button" accessibilityLabel={label} accessibilityState={{ disabled }} disabled={disabled} onPress={onPress}>
        <Text>{label}</Text>
      </Pressable>
    );
  },
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

jest.mock('../../src/components/layout/top-bar', () => ({
  TopBar: ({ title, onBackPress }: { title?: string; onBackPress?: () => void }) => {
    const { Pressable, Text, View } = require('react-native');
    return (
      <View>
        <Text>{title}</Text>
        <Pressable accessibilityRole="button" accessibilityLabel="返回" onPress={onBackPress}>
          <Text>返回</Text>
        </Pressable>
      </View>
    );
  },
}));

jest.mock('../../src/components/diary/photo', () => ({
  Photo: ({ id }: { id?: string }) => {
    const { Text } = require('react-native');
    return <Text>{id ?? 'no-photo'}</Text>;
  },
}));

jest.mock('../../src/components/common/design-ui', () => ({
  Empty: ({ title, detail }: { title?: string; detail?: string }) => {
    const { Text, View } = require('react-native');
    return (
      <View>
        <Text>{title ?? '空'}</Text>
        <Text>{detail ?? ''}</Text>
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

describe('Privacy screen entry flow', () => {
  beforeEach(() => {
    resetAppStore();
    useAppStore.setState({ setDiaryVisibility: actualSetDiaryVisibility });
    jest.clearAllMocks();
    mockParams.diaryId = 'diary-1';
    mockParams.returnTo = undefined;
  });

  afterEach(() => {
    cleanup();
  });

  test('opens newly saved diaries as private by default', async () => {
    const setDiaryVisibility = jest.fn();
    useAppStore.setState({ setDiaryVisibility });
    const screen = await render(<PrivacyScreen />);

    await waitFor(() => {
      expect(screen.getByLabelText('私密 · 仅自己可见')).toBeTruthy();
    });

    expect(screen.getByLabelText('私密 · 仅自己可见').props.accessibilityState.selected).toBe(true);
    expect(screen.getByLabelText('匿名公开 · 独立马甲').props.accessibilityState.selected).toBe(false);
    expect(setDiaryVisibility).not.toHaveBeenCalled();
    expect(mockRouter.back).not.toHaveBeenCalled();
    expect(mockRouter.push).not.toHaveBeenCalled();
  });

  test.each([
    ['private', '私密 · 仅自己可见'],
    ['anonymous', '匿名公开 · 独立马甲'],
    ['public-likes', '公开 · 仅点赞'],
  ] as const)('reopens with the saved visibility for %s', async (privacy, label) => {
    const diary = useAppStore.getState().diaries.find(item => item.id === 'diary-1');
    if (!diary) {
      throw new Error('expected diary-1 to exist');
    }
    const blocks = publicParagraphs(diary);
    const selectedBlock = blocks[0];
    const unselectedBlock = blocks[1];
    useAppStore.setState({
      diaries: useAppStore.getState().diaries.map(item =>
        item.id === 'diary-1'
          ? {
              ...item,
              privacy,
              publicBlockIds: privacy === 'private' ? undefined : [selectedBlock.id],
            }
          : item,
      ),
    });

    const screen = await render(<PrivacyScreen />);

    await waitFor(() => {
      expect(screen.getByLabelText(label)).toBeTruthy();
    });

    expect(screen.getByLabelText(label).props.accessibilityState.selected).toBe(true);
    expect(screen.getByLabelText(`公开内容：${selectedBlock.content}`).props.accessibilityState.checked).toBe(true);
    if (unselectedBlock) {
      expect(screen.getByLabelText(`公开内容：${unselectedBlock.content}`).props.accessibilityState.checked).toBe(privacy === 'private');
    }
  });

  test('hides comments and maps a legacy saved value to public likes', async () => {
    const diary = useAppStore.getState().diaries.find(item => item.id === 'diary-1');
    if (!diary) throw new Error('expected diary-1 to exist');
    const selectedIds = publicParagraphs(diary).slice(0, 1).map(block => block.id);
    useAppStore.setState({
      diaries: useAppStore.getState().diaries.map(item =>
        item.id === 'diary-1'
          ? { ...item, privacy: 'public-comments', publicBlockIds: selectedIds }
          : item,
      ),
    });
    const setDiaryVisibility = jest.fn().mockResolvedValue({
      ok: true as const,
      privacy: 'public-likes' as const,
      publicBlockIds: selectedIds,
    });
    useAppStore.setState({ setDiaryVisibility });

    const screen = await render(<PrivacyScreen />);
    await waitFor(() => {
      expect(screen.getByLabelText('公开 · 仅点赞').props.accessibilityState.selected).toBe(true);
    });
    expect(screen.queryByLabelText('公开 · 可评论')).toBeNull();

    fireEvent.press(screen.getByText('完成'));
    await waitFor(() => {
      expect(setDiaryVisibility).toHaveBeenCalledWith('diary-1', 'public-likes', selectedIds);
    });
  });

  test('leaving before finishing keeps the saved privacy unchanged and does not submit', async () => {
    const setDiaryVisibility = jest.fn();
    useAppStore.setState({ setDiaryVisibility });
    const before = useAppStore.getState().diaries.find(item => item.id === 'diary-1');

    const screen = await render(<PrivacyScreen />);
    await waitFor(() => {
      expect(screen.getByLabelText('公开 · 仅点赞')).toBeTruthy();
    });

    fireEvent.press(screen.getByLabelText('公开 · 仅点赞'));
    fireEvent.press(screen.getByLabelText('返回'));

    expect(mockRouter.back).toHaveBeenCalledTimes(1);
    expect(setDiaryVisibility).not.toHaveBeenCalled();
    expect(useAppStore.getState().diaries.find(item => item.id === 'diary-1')).toEqual(before);
  });

  test('shows the empty state for an invalid diary id without mutating other diaries', async () => {
    mockParams.diaryId = 'missing-diary';
    const beforeDiary1 = useAppStore.getState().diaries.find(item => item.id === 'diary-1');
    const beforeDiary2 = useAppStore.getState().diaries.find(item => item.id === 'diary-2');

    const screen = await render(<PrivacyScreen />);

    await waitFor(() => {
      expect(screen.getByText('没有找到这篇日记')).toBeTruthy();
    });
    expect(screen.queryByLabelText('完成')).toBeNull();
    expect(useAppStore.getState().diaries.find(item => item.id === 'diary-1')).toEqual(beforeDiary1);
    expect(useAppStore.getState().diaries.find(item => item.id === 'diary-2')).toEqual(beforeDiary2);
  });
});
