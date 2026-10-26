import React from 'react';
import { fireEvent, render, waitFor } from '@testing-library/react-native';
import PetScreen from '../(tabs)/pet';
import { createTestStore } from '../../src/test-utils/create-test-store';
import { useAppStore } from '../../src/store/use-app-store';
import type { AppStore } from '../../src/store/use-app-store';

const mockRouter = { push: jest.fn() };

jest.mock('../../src/store/use-app-store', () => {
  const { createTestStore } = require('../../src/test-utils/create-test-store');
  const { getDiaryStatistics } = require('../../src/store/diary-domain');
  const { store, selectors } = createTestStore();
  return { useAppStore: store, appSelectors: selectors, getDiaryStatistics };
});

jest.mock('expo-router', () => ({
  useRouter: () => mockRouter,
}));

jest.mock('../../src/components/layout/screen', () => ({
  Screen: ({ children }: { children: React.ReactNode }) => {
    const { View } = require('react-native');
    return <View>{children}</View>;
  },
}));

jest.mock('../../src/components/navigation/bottom-tabs', () => ({
  BottomTabs: () => null,
}));

jest.mock('@expo/vector-icons', () => {
  const { Text } = require('react-native');
  return { Ionicons: ({ name }: { name: string }) => <Text>{name}</Text> };
});

function resetAppStore() {
  const current = useAppStore.getState() as Record<string, unknown>;
  const fresh = createTestStore().store.getState() as Record<string, unknown>;
  const next = Object.fromEntries(
    Object.keys(current).map(key => [key, typeof current[key] === 'function' ? current[key] : fresh[key]]),
  );
  useAppStore.setState(next as AppStore, true);
}

describe('Pet chat screen reply feedback', () => {
  beforeEach(() => {
    resetAppStore();
    jest.clearAllMocks();
  });

  test('does not show a separate name beneath the mascot', async () => {
    const screen = await render(<PetScreen />);

    expect(screen.queryByText('小橘', { exact: true })).toBeNull();
  });

  test('retries a failed reply from its existing assistant bubble', async () => {
    useAppStore.setState({
      chatConversationId: 'conversation-1',
      chatMessages: [
        { id: 'chat-welcome', role: 'assistant', source: 'welcome', text: '嘿，今天过得怎么样？' },
        {
          id: 'user-1',
          conversationId: 'conversation-1',
          requestId: 'request-1',
          role: 'user',
          text: '今天有点累。',
        },
        {
          id: 'chat-status-request-1',
          conversationId: 'conversation-1',
          requestId: 'request-1',
          role: 'assistant',
          source: 'failed',
          text: '小橘回复超时了，点这里重试。',
        },
      ],
      chatTurnRequests: [{
        id: 'request-1',
        conversationId: 'conversation-1',
        userMessageId: 'user-1',
        attempt: 1,
        status: 'failed',
        error: 'timeout',
      }],
    });
    const screen = await render(<PetScreen />);

    fireEvent.press(screen.getByLabelText('聊天回复失败，点击重试，消息标识 request-1'));

    await waitFor(() => {
      expect(useAppStore.getState().chatTurnRequests[0]).toMatchObject({
        id: 'request-1',
        attempt: 2,
        status: 'completed',
      });
    });
    expect(useAppStore.getState().chatMessages.filter(message => message.role === 'user')).toHaveLength(1);
    expect(useAppStore.getState().chatMessages.filter(message => message.role === 'assistant' && message.requestId === 'request-1')).toHaveLength(1);
    expect(screen.queryByLabelText('聊天回复失败，点击重试，消息标识 request-1')).toBeNull();
  });

  test('shows the animated typing indicator while the reply is still pending', async () => {
    useAppStore.setState({
      chatConversationId: 'conversation-1',
      chatMessages: [
        { id: 'chat-welcome', role: 'assistant', source: 'welcome', text: '嘿，今天有点什么想分享？' },
        {
          id: 'chat-status-request-1',
          conversationId: 'conversation-1',
          requestId: 'request-1',
          role: 'assistant',
          source: 'pending',
          text: '',
        },
      ],
    });

    const screen = await render(<PetScreen />);

    expect(screen.getByLabelText('小橘正在输入')).toBeTruthy();
  });

  test('disables sending while this device already has a pending chat task', async () => {
    useAppStore.setState({
      chatConversationId: 'conversation-1',
      chatTurnRequests: [{
        id: 'request-1',
        conversationId: 'conversation-1',
        userMessageId: 'user-1',
        attempt: 1,
        status: 'pending',
      }],
    });

    const screen = await render(<PetScreen />);

    expect(screen.getByLabelText('发送消息').props.accessibilityState.disabled).toBe(true);
  });

  test('renders policy-blocked feedback without exposing a retry action', async () => {
    useAppStore.setState({
      chatConversationId: 'conversation-1',
      chatMessages: [{
        id: 'chat-status-request-blocked',
        conversationId: 'conversation-1',
        requestId: 'request-blocked',
        role: 'assistant',
        source: 'blocked',
        text: '小橘主要陪你聊日常、心情和旅行回忆，暂不提供代码、小说或商业内容创作。',
      }],
      chatTurnRequests: [{
        id: 'request-blocked',
        conversationId: 'conversation-1',
        userMessageId: 'user-blocked',
        attempt: 1,
        status: 'blocked',
        error: 'out_of_scope',
      }],
    });

    const screen = await render(<PetScreen />);

    expect(screen.getByText('小橘主要陪你聊日常、心情和旅行回忆，暂不提供代码、小说或商业内容创作。')).toBeTruthy();
    expect(screen.queryByLabelText('聊天回复失败，点击重试，消息标识 request-blocked')).toBeNull();
  });
});
