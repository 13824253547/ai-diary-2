import { HttpPetChatRepository } from '../http-pet-chat-repository';
import { PetChatRepositoryError } from '../pet-chat-repository';
import { PROVIDER_REQUEST_CLIENT_TIMEOUT_MS, type ApiClient } from '../../services/api-client';

const conversation = {
  id: 'conversation-1',
  updatedAt: '2026-10-16T00:00:00.000Z',
  messages: [{
    id: 'user-1',
    conversationId: 'conversation-1',
    requestId: 'request-1',
    role: 'user',
    text: 'Today was lovely.',
    createdAt: '2026-10-16T00:00:00.000Z',
  }],
  turns: [{
    requestId: 'request-1',
    sequence: 1,
    userMessageId: 'user-1',
    attempt: 1,
    status: 'pending',
  }],
};

const client = {
  request: jest.fn(),
  buildUrl: jest.fn((path: string) => `http://localhost:3001/api${path}`),
  getHeaders: jest.fn(async (extra?: Record<string, string>) => ({
    ...extra,
    'x-device-id': 'device-1',
  })),
} as unknown as ApiClient;

describe('HttpPetChatRepository', () => {
  const repository = new HttpPetChatRepository(client);
  const originalXMLHttpRequest = globalThis.XMLHttpRequest;

  beforeEach(() => {
    jest.clearAllMocks();
  });

  afterEach(() => {
    Object.defineProperty(globalThis, 'XMLHttpRequest', {
      configurable: true,
      writable: true,
      value: originalXMLHttpRequest,
    });
  });

  test('loads conversation history through a versioned envelope', async () => {
    jest.mocked(client.request).mockResolvedValue({
      ok: true,
      status: 200,
      data: { ok: true, version: 'pet-chat-v1', data: conversation },
    });

    await expect(repository.getConversation('conversation-1')).resolves.toEqual(conversation);
    expect(client.request).toHaveBeenCalledWith(
      '/chat/conversations/conversation-1',
      { method: 'GET' },
      undefined,
    );
  });

  test('persists a trimmed user turn with stable request and message IDs', async () => {
    jest.mocked(client.request).mockResolvedValue({
      ok: true,
      status: 200,
      data: { ok: true, version: 'pet-chat-v1', data: conversation },
    });

    await expect(repository.beginTurn({
      conversationId: 'conversation-1',
      requestId: 'request-1',
      userMessageId: 'user-1',
      text: '  Today was lovely.  ',
    })).resolves.toEqual(conversation);
    expect(client.request).toHaveBeenCalledWith(
      '/chat/conversations/conversation-1/turns',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          requestId: 'request-1',
          userMessageId: 'user-1',
          text: 'Today was lovely.',
        }),
      },
      undefined,
    );
  });

  test('asks the server to generate a provider reply for the persisted attempt', async () => {
    jest.mocked(client.request).mockResolvedValue({
      ok: true,
      status: 200,
      data: { ok: true, version: 'pet-chat-v1', data: conversation },
    });

    await expect(repository.generateReply({
      conversationId: 'conversation-1',
      requestId: 'request-1',
      attempt: 1,
    })).resolves.toEqual(conversation);
    expect(client.request).toHaveBeenCalledWith(
      '/chat/conversations/conversation-1/turns/request-1/generate',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ attempt: 1 }),
      },
      undefined,
    );
  });

  test('reads SSE deltas incrementally and resolves the completed conversation', async () => {
    const completed = {
      ...conversation,
      messages: [
        ...conversation.messages,
        {
          id: 'assistant-1',
          conversationId: 'conversation-1',
          requestId: 'request-1',
          role: 'assistant',
          text: '我在这里陪你。',
          source: 'provider',
          providerRequestId: 'ark-stream-1',
          createdAt: '2026-10-16T00:00:01.000Z',
        },
      ],
      turns: [{
        ...conversation.turns[0],
        assistantMessageId: 'assistant-1',
        status: 'completed',
        source: 'provider',
        providerRequestId: 'ark-stream-1',
      }],
    };
    const chunks = [
      `event: delta\ndata: ${JSON.stringify({ text: '我在' })}\n\n`,
      `event: delta\ndata: ${JSON.stringify({ text: '这里陪你。' })}\n\n`,
      `event: complete\ndata: ${JSON.stringify({ ok: true, version: 'pet-chat-v1', data: completed })}\n\n`,
    ];
    let request: {
      responseText: string;
      status: number;
      timeout: number;
      onprogress: ((event: ProgressEvent) => void) | null;
      onload: ((event: ProgressEvent) => void) | null;
      headers: Record<string, string>;
    } | undefined;
    class FakeXMLHttpRequest {
      responseText = '';
      status = 200;
      responseType = '';
      timeout = 0;
      onprogress: ((event: ProgressEvent) => void) | null = null;
      onload: ((event: ProgressEvent) => void) | null = null;
      onerror: ((event: ProgressEvent) => void) | null = null;
      ontimeout: ((event: ProgressEvent) => void) | null = null;
      onabort: ((event: ProgressEvent) => void) | null = null;
      headers: Record<string, string> = {};
      open = jest.fn();
      setRequestHeader(name: string, value: string) {
        this.headers[name] = value;
      }
      send = jest.fn(() => {
        request = this;
        for (const chunk of chunks) {
          this.responseText += chunk;
          this.onprogress?.({} as ProgressEvent);
        }
        this.onload?.({} as ProgressEvent);
      });
      abort = jest.fn();
    }
    Object.defineProperty(globalThis, 'XMLHttpRequest', {
      configurable: true,
      writable: true,
      value: FakeXMLHttpRequest,
    });
    const onTextDelta = jest.fn();

    await expect(repository.generateReply({
      conversationId: 'conversation-1',
      requestId: 'request-1',
      attempt: 1,
    }, undefined, onTextDelta)).resolves.toEqual(completed);

    expect(client.buildUrl).toHaveBeenCalledWith(
      '/chat/conversations/conversation-1/turns/request-1/generate/stream',
    );
    expect(request?.timeout).toBe(PROVIDER_REQUEST_CLIENT_TIMEOUT_MS);
    expect(request?.headers['x-device-id']).toBe('device-1');
    expect(onTextDelta.mock.calls.flat()).toEqual(['我在', '这里陪你。']);
  });

  test('rejects invalid generation attempts before making an HTTP request', async () => {
    await expect(repository.generateReply({
      conversationId: 'conversation-1',
      requestId: 'request-1',
      attempt: 0,
    })).rejects.toMatchObject({ code: 'invalid_input', retryable: false });
    expect(client.request).not.toHaveBeenCalled();
  });

  test('rejects blank turns locally and preserves structured server conflicts', async () => {
    await expect(repository.beginTurn({
      conversationId: 'conversation-1',
      requestId: 'request-1',
      userMessageId: 'user-1',
      text: ' \n ',
    })).rejects.toMatchObject({ code: 'invalid_input' });
    expect(client.request).not.toHaveBeenCalled();

    jest.mocked(client.request).mockResolvedValue({
      ok: false,
      status: 409,
      data: {
        ok: false,
        error: { code: 'version_conflict', message: 'stale attempt', retryable: false },
      },
    });
    await expect(repository.retryTurn({
      conversationId: 'conversation-1',
      requestId: 'request-1',
      nextAttempt: 2,
    })).rejects.toBeInstanceOf(PetChatRepositoryError);
    await expect(repository.retryTurn({
      conversationId: 'conversation-1',
      requestId: 'request-1',
      nextAttempt: 2,
    })).rejects.toMatchObject({ code: 'version_conflict' });
  });

  test('rejects unknown failure codes before making an HTTP request', async () => {
    await expect(repository.failTurn({
      conversationId: 'conversation-1',
      requestId: 'request-1',
      attempt: 1,
      failureCode: 'unknown' as never,
    })).rejects.toMatchObject({ code: 'invalid_input', retryable: false });
    expect(client.request).not.toHaveBeenCalled();
  });

  test.each(['out_of_scope', 'unsafe_request', 'chat_busy'] as const)(
    'preserves server policy rejection code %s',
    async code => {
      jest.mocked(client.request).mockResolvedValue({
        ok: false,
        status: code === 'chat_busy' ? 409 : 400,
        data: {
          ok: false,
          error: { code, message: 'blocked', retryable: false },
        },
      });

      await expect(repository.beginTurn({
        conversationId: 'conversation-1',
        requestId: 'request-blocked',
        userMessageId: 'user-blocked',
        text: 'request',
      })).rejects.toMatchObject({ code, retryable: false });
    },
  );

  test('rejects a conversation envelope containing another conversation message', async () => {
    jest.mocked(client.request).mockResolvedValue({
      ok: true,
      status: 200,
      data: {
        ok: true,
        version: 'pet-chat-v1',
        data: {
          ...conversation,
          messages: [{
            ...conversation.messages[0],
            conversationId: 'conversation-2',
          }],
        },
      },
    });

    await expect(repository.getConversation('conversation-1'))
      .rejects.toMatchObject({ code: 'provider_failed' });
  });
});
