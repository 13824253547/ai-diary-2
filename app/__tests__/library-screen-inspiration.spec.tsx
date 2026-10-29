import React from 'react';
import { act, fireEvent, render, waitFor } from '@testing-library/react-native';
import LibraryScreen from '../library';
import { createTestStore } from '../../src/test-utils/create-test-store';
import { useAppStore } from '../../src/store/use-app-store';
import type { AppStore } from '../../src/store/use-app-store';
import { requestAIConsent } from '../../src/services/ai-consent';

jest.mock('../../src/services/ai-consent', () => ({
  requestAIConsent: jest.fn(async () => true),
}));

const mockRouter = {
  push: jest.fn(),
  back: jest.fn(),
};

const inspirationCards = [
  '今天阳光正好，发生了什么小确幸？',
  '如果用一个颜色形容今天，你会选什么？',
  '最近有没有什么让你心动的瞬间？',
];

jest.mock('expo-router', () => ({
  useRouter: () => mockRouter,
}));

jest.mock('../../src/components/layout/screen', () => ({
  Screen: ({ children, header }: { children: React.ReactNode; header?: React.ReactNode }) => {
    const { View } = require('react-native');
    return <View>{header}{children}</View>;
  },
}));

jest.mock('../../src/components/common/bottom-sheet', () => ({
  BottomSheet: ({
    visible,
    onClose,
    title,
    children,
  }: {
    visible: boolean;
    onClose: () => void;
    title?: string;
    children: React.ReactNode;
  }) => {
    const { Pressable, Text, View } = require('react-native');
    return visible ? (
      <View>
        <Text>{title}</Text>
        <Pressable accessibilityRole="button" accessibilityLabel="关闭底部面板" onPress={onClose}>
          <Text>关闭</Text>
        </Pressable>
        {children}
      </View>
    ) : null;
  },
}));

jest.mock('@expo/vector-icons', () => {
  const { Text } = require('react-native');
  return {
    Ionicons: ({ name }: { name: string }) => <Text>{name}</Text>,
  };
});

jest.mock('expo-linear-gradient', () => ({
  LinearGradient: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

function resetAppStore() {
  const current = useAppStore.getState() as Record<string, unknown>;
  const fresh = createTestStore().store.getState() as Record<string, unknown>;
  const next = Object.fromEntries(
    Object.keys(current).map(key => [key, typeof current[key] === 'function' ? current[key] : fresh[key]]),
  );
  useAppStore.setState(next as AppStore, true);
}

describe('Library screen inspiration submission', () => {
  beforeEach(() => {
    resetAppStore();
    jest.clearAllMocks();
  });

  test('declining chat consent keeps the written answer without sending or navigating', async () => {
    jest.mocked(requestAIConsent).mockResolvedValueOnce(false);
    const initialMessages = useAppStore.getState().chatMessages;
    const screen = await render(<LibraryScreen />);
    fireEvent.press(screen.getByText(inspirationCards[0]!));
    await waitFor(() => expect(screen.getByLabelText('记录灵感')).toBeTruthy());
    await act(async () => { fireEvent.changeText(screen.getByLabelText('记录灵感'), '今天去海边了'); });
    await act(async () => { fireEvent.press(screen.getByLabelText('和小橘聊聊')); });
    expect(useAppStore.getState().chatMessages).toEqual(initialMessages);
    expect(mockRouter.push).not.toHaveBeenCalled();
    expect(screen.getByLabelText('记录灵感').props.value).toBe('今天去海边了');
  });

  test.each(inspirationCards)('keeps blank answers from submitting for prompt: %s', async prompt => {
    const initialMessages = useAppStore.getState().chatMessages;
    const initialDiaries = useAppStore.getState().diaries;
    const initialDrafts = useAppStore.getState().drafts;
    const screen = await render(<LibraryScreen />);

    fireEvent.press(screen.getByText(prompt));
    await waitFor(() => expect(screen.getByLabelText('记录灵感')).toBeTruthy());

    const answerInput = screen.getByLabelText('记录灵感');
    const submitButton = screen.getByLabelText('和小橘聊聊');
    for (const blankAnswer of ['', '   ', '\n \t']) {
      await act(async () => {
        fireEvent.changeText(answerInput, blankAnswer);
      });
      expect(submitButton.props.accessibilityState?.disabled).toBe(true);
      await act(async () => {
        fireEvent.press(submitButton);
      });
    }

    expect(useAppStore.getState().chatMessages).toEqual(initialMessages);
    expect(useAppStore.getState().diaries).toEqual(initialDiaries);
    expect(useAppStore.getState().drafts).toEqual(initialDrafts);
    expect(mockRouter.push).not.toHaveBeenCalled();
  });

  test('submits only the written answer and not the inspiration prompt', async () => {
    const screen = await render(<LibraryScreen />);

    fireEvent.press(screen.getByText(inspirationCards[0]!));
    await waitFor(() => expect(screen.getByLabelText('记录灵感')).toBeTruthy());
    await act(async () => {
      fireEvent.changeText(screen.getByLabelText('记录灵感'), '今天彩票中奖了');
    });
    await act(async () => {
      fireEvent.press(screen.getByLabelText('和小橘聊聊'));
    });

    const userMessages = useAppStore.getState().chatMessages.filter(message => message.role === 'user');
    expect(userMessages).toHaveLength(1);
    expect(userMessages[0]?.text).toBe('今天彩票中奖了');
    expect(mockRouter.push).toHaveBeenCalledWith('/(tabs)/pet');
  });

  test('closing an unanswered inspiration keeps the conversation and diaries unchanged', async () => {
    const initialMessages = useAppStore.getState().chatMessages;
    const initialDiaries = useAppStore.getState().diaries;
    const screen = await render(<LibraryScreen />);

    fireEvent.press(screen.getByText(inspirationCards[0]!));
    await waitFor(() => expect(screen.getByLabelText('记录灵感')).toBeTruthy());
    await act(async () => {
      fireEvent.changeText(screen.getByLabelText('记录灵感'), '还没有提交的回答');
    });
    await act(async () => {
      fireEvent.press(screen.getByLabelText('关闭底部面板'));
    });

    await waitFor(() => expect(screen.queryByLabelText('记录灵感')).toBeNull());
    expect(useAppStore.getState().chatMessages).toEqual(initialMessages);
    expect(useAppStore.getState().diaries).toEqual(initialDiaries);
    expect(mockRouter.push).not.toHaveBeenCalled();
  });
});
