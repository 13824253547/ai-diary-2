import React from 'react';
import { act, fireEvent, render, waitFor } from '@testing-library/react-native';
import { Alert } from 'react-native';
import MoreActionsScreen from '../modal/more-actions';
import { createTestStore } from '../../src/test-utils/create-test-store';
import { useAppStore } from '../../src/store/use-app-store';
import type { AppStore } from '../../src/store/use-app-store';

const mockRouter = {
  back: jest.fn(),
  replace: jest.fn(),
};

const mockParams: { diaryId?: string } = {};

jest.mock('expo-router', () => ({
  useRouter: () => mockRouter,
  useLocalSearchParams: () => mockParams,
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

function resetAppStore() {
  const current = useAppStore.getState() as Record<string, unknown>;
  const fresh = createTestStore().store.getState() as Record<string, unknown>;
  const next = Object.fromEntries(
    Object.keys(current).map(key => [key, typeof current[key] === 'function' ? current[key] : fresh[key]]),
  );
  useAppStore.setState(next as AppStore, true);
}

describe('More actions modal', () => {
  beforeEach(() => {
    resetAppStore();
    jest.clearAllMocks();
    mockParams.diaryId = undefined;
  });

  test('shows the empty state when the target diary does not exist', async () => {
    mockParams.diaryId = 'missing-diary';

    const screen = await render(<MoreActionsScreen />);

    expect(screen.getByText('这篇日记不存在')).toBeTruthy();
    fireEvent.press(screen.getByLabelText('关闭'));
    expect(mockRouter.back).toHaveBeenCalledTimes(1);
  });

  test('does not offer continue editing in the diary actions menu', async () => {
    mockParams.diaryId = 'diary-1';

    const screen = await render(<MoreActionsScreen />);
    expect(screen.queryByLabelText('继续编辑')).toBeNull();
    expect(screen.queryByText('继续编辑')).toBeNull();
  });

  test('routes privacy and share actions and confirms deletion for the current diary', async () => {
    mockParams.diaryId = 'diary-2';

    const screen = await render(<MoreActionsScreen />);
    expect(screen.getByText('这篇日记')).toBeTruthy();

    fireEvent.press(screen.getByLabelText('设置公开范围'));
    expect(mockRouter.replace).toHaveBeenCalledWith({
      pathname: '/share/privacy',
      params: { diaryId: 'diary-2', returnTo: 'detail' },
    });

    fireEvent.press(screen.getByLabelText('分享这篇日记'));
    expect(mockRouter.replace).toHaveBeenCalledWith('/share/result?diaryId=diary-2');
    const alertSpy = jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
    fireEvent.press(screen.getByText('删除日记'));

    expect(useAppStore.getState().diaries.some(diary => diary.id === 'diary-2')).toBe(true);
    expect(alertSpy).toHaveBeenCalledWith(
      '删除这篇日记？',
      expect.stringContaining('发现页公开内容'),
      expect.arrayContaining([
        expect.objectContaining({ text: '取消' }),
        expect.objectContaining({ text: '删除日记', style: 'destructive' }),
      ]),
      { cancelable: true },
    );

    alertSpy.mock.calls[0][2]?.find(button => button.text === '取消')?.onPress?.();
    expect(useAppStore.getState().diaries.some(diary => diary.id === 'diary-2')).toBe(true);
    expect(alertSpy).toHaveBeenCalledTimes(1);

    fireEvent.press(screen.getByText('删除日记'));
    const buttons = alertSpy.mock.calls[1][2];
    const confirm = buttons?.find(button => button.text === '删除日记');
    await act(async () => {
      confirm?.onPress?.();
    });

    await waitFor(() => {
      expect(useAppStore.getState().diaries.some(diary => diary.id === 'diary-2')).toBe(false);
      expect(mockRouter.replace).toHaveBeenCalledWith('/(tabs)/memories');
    });
    alertSpy.mockRestore();
  });
});
