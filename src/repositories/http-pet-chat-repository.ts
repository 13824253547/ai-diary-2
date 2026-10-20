import {
  isPetChatConversation,
  isPetChatConversationsPage,
  PET_CHAT_CONTRACT_VERSION,
  PET_CHAT_PAGE_SIZES,
  type PetChatConversation,
  type PetChatConversationsPage,
} from '../contracts/pet-chat-contract';
import { ApiClient, ApiRequestError, type ApiRequestOptions, type ApiResponse } from '../services/api-client';
import {
  PetChatRepositoryError,
  type PetChatRepository,
} from './pet-chat-repository';

type OkEnvelope<T> = { ok: true; version: string; data: T };
type ErrorEnvelope = {
  ok: false;
  error: { code: string; message: string; retryable: boolean };
};

const ERROR_CODES = new Set([
  'permission_denied',
  'device_identity_required',
  'timeout',
  'cancelled',
  'not_found',
  'invalid_input',
  'version_conflict',
  'provider_failed',
]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isOkEnvelope(value: unknown): value is OkEnvelope<unknown> {
  return isRecord(value)
    && value.ok === true
    && value.version === PET_CHAT_CONTRACT_VERSION
    && 'data' in value;
}

function isErrorEnvelope(value: unknown): value is ErrorEnvelope {
  if (!isRecord(value) || value.ok !== false || !isRecord(value.error)) return false;
  return typeof value.error.code === 'string'
    && ERROR_CODES.has(value.error.code)
    && typeof value.error.message === 'string'
    && typeof value.error.retryable === 'boolean';
}

function requestError(error: unknown) {
  if (error instanceof PetChatRepositoryError) return error;
  if (error instanceof ApiRequestError) {
    return new PetChatRepositoryError(error.code, error.message, error.retryable);
  }
  return new PetChatRepositoryError('provider_failed', '聊天服务暂时不可用，请稍后重试。', true);
}

export class HttpPetChatRepository implements PetChatRepository {
  constructor(private readonly client: ApiClient) {}

  async listConversations(
    input: { page?: number; pageSize?: 10 | 20 | 50 | 100 } = {},
    options?: ApiRequestOptions,
  ): Promise<PetChatConversationsPage> {
    const page = input.page ?? 1;
    const pageSize = input.pageSize ?? 20;
    if (!Number.isSafeInteger(page) || page < 1 || !PET_CHAT_PAGE_SIZES.includes(pageSize)) {
      throw new PetChatRepositoryError('invalid_input', '会话分页条件无效。', false);
    }
    const params = new URLSearchParams({ page: String(page), pageSize: String(pageSize) });
    return this.requestData(`/chat/conversations?${params.toString()}`, { method: 'GET' }, isPetChatConversationsPage, options);
  }

  async getConversation(conversationId: string, options?: ApiRequestOptions): Promise<PetChatConversation> {
    if (!conversationId.trim()) {
      throw new PetChatRepositoryError('invalid_input', '聊天会话标识无效。', false);
    }
    return this.requestData(
      `/chat/conversations/${encodeURIComponent(conversationId)}`,
      { method: 'GET' },
      isPetChatConversation,
      options,
    );
  }

  async beginTurn(input: {
    conversationId: string;
    requestId: string;
    userMessageId: string;
    text: string;
  }, options?: ApiRequestOptions): Promise<PetChatConversation> {
    if (!input.conversationId.trim()
      || !input.requestId.trim()
      || !input.userMessageId.trim()
      || !input.text.trim()) {
      throw new PetChatRepositoryError('invalid_input', '聊天消息信息无效。', false);
    }
    return this.requestData(
      `/chat/conversations/${encodeURIComponent(input.conversationId)}/turns`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          requestId: input.requestId,
          userMessageId: input.userMessageId,
          text: input.text.trim(),
        }),
      },
      isPetChatConversation,
      options,
    );
  }

  async completeTurn(input: {
    conversationId: string;
    requestId: string;
    attempt: number;
    assistantMessageId: string;
    text: string;
    source: 'mock' | 'provider';
    providerRequestId?: string;
  }, options?: ApiRequestOptions): Promise<PetChatConversation> {
    if (!input.conversationId.trim()
      || !input.requestId.trim()
      || !input.assistantMessageId.trim()
      || !input.text.trim()
      || !Number.isSafeInteger(input.attempt)
      || input.attempt < 1
      || (input.source !== 'mock' && input.source !== 'provider')) {
      throw new PetChatRepositoryError('invalid_input', '聊天回复信息无效。', false);
    }
    return this.requestData(
      `/chat/conversations/${encodeURIComponent(input.conversationId)}/turns/${encodeURIComponent(input.requestId)}/reply`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          attempt: input.attempt,
          assistantMessageId: input.assistantMessageId,
          text: input.text.trim(),
          source: input.source,
          ...(input.providerRequestId ? { providerRequestId: input.providerRequestId } : {}),
        }),
      },
      isPetChatConversation,
      options,
    );
  }

  async failTurn(input: {
    conversationId: string;
    requestId: string;
    attempt: number;
    failureCode: 'timeout' | 'cancelled' | 'provider_failed';
  }, options?: ApiRequestOptions): Promise<PetChatConversation> {
    if (!input.conversationId.trim()
      || !input.requestId.trim()
      || !Number.isSafeInteger(input.attempt)
      || input.attempt < 1
      || (input.failureCode !== 'timeout'
        && input.failureCode !== 'cancelled'
        && input.failureCode !== 'provider_failed')) {
      throw new PetChatRepositoryError('invalid_input', '聊天失败状态信息无效。', false);
    }
    return this.requestData(
      `/chat/conversations/${encodeURIComponent(input.conversationId)}/turns/${encodeURIComponent(input.requestId)}/failure`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          attempt: input.attempt,
          failureCode: input.failureCode,
        }),
      },
      isPetChatConversation,
      options,
    );
  }

  async retryTurn(input: {
    conversationId: string;
    requestId: string;
    nextAttempt: number;
  }, options?: ApiRequestOptions): Promise<PetChatConversation> {
    if (!input.conversationId.trim()
      || !input.requestId.trim()
      || !Number.isSafeInteger(input.nextAttempt)
      || input.nextAttempt < 2) {
      throw new PetChatRepositoryError('invalid_input', '聊天重试轮次无效。', false);
    }
    return this.requestData(
      `/chat/conversations/${encodeURIComponent(input.conversationId)}/turns/${encodeURIComponent(input.requestId)}/retry`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ nextAttempt: input.nextAttempt }),
      },
      isPetChatConversation,
      options,
    );
  }

  private async requestData<T>(
    path: string,
    init: RequestInit,
    isData: (value: unknown) => value is T,
    options?: ApiRequestOptions,
  ): Promise<T> {
    let response: ApiResponse<unknown>;
    try {
      response = await this.client.request<unknown>(path, init, options);
    } catch (error) {
      throw requestError(error);
    }

    const envelope = response.data;
    if (!response.ok || !isOkEnvelope(envelope)) {
      if (isErrorEnvelope(envelope)) {
        throw new PetChatRepositoryError(
          envelope.error.code as PetChatRepositoryError['code'],
          envelope.error.message,
          envelope.error.retryable,
        );
      }
      throw new PetChatRepositoryError(
        'provider_failed',
        response.ok ? '聊天服务返回的数据格式异常。' : `请求失败（HTTP ${response.status}）。`,
        response.status >= 500,
      );
    }
    if (!isData(envelope.data)) {
      throw new PetChatRepositoryError('provider_failed', '聊天服务返回的数据格式异常。', false);
    }
    return envelope.data;
  }
}

export { PET_CHAT_CONTRACT_VERSION };
