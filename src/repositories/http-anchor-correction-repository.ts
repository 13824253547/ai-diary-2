import {
  ANCHOR_CORRECTION_CONTRACT_VERSION,
  isAnchorCorrectionRecord,
  isChatAnchorCorrectionRecord,
  type ChatAnchorCorrectionRecord,
  type AnchorCorrectionRecord,
  type ChatAnchorCorrectionQuery,
  type SaveChatAnchorCorrectionInput,
} from '../contracts/anchor-correction-contract';
import { ApiClient, ApiRequestError, type ApiRequestOptions, type ApiResponse } from '../services/api-client';
import {
  AnchorCorrectionRepositoryError,
  type AnchorCorrectionRepository,
} from './anchor-correction-repository';

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
    && value.version === ANCHOR_CORRECTION_CONTRACT_VERSION
    && 'data' in value;
}

function isChatCorrectionEnvelope(value: unknown): value is OkEnvelope<unknown> {
  return isRecord(value)
    && value.ok === true
    && value.version === 'chat-anchor-correction-v1'
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
  if (error instanceof AnchorCorrectionRepositoryError) return error;
  if (error instanceof ApiRequestError) {
    return new AnchorCorrectionRepositoryError(error.code, error.message, error.retryable);
  }
  return new AnchorCorrectionRepositoryError('provider_failed', '网络请求失败，请稍后重试。', true);
}

export class HttpAnchorCorrectionRepository implements AnchorCorrectionRepository {
  constructor(private readonly client: ApiClient) {}

  async getChatCorrection(
    query: ChatAnchorCorrectionQuery,
    options?: ApiRequestOptions,
  ): Promise<ChatAnchorCorrectionRecord | null> {
    if (!query.anchorId.trim() || !query.anchorBatchId.trim()) {
      throw new AnchorCorrectionRepositoryError('invalid_input', '聊天锚点来源无效。', false);
    }
    const params = new URLSearchParams({ anchorBatchId: query.anchorBatchId });
    return this.requestChatCorrectionData(
      `/anchors/${encodeURIComponent(query.anchorId)}/chat-correction?${params.toString()}`,
      { method: 'GET' },
      (value): value is ChatAnchorCorrectionRecord | null =>
        value === null
        || (isChatAnchorCorrectionRecord(value)
          && value.anchorId === query.anchorId
          && value.anchorBatchId === query.anchorBatchId),
      options,
    );
  }

  async saveChatCorrection(
    input: SaveChatAnchorCorrectionInput,
    options?: ApiRequestOptions,
  ): Promise<ChatAnchorCorrectionRecord> {
    const correction = input.correction.trim();
    const charCount = Array.from(correction).length;
    if (!input.anchorId.trim()
      || !input.anchorBatchId.trim()
      || !correction
      || charCount > 240
      || !input.idempotencyKey.trim()
      || !Number.isSafeInteger(input.expectedVersion)
      || input.expectedVersion < 0) {
      throw new AnchorCorrectionRepositoryError('invalid_input', '锚点纠正内容无效。', false);
    }
    return this.requestChatCorrectionData(
      `/anchors/${encodeURIComponent(input.anchorId)}/chat-correction`,
      {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          anchorBatchId: input.anchorBatchId,
          correction,
          expectedVersion: input.expectedVersion,
          idempotencyKey: input.idempotencyKey,
        }),
      },
      (value): value is ChatAnchorCorrectionRecord =>
        isChatAnchorCorrectionRecord(value)
        && value.anchorId === input.anchorId
        && value.anchorBatchId === input.anchorBatchId
        && value.correction === correction
        && value.version === input.expectedVersion + 1,
      options,
    );
  }

  async getCorrection(
    query: unknown,
    options?: ApiRequestOptions,
  ): Promise<AnchorCorrectionRecord | null> {
    if (!isRecord(query)
      || typeof query.diaryId !== 'string'
      || !query.diaryId.trim()
      || typeof query.anchorId !== 'string'
      || !query.anchorId.trim()
      || typeof query.diaryVersion !== 'number'
      || !Number.isSafeInteger(query.diaryVersion)
      || query.diaryVersion < 1) {
      throw new AnchorCorrectionRepositoryError('invalid_input', '锚点来源无效。', false);
    }
    const params = new URLSearchParams({
      diaryId: query.diaryId,
      diaryVersion: String(query.diaryVersion),
    });
    const data = await this.requestData(
      `/anchors/${encodeURIComponent(query.anchorId)}/correction?${params.toString()}`,
      { method: 'GET' },
      (value): value is AnchorCorrectionRecord | null =>
        value === null
        || (isAnchorCorrectionRecord(value)
          && value.diaryId === query.diaryId
          && value.diaryVersion === query.diaryVersion
          && value.anchorId === query.anchorId),
      options,
    );
    return data;
  }

  async saveCorrection(
    input: unknown,
    options?: ApiRequestOptions,
  ): Promise<AnchorCorrectionRecord> {
    if (!isRecord(input)
      || typeof input.diaryId !== 'string'
      || !input.diaryId.trim()
      || typeof input.anchorId !== 'string'
      || !input.anchorId.trim()
      || typeof input.sourceBlockId !== 'string'
      || !input.sourceBlockId.trim()
      || typeof input.correction !== 'string'
      || !input.correction.trim()
      || Array.from(input.correction.trim()).length > 240
      || typeof input.idempotencyKey !== 'string'
      || !input.idempotencyKey.trim()
      || typeof input.diaryVersion !== 'number'
      || !Number.isSafeInteger(input.diaryVersion)
      || input.diaryVersion < 1
      || typeof input.expectedVersion !== 'number'
      || !Number.isSafeInteger(input.expectedVersion)
      || input.expectedVersion < 0) {
      throw new AnchorCorrectionRepositoryError('invalid_input', '锚点纠正内容无效。', false);
    }
    const correction = input.correction.trim();
    const expectedVersion = input.expectedVersion;
    return this.requestData(
      `/anchors/${encodeURIComponent(input.anchorId)}/correction`,
      {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          diaryId: input.diaryId,
          diaryVersion: input.diaryVersion,
          sourceBlockId: input.sourceBlockId,
          correction,
          expectedVersion,
          idempotencyKey: input.idempotencyKey,
        }),
      },
      (value): value is AnchorCorrectionRecord =>
        isAnchorCorrectionRecord(value)
        && value.diaryId === input.diaryId
        && value.diaryVersion === input.diaryVersion
        && value.anchorId === input.anchorId
        && value.sourceBlockId === input.sourceBlockId
        && value.correction === correction
        && value.version === expectedVersion + 1,
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
        throw new AnchorCorrectionRepositoryError(
          envelope.error.code as AnchorCorrectionRepositoryError['code'],
          envelope.error.message,
          envelope.error.retryable,
        );
      }
      throw new AnchorCorrectionRepositoryError(
        'provider_failed',
        response.ok ? '服务器返回的数据格式异常。' : `请求失败（HTTP ${response.status}）。`,
        response.status >= 500,
      );
    }
    if (!isData(envelope.data)) {
      throw new AnchorCorrectionRepositoryError('provider_failed', '服务器返回的数据格式异常。', false);
    }
    return envelope.data;
  }

  private async requestChatCorrectionData<T>(
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
    if (!response.ok || !isChatCorrectionEnvelope(envelope)) {
      if (isErrorEnvelope(envelope)) {
        throw new AnchorCorrectionRepositoryError(
          envelope.error.code as AnchorCorrectionRepositoryError['code'],
          envelope.error.message,
          envelope.error.retryable,
        );
      }
      throw new AnchorCorrectionRepositoryError(
        'provider_failed',
        response.ok ? '服务器返回的数据格式异常。' : `请求失败（HTTP ${response.status}）。`,
        response.status >= 500,
      );
    }
    if (!isData(envelope.data)) {
      throw new AnchorCorrectionRepositoryError('provider_failed', '服务器返回的数据格式异常。', false);
    }
    return envelope.data;
  }
}

export { ANCHOR_CORRECTION_CONTRACT_VERSION };
