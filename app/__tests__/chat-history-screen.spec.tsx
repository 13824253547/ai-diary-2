import React from 'react';
import { fireEvent, render, waitFor } from '@testing-library/react-native';
import ChatHistoryScreen from '../profile/chat-history';

const mockRouter = { dismissTo: jest.fn(), back: jest.fn(), canGoBack: jest.fn(() => true) };
const mockGetConversation = jest.fn();
const mockGetChatHistory = jest.fn();
const mockIdentity = jest.fn();
const mockScrollTo = jest.fn();
const mockParams: { conversationId?: string; focusMessageId?: string; anchorBatchId?: string } = {
  conversationId: 'old-chat', focusMessageId: 'old-message',
};

jest.mock('expo-router', () => ({
  useRouter: () => mockRouter,
  useLocalSearchParams: () => mockParams,
}));
jest.mock('../../src/store/adapters/backend-pet-chat-adapter', () => ({
  createBackendPetChatRepository: () => ({ getConversation: mockGetConversation }),
}));
jest.mock('../../src/store/adapters/backend-anchor-read-model-adapter', () => ({
  createBackendAnchorReadModelRepository: () => ({ getChatHistory: mockGetChatHistory }),
}));
jest.mock('../../src/services/device-identity', () => ({
  ensureDeviceIdentity: () => mockIdentity(),
}));
jest.mock('../../src/components/layout/screen', () => ({
  Screen: ({ header, children }: { header: React.ReactNode; children: React.ReactNode }) => {
    const { View } = require('react-native');
    return <View>{header}{children}</View>;
  },
}));
jest.mock('react-native', () => {
  const actual = jest.requireActual('react-native');
  const React = require('react');
  return Object.defineProperty(Object.create(actual), 'ScrollView', {
    value: React.forwardRef((props: any, ref: any) => {
      React.useImperativeHandle(ref, () => ({ scrollTo: mockScrollTo }));
      return <actual.View {...props} />;
    }),
  });
});
jest.mock('@expo/vector-icons', () => ({ Ionicons: () => null }));

const history = {
  id: 'old-chat',
  messages: [{ id: 'old-message', role: 'user', text: '旧日的散步。' }],
  turns: [],
};

describe('Read-only chat history', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockRouter.canGoBack.mockReturnValue(true);
    mockIdentity.mockReset().mockResolvedValue('device-1');
    mockGetConversation.mockReset().mockResolvedValue(history);
    mockGetChatHistory.mockReset();
    mockParams.anchorBatchId = undefined;
    mockParams.conversationId = 'old-chat';
    mockParams.focusMessageId = 'old-message';
  });

  test('loads every batch page across conversations without loading or replacing the active chat', async () => {
    mockParams.anchorBatchId = 'batch-1';
    mockParams.focusMessageId = undefined;
    const items = Array.from({ length: 102 }, (_, index) => ({
      id: `source-${index}`, conversationId: index < 50 ? 'chat-a' : 'chat-b',
      role: 'user', text: index === 101 ? '金色的海面' : `内容-${index}`,
    }));
    const page = { batchId: 'batch-1', sourceVersion: 'hash-1', pageSize: 100, total: 102 };
    mockGetChatHistory.mockResolvedValueOnce({ ...page, page: 1, items: items.slice(0, 100) })
      .mockResolvedValueOnce({ ...page, page: 2, items: items.slice(100) });
    const screen = await render(<ChatHistoryScreen />);
    await waitFor(() => expect(screen.getByText('金色的海面')).toBeTruthy());
    expect(screen.getByText('内容-0')).toBeTruthy();
    expect(mockGetChatHistory).toHaveBeenNthCalledWith(2, { batchId: 'batch-1', page: 2, pageSize: 100 });
    expect(mockGetConversation).not.toHaveBeenCalled();
    expect(screen.queryByLabelText('和小橘聊天')).toBeNull();
  });

  test.each(['failure', 'changed-source', 'changed-device'])('does not show partial batch history: %s', async kind => {
    mockParams.anchorBatchId = 'batch-1';
    const first = { batchId: 'batch-1', sourceVersion: 'hash-1', page: 1, pageSize: 100, total: 2,
      items: [{ id: 'source-1', role: 'user', text: '不应显示半份历史' }] };
    mockGetChatHistory.mockResolvedValueOnce(first);
    if (kind === 'failure') mockGetChatHistory.mockRejectedValueOnce(new Error('offline'));
    if (kind === 'changed-source') mockGetChatHistory.mockResolvedValueOnce({
      ...first, page: 2, sourceVersion: 'hash-2', items: [{ id: 'source-2', text: 'changed' }],
    });
    if (kind === 'changed-device') mockIdentity.mockResolvedValueOnce('device-1').mockResolvedValue('device-2');
    const screen = await render(<ChatHistoryScreen />);
    await waitFor(() => expect(screen.getByText('聊天记录暂时无法读取。')).toBeTruthy());
    expect(screen.queryByText('不应显示半份历史')).toBeNull();
  });

  test('reads the source conversation, focuses once and returns without a chat input', async () => {
    const screen = await render(<ChatHistoryScreen />);
    await waitFor(() => expect(screen.getByText('旧日的散步。')).toBeTruthy());
    expect(mockGetConversation).toHaveBeenCalledWith('old-chat');
    expect(screen.queryByText('正在查看过去的聊天，不会改变当前会话。')).toBeNull();
    expect(screen.queryByLabelText('和小橘聊天')).toBeNull();
    expect(screen.getByTestId('chat-history-scroll').props.showsVerticalScrollIndicator).toBe(false);
    await fireEvent(screen.getByTestId('history-message-old-message'), 'layout', {
      nativeEvent: { layout: { y: 320 } },
    });
    await fireEvent(screen.getByTestId('chat-history-scroll'), 'contentSizeChange', 300, 900);
    expect(mockScrollTo).toHaveBeenCalledTimes(1);
    expect(mockScrollTo).toHaveBeenCalledWith({ y: 304, animated: false });
    await fireEvent.press(screen.getByLabelText('返回'));
    expect(mockRouter.back).toHaveBeenCalledTimes(1);
    await fireEvent.press(screen.getByText('返回当前聊天'));
    expect(mockRouter.dismissTo).toHaveBeenCalledWith('/(tabs)/pet');
  });

  test('allows retry after a failed read', async () => {
    mockGetConversation.mockRejectedValueOnce(new Error('offline'));
    const screen = await render(<ChatHistoryScreen />);
    await waitFor(() => expect(screen.getByText('聊天记录暂时无法读取。')).toBeTruthy());
    await fireEvent.press(screen.getByText('重新加载'));
    await waitFor(() => expect(screen.getByText('旧日的散步。')).toBeTruthy());
    expect(mockGetConversation).toHaveBeenCalledTimes(2);
  });

  test.each(['wrong-conversation', 'changed-device'])('rejects mismatched history: %s', async kind => {
    if (kind === 'wrong-conversation') mockGetConversation.mockResolvedValue({ ...history, id: 'other' });
    else mockIdentity.mockResolvedValueOnce('device-1').mockResolvedValueOnce('device-2');
    const screen = await render(<ChatHistoryScreen />);
    await waitFor(() => expect(screen.getByText('聊天记录暂时无法读取。')).toBeTruthy());
    expect(screen.queryByText('旧日的散步。')).toBeNull();
  });

  test('returns to the pet page when no back stack exists', async () => {
    mockRouter.canGoBack.mockReturnValue(false);
    const screen = await render(<ChatHistoryScreen />);
    await waitFor(() => expect(screen.getByText('旧日的散步。')).toBeTruthy());
    await fireEvent.press(screen.getByLabelText('返回'));
    expect(mockRouter.dismissTo).toHaveBeenCalledWith('/(tabs)/pet');
  });
});
