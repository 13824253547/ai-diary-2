import {
  isPetChatConversation,
  isPetChatConversationsPage,
  PET_CHAT_CONTRACT_VERSION,
  PET_CHAT_PAGE_SIZES,
  type PetChatConversation,
  type PetChatConversationsPage,
} from '../contracts/pet-chat-contract';
import {
  ApiClient,
  ApiRequestError,
  PROVIDER_REQUEST_CLIENT_TIMEOUT_MS,
  type ApiRequestOptions,
  type ApiResponse,
} from '../services/api-client';
import {
  PetChatRepositoryError,
  type PetChatRepository,
} from './pet-chat-repository';
import {
  createDiagnosticRequestId,
  isDevDiagnosticsEnabled,
  logDevDiagnostic,
} from '../services/dev-diagnostics';

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
  'out_of_scope',
  'unsafe_request',
  'chat_busy',
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

  async generateReply(input: {
    conversationId: string;
    requestId: string;
    attempt: number;
  }, options?: ApiRequestOptions, onTextDelta?: (text: string) => void): Promise<PetChatConversation> {
    if (!input.conversationId.trim()
      || !input.requestId.trim()
      || !Number.isSafeInteger(input.attempt)
      || input.attempt < 1) {
      throw new PetChatRepositoryError('invalid_input', '聊天请求信息无效。', false);
    }
    const path = `/chat/conversations/${encodeURIComponent(input.conversationId)}/turns/${encodeURIComponent(input.requestId)}/generate`;
    if (onTextDelta) {
      return this.requestStreamData(
        `${path}/stream`,
        { attempt: input.attempt },
        options,
        onTextDelta,
      );
    }
    return this.requestData(path, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ attempt: input.attempt }),
    }, isPetChatConversation, options);
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

  private async requestStreamData(
    path: string,
    body: unknown,
    options: ApiRequestOptions | undefined,
    onTextDelta: (text: string) => void,
  ): Promise<PetChatConversation> {
    const signal = options?.signal;
    if (signal?.aborted) {
      throw new PetChatRepositoryError('cancelled', '请求已取消。', false);
    }

    const headers = await this.client.getHeaders({ 'Content-Type': 'application/json' });
    const diagnosticsEnabled = isDevDiagnosticsEnabled();
    const requestId = diagnosticsEnabled ? createDiagnosticRequestId() : '';
    const startedAt = Date.now();
    return new Promise<PetChatConversation>((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      let settled = false;
      let receivedLength = 0;
      let deltaCount = 0;
      let firstDeltaAt: number | undefined;
      let buffer = '';
      let eventName = 'message';
      let eventData: string[] = [];
      let conversation: PetChatConversation | undefined;

      const cleanup = () => signal?.removeEventListener('abort', abort);
      const fail = (error: PetChatRepositoryError) => {
        if (settled) return;
        settled = true;
        cleanup();
        logDevDiagnostic('warn', 'chat.stream.failed', {
          requestId,
          route: path,
          method: 'POST',
          status: xhr.status,
          durationMs: Date.now() - startedAt,
          errorCode: error.code,
          deltaCount,
          ...(firstDeltaAt ? { firstDeltaMs: firstDeltaAt - startedAt } : {}),
        });
        reject(error);
      };
      const succeed = () => {
        if (settled) return;
        if (!conversation) {
          fail(new PetChatRepositoryError('provider_failed', '聊天服务未能完成回复。', true));
          return;
        }
        settled = true;
        cleanup();
        logDevDiagnostic('info', 'chat.stream.completed', {
          requestId,
          route: path,
          method: 'POST',
          status: xhr.status,
          durationMs: Date.now() - startedAt,
          deltaCount,
          ...(firstDeltaAt ? { firstDeltaMs: firstDeltaAt - startedAt } : {}),
        });
        resolve(conversation);
      };
      const abort = () => {
        xhr.abort();
        fail(new PetChatRepositoryError('cancelled', '请求已取消。', false));
      };
      const dispatch = (frame: string) => {
        eventName = 'message';
        eventData = [];
        for (const line of frame.split(/\r?\n/)) {
          if (line.startsWith('event:')) eventName = line.slice(6).trim();
          else if (line.startsWith('data:')) eventData.push(line.slice(5).trimStart());
        }
        if (!eventData.length) return;
        const payload: unknown = JSON.parse(eventData.join('\n'));
        if (eventName === 'delta') {
          if (isRecord(payload) && typeof payload.text === 'string' && payload.text) {
            deltaCount += 1;
            if (!firstDeltaAt) {
              firstDeltaAt = Date.now();
              logDevDiagnostic('info', 'chat.stream.first_delta', {
                requestId,
                route: path,
                method: 'POST',
                firstDeltaMs: firstDeltaAt - startedAt,
              });
            }
            onTextDelta(payload.text);
          }
          return;
        }
        if (eventName === 'error') {
          const code = isRecord(payload) && typeof payload.code === 'string' && ERROR_CODES.has(payload.code)
            ? payload.code as PetChatRepositoryError['code']
            : 'provider_failed';
          const message = code === 'timeout'
            ? '小橘回复超时了，请重试。'
            : '聊天服务暂时不可用，请稍后重试。';
          fail(new PetChatRepositoryError(code, message, code === 'timeout' || code === 'provider_failed'));
          return;
        }
        if (eventName === 'complete' && isOkEnvelope(payload) && isPetChatConversation(payload.data)) {
          conversation = payload.data;
        }
      };
      const consume = (text: string) => {
        buffer += text;
        let boundary = buffer.search(/\r?\n\r?\n/);
        while (boundary >= 0) {
          const separator = /^\r?\n\r?\n/.exec(buffer.slice(boundary))?.[0] ?? '\n\n';
          dispatch(buffer.slice(0, boundary));
          buffer = buffer.slice(boundary + separator.length);
          if (settled) return;
          boundary = buffer.search(/\r?\n\r?\n/);
        }
      };
      const processHttpError = () => {
        try {
          const payload: unknown = JSON.parse(xhr.responseText);
          if (isErrorEnvelope(payload)) {
            fail(new PetChatRepositoryError(
              payload.error.code as PetChatRepositoryError['code'],
              payload.error.message,
              payload.error.retryable,
            ));
            return;
          }
        } catch {
          // Use the status-based message when the server did not return an API envelope.
        }
        fail(new PetChatRepositoryError(
          'provider_failed',
          `请求失败（HTTP ${xhr.status}）。`,
          xhr.status >= 500,
        ));
      };

      xhr.open('POST', this.client.buildUrl(path), true);
      if (diagnosticsEnabled) headers['x-request-id'] = requestId;
      xhr.responseType = 'text';
      xhr.timeout = options?.timeoutMs ?? PROVIDER_REQUEST_CLIENT_TIMEOUT_MS;
      for (const [name, value] of Object.entries(headers)) xhr.setRequestHeader(name, value);
      logDevDiagnostic('info', 'chat.stream.started', {
        requestId,
        route: path,
        method: 'POST',
      });
      xhr.onprogress = () => {
        if (xhr.status < 200 || xhr.status >= 300) return;
        try {
          const responseText = xhr.responseText ?? '';
          consume(responseText.slice(receivedLength));
          receivedLength = responseText.length;
        } catch {
          fail(new PetChatRepositoryError('provider_failed', '聊天服务返回的数据格式异常。', false));
        }
      };
      xhr.onload = () => {
        if (xhr.status < 200 || xhr.status >= 300) {
          processHttpError();
          return;
        }
        try {
          const responseText = xhr.responseText ?? '';
          consume(responseText.slice(receivedLength));
          if (buffer.trim()) dispatch(buffer);
          if (!settled) succeed();
        } catch {
          fail(new PetChatRepositoryError('provider_failed', '聊天服务返回的数据格式异常。', false));
        }
      };
      xhr.onerror = () => fail(new PetChatRepositoryError('provider_failed', '聊天服务暂时不可用，请稍后重试。', true));
      xhr.ontimeout = () => fail(new PetChatRepositoryError('timeout', '小橘回复超时了，请重试。', true));
      xhr.onabort = () => fail(new PetChatRepositoryError('cancelled', '请求已取消。', false));
      signal?.addEventListener('abort', abort, { once: true });
      xhr.send(JSON.stringify(body));
    });
  }
}

export { PET_CHAT_CONTRACT_VERSION };
