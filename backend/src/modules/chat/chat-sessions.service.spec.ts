import { PrismaService } from '../../common/prisma.service';
import { ChatSessionsService } from './chat-sessions.service';

function createHarness() {
  const conversations = new Map<string, Record<string, any>>();
  const turns = new Map<string, Record<string, any>>();
  const messages = new Map<string, Record<string, any>>();

  const turnKey = (ownerDeviceId: string, conversationId: string, requestId: string) =>
    `${ownerDeviceId}:${conversationId}:${requestId}`;
  const findTurn = (where: Record<string, any>) => {
    if (where.id) return [...turns.values()].find(turn => turn.id === where.id) ?? null;
    const key = where.ownerDeviceId_conversationId_requestId;
    return turns.get(turnKey(key.ownerDeviceId, key.conversationId, key.requestId)) ?? null;
  };
  let nextId = 1;

  const tx = {
    $queryRaw: jest.fn(async () => []),
    chatConversation: {
      findUnique: jest.fn(async ({ where }: { where: { id: string } }) => conversations.get(where.id) ?? null),
      findUniqueOrThrow: jest.fn(async ({ where }: { where: { id: string } }) => {
        const conversation = conversations.get(where.id);
        if (!conversation) throw new Error('conversation not found');
        return conversation;
      }),
      create: jest.fn(async ({ data }: { data: Record<string, any> }) => {
        const conversation = {
          id: data.id,
          ownerDeviceId: data.ownerDeviceId,
          nextTurnSequence: 1,
          createdAt: new Date('2026-10-16T00:00:00.000Z'),
          updatedAt: new Date('2026-10-16T00:00:00.000Z'),
        };
        conversations.set(conversation.id, conversation);
        return conversation;
      }),
      update: jest.fn(async ({ where, data }: {
        where: { id: string };
        data: { nextTurnSequence: number };
      }) => {
        const conversation = conversations.get(where.id);
        if (!conversation) throw new Error('conversation not found');
        Object.assign(conversation, data, { updatedAt: new Date('2026-10-16T00:01:00.000Z') });
        return conversation;
      }),
      findMany: jest.fn(async ({ skip, take }: { skip: number; take: number }) =>
        [...conversations.values()]
          .slice(skip, skip + take)
          .map(conversation => ({
            ...conversation,
            _count: {
              messages: [...messages.values()].filter(message => message.conversationId === conversation.id).length,
            },
          })),
      ),
      count: jest.fn(async () => conversations.size),
    },
    chatTurn: {
      findUnique: jest.fn(async ({ where }: { where: Record<string, any> }) => findTurn(where)),
      findUniqueOrThrow: jest.fn(async ({ where }: { where: Record<string, any> }) => {
        const turn = findTurn(where);
        if (!turn) throw new Error('turn not found');
        return turn;
      }),
      findMany: jest.fn(async ({ where }: { where: { conversationId: string } }) =>
        [...turns.values()].filter(turn => turn.conversationId === where.conversationId),
      ),
      create: jest.fn(async ({ data }: { data: Record<string, any> }) => {
        const turn = {
          id: `turn-${nextId++}`,
          assistantMessageId: null,
          failureCode: null,
          source: null,
          providerRequestId: null,
          resultHash: null,
          createdAt: new Date('2026-10-16T00:00:00.000Z'),
          updatedAt: new Date('2026-10-16T00:00:00.000Z'),
          ...data,
        };
        turns.set(turnKey(data.ownerDeviceId, data.conversationId, data.requestId), turn);
        return turn;
      }),
      update: jest.fn(async ({ where, data }: { where: { id: string }; data: Record<string, any> }) => {
        const turn = [...turns.values()].find(item => item.id === where.id);
        if (!turn) throw new Error('turn not found');
        Object.assign(turn, data, { updatedAt: new Date('2026-10-16T00:02:00.000Z') });
        return turn;
      }),
    },
    chatMessage: {
      findUnique: jest.fn(async ({ where }: { where: { id: string } }) => messages.get(where.id) ?? null),
      findMany: jest.fn(async ({ where }: { where: { conversationId: string } }) =>
        [...messages.values()]
          .filter(message => message.conversationId === where.conversationId)
          .sort((left, right) => left.order - right.order),
      ),
      create: jest.fn(async ({ data }: { data: Record<string, any> }) => {
        const message: Record<string, any> = {
          ...data,
          source: data.source ?? null,
          providerRequestId: data.providerRequestId ?? null,
          createdAt: new Date('2026-10-16T00:01:00.000Z'),
        };
        messages.set(message.id, message);
        return message;
      }),
    },
  };
  const prisma = {
    ...tx,
    $transaction: jest.fn((operation: unknown) => Array.isArray(operation)
      ? Promise.all(operation)
      : (operation as (transaction: typeof tx) => Promise<unknown>)(tx)),
  };

  return {
    conversations,
    turns,
    messages,
    prisma,
    service: new ChatSessionsService(prisma as unknown as PrismaService),
  };
}

const beginInput = {
  conversationId: 'conversation-1',
  requestId: 'request-1',
  userMessageId: 'user-1',
  text: '  We went for a walk.  ',
};

describe('ChatSessionsService', () => {
  test.each([
    null,
    [],
    { page: 1, pageSize: '20' },
    { page: 1.5, pageSize: 20 },
    { page: 1, pageSize: 15 },
  ])('rejects malformed pagination before database access (%j)', async input => {
    const harness = createHarness();

    await expect(harness.service.listConversations(input, 'device-1'))
      .rejects.toMatchObject({ code: 'invalid_input' });
    expect(harness.prisma.$transaction).not.toHaveBeenCalled();
  });

  test('persists one user turn idempotently and keeps messages in turn order', async () => {
    const harness = createHarness();

    const first = await harness.service.beginTurn(beginInput, 'device-1');
    const replay = await harness.service.beginTurn(beginInput, 'device-1');

    expect(first.messages).toHaveLength(1);
    expect(first.messages[0]).toMatchObject({
      id: 'user-1',
      text: 'We went for a walk.',
      role: 'user',
    });
    expect(first.turns[0]).toMatchObject({
      requestId: 'request-1',
      attempt: 1,
      status: 'pending',
    });
    expect(replay.messages).toEqual(first.messages);
    expect(harness.messages.size).toBe(1);
    expect(harness.turns.size).toBe(1);
  });

  test('stores a reply once and replays the existing assistant message', async () => {
    const harness = createHarness();
    await harness.service.beginTurn(beginInput, 'device-1');
    const reply = {
      conversationId: 'conversation-1',
      requestId: 'request-1',
      attempt: 1,
      assistantMessageId: 'assistant-1',
      text: 'That sounds peaceful.',
      source: 'mock' as const,
    };

    const completed = await harness.service.completeTurn(reply, 'device-1');
    const replay = await harness.service.completeTurn(reply, 'device-1');

    expect(completed.messages.map(message => message.role)).toEqual(['user', 'assistant']);
    expect(replay.messages).toEqual(completed.messages);
    expect(harness.messages.size).toBe(2);
  });

  test('rejects client-declared provider replies in development but permits explicit mock replies', async () => {
    const harness = createHarness();
    await harness.service.beginTurn(beginInput, 'device-1');
    const previousNodeEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = 'development';
    try {
      await expect(harness.service.completeTurn({
        conversationId: 'conversation-1',
        requestId: 'request-1',
        attempt: 1,
        assistantMessageId: 'untrusted-provider-reply',
        text: 'Untrusted provider claim',
        source: 'provider',
      }, 'device-1')).rejects.toMatchObject({ code: 'provider_failed' });

      const mockReply = await harness.service.completeTurn({
        conversationId: 'conversation-1',
        requestId: 'request-1',
        attempt: 1,
        assistantMessageId: 'mock-assistant-1',
        text: 'Explicit development mock',
        source: 'mock',
      }, 'device-1');
      expect(mockReply.messages[1]).toMatchObject({ source: 'mock', text: 'Explicit development mock' });
    } finally {
      if (previousNodeEnv === undefined) delete process.env.NODE_ENV;
      else process.env.NODE_ENV = previousNodeEnv;
    }
    expect(harness.messages.size).toBe(2);
  });

  test('persists fixed failure state, advances an explicit attempt, and isolates devices', async () => {
    const harness = createHarness();
    await harness.service.beginTurn(beginInput, 'device-1');
    await harness.service.failTurn({
      conversationId: 'conversation-1',
      requestId: 'request-1',
      attempt: 1,
      failureCode: 'timeout',
    }, 'device-1');

    const retried = await harness.service.retryTurn({
      conversationId: 'conversation-1',
      requestId: 'request-1',
      nextAttempt: 2,
    }, 'device-1');
    expect(retried.turns[0]).toMatchObject({ attempt: 2, status: 'pending' });
    await expect(harness.service.completeTurn({
      conversationId: 'conversation-1',
      requestId: 'request-1',
      attempt: 1,
      assistantMessageId: 'late-assistant',
      text: 'Late response',
      source: 'provider',
    }, 'device-1')).rejects.toMatchObject({ code: 'version_conflict' });

    await expect(harness.service.getConversation('conversation-1', 'device-2'))
      .rejects.toMatchObject({ code: 'permission_denied' });
    expect(harness.messages.size).toBe(1);
  });

  test('rejects request ID reuse with different message content', async () => {
    const harness = createHarness();
    await harness.service.beginTurn(beginInput, 'device-1');
    await expect(harness.service.beginTurn({
      ...beginInput,
      text: 'A different message',
    }, 'device-1')).rejects.toMatchObject({ code: 'invalid_input' });
  });

  test('fails closed for client replies in production without a trusted server provider', async () => {
    const harness = createHarness();
    await harness.service.beginTurn(beginInput, 'device-1');
    const previousNodeEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = 'production';
    try {
      await expect(harness.service.beginTurn({
        ...beginInput,
        conversationId: 'conversation-production',
        requestId: 'request-production',
        userMessageId: 'user-production',
      }, 'device-1')).rejects.toMatchObject({ code: 'provider_failed' });
      await expect(harness.service.retryTurn({
        conversationId: 'conversation-1',
        requestId: 'request-1',
        nextAttempt: 2,
      }, 'device-1')).rejects.toMatchObject({ code: 'provider_failed' });
      for (const source of ['mock', 'provider'] as const) {
        await expect(harness.service.completeTurn({
          conversationId: 'conversation-1',
          requestId: 'request-1',
          attempt: 1,
          assistantMessageId: `assistant-${source}`,
          text: 'Client-supplied reply',
          source,
        }, 'device-1')).rejects.toMatchObject({ code: 'provider_failed' });
      }
    } finally {
      if (previousNodeEnv === undefined) delete process.env.NODE_ENV;
      else process.env.NODE_ENV = previousNodeEnv;
    }
    expect(harness.messages.size).toBe(1);
    expect(harness.conversations.has('conversation-production')).toBe(false);
  });
});
