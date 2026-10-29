import React from 'react';
import { act, cleanup, fireEvent, render, waitFor } from '@testing-library/react-native';
import AnchorsScreen from '../profile/anchors';
import type { MemoryAnchorFeedRecord } from '../../src/contracts/anchor-read-model-contract';

const mockRouter = { push: jest.fn(), back: jest.fn(), dismissTo: jest.fn() };
const mockListFeed = jest.fn();
const mockGetCorrection = jest.fn();
const mockSaveCorrection = jest.fn();
const mockGetChatCorrection = jest.fn();
const mockSaveChatCorrection = jest.fn();
const mockRoute = { tag: undefined as string | undefined };
const mockChatState = { chatConversationId: undefined as string | undefined };

jest.mock('../../src/store/use-app-store', () => ({
  useAppStore: { getState: () => mockChatState },
}));

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>(resolvePromise => { resolve = resolvePromise; });
  return { promise, resolve };
}

jest.mock('expo-router', () => ({
  useRouter: () => mockRouter,
  useLocalSearchParams: () => mockRoute,
}));

jest.mock('../../src/store/adapters/backend-anchor-read-model-adapter', () => ({
  createBackendAnchorReadModelRepository: () => ({ listFeed: mockListFeed }),
}));

jest.mock('../../src/store/adapters/backend-anchor-correction-adapter', () => ({
  createBackendAnchorCorrectionRepository: () => ({
    getCorrection: mockGetCorrection,
    saveCorrection: mockSaveCorrection,
    getChatCorrection: mockGetChatCorrection,
    saveChatCorrection: mockSaveChatCorrection,
  }),
}));

jest.mock('../../src/components/profile/growth-screen', () => ({
  GrowthScreen: ({ children, header }: { children: React.ReactNode; header?: React.ReactNode }) => {
    const { View } = require('react-native');
    return <View>{header}{children}</View>;
  },
}));

jest.mock('../../src/components/diary/photo', () => ({
  Photo: () => {
    const { View } = require('react-native');
    return <View accessibilityLabel="日记封面" />;
  },
}));

jest.mock('@expo/vector-icons', () => ({
  Ionicons: () => null,
}));

const diaryAnchor = {
  id: 'diary:row-1',
  anchorId: 'diary-anchor-1',
  sourceType: 'diary' as const,
  tagId: 'friends',
  title: '海边散步',
  displayDate: '2026-10-20T00:00:00.000Z',
  excerpt: '小橘记得海边的风让你感到放松。',
  correction: '这段回忆让我重新和老朋友熟悉起来。',
  correctionVersion: 1,
  diary: { id: 'diary-1', version: 2, coverPhotoId: 'photo-1' },
  sourceBlockId: 'block-1',
  sourceBlockIds: ['block-1', 'block-2'],
};

const chatAnchor = {
  id: 'chat:batch-1',
  anchorId: 'chat-anchor-1',
  sourceType: 'chat' as const,
  tagId: 'friends',
  title: '小橘的陪伴记忆',
  displayDate: '2026-10-21T00:00:00.000Z',
  excerpt: '小橘记得你提到老朋友时，语气里满是珍惜。',
  chat: {
    batchId: 'batch-1',
    sourceDateStart: '2026-10-20',
    sourceDateEnd: '2026-10-20',
    sourceMessages: [
      { conversationId: 'conversation-1', messageId: 'message-1' },
      { conversationId: 'conversation-1', messageId: 'message-2' },
    ],
  },
};

describe('Memory anchors screen', () => {
  beforeEach(() => {
    mockRoute.tag = undefined;
    mockChatState.chatConversationId = undefined;
    mockRouter.dismissTo.mockClear();
    mockRouter.push.mockClear();
    mockRouter.back.mockClear();
    mockListFeed.mockReset();
    mockGetCorrection.mockReset();
    mockSaveCorrection.mockReset();
    mockGetChatCorrection.mockReset();
    mockSaveChatCorrection.mockReset();
    mockListFeed.mockResolvedValue({
      items: [diaryAnchor, chatAnchor],
      tagId: null,
      page: 1,
      pageSize: 20,
      total: 2,
    });
    mockGetCorrection.mockResolvedValue(null);
    mockGetChatCorrection.mockResolvedValue(null);
  });

  afterEach(async () => {
    await cleanup();
  });

  test('loads all source types by default and shows saved corrections immediately', async () => {
    const initialPage = deferred<{
      items: MemoryAnchorFeedRecord[];
      tagId: null;
      page: number;
      pageSize: 20;
      total: number;
    }>();
    mockListFeed.mockReturnValueOnce(initialPage.promise);
    const screen = await render(<AnchorsScreen />);
    await waitFor(() => expect(mockListFeed).toHaveBeenCalledTimes(1));
    await act(async () => {
      initialPage.resolve({
        items: [diaryAnchor, chatAnchor],
        tagId: null,
        page: 1,
        pageSize: 20,
        total: 2,
      });
      await initialPage.promise;
    });

    expect(mockListFeed).toHaveBeenCalledWith({ page: 1, pageSize: 20 });
    expect(screen.getByText('记忆锚点 · 全部')).toBeTruthy();
    expect(screen.getByText(/这段回忆让我重新和老朋友熟悉起来/)).toBeTruthy();
    expect(screen.getByText('已按你的想法更新')).toBeTruthy();
    expect(screen.getByLabelText('查看小橘的陪伴记忆')).toBeTruthy();
  });

  test('filters by the selected tree theme and opens each source correctly', async () => {
    mockRoute.tag = 'friends';
    const initialPage = deferred<{
      items: MemoryAnchorFeedRecord[];
      tagId: string;
      page: number;
      pageSize: 20;
      total: number;
    }>();
    mockListFeed.mockReturnValueOnce(initialPage.promise);
    const screen = await render(<AnchorsScreen />);
    await waitFor(() => expect(mockListFeed).toHaveBeenCalledTimes(1));
    await act(async () => {
      initialPage.resolve({
        items: [diaryAnchor, chatAnchor],
        tagId: 'friends',
        page: 1,
        pageSize: 20,
        total: 2,
      });
      await initialPage.promise;
    });

    expect(mockListFeed).toHaveBeenCalledWith({ tagId: 'friends', page: 1, pageSize: 20 });
    await fireEvent.press(screen.getByLabelText('查看海边散步'));
    expect(mockRouter.push).toHaveBeenCalledWith('/diary/diary-1');

    await fireEvent.press(screen.getByLabelText('查看小橘的陪伴记忆'));
    expect(mockRouter.push).toHaveBeenLastCalledWith({
      pathname: '/profile/chat-history',
      params: { anchorBatchId: 'batch-1' },
    });
  });

  test('opens the complete batch in read-only history even when a source is in the active chat', async () => {
    mockChatState.chatConversationId = 'conversation-1';
    const initialPage = deferred<any>();
    mockListFeed.mockReturnValueOnce(initialPage.promise);
    const screen = await render(<AnchorsScreen />);
    await act(async () => {
      initialPage.resolve({ items: [chatAnchor], tagId: null, page: 1, pageSize: 20, total: 1 });
      await initialPage.promise;
    });
    await waitFor(() => expect(screen.getByLabelText('查看小橘的陪伴记忆')).toBeTruthy());
    await fireEvent.press(screen.getByLabelText('查看小橘的陪伴记忆'));
    expect(mockRouter.push).toHaveBeenCalledWith({
      pathname: '/profile/chat-history',
      params: { anchorBatchId: 'batch-1' },
    });
    expect(mockRouter.dismissTo).not.toHaveBeenCalled();
  });

  test('fetches the next fixed-size server page on demand', async () => {
    const initialPage = deferred<any>();
    mockListFeed
      .mockReturnValueOnce(initialPage.promise)
      .mockImplementationOnce(() => new Promise(() => undefined));
    const screen = await render(<AnchorsScreen />);
    await waitFor(() => expect(mockListFeed).toHaveBeenCalledTimes(1));
    await act(async () => {
      initialPage.resolve({
        items: [diaryAnchor] as MemoryAnchorFeedRecord[],
        tagId: null,
        page: 1,
        pageSize: 20,
        total: 21,
      });
      await initialPage.promise;
    });
    await waitFor(() => expect(screen.getByLabelText('加载更多')).toBeTruthy());

    await fireEvent.press(screen.getByLabelText('加载更多'));
    await waitFor(() => expect(mockListFeed).toHaveBeenCalledTimes(2));

    expect(mockListFeed).toHaveBeenLastCalledWith({
      page: 2,
      pageSize: 20,
    });
  });
});
