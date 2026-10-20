import {
  isPetChatConversation,
  type PetChatConversation,
} from '../pet-chat-contract';

const userMessage = {
  id: 'user-1',
  conversationId: 'conversation-1',
  requestId: 'request-1',
  role: 'user' as const,
  text: 'A long walk today.',
  createdAt: '2026-10-16T00:00:00.000Z',
};

function pendingConversation(): PetChatConversation {
  return {
    id: 'conversation-1',
    updatedAt: '2026-10-16T00:00:00.000Z',
    messages: [userMessage],
    turns: [{
      requestId: 'request-1',
      sequence: 1,
      userMessageId: 'user-1',
      attempt: 1,
      status: 'pending',
    }],
  };
}

function completedConversation(): PetChatConversation {
  return {
    ...pendingConversation(),
    messages: [
      userMessage,
      {
        id: 'assistant-1',
        conversationId: 'conversation-1',
        requestId: 'request-1',
        role: 'assistant',
        text: 'That sounds peaceful.',
        source: 'mock',
        createdAt: '2026-10-16T00:00:01.000Z',
      },
    ],
    turns: [{
      requestId: 'request-1',
      sequence: 1,
      userMessageId: 'user-1',
      assistantMessageId: 'assistant-1',
      attempt: 1,
      status: 'completed',
      source: 'mock',
    }],
  };
}

describe('pet-chat contract', () => {
  test.each([
    ['pending turn', pendingConversation()],
    ['completed turn', completedConversation()],
    ['failed turn', {
      ...pendingConversation(),
      turns: [{
        ...pendingConversation().turns[0],
        status: 'failed' as const,
        failureCode: 'provider_failed' as const,
      }],
    }],
  ])('accepts a well-formed %s', (_label, conversation) => {
    expect(isPetChatConversation(conversation)).toBe(true);
  });

  test('rejects messages that do not belong to a turn', () => {
    const conversation = pendingConversation();
    conversation.messages.push({
      ...userMessage,
      id: 'orphan-message',
      requestId: 'unknown-request',
    });

    expect(isPetChatConversation(conversation)).toBe(false);
  });

  test('rejects assistant replies attached to pending turns', () => {
    const conversation = pendingConversation();
    conversation.messages.push({
      ...userMessage,
      id: 'assistant-1',
      role: 'assistant',
      text: 'Premature reply.',
      source: 'mock',
    });

    expect(isPetChatConversation(conversation)).toBe(false);
  });

  test('rejects completed turns without exactly one matching reply', () => {
    const conversation = completedConversation();
    conversation.messages.pop();

    expect(isPetChatConversation(conversation)).toBe(false);
  });

  test('rejects failed turns without a fixed failure code', () => {
    const conversation = pendingConversation();
    conversation.turns[0] = { ...conversation.turns[0], status: 'failed' };

    expect(isPetChatConversation(conversation)).toBe(false);
  });

  test('rejects message arrays that violate stable turn and role order', () => {
    const conversation = completedConversation();
    conversation.messages.reverse();

    expect(isPetChatConversation(conversation)).toBe(false);
  });

  test('rejects whitespace-only persisted message bodies', () => {
    const conversation = pendingConversation();
    conversation.messages[0] = { ...userMessage, text: ' \n ' };

    expect(isPetChatConversation(conversation)).toBe(false);
  });
});
