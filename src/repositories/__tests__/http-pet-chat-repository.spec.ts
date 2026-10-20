import { HttpPetChatRepository } from '../http-pet-chat-repository';
import { PetChatRepositoryError } from '../pet-chat-repository';
import type { ApiClient } from '../../services/api-client';

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

describe('HttpPetChatRepository', () => {
  const client = { request: jest.fn() } as unknown as ApiClient;
  const repository = new HttpPetChatRepository(client);

  beforeEach(() => {
    jest.clearAllMocks();
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
