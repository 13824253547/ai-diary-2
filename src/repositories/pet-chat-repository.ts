import type { ApiRequestOptions } from '../services/api-client';
import type {
  PetChatConversation,
  PetChatConversationsPage,
} from '../contracts/pet-chat-contract';

export type PetChatRepositoryErrorCode =
  | 'permission_denied'
  | 'device_identity_required'
  | 'timeout'
  | 'cancelled'
  | 'not_found'
  | 'invalid_input'
  | 'version_conflict'
  | 'provider_failed'
  | 'out_of_scope'
  | 'unsafe_request'
  | 'chat_busy';

export class PetChatRepositoryError extends Error {
  constructor(
    readonly code: PetChatRepositoryErrorCode,
    message: string,
    readonly retryable: boolean,
  ) {
    super(message);
    this.name = 'PetChatRepositoryError';
  }
}

export interface PetChatRepository {
  listConversations(input?: {
    page?: number;
    pageSize?: 10 | 20 | 50 | 100;
  }, options?: ApiRequestOptions): Promise<PetChatConversationsPage>;
  getConversation(conversationId: string, options?: ApiRequestOptions): Promise<PetChatConversation>;
  beginTurn(input: {
    conversationId: string;
    requestId: string;
    userMessageId: string;
    text: string;
    deviceLocalDate?: string;
  }, options?: ApiRequestOptions): Promise<PetChatConversation>;
  generateReply(input: {
    conversationId: string;
    requestId: string;
    attempt: number;
  }, options?: ApiRequestOptions, onTextDelta?: (text: string) => void): Promise<PetChatConversation>;
  completeTurn(input: {
    conversationId: string;
    requestId: string;
    attempt: number;
    assistantMessageId: string;
    text: string;
    source: 'mock' | 'provider';
    providerRequestId?: string;
  }, options?: ApiRequestOptions): Promise<PetChatConversation>;
  failTurn(input: {
    conversationId: string;
    requestId: string;
    attempt: number;
    failureCode: 'timeout' | 'cancelled' | 'provider_failed';
  }, options?: ApiRequestOptions): Promise<PetChatConversation>;
  retryTurn(input: {
    conversationId: string;
    requestId: string;
    nextAttempt: number;
  }, options?: ApiRequestOptions): Promise<PetChatConversation>;
}
