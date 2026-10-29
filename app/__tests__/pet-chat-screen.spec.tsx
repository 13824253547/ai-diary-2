import React from 'react';
import { fireEvent, render, waitFor, within } from '@testing-library/react-native';
import PetScreen from '../(tabs)/pet';
import { createTestStore } from '../../src/test-utils/create-test-store';
import { useAppStore } from '../../src/store/use-app-store';
import type { AppStore } from '../../src/store/use-app-store';
import { requestAIConsent } from '../../src/services/ai-consent';

jest.mock('../../src/services/ai-consent', () => ({
  requestAIConsent: jest.fn(async () => true),
}));

const mockRouter = { push: jest.fn(), replace: jest.fn(), setParams: jest.fn() };
const mockGetAnchorSummary = jest.fn();
const mockRouteParams: { conversationId?: string; focusMessageId?: string } = {};

jest.mock('../../src/store/use-app-store', () => {
  const { createTestStore } = require('../../src/test-utils/create-test-store');
  const { getDiaryStatistics } = require('../../src/store/diary-domain');
  const { store, selectors } = createTestStore();
  return { useAppStore: store, appSelectors: selectors, getDiaryStatistics };
});

jest.mock('../../src/store/adapters/backend-anchor-read-model-adapter', () => ({
  createBackendAnchorReadModelRepository: () => ({ getSummary: mockGetAnchorSummary }),
}));

jest.mock('expo-router', () => ({
  useRouter: () => mockRouter,
  useLocalSearchParams: () => mockRouteParams,
}));

jest.mock('../../src/components/layout/screen', () => ({
  Screen: ({ children, header }: { children: React.ReactNode; header?: React.ReactNode }) => {
    const { View } = require('react-native');
    return <View>{header}{children}</View>;
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
    mockGetAnchorSummary.mockResolvedValue({ total: 7 });
    mockRouteParams.conversationId = undefined;
    mockRouteParams.focusMessageId = undefined;
  });

  test('declining first chat consent keeps the text without adding a user message', async () => {
    jest.mocked(requestAIConsent).mockResolvedValueOnce(false);
    useAppStore.setState({ chatHistoryStatus: 'ready', restoreLatestChatConversation: jest.fn(async () => false) });
    const sendChat = jest.fn();
    useAppStore.setState({ sendChat });
    const screen = await render(<PetScreen />);
    fireEvent.changeText(screen.getByLabelText('和小橘聊天'), '今天去海边了');
    await waitFor(() => expect(screen.getByDisplayValue('今天去海边了')).toBeTruthy());
    fireEvent.press(screen.getByLabelText('发送消息'));
    await waitFor(() => expect(requestAIConsent).toHaveBeenCalledWith('chat', expect.anything()));
    expect(sendChat).not.toHaveBeenCalled();
    expect(screen.getByDisplayValue('今天去海边了')).toBeTruthy();
  });

  test('does not show a separate name beneath the mascot', async () => {
    const screen = await render(<PetScreen />);

    expect(screen.queryByText('小橘', { exact: true })).toBeNull();
    expect(within(screen.getByTestId('pet-fixed-header')).getByLabelText('记忆锚点')).toBeTruthy();
    expect(within(screen.getByTestId('pet-chat-scroll')).queryByLabelText('记忆锚点')).toBeNull();
  });

  test('shows the authenticated anchor count from the backend summary', async () => {
    const screen = await render(<PetScreen />);

    await waitFor(() => expect(screen.getByLabelText('7 个锚点')).toBeTruthy());
    expect(mockGetAnchorSummary).toHaveBeenCalledTimes(1);
  });

  test('restores the latest saved chat on a normal visit', async () => {
    const restoreLatestChatConversation = jest.fn(async () => {
      useAppStore.setState({
        chatHistoryStatus: 'ready',
        chatConversationId: 'conversation-latest',
        chatMessages: [{
          id: 'user-latest',
          conversationId: 'conversation-latest',
          requestId: 'request-latest',
          role: 'user',
          text: '今天看到了夕阳。',
        }],
      });
      return true;
    });
    useAppStore.setState({ chatHistoryStatus: 'idle', restoreLatestChatConversation });
    const screen = await render(<PetScreen />);

    await waitFor(() => expect(restoreLatestChatConversation).toHaveBeenCalledTimes(1));
    expect(screen.getByText('今天看到了夕阳。')).toBeTruthy();
  });

  test('blocks sending during restore and retries history without sending a new message', async () => {
    let finishRestore!: () => void;
    const pending = new Promise<void>(resolve => { finishRestore = resolve; });
    const restoreLatestChatConversation = jest.fn()
      .mockImplementationOnce(async () => {
        useAppStore.setState({ chatHistoryStatus: 'loading' });
        await pending;
        useAppStore.setState({ chatHistoryStatus: 'error' });
        return false;
      })
      .mockImplementationOnce(async () => {
        useAppStore.setState({ chatHistoryStatus: 'ready' });
        return false;
      });
    const sendChat = jest.fn();
    useAppStore.setState({ chatHistoryStatus: 'idle', restoreLatestChatConversation, sendChat });
    const screen = await render(<PetScreen />);

    await waitFor(() => expect(screen.getByPlaceholderText('正在恢复聊天记录…')).toBeTruthy());
    fireEvent.changeText(screen.getByLabelText('和小橘聊天'), '先恢复再发送');
    expect(screen.getByLabelText('发送消息').props.accessibilityState.disabled).toBe(true);
    finishRestore();
    await waitFor(() => expect(screen.getByLabelText('重试加载聊天记录')).toBeTruthy());
    fireEvent.press(screen.getByLabelText('重试加载聊天记录'));
    await waitFor(() => expect(restoreLatestChatConversation).toHaveBeenCalledTimes(2));
    expect(sendChat).not.toHaveBeenCalled();
    expect(screen.getByDisplayValue('先恢复再发送')).toBeTruthy();
  });

  test('does not show stale messages while a different identity is being checked', async () => {
    useAppStore.setState({
      chatHistoryStatus: 'loading',
      chatMessages: [{
        id: 'old-user',
        conversationId: 'old-conversation',
        requestId: 'old-request',
        role: 'user',
        text: '旧设备的消息',
      }],
      restoreLatestChatConversation: jest.fn(async () => false),
    });

    const screen = await render(<PetScreen />);

    expect(screen.queryByText('旧设备的消息')).toBeNull();
    expect(screen.getByPlaceholderText('正在恢复聊天记录…')).toBeTruthy();
  });

  test('redirects another conversation to read-only history without replacing the current chat', async () => {
    mockRouteParams.conversationId = 'conversation-memory';
    mockRouteParams.focusMessageId = 'message-memory';
    const loadChatConversation = jest.fn(async (conversationId: string) => {
      useAppStore.setState({
        chatConversationId: conversationId,
        chatMessages: [{
          id: 'message-memory',
          conversationId,
          requestId: 'request-memory',
          role: 'user',
          text: '那天我和老朋友聊了很久。',
        }],
      });
      return true;
    });
    const restoreLatestChatConversation = jest.fn();
    useAppStore.setState({ loadChatConversation, restoreLatestChatConversation });

    const screen = await render(<PetScreen />);

    await waitFor(() => expect(mockRouter.replace).toHaveBeenCalledWith({
      pathname: '/profile/chat-history',
      params: { conversationId: 'conversation-memory', focusMessageId: 'message-memory' },
    }));
    expect(loadChatConversation).not.toHaveBeenCalled();
    expect(screen.queryByText('那天我和老朋友聊了很久。')).toBeNull();
    expect(restoreLatestChatConversation).not.toHaveBeenCalled();
  });

  test('keeps the current conversation when its own historical message is targeted', async () => {
    mockRouteParams.conversationId = 'conversation-memory';
    mockRouteParams.focusMessageId = 'message-memory';
    const loadChatConversation = jest.fn(async (conversationId: string) => {
      useAppStore.setState({
        chatConversationId: conversationId,
        chatMessages: [{
          id: 'message-memory',
          conversationId,
          requestId: 'request-memory',
          role: 'user',
          text: '那天我和老朋友聊了很久。',
        }],
      });
      return true;
    });
    useAppStore.setState({
      loadChatConversation, chatConversationId: 'conversation-memory', chatHistoryStatus: 'ready',
      chatMessages: [{ id: 'message-memory', conversationId: 'conversation-memory',
        role: 'user', text: '那天我和老朋友聊了很久。' }],
    });

    const screen = await render(<PetScreen />);

    expect(loadChatConversation).not.toHaveBeenCalled();
    expect(mockRouter.replace).not.toHaveBeenCalled();
    expect(screen.getByText('那天我和老朋友聊了很久。')).toBeTruthy();
    fireEvent(screen.getByTestId('pet-message-message-memory'), 'layout', {
      nativeEvent: { layout: { y: 320 } },
    });
    await waitFor(() => expect(screen.getByLabelText('回到最新消息')).toBeTruthy());
    fireEvent.press(screen.getByLabelText('回到最新消息'));
    expect(mockRouter.setParams).toHaveBeenCalledWith({ conversationId: undefined, focusMessageId: undefined });
    await waitFor(() => expect(screen.queryByLabelText('回到最新消息')).toBeNull());
    expect(useAppStore.getState().chatConversationId).toBe('conversation-memory');
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
