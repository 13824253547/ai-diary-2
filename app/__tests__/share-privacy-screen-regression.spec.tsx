import React from 'react';
import { Alert } from 'react-native';
import { act, cleanup, fireEvent, render, waitFor } from '@testing-library/react-native';
import PrivacyScreen from '../share/privacy';
import { createTestStore } from '../../src/test-utils/create-test-store';
import { publicParagraphs } from '../../src/store/use-app-store';
import { useAppStore } from '../../src/store/use-app-store';
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

function createDeferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((nextResolve, nextReject) => {
    resolve = nextResolve;
    reject = nextReject;
  });
  return { promise, resolve, reject };
}

describe('Privacy screen regressions', () => {
  const alertSpy = jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);

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

  afterAll(() => {
    alertSpy.mockRestore();
  });

  test('keeps the page in place when remote visibility saving fails', async () => {
    const setDiaryVisibility = jest.fn().mockResolvedValue({
      ok: false as const,
      reason: 'save_failed' as const,
      message: '公开范围保存失败，请稍后重试。',
    });
    useAppStore.setState({ setDiaryVisibility });

    const screen = await render(<PrivacyScreen />);
    await waitFor(() => {
      expect(screen.getByText('完成')).toBeTruthy();
    });

    await act(async () => {
      fireEvent.press(screen.getByText('完成'));
    });

    await waitFor(() => {
      expect(setDiaryVisibility).toHaveBeenCalledTimes(1);
      expect(alertSpy).toHaveBeenCalledWith('保存失败', '公开范围保存失败，请稍后重试。');
    });
    expect(mockRouter.back).not.toHaveBeenCalled();
    expect(mockRouter.push).not.toHaveBeenCalled();
  });

  test('shows the target-missing failure without navigating away when the save target becomes invalid', async () => {
    const setDiaryVisibility = jest.fn().mockResolvedValue({
      ok: false as const,
      reason: 'not_found' as const,
      message: '没有找到这篇日记。',
    });
    useAppStore.setState({ setDiaryVisibility });

    const screen = await render(<PrivacyScreen />);
    await waitFor(() => {
      expect(screen.getByText('完成')).toBeTruthy();
    });

    await act(async () => {
      fireEvent.press(screen.getByText('完成'));
    });

    await waitFor(() => {
      expect(setDiaryVisibility).toHaveBeenCalledTimes(1);
      expect(alertSpy).toHaveBeenCalledWith('保存失败', '没有找到这篇日记。');
    });
    expect(mockRouter.back).not.toHaveBeenCalled();
    expect(mockRouter.push).not.toHaveBeenCalled();
  });

  test('reopens with the last saved visibility and selected blocks after a failed save attempt', async () => {
    const diary = useAppStore.getState().diaries.find(item => item.id === 'diary-1');
    if (!diary) {
      throw new Error('expected diary-1 to exist');
    }
    const blocks = publicParagraphs(diary);
    const firstBlock = blocks[0];
    const secondBlock = blocks[1];
    const otherDiary = useAppStore.getState().diaries.find(item => item.id === 'diary-2');
    if (!firstBlock || !secondBlock) {
      throw new Error('expected at least two public blocks');
    }
    if (!otherDiary) {
      throw new Error('expected diary-2 to exist');
    }

    useAppStore.setState({
      diaries: useAppStore.getState().diaries.map(item =>
        item.id === 'diary-1'
          ? {
              ...item,
              privacy: 'public-likes',
              publicBlockIds: [firstBlock.id],
            }
          : item,
      ),
    });

    const setDiaryVisibility = jest.fn().mockResolvedValue({
      ok: false as const,
      reason: 'save_failed' as const,
      message: '公开范围保存失败，请稍后重试。',
    });
    useAppStore.setState({ setDiaryVisibility });

    const screen = await render(<PrivacyScreen />);
    await waitFor(() => {
      expect(screen.getByLabelText('公开 · 仅点赞')).toBeTruthy();
    });

    expect(screen.getByLabelText('公开 · 仅点赞').props.accessibilityState.selected).toBe(true);
    expect(screen.getByLabelText(`公开内容：${firstBlock.content}`).props.accessibilityState.checked).toBe(true);
    expect(screen.getByLabelText(`公开内容：${secondBlock.content}`).props.accessibilityState.checked).toBe(false);

    await act(async () => {
      fireEvent.press(screen.getByLabelText('公开 · 可评论'));
      fireEvent.press(screen.getByLabelText(`公开内容：${firstBlock.content}`));
      fireEvent.press(screen.getByLabelText(`公开内容：${secondBlock.content}`));
    });

    await waitFor(() => {
      expect(screen.getByLabelText('公开 · 可评论').props.accessibilityState.selected).toBe(true);
      expect(screen.getByLabelText(`公开内容：${firstBlock.content}`).props.accessibilityState.checked).toBe(false);
      expect(screen.getByLabelText(`公开内容：${secondBlock.content}`).props.accessibilityState.checked).toBe(true);
    });

    await act(async () => {
      fireEvent.press(screen.getByText('完成'));
    });

    await waitFor(() => {
      expect(setDiaryVisibility).toHaveBeenCalledWith('diary-1', 'public-comments', [secondBlock.id]);
      expect(alertSpy).toHaveBeenCalledWith('保存失败', '公开范围保存失败，请稍后重试。');
    });

    expect(useAppStore.getState().diaries.find(item => item.id === 'diary-1')).toMatchObject({
      privacy: 'public-likes',
      publicBlockIds: [firstBlock.id],
    });

    await act(async () => {
      mockParams.diaryId = 'diary-2';
      screen.rerender(<PrivacyScreen key="switch-away-before-reopen" />);
    });
    await waitFor(() => {
      expect(screen.getByText(otherDiary.title)).toBeTruthy();
    });

    await act(async () => {
      mockParams.diaryId = 'diary-1';
      screen.rerender(<PrivacyScreen key="reopen-after-failed-save" />);
    });
    await waitFor(() => {
      expect(screen.getByLabelText('公开 · 仅点赞')).toBeTruthy();
    });

    expect(screen.getByLabelText('公开 · 仅点赞').props.accessibilityState.selected).toBe(true);
    expect(screen.getByLabelText('公开 · 可评论').props.accessibilityState.selected).toBe(false);
    expect(screen.getByLabelText(`公开内容：${firstBlock.content}`).props.accessibilityState.checked).toBe(true);
    expect(screen.getByLabelText(`公开内容：${secondBlock.content}`).props.accessibilityState.checked).toBe(false);
  });

  test('pushes the share result after a successful save by default', async () => {
    const setDiaryVisibility = jest.fn().mockResolvedValue({
      ok: true as const,
      privacy: 'public-comments' as const,
      publicBlockIds: ['block-1'],
    });
    useAppStore.setState({ setDiaryVisibility });

    const screen = await render(<PrivacyScreen />);
    await waitFor(() => {
      expect(screen.getByText('完成')).toBeTruthy();
    });

    await act(async () => {
      fireEvent.press(screen.getByText('完成'));
    });

    await waitFor(() => {
      expect(setDiaryVisibility).toHaveBeenCalledTimes(1);
      expect(mockRouter.push).toHaveBeenCalledWith({
        pathname: '/share/result',
        params: { diaryId: 'diary-1' },
      });
    });
    expect(mockRouter.back).not.toHaveBeenCalled();
  });

  test('returns to detail after a successful save when returnTo=detail', async () => {
    mockParams.returnTo = 'detail';
    const setDiaryVisibility = jest.fn().mockResolvedValue({
      ok: true as const,
      privacy: 'public-comments' as const,
      publicBlockIds: ['block-1'],
    });
    useAppStore.setState({ setDiaryVisibility });

    const screen = await render(<PrivacyScreen />);
    await waitFor(() => {
      expect(screen.getByText('完成')).toBeTruthy();
    });

    await act(async () => {
      fireEvent.press(screen.getByText('完成'));
    });

    await waitFor(() => {
      expect(setDiaryVisibility).toHaveBeenCalledTimes(1);
      expect(mockRouter.back).toHaveBeenCalledTimes(1);
    });
    expect(mockRouter.push).not.toHaveBeenCalled();
  });

  test('ignores a stale success result after switching to another diary', async () => {
    const diary2 = useAppStore.getState().diaries.find(item => item.id === 'diary-2');
    if (!diary2) {
      throw new Error('expected diary-2 to exist');
    }
    const deferred = createDeferred<{
      ok: true;
      privacy: 'public-comments';
      publicBlockIds: string[];
    }>();
    const setDiaryVisibility = jest.fn().mockImplementation(async (diaryId: string) => {
      if (diaryId === 'diary-1') {
        return deferred.promise;
      }
      return {
        ok: true as const,
        privacy: 'private' as const,
        publicBlockIds: undefined,
      };
    });
    useAppStore.setState({ setDiaryVisibility });

    const screen = await render(<PrivacyScreen />);
    await waitFor(() => {
      expect(screen.getByText('完成')).toBeTruthy();
    });

    fireEvent.press(screen.getByText('完成'));
    await waitFor(() => {
      expect(setDiaryVisibility).toHaveBeenCalledWith('diary-1', 'private', undefined);
      expect(screen.getByText('保存中...')).toBeTruthy();
    });

    await act(async () => {
      mockParams.diaryId = 'diary-2';
      screen.rerender(<PrivacyScreen key="stale-success-diary-2" />);
    });
    await waitFor(() => {
      expect(screen.getByText(diary2.title)).toBeTruthy();
      expect(screen.getByText('完成')).toBeTruthy();
    });

    deferred.resolve({
      ok: true,
      privacy: 'public-comments',
      publicBlockIds: ['block-1'],
    });
    await act(async () => {
      await deferred.promise;
    });

    expect(mockRouter.push).not.toHaveBeenCalled();
    expect(mockRouter.back).not.toHaveBeenCalled();
    expect(alertSpy).not.toHaveBeenCalled();
    expect(screen.getByText(diary2.title)).toBeTruthy();
  });

  test('uses the current detail return path once after switching diaries and ignores the stale success', async () => {
    const diary2 = useAppStore.getState().diaries.find(item => item.id === 'diary-2');
    if (!diary2) {
      throw new Error('expected diary-2 to exist');
    }
    const deferred = createDeferred<{
      ok: true;
      privacy: 'public-comments';
      publicBlockIds: string[];
    }>();
    const setDiaryVisibility = jest.fn().mockImplementation(async (diaryId: string) => {
      if (diaryId === 'diary-1') {
        return deferred.promise;
      }
      return {
        ok: true as const,
        privacy: 'public-comments' as const,
        publicBlockIds: ['block-2'],
      };
    });
    useAppStore.setState({ setDiaryVisibility });

    const screen = await render(<PrivacyScreen />);
    await waitFor(() => {
      expect(screen.getByText('完成')).toBeTruthy();
    });

    fireEvent.press(screen.getByText('完成'));
    await waitFor(() => {
      expect(setDiaryVisibility).toHaveBeenCalledWith('diary-1', 'private', undefined);
      expect(screen.getByText('保存中...')).toBeTruthy();
    });

    await act(async () => {
      mockParams.diaryId = 'diary-2';
      mockParams.returnTo = 'detail';
      screen.rerender(<PrivacyScreen key="stale-success-detail-diary-2" />);
    });
    await waitFor(() => {
      expect(screen.getByText(diary2.title)).toBeTruthy();
      expect(screen.getByText('完成')).toBeTruthy();
    });

    await act(async () => {
      fireEvent.press(screen.getByText('完成'));
    });
    await waitFor(() => {
      expect(setDiaryVisibility.mock.calls[1]).toEqual(['diary-2', diary2.privacy, diary2.publicBlockIds]);
      expect(mockRouter.back).toHaveBeenCalledTimes(1);
    });

    deferred.resolve({
      ok: true,
      privacy: 'public-comments',
      publicBlockIds: ['block-1'],
    });
    await act(async () => {
      await deferred.promise;
    });

    expect(mockRouter.back).toHaveBeenCalledTimes(1);
    expect(mockRouter.push).not.toHaveBeenCalled();
    expect(alertSpy).not.toHaveBeenCalled();
    expect(screen.getByText(diary2.title)).toBeTruthy();
  });

  test('ignores a stale failure result after switching to another diary', async () => {
    const diary2 = useAppStore.getState().diaries.find(item => item.id === 'diary-2');
    if (!diary2) {
      throw new Error('expected diary-2 to exist');
    }
    const deferred = createDeferred<{
      ok: false;
      reason: 'save_failed';
      message: '公开范围保存失败，请稍后重试。';
    }>();
    const setDiaryVisibility = jest.fn().mockImplementation(async (diaryId: string) => {
      if (diaryId === 'diary-1') {
        return deferred.promise;
      }
      return {
        ok: true as const,
        privacy: 'private' as const,
        publicBlockIds: undefined,
      };
    });
    useAppStore.setState({ setDiaryVisibility });

    const screen = await render(<PrivacyScreen />);
    await waitFor(() => {
      expect(screen.getByText('完成')).toBeTruthy();
    });

    fireEvent.press(screen.getByText('完成'));
    await waitFor(() => {
      expect(setDiaryVisibility).toHaveBeenCalledWith('diary-1', 'private', undefined);
      expect(screen.getByText('保存中...')).toBeTruthy();
    });

    await act(async () => {
      mockParams.diaryId = 'diary-2';
      screen.rerender(<PrivacyScreen key="stale-failure-diary-2" />);
    });
    await waitFor(() => {
      expect(screen.getByText(diary2.title)).toBeTruthy();
      expect(screen.getByText('完成')).toBeTruthy();
    });

    deferred.resolve({
      ok: false,
      reason: 'save_failed',
      message: '公开范围保存失败，请稍后重试。',
    });
    await act(async () => {
      await deferred.promise;
    });

    expect(alertSpy).not.toHaveBeenCalled();
    expect(mockRouter.push).not.toHaveBeenCalled();
    expect(mockRouter.back).not.toHaveBeenCalled();
    expect(screen.getByText(diary2.title)).toBeTruthy();
  });

  test('uses the current share-result path once after switching diaries and ignores the stale success', async () => {
    const diary2 = useAppStore.getState().diaries.find(item => item.id === 'diary-2');
    if (!diary2) {
      throw new Error('expected diary-2 to exist');
    }
    const deferred = createDeferred<{
      ok: true;
      privacy: 'public-comments';
      publicBlockIds: string[];
    }>();
    const setDiaryVisibility = jest.fn().mockImplementation(async (diaryId: string) => {
      if (diaryId === 'diary-1') {
        return deferred.promise;
      }
      return {
        ok: true as const,
        privacy: 'public-comments' as const,
        publicBlockIds: ['block-2'],
      };
    });
    useAppStore.setState({ setDiaryVisibility });

    const screen = await render(<PrivacyScreen />);
    await waitFor(() => {
      expect(screen.getByText('完成')).toBeTruthy();
    });

    fireEvent.press(screen.getByText('完成'));
    await waitFor(() => {
      expect(setDiaryVisibility).toHaveBeenCalledWith('diary-1', 'private', undefined);
      expect(screen.getByText('保存中...')).toBeTruthy();
    });

    await act(async () => {
      mockParams.diaryId = 'diary-2';
      mockParams.returnTo = undefined;
      screen.rerender(<PrivacyScreen key="stale-success-share-result-diary-2" />);
    });
    await waitFor(() => {
      expect(screen.getByText(diary2.title)).toBeTruthy();
      expect(screen.getByText('完成')).toBeTruthy();
    });

    await act(async () => {
      fireEvent.press(screen.getByText('完成'));
    });
    await waitFor(() => {
      expect(setDiaryVisibility.mock.calls[1]).toEqual(['diary-2', diary2.privacy, diary2.publicBlockIds]);
      expect(mockRouter.push).toHaveBeenCalledWith({
        pathname: '/share/result',
        params: { diaryId: 'diary-2' },
      });
    });

    deferred.resolve({
      ok: true,
      privacy: 'public-comments',
      publicBlockIds: ['block-1'],
    });
    await act(async () => {
      await deferred.promise;
    });

    expect(mockRouter.push).toHaveBeenCalledTimes(1);
    expect(mockRouter.back).not.toHaveBeenCalled();
    expect(alertSpy).not.toHaveBeenCalled();
    expect(screen.getByText(diary2.title)).toBeTruthy();
  });
});
