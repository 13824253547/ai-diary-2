import type { PetChatConversation } from '../../contracts/pet-chat-contract';
import type { PetChatRepository } from '../../repositories/pet-chat-repository';
import { PetChatRepositoryError } from '../../repositories/pet-chat-repository';
import { createTestStore } from '../../test-utils/create-test-store';

function buildConversation(input: {
  conversationId: string;
  requestId: string;
  userMessageId: string;
  text: string;
  status: 'pending' | 'failed' | 'completed';
  attempt?: number;
  failureCode?: 'timeout' | 'cancelled' | 'provider_failed';
  reply?: string;
}): PetChatConversation {
  const attempt = input.attempt ?? 1;
  return {
    id: input.conversationId,
    updatedAt: '2026-10-20T00:00:00.000Z',
    messages: [
      {
        id: input.userMessageId,
        conversationId: input.conversationId,
        requestId: input.requestId,
        role: 'user',
        text: input.text,
        createdAt: '2026-10-20T00:00:00.000Z',
      },
      ...(input.status === 'completed'
        ? [{
            id: `assistant-${input.requestId}`,
            conversationId: input.conversationId,
            requestId: input.requestId,
            role: 'assistant' as const,
            text: input.reply ?? '小橘收到啦。',
            source: 'provider' as const,
            providerRequestId: 'ark-request-test',
            createdAt: '2026-10-20T00:00:01.000Z',
          }]
        : []),
    ],
    turns: [{
      requestId: input.requestId,
      sequence: 1,
      userMessageId: input.userMessageId,
      ...(input.status === 'completed' ? { assistantMessageId: `assistant-${input.requestId}` } : {}),
      attempt,
      status: input.status,
      ...(input.status === 'failed' ? { failureCode: input.failureCode ?? 'provider_failed' } : {}),
      ...(input.status === 'completed'
        ? { source: 'provider' as const, providerRequestId: 'ark-request-test' }
        : {}),
    }],
  };
}

async function flushAsyncWork() {
  await new Promise(resolve => setTimeout(resolve, 0));
}

function createRepository(overrides: Partial<PetChatRepository> = {}): PetChatRepository {
  const turns = new Map<string, {
    conversationId: string;
    requestId: string;
    userMessageId: string;
    text: string;
  }>();
  return {
    listConversations: jest.fn(async () => ({ items: [], page: 1, pageSize: 20 as const, total: 0 })),
    getConversation: jest.fn(async () => {
      throw new Error('unexpected getConversation');
    }),
    beginTurn: jest.fn(async input => {
      turns.set(input.requestId, input);
      return buildConversation({ ...input, status: 'pending' });
    }),
    generateReply: jest.fn(async input => {
      const turn = turns.get(input.requestId);
      if (!turn) throw new Error('turn has not been persisted');
      return buildConversation({
        ...turn,
        status: 'completed',
        attempt: input.attempt,
      });
    }),
    completeTurn: jest.fn(async () => {
      throw new Error('client must not submit provider replies');
    }),
    failTurn: jest.fn(async () => {
      throw new Error('unexpected failTurn');
    }),
    retryTurn: jest.fn(async input => {
      const turn = turns.get(input.requestId);
      if (!turn) throw new Error('turn has not been persisted');
      return buildConversation({
        ...turn,
        status: 'pending',
        attempt: input.nextAttempt,
      });
    }),
    ...overrides,
  };
}

describe('PET-001 Store/server integration', () => {
  test('uses the device-scoped server repository instead of the local mock provider', async () => {
    const localMockReply = jest.fn(() => ({ text: '本地 mock', source: 'mock' as const }));
    const repository = createRepository();
    const { store } = createTestStore({
      adapters: { petChatRepository: repository },
      chatReplyProvider: { reply: localMockReply },
    });
    const get = () => store.getState();

    get().sendChat('  今天很开心。  ');
    await flushAsyncWork();

    const conversationId = get().chatConversationId!;
    const request = get().chatTurnRequests[0];
    expect(repository.beginTurn).toHaveBeenCalledWith({
      conversationId,
      requestId: request.id,
      userMessageId: request.userMessageId,
      text: '今天很开心。',
    });
    expect(repository.generateReply).toHaveBeenCalledWith(expect.objectContaining({
      conversationId,
      requestId: request.id,
      attempt: 1,
    }), undefined, expect.any(Function));
    expect(localMockReply).not.toHaveBeenCalled();
    expect(get().chatTurnRequests[0]).toMatchObject({ status: 'completed', source: 'provider' });
    expect(get().chatMessages.map(message => message.role)).toEqual(['assistant', 'user', 'assistant']);
    expect(get().chatMessages[get().chatMessages.length - 1]).toMatchObject({
      source: 'provider',
      text: '小橘收到啦。',
    });
  });

  test('shows streamed assistant text before the server finishes the turn', async () => {
    let finishReply!: () => void;
    const replyFinished = new Promise<void>(resolve => {
      finishReply = resolve;
    });
    const repository = createRepository({
      generateReply: jest.fn(async (input, _options, onTextDelta) => {
        onTextDelta?.('我在');
        await replyFinished;
        return buildConversation({
          conversationId: input.conversationId,
          requestId: input.requestId,
          userMessageId: 'user-stream',
          text: '今天有点累。',
          status: 'completed',
          attempt: input.attempt,
          reply: '我在这里陪你。',
        });
      }),
    });
    const { store } = createTestStore({ adapters: { petChatRepository: repository } });
    const get = () => store.getState();

    get().sendChat('今天有点累。');
    await flushAsyncWork();

    expect(get().chatMessages.find(message => message.source === 'pending')?.text).toBe('我在');
    finishReply();
    await flushAsyncWork();
    expect(get().chatTurnRequests[0].status).toBe('completed');
    expect(get().chatMessages.find(message => message.source === 'provider')?.text).toBe('我在这里陪你。');
  });

  test('reconciles failed turns and retries the persisted server attempt without duplicating the user message', async () => {
    let serverConversation: PetChatConversation | undefined;
    const repository = createRepository({
      beginTurn: jest.fn(async input => {
        serverConversation = buildConversation({ ...input, status: 'pending' });
        return serverConversation;
      }),
      generateReply: jest.fn(async input => {
        if (input.attempt === 1) {
          serverConversation = buildConversation({
            conversationId: input.conversationId,
            requestId: input.requestId,
            userMessageId: `user-${input.requestId}`,
            text: '今天很开心。',
            status: 'failed',
            failureCode: 'timeout',
          });
        } else {
          serverConversation = buildConversation({
            conversationId: input.conversationId,
            requestId: input.requestId,
            userMessageId: `user-${input.requestId}`,
            text: '今天很开心。',
            status: 'completed',
            attempt: input.attempt,
          });
        }
        return serverConversation;
      }),
      getConversation: jest.fn(async () => serverConversation!),
      retryTurn: jest.fn(async input => {
        serverConversation = buildConversation({
          conversationId: input.conversationId,
          requestId: input.requestId,
          userMessageId: `user-${input.requestId}`,
          text: '今天很开心。',
          status: 'pending',
          attempt: input.nextAttempt,
        });
        return serverConversation;
      }),
    });
    const { store } = createTestStore({ adapters: { petChatRepository: repository } });
    const get = () => store.getState();

    get().sendChat('今天很开心。');
    await flushAsyncWork();
    const requestId = get().chatTurnRequests[0].id;
    expect(get().chatMessages[get().chatMessages.length - 1]).toMatchObject({
      source: 'failed',
      text: '小橘回复超时了，点这里重试。',
    });

    get().retryChat(requestId);
    await flushAsyncWork();

    expect(repository.retryTurn).toHaveBeenCalledWith({
      conversationId: get().chatConversationId,
      requestId,
      nextAttempt: 2,
    });
    expect(repository.generateReply).toHaveBeenLastCalledWith(expect.objectContaining({
      conversationId: get().chatConversationId,
      requestId,
      attempt: 2,
    }), undefined, expect.any(Function));
    expect(get().chatTurnRequests[0]).toMatchObject({ status: 'completed', attempt: 2 });
    expect(get().chatMessages.filter(message => message.role === 'user')).toHaveLength(1);
    expect(get().chatMessages.filter(message => message.role === 'assistant' && message.source === 'provider')).toHaveLength(1);
  });

  test('keeps an earlier local-only failed message in its original position after a later turn succeeds', async () => {
    type StoredTurn = {
      conversationId: string;
      requestId: string;
      userMessageId: string;
      text: string;
      sequence: number;
      attempt: number;
      status: 'pending' | 'completed';
      reply?: string;
    };
    const turns = new Map<string, StoredTurn>();
    let nextSequence = 1;
    let failFirstBegin = true;
    let conversationId = 'conversation-ordered';
    const snapshot = (): PetChatConversation => ({
      id: conversationId,
      updatedAt: '2026-10-20T00:00:00.000Z',
      turns: [...turns.values()].sort((left, right) => left.sequence - right.sequence).map(turn => ({
        requestId: turn.requestId,
        sequence: turn.sequence,
        userMessageId: turn.userMessageId,
        ...(turn.status === 'completed' ? { assistantMessageId: `assistant-${turn.requestId}` } : {}),
        attempt: turn.attempt,
        status: turn.status,
        ...(turn.status === 'completed' ? {
          source: 'provider' as const,
          providerRequestId: `provider-${turn.requestId}`,
        } : {}),
      })),
      messages: [...turns.values()]
        .sort((left, right) => left.sequence - right.sequence)
        .flatMap(turn => [
          {
            id: turn.userMessageId,
            conversationId: turn.conversationId,
            requestId: turn.requestId,
            role: 'user' as const,
            text: turn.text,
            createdAt: '2026-10-20T00:00:00.000Z',
          },
          ...(turn.status === 'completed'
            ? [{
                id: `assistant-${turn.requestId}`,
                conversationId: turn.conversationId,
                requestId: turn.requestId,
                role: 'assistant' as const,
                text: turn.reply!,
                source: 'provider' as const,
                providerRequestId: `provider-${turn.requestId}`,
                createdAt: '2026-10-20T00:00:01.000Z',
              }]
            : []),
        ]),
    });
    const repository = createRepository({
      beginTurn: jest.fn(async input => {
        conversationId = input.conversationId;
        if (input.text === '旧消息' && failFirstBegin) {
          failFirstBegin = false;
          throw new PetChatRepositoryError('provider_failed', 'network failed', true);
        }
        if (!turns.has(input.requestId)) {
          turns.set(input.requestId, {
            ...input,
            sequence: nextSequence++,
            attempt: 1,
            status: 'pending',
          });
        }
        return snapshot();
      }),
      getConversation: jest.fn(async () => snapshot()),
      generateReply: jest.fn(async input => {
        const turn = turns.get(input.requestId)!;
        turn.status = 'completed';
        turn.attempt = input.attempt;
        turn.reply = turn.text === '旧消息'
          ? '旧消息重试成功'
          : '新消息回复成功';
        return snapshot();
      }),
    });
    const { store } = createTestStore({
      adapters: { petChatRepository: repository },
      now: (() => {
        let now = 1;
        return () => now++;
      })(),
    });
    const get = () => store.getState();

    get().sendChat('旧消息');
    await flushAsyncWork();
    const oldRequestId = get().chatTurnRequests[0].id;
    expect(get().chatMessages.at(-1)).toMatchObject({ source: 'failed' });

    get().sendChat('新消息');
    await flushAsyncWork();
    const newRequestId = get().chatTurnRequests[1].id;
    expect(get().chatTurnRequests.map(request => request.id)).toEqual([oldRequestId, newRequestId]);
    expect(get().chatMessages.map(message => message.text)).toEqual([
      '嘿，今天过得怎么样？\n我一直在这里，想听听你的小故事。',
      '旧消息',
      '小橘刚刚没有连上，点这里重试。',
      '新消息',
      '新消息回复成功',
    ]);

    get().retryChat(oldRequestId);
    await flushAsyncWork();

    expect(get().chatTurnRequests.map(request => request.id)).toEqual([oldRequestId, newRequestId]);
    expect(get().chatMessages.map(message => message.text)).toEqual([
      '嘿，今天过得怎么样？\n我一直在这里，想听听你的小故事。',
      '旧消息',
      '旧消息重试成功',
      '新消息',
      '新消息回复成功',
    ]);
  });

  test('shows a non-retryable Chinese block when the server rejects an out-of-scope request', async () => {
    const repository = createRepository({
      beginTurn: jest.fn(async () => {
        throw new PetChatRepositoryError('out_of_scope', 'blocked', false);
      }),
    });
    const { store } = createTestStore({ adapters: { petChatRepository: repository } });
    const get = () => store.getState();

    get().sendChat('请帮我写一个 Python 脚本。');
    await flushAsyncWork();

    const request = get().chatTurnRequests[0];
    expect(request).toMatchObject({ status: 'blocked', error: 'out_of_scope' });
    expect(get().chatMessages.at(-1)).toMatchObject({
      role: 'assistant',
      source: 'blocked',
      text: '小橘主要陪你聊日常、心情和旅行回忆，暂不提供代码、小说或商业内容创作。',
    });
    get().retryChat(request.id);
    expect(repository.generateReply).not.toHaveBeenCalled();
    expect(repository.retryTurn).not.toHaveBeenCalled();
  });

  test('does not add a second turn while one device task is pending', async () => {
    let releaseBegin!: () => void;
    const beginGate = new Promise<void>(resolve => {
      releaseBegin = resolve;
    });
    let firstInput: Parameters<PetChatRepository['beginTurn']>[0] | undefined;
    const repository = createRepository({
      beginTurn: jest.fn(async input => {
        firstInput = input;
        await beginGate;
        return buildConversation({ ...input, status: 'pending' });
      }),
      generateReply: jest.fn(async input => buildConversation({
        ...firstInput!,
        status: 'completed',
        attempt: input.attempt,
      })),
    });
    const { store } = createTestStore({ adapters: { petChatRepository: repository } });
    const get = () => store.getState();

    get().sendChat('第一条消息');
    get().sendChat('第二条消息');

    expect(repository.beginTurn).toHaveBeenCalledTimes(1);
    expect(get().chatMessages.filter(message => message.role === 'user')).toHaveLength(1);
    expect(get().chatTurnRequests).toHaveLength(1);

    releaseBegin();
    await flushAsyncWork();
    expect(get().chatTurnRequests[0].status).toBe('completed');
  });
});
