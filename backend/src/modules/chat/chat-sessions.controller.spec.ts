import { BadRequestException, ConflictException, ForbiddenException } from '@nestjs/common';
import { ArkPetChatProvider, PetChatProviderError } from './ark-pet-chat-provider';
import {
  ChatSessionError,
  ChatSessionsService,
} from './chat-sessions.service';
import { ChatSessionsController, type ChatStreamResponse } from './chat-sessions.controller';

describe('ChatSessionsController', () => {
  const service = {
    listConversations: jest.fn(),
    getConversation: jest.fn(),
    beginTurn: jest.fn(),
    completeTurn: jest.fn(),
    completeGeneratedTurn: jest.fn(),
    failTurn: jest.fn(),
    retryTurn: jest.fn(),
    discardPolicyBlockedTurn: jest.fn(),
  } as unknown as ChatSessionsService;
  const provider = { reply: jest.fn() } as unknown as ArkPetChatProvider;
  const controller = new ChatSessionsController(service, provider);

  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('requires device identity and forwards scoped conversation listing', async () => {
    jest.mocked(service.listConversations).mockResolvedValue({
      items: [],
      page: 1,
      pageSize: 20,
      total: 0,
    });

    await expect(controller.listConversations(undefined, undefined, undefined))
      .rejects.toBeInstanceOf(BadRequestException);
    await expect(controller.listConversations(undefined, undefined, 'device-1'))
      .resolves.toMatchObject({
        ok: true,
        version: 'pet-chat-v1',
        data: { items: [], page: 1, pageSize: 20 },
      });
    expect(service.listConversations).toHaveBeenCalledWith({ page: 1, pageSize: 20 }, 'device-1');
  });

  test('requires device identity before validating malformed query and turn input', async () => {
    await expect(controller.listConversations(['1', '2'], undefined, undefined))
      .rejects.toMatchObject({
        response: { error: { code: 'device_identity_required' } },
      });
    await expect(controller.beginTurn('conversation-1', undefined as never, undefined))
      .rejects.toMatchObject({
        response: { error: { code: 'device_identity_required' } },
      });
    await expect(controller.generateReply('conversation-1', 'request-1', undefined as never, undefined))
      .rejects.toMatchObject({
        response: { error: { code: 'device_identity_required' } },
      });
    expect(service.listConversations).not.toHaveBeenCalled();
    expect(service.beginTurn).not.toHaveBeenCalled();
    expect(provider.reply).not.toHaveBeenCalled();
  });

  test.each([
    ['0x10', undefined],
    ['1e1', undefined],
    ['1.0', undefined],
    [' 1', undefined],
    [undefined, '+20'],
    [['1', '2'], undefined],
    [undefined, ['10', '20']],
    [undefined, '15'],
  ])('rejects non-decimal or repeated pagination values (%j, %j)', async (page, pageSize) => {
    await expect(controller.listConversations(page, pageSize, 'device-1'))
      .rejects.toBeInstanceOf(BadRequestException);
    expect(service.listConversations).not.toHaveBeenCalled();
  });

  test('rejects malformed turn bodies before persistence', async () => {
    await expect(controller.beginTurn('conversation-1', {
      requestId: 'request-1',
      text: 'A message',
    }, 'device-1')).rejects.toBeInstanceOf(BadRequestException);
    expect(service.beginTurn).not.toHaveBeenCalled();
  });

  test('maps ownership and stale attempt errors to explicit HTTP responses', async () => {
    jest.mocked(service.completeTurn)
      .mockRejectedValueOnce(new ChatSessionError('permission_denied', 'forbidden'))
      .mockRejectedValueOnce(new ChatSessionError('version_conflict', 'stale'));
    const body = {
      attempt: 1,
      assistantMessageId: 'assistant-1',
      text: 'A reply',
      source: 'mock',
    };

    await expect(controller.completeTurn('conversation-1', 'request-1', body, 'device-1'))
      .rejects.toBeInstanceOf(ForbiddenException);
    await expect(controller.completeTurn('conversation-1', 'request-1', body, 'device-1'))
      .rejects.toBeInstanceOf(ConflictException);
  });

  test('generates from persisted conversation messages and persists a trusted provider reply', async () => {
    const pending = {
      id: 'conversation-1',
      updatedAt: '2026-10-20T00:00:00.000Z',
      messages: [{
        id: 'user-1',
        conversationId: 'conversation-1',
        requestId: 'request-1',
        role: 'user' as const,
        text: '今天有点累。',
        createdAt: '2026-10-20T00:00:00.000Z',
      }],
      turns: [{
        requestId: 'request-1',
        sequence: 1,
        userMessageId: 'user-1',
        attempt: 1,
        status: 'pending' as const,
      }],
    };
    const completed = {
      ...pending,
      messages: [
        ...pending.messages,
        {
          id: 'assistant-1',
          conversationId: 'conversation-1',
          requestId: 'request-1',
          role: 'assistant' as const,
          text: '我在这里陪你慢慢说。',
          source: 'provider' as const,
          createdAt: '2026-10-20T00:00:01.000Z',
        },
      ],
      turns: [{
        ...pending.turns[0],
        status: 'completed' as const,
        assistantMessageId: 'assistant-1',
        source: 'provider' as const,
      }],
    };
    jest.mocked(service.getConversation).mockResolvedValue(pending);
    jest.mocked(provider.reply).mockResolvedValue({
      text: '我在这里陪你慢慢说。',
      providerRequestId: 'ark-request-1',
    });
    jest.mocked(service.completeGeneratedTurn).mockResolvedValue(completed);

    const result = await controller.generateReply(
      'conversation-1',
      'request-1',
      { attempt: 1 },
      'device-1',
    );

    expect(provider.reply).toHaveBeenCalledWith([
      { role: 'user', content: '今天有点累。' },
    ], undefined);
    expect(service.completeGeneratedTurn).toHaveBeenCalledWith(expect.objectContaining({
      conversationId: 'conversation-1',
      requestId: 'request-1',
      attempt: 1,
      text: '我在这里陪你慢慢说。',
      source: 'provider',
      providerRequestId: 'ark-request-1',
    }), 'device-1');
    expect(result.data.turns[0].source).toBe('provider');
  });

  test('omits legacy policy-blocked history from provider context', async () => {
    const snapshot = {
      id: 'conversation-1',
      updatedAt: '2026-10-20T00:00:00.000Z',
      messages: [
        {
          id: 'safe-user',
          conversationId: 'conversation-1',
          requestId: 'safe-request',
          role: 'user' as const,
          text: '上周去海边散步，心情放松了很多。',
          createdAt: '2026-10-20T00:00:00.000Z',
        },
        {
          id: 'safe-assistant',
          conversationId: 'conversation-1',
          requestId: 'safe-request',
          role: 'assistant' as const,
          text: '听起来那阵海风给你带来了一点放松。',
          source: 'provider' as const,
          createdAt: '2026-10-20T00:00:01.000Z',
        },
        {
          id: 'blocked-user',
          conversationId: 'conversation-1',
          requestId: 'old-request',
          role: 'user' as const,
          text: '请帮我写一个 Python 脚本。',
          createdAt: '2026-10-20T00:00:02.000Z',
        },
        {
          id: 'blocked-assistant',
          conversationId: 'conversation-1',
          requestId: 'old-request',
          role: 'assistant' as const,
          text: '```python\nprint(1)\n```',
          source: 'provider' as const,
          createdAt: '2026-10-20T00:00:03.000Z',
        },
        {
          id: 'user-current',
          conversationId: 'conversation-1',
          requestId: 'request-current',
          role: 'user' as const,
          text: '今天也想聊聊。',
          createdAt: '2026-10-20T00:00:04.000Z',
        },
      ],
      turns: [
        {
          requestId: 'safe-request',
          sequence: 1,
          userMessageId: 'safe-user',
          assistantMessageId: 'safe-assistant',
          attempt: 1,
          status: 'completed' as const,
          source: 'provider' as const,
        },
        {
          requestId: 'old-request',
          sequence: 2,
          userMessageId: 'blocked-user',
          assistantMessageId: 'blocked-assistant',
          attempt: 1,
          status: 'completed' as const,
          source: 'provider' as const,
        },
        {
          requestId: 'request-current',
          sequence: 3,
          userMessageId: 'user-current',
          attempt: 1,
          status: 'pending' as const,
        },
      ],
    };
    jest.mocked(service.getConversation).mockResolvedValue(snapshot);
    jest.mocked(provider.reply).mockResolvedValue({ text: '我在这里陪你。' });
    jest.mocked(service.completeGeneratedTurn).mockResolvedValue(snapshot);

    await controller.generateReply(
      'conversation-1',
      'request-current',
      { attempt: 1 },
      'device-1',
    );

    expect(provider.reply).toHaveBeenCalledWith([
      { role: 'user', content: '上周去海边散步，心情放松了很多。' },
      { role: 'assistant', content: '听起来那阵海风给你带来了一点放松。' },
      { role: 'user', content: '今天也想聊聊。' },
    ], undefined);
  });

  test('emits reply deltas over SSE and finishes with the persisted conversation', async () => {
    const pending = {
      id: 'conversation-1',
      updatedAt: '2026-10-20T00:00:00.000Z',
      messages: [{
        id: 'user-1',
        conversationId: 'conversation-1',
        requestId: 'request-stream',
        role: 'user' as const,
        text: '今天有点累。',
        createdAt: '2026-10-20T00:00:00.000Z',
      }],
      turns: [{
        requestId: 'request-stream',
        sequence: 1,
        userMessageId: 'user-1',
        attempt: 1,
        status: 'pending' as const,
      }],
    };
    const completed = {
      ...pending,
      messages: [...pending.messages, {
        id: 'assistant-stream',
        conversationId: 'conversation-1',
        requestId: 'request-stream',
        role: 'assistant' as const,
        text: '我在这里陪你。',
        source: 'provider' as const,
        createdAt: '2026-10-20T00:00:01.000Z',
      }],
      turns: [{
        ...pending.turns[0],
        status: 'completed' as const,
        assistantMessageId: 'assistant-stream',
        source: 'provider' as const,
      }],
    };
    const chunks: string[] = [];
    const response = {
      status: jest.fn().mockReturnThis(),
      set: jest.fn().mockReturnThis(),
      flushHeaders: jest.fn(),
      write: jest.fn((chunk: string) => chunks.push(chunk)),
      end: jest.fn(),
      destroyed: false,
      writableEnded: false,
    } as unknown as ChatStreamResponse;
    jest.mocked(service.getConversation).mockResolvedValue(pending);
    jest.mocked(provider.reply).mockImplementation(async (_messages, onTextDelta) => {
      onTextDelta?.('我在');
      onTextDelta?.('这里陪你。');
      return { text: '我在这里陪你。', providerRequestId: 'ark-stream-1' };
    });
    jest.mocked(service.completeGeneratedTurn).mockResolvedValue(completed);

    await controller.streamReply(
      'conversation-1',
      'request-stream',
      { attempt: 1 },
      'device-1',
      response,
    );

    expect(response.set).toHaveBeenCalledWith(expect.objectContaining({
      'Content-Type': 'text/event-stream; charset=utf-8',
      'X-Accel-Buffering': 'no',
    }));
    expect(chunks).toEqual([
      'event: delta\ndata: {"text":"我在"}\n\n',
      'event: delta\ndata: {"text":"这里陪你。"}\n\n',
      expect.stringContaining('event: complete'),
    ]);
    expect(chunks[2]).toContain('"text":"我在这里陪你。"');
    expect(response.end).toHaveBeenCalledTimes(1);
  });

  test('stores only a fixed failure code when the trusted provider fails', async () => {
    const pending = {
      id: 'conversation-1',
      updatedAt: '2026-10-20T00:00:00.000Z',
      messages: [{
        id: 'user-1',
        conversationId: 'conversation-1',
        requestId: 'request-1',
        role: 'user' as const,
        text: '今天有点累。',
        createdAt: '2026-10-20T00:00:00.000Z',
      }],
      turns: [{
        requestId: 'request-1',
        sequence: 1,
        userMessageId: 'user-1',
        attempt: 1,
        status: 'pending' as const,
      }],
    };
    jest.mocked(service.getConversation).mockResolvedValue(pending);
    jest.mocked(provider.reply).mockRejectedValue(new PetChatProviderError('timeout'));
    jest.mocked(service.failTurn).mockResolvedValue({
      ...pending,
      turns: [{ ...pending.turns[0], status: 'failed', failureCode: 'timeout' }],
    });

    const result = await controller.generateReply(
      'conversation-1',
      'request-1',
      { attempt: 1 },
      'device-1',
    );

    expect(service.failTurn).toHaveBeenCalledWith({
      conversationId: 'conversation-1',
      requestId: 'request-1',
      attempt: 1,
      failureCode: 'timeout',
    }, 'device-1');
    expect(result.data.turns[0]).toMatchObject({
      status: 'failed',
      failureCode: 'timeout',
    });
    expect(service.completeGeneratedTurn).not.toHaveBeenCalled();
  });

  test('discards a pending turn when the provider output trips the policy gate', async () => {
    const pending = {
      id: 'conversation-1',
      updatedAt: '2026-10-20T00:00:00.000Z',
      messages: [{
        id: 'user-1',
        conversationId: 'conversation-1',
        requestId: 'request-policy',
        role: 'user' as const,
        text: '今天工作有点累。',
        createdAt: '2026-10-20T00:00:00.000Z',
      }],
      turns: [{
        requestId: 'request-policy',
        sequence: 1,
        userMessageId: 'user-1',
        attempt: 1,
        status: 'pending' as const,
      }],
    };
    jest.mocked(service.getConversation).mockResolvedValue(pending);
    jest.mocked(provider.reply).mockRejectedValue(new PetChatProviderError('out_of_scope'));
    jest.mocked(service.discardPolicyBlockedTurn).mockResolvedValue(undefined);

    await expect(controller.generateReply(
      'conversation-1',
      'request-policy',
      { attempt: 1 },
      'device-1',
    )).rejects.toMatchObject({
      response: { error: { code: 'out_of_scope' } },
    });

    expect(service.discardPolicyBlockedTurn).toHaveBeenCalledWith({
      conversationId: 'conversation-1',
      requestId: 'request-policy',
      attempt: 1,
    }, 'device-1');
    expect(service.completeGeneratedTurn).not.toHaveBeenCalled();
  });

  test('rechecks legacy pending input before any provider call', async () => {
    const pending = {
      id: 'conversation-1',
      updatedAt: '2026-10-20T00:00:00.000Z',
      messages: [{
        id: 'user-legacy',
        conversationId: 'conversation-1',
        requestId: 'request-legacy',
        role: 'user' as const,
        text: '请帮我写一个 Python 脚本。',
        createdAt: '2026-10-20T00:00:00.000Z',
      }],
      turns: [{
        requestId: 'request-legacy',
        sequence: 1,
        userMessageId: 'user-legacy',
        attempt: 1,
        status: 'pending' as const,
      }],
    };
    jest.mocked(service.getConversation).mockResolvedValue(pending);
    jest.mocked(service.discardPolicyBlockedTurn).mockResolvedValue(undefined);

    await expect(controller.generateReply(
      'conversation-1',
      'request-legacy',
      { attempt: 1 },
      'device-1',
    )).rejects.toMatchObject({
      response: { error: { code: 'out_of_scope' } },
    });

    expect(provider.reply).not.toHaveBeenCalled();
    expect(service.discardPolicyBlockedTurn).toHaveBeenCalledWith({
      conversationId: 'conversation-1',
      requestId: 'request-legacy',
      attempt: 1,
    }, 'device-1');
  });

  test('coalesces duplicate generation calls for the same pending attempt', async () => {
    const pending = {
      id: 'conversation-1',
      updatedAt: '2026-10-20T00:00:00.000Z',
      messages: [{
        id: 'user-1',
        conversationId: 'conversation-1',
        requestId: 'request-1',
        role: 'user' as const,
        text: '今天有点累。',
        createdAt: '2026-10-20T00:00:00.000Z',
      }],
      turns: [{
        requestId: 'request-1',
        sequence: 1,
        userMessageId: 'user-1',
        attempt: 1,
        status: 'pending' as const,
      }],
    };
    const completed = {
      ...pending,
      messages: [
        ...pending.messages,
        {
          id: 'assistant-1',
          conversationId: 'conversation-1',
          requestId: 'request-1',
          role: 'assistant' as const,
          text: '我在这里陪你慢慢说。',
          source: 'provider' as const,
          createdAt: '2026-10-20T00:00:01.000Z',
        },
      ],
      turns: [{
        ...pending.turns[0],
        status: 'completed' as const,
        assistantMessageId: 'assistant-1',
        source: 'provider' as const,
      }],
    };
    let resolveReply!: (value: { text: string; providerRequestId: string }) => void;
    const replyResult = new Promise<{ text: string; providerRequestId: string }>(resolve => {
      resolveReply = resolve;
    });
    jest.mocked(service.getConversation).mockResolvedValue(pending);
    jest.mocked(provider.reply).mockReturnValue(replyResult);
    jest.mocked(service.completeGeneratedTurn).mockResolvedValue(completed);

    const first = controller.generateReply('conversation-1', 'request-1', { attempt: 1 }, 'device-1');
    const duplicate = controller.generateReply('conversation-1', 'request-1', { attempt: 1 }, 'device-1');
    await Promise.resolve();
    expect(provider.reply).toHaveBeenCalledTimes(1);

    resolveReply({ text: '我在这里陪你慢慢说。', providerRequestId: 'ark-request-1' });
    const [firstResult, duplicateResult] = await Promise.all([first, duplicate]);
    expect(firstResult.data).toEqual(duplicateResult.data);
    expect(service.completeGeneratedTurn).toHaveBeenCalledTimes(1);
  });

  test('allows only one active generation task per device and rejects another turn before persistence', async () => {
    const pendingConversation = (conversationId: string, requestId: string, userMessageId: string) => ({
      id: conversationId,
      updatedAt: '2026-10-20T00:00:00.000Z',
      messages: [{
        id: userMessageId,
        conversationId,
        requestId,
        role: 'user' as const,
        text: '今天有点累。',
        createdAt: '2026-10-20T00:00:00.000Z',
      }],
      turns: [{
        requestId,
        sequence: 1,
        userMessageId,
        attempt: 1,
        status: 'pending' as const,
      }],
    });
    const firstPending = pendingConversation('conversation-1', 'request-1', 'user-1');
    const secondPending = pendingConversation('conversation-2', 'request-2', 'user-2');
    const completed = {
      ...firstPending,
      messages: [...firstPending.messages, {
        id: 'assistant-1',
        conversationId: 'conversation-1',
        requestId: 'request-1',
        role: 'assistant' as const,
        text: '我在这里陪你。',
        source: 'provider' as const,
        createdAt: '2026-10-20T00:00:01.000Z',
      }],
      turns: [{
        ...firstPending.turns[0],
        status: 'completed' as const,
        assistantMessageId: 'assistant-1',
        source: 'provider' as const,
      }],
    };
    let resolveReply!: (value: { text: string; providerRequestId: string }) => void;
    const replyResult = new Promise<{ text: string; providerRequestId: string }>(resolve => {
      resolveReply = resolve;
    });
    jest.mocked(service.getConversation).mockImplementation(async conversationId =>
      conversationId === 'conversation-1' ? firstPending : secondPending);
    jest.mocked(provider.reply).mockReturnValue(replyResult);
    jest.mocked(service.completeGeneratedTurn).mockResolvedValue(completed);

    const active = controller.generateReply('conversation-1', 'request-1', { attempt: 1 }, 'device-1');
    await Promise.resolve();
    expect(provider.reply).toHaveBeenCalledTimes(1);

    await expect(controller.beginTurn('conversation-2', {
      requestId: 'request-2',
      userMessageId: 'user-2',
      text: '今天也想聊聊。',
    }, 'device-1')).rejects.toMatchObject({
      response: { error: { code: 'chat_busy' } },
    });
    await expect(controller.generateReply(
      'conversation-2',
      'request-2',
      { attempt: 1 },
      'device-1',
    )).rejects.toMatchObject({
      response: { error: { code: 'chat_busy' } },
    });
    await expect(controller.retryTurn(
      'conversation-2',
      'request-2',
      { nextAttempt: 2 },
      'device-1',
    )).rejects.toMatchObject({
      response: { error: { code: 'chat_busy' } },
    });
    expect(service.beginTurn).not.toHaveBeenCalled();
    expect(service.retryTurn).not.toHaveBeenCalled();
    expect(provider.reply).toHaveBeenCalledTimes(1);

    resolveReply({ text: '我在这里陪你。', providerRequestId: 'ark-request-1' });
    await expect(active).resolves.toMatchObject({ data: completed });
  });
});
