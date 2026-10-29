import { appConfig } from '../config/app-config';
import { ApiClient, ApiRequestError } from './api-client';
import { getDeviceIdentityHeaders } from './device-identity';

export const POSTCARD_MESSAGE_CONTRACT_VERSION = 'postcard-message-v1';
const MAX_MESSAGE_LENGTH = 12;
const MAX_RETRIES = 3;
const RETRY_DELAY_MS = 3_000;

type PostcardMessageEnvelope = {
  ok?: unknown;
  version?: unknown;
  data?: { message?: unknown };
  error?: { message?: unknown; retryable?: unknown };
};

export class PostcardMessageRequestError extends Error {
  constructor(message: string, readonly retryable: boolean) {
    super(message);
    this.name = 'PostcardMessageRequestError';
  }
}

const client = new ApiClient({
  baseUrl: appConfig.backendBaseUrl,
  getHeaders: getDeviceIdentityHeaders,
});

function isValidMessage(value: unknown): value is string {
  return typeof value === 'string'
    && value.trim() === value
    && value.length > 0
    && !/[\r\n\u2028\u2029]/u.test(value)
    && Array.from(value).length <= MAX_MESSAGE_LENGTH;
}

function abortableDelay(signal?: AbortSignal) {
  return new Promise<void>((resolve, reject) => {
    if (signal?.aborted) {
      reject(new ApiRequestError('cancelled', 'Request cancelled', false));
      return;
    }
    const finish = () => {
      signal?.removeEventListener('abort', abort);
      resolve();
    };
    const timer = setTimeout(finish, RETRY_DELAY_MS);
    const abort = () => {
      clearTimeout(timer);
      signal?.removeEventListener('abort', abort);
      reject(new ApiRequestError('cancelled', 'Request cancelled', false));
    };
    signal?.addEventListener('abort', abort, { once: true });
  });
}

async function requestMessage(photoId: string, location: string, signal?: AbortSignal) {
  const response = await client.request<PostcardMessageEnvelope>('/postcards/message', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      version: POSTCARD_MESSAGE_CONTRACT_VERSION,
      photoId,
      location,
    }),
  }, { signal, timeoutMs: 120_000 });

  if (!response.ok) {
    const message = typeof response.data?.error?.message === 'string'
      ? response.data.error.message
      : '寄语暂时无法生成，请稍后重试。';
    throw new PostcardMessageRequestError(
      message,
      response.data?.error?.retryable === true || response.status === 429,
    );
  }
  if (response.data?.ok !== true
    || response.data.version !== POSTCARD_MESSAGE_CONTRACT_VERSION
    || !isValidMessage(response.data.data?.message)) {
    throw new PostcardMessageRequestError('寄语返回内容无效，请稍后重试。', false);
  }
  return response.data.data.message;
}

export async function generatePostcardMessage(photoId: string, location: string, signal?: AbortSignal) {
  if (!photoId.trim() || photoId.length > 191 || location.length > 80) {
    throw new PostcardMessageRequestError('明信片素材信息无效，请重新选择。', false);
  }

  for (let retryCount = 0; ; retryCount += 1) {
    try {
      return await requestMessage(photoId, location, signal);
    } catch (error) {
      if (signal?.aborted || error instanceof ApiRequestError && error.code === 'cancelled') throw error;
      const retryable = error instanceof PostcardMessageRequestError
        ? error.retryable
        : error instanceof ApiRequestError && error.retryable;
      if (!retryable || retryCount >= MAX_RETRIES) {
        if (error instanceof PostcardMessageRequestError) throw error;
        throw new PostcardMessageRequestError('寄语暂时无法生成，请稍后重试。', false);
      }
      await abortableDelay(signal);
    }
  }
}
