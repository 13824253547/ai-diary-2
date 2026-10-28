export const PET_CHAT_CONTRACT_VERSION = 'pet-chat-v1';
export const PET_CHAT_PAGE_SIZES = [10, 20, 50, 100] as const;

export type PetChatMessage = {
  id: string;
  conversationId: string;
  requestId: string;
  role: 'user' | 'assistant';
  text: string;
  source?: 'mock' | 'provider';
  providerRequestId?: string;
  createdAt: string;
};

export type PetChatTurn = {
  requestId: string;
  sequence: number;
  userMessageId: string;
  assistantMessageId?: string;
  deviceLocalDate?: string;
  attempt: number;
  status: 'pending' | 'completed' | 'failed';
  failureCode?: 'timeout' | 'cancelled' | 'provider_failed';
  source?: 'mock' | 'provider';
  providerRequestId?: string;
};

export type PetChatConversation = {
  id: string;
  updatedAt: string;
  messages: PetChatMessage[];
  turns: PetChatTurn[];
};

export type PetChatConversationsPage = {
  items: Array<{ id: string; updatedAt: string; messageCount: number }>;
  page: number;
  pageSize: typeof PET_CHAT_PAGE_SIZES[number];
  total: number;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

function isDate(value: unknown) {
  return typeof value === 'string' && Number.isFinite(Date.parse(value));
}

function isSafePositiveInteger(value: unknown) {
  return Number.isSafeInteger(value) && (value as number) > 0;
}

function isSafeNonNegativeInteger(value: unknown) {
  return Number.isSafeInteger(value) && (value as number) >= 0;
}

export function isPetChatMessage(value: unknown): value is PetChatMessage {
  if (!isRecord(value)) return false;
  return isNonEmptyString(value.id)
    && isNonEmptyString(value.conversationId)
    && isNonEmptyString(value.requestId)
    && (value.role === 'user' || value.role === 'assistant')
    && typeof value.text === 'string'
    && value.text.trim().length > 0
    && (value.source === undefined || value.source === 'mock' || value.source === 'provider')
    && (value.providerRequestId === undefined || typeof value.providerRequestId === 'string')
    && isDate(value.createdAt);
}

export function isPetChatTurn(value: unknown): value is PetChatTurn {
  if (!isRecord(value)) return false;
  return isNonEmptyString(value.requestId)
    && isSafePositiveInteger(value.sequence)
    && isNonEmptyString(value.userMessageId)
    && (value.assistantMessageId === undefined || isNonEmptyString(value.assistantMessageId))
    && (value.deviceLocalDate === undefined
      || (typeof value.deviceLocalDate === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value.deviceLocalDate)))
    && isSafePositiveInteger(value.attempt)
    && (value.status === 'pending' || value.status === 'completed' || value.status === 'failed')
    && (value.failureCode === undefined
      || value.failureCode === 'timeout'
      || value.failureCode === 'cancelled'
      || value.failureCode === 'provider_failed')
    && (value.source === undefined || value.source === 'mock' || value.source === 'provider')
    && (value.providerRequestId === undefined || typeof value.providerRequestId === 'string');
}

export function isPetChatConversation(value: unknown): value is PetChatConversation {
  if (!isRecord(value)
    || !isNonEmptyString(value.id)
    || !isDate(value.updatedAt)
    || !Array.isArray(value.messages)
    || !Array.isArray(value.turns)) return false;

  const turnIds = new Set<string>();
  const turnSequences = new Set<number>();
  const turns: PetChatTurn[] = [];
  const turnsByRequest = new Map<string, PetChatTurn>();
  let previousTurnSequence = 0;
  for (const turn of value.turns as unknown[]) {
    if (!isPetChatTurn(turn)
      || turnIds.has(turn.requestId)
      || turnSequences.has(turn.sequence)
      || turn.sequence <= previousTurnSequence) return false;
    turnIds.add(turn.requestId);
    turnSequences.add(turn.sequence);
    previousTurnSequence = turn.sequence;
    turns.push(turn);
    turnsByRequest.set(turn.requestId, turn);
  }

  const messageIds = new Set<string>();
  const messages = value.messages as unknown[];
  const messagesByRequest = new Map<string, PetChatMessage[]>();
  let previousMessageSequence = 0;
  let previousMessageRole = -1;
  for (const message of messages) {
    if (!isPetChatMessage(message)
      || message.conversationId !== value.id
      || messageIds.has(message.id)) return false;
    messageIds.add(message.id);

    const turn = turnsByRequest.get(message.requestId);
    if (!turn) return false;
    const roleOrder = message.role === 'user' ? 0 : 1;
    if (turn.sequence < previousMessageSequence
      || (turn.sequence === previousMessageSequence && roleOrder <= previousMessageRole)) return false;
    previousMessageSequence = turn.sequence;
    previousMessageRole = roleOrder;

    if (message.role === 'user' && (message.source !== undefined || message.providerRequestId !== undefined)) {
      return false;
    }
    const relatedMessages = messagesByRequest.get(message.requestId) ?? [];
    relatedMessages.push(message);
    messagesByRequest.set(message.requestId, relatedMessages);
  }

  for (const turn of turns) {
    const relatedMessages = messagesByRequest.get(turn.requestId) ?? [];
    const userMessages = relatedMessages.filter(message => message.role === 'user');
    const assistantMessages = relatedMessages.filter(message => message.role === 'assistant');
    if (userMessages.length !== 1 || userMessages[0].id !== turn.userMessageId) return false;

    if (turn.status === 'completed') {
      if (turn.failureCode !== undefined
        || !turn.assistantMessageId
        || assistantMessages.length !== 1
        || assistantMessages[0].id !== turn.assistantMessageId
        || !turn.source
        || assistantMessages[0].source !== turn.source
        || assistantMessages[0].providerRequestId !== turn.providerRequestId) return false;
    } else if (assistantMessages.length > 0
      || turn.assistantMessageId !== undefined
      || turn.source !== undefined
      || turn.providerRequestId !== undefined
      || (turn.status === 'failed' ? turn.failureCode === undefined : turn.failureCode !== undefined)) {
      return false;
    }
  }
  return messagesByRequest.size === turns.length;
}

export function isPetChatConversationsPage(value: unknown): value is PetChatConversationsPage {
  return isRecord(value)
    && Array.isArray(value.items)
    && value.items.every(item =>
      isRecord(item)
      && isNonEmptyString(item.id)
      && isDate(item.updatedAt)
      && isSafeNonNegativeInteger(item.messageCount),
    )
    && isSafePositiveInteger(value.page)
    && PET_CHAT_PAGE_SIZES.includes(value.pageSize as typeof PET_CHAT_PAGE_SIZES[number])
    && value.items.length <= (value.pageSize as number)
    && Number.isSafeInteger(value.total)
    && (value.total as number) >= 0;
}
