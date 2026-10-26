import {
  createDiagnosticRequestId,
  isDevDiagnosticsEnabled,
  logDevDiagnostic,
} from './dev-diagnostics';

export type ApiClientOptions = {
  baseUrl: string;
  headers?: Record<string, string>;
  getHeaders?: () => Promise<Record<string, string> | undefined> | Record<string, string> | undefined;
  timeoutMs?: number;
};

export type ApiRequestOptions = {
  signal?: AbortSignal;
  timeoutMs?: number;
  transport?: 'xhr';
};

export type ApiResponse<T> = {
  ok: boolean;
  status: number;
  data: T;
};

export type ApiRequestErrorCode = 'timeout' | 'cancelled' | 'provider_failed';

export class ApiRequestError extends Error {
  constructor(
    readonly code: ApiRequestErrorCode,
    message: string,
    readonly retryable: boolean,
  ) {
    super(message);
    this.name = 'ApiRequestError';
  }
}

export const DEFAULT_API_REQUEST_TIMEOUT_MS = 15_000;
export const PROVIDER_REQUEST_CLIENT_TIMEOUT_MS = 360_000;

function getDiagnosticBodyKind(body: RequestInit['body']) {
  if (body == null) return 'none';
  if (typeof body === 'string') return 'text';
  if (typeof FormData !== 'undefined' && body instanceof FormData) return 'multipart';
  return 'binary';
}

function mergeHeaders(base: Record<string, string>, extra?: HeadersInit) {
  const merged: Record<string, string> = {};
  const set = (name: string, value: string) => {
    const previousName = Object.keys(merged).find(key => key.toLowerCase() === name.toLowerCase());
    if (previousName) delete merged[previousName];
    merged[name] = value;
  };

  Object.entries(base).forEach(([name, value]) => set(name, value));
  if (Array.isArray(extra)) {
    extra.forEach(([name, value]) => set(name, value));
  } else if (extra && typeof extra === 'object' && 'forEach' in extra && typeof extra.forEach === 'function') {
    extra.forEach((value, name) => set(name, value));
  } else if (extra) {
    Object.entries(extra).forEach(([name, value]) => set(name, String(value)));
  }

  return merged;
}

function requestWithXhr(
  url: string,
  init: RequestInit,
  headers: Record<string, string>,
  signal: AbortSignal,
): Promise<Response> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    let settled = false;
    const cleanup = () => signal.removeEventListener('abort', abort);
    const finish = (callback: () => void) => {
      if (settled) return;
      settled = true;
      cleanup();
      callback();
    };
    const abort = () => xhr.abort();

    try {
      xhr.open(String(init.method ?? 'GET'), url, true);
      xhr.responseType = 'text';
      for (const [name, value] of Object.entries(headers)) xhr.setRequestHeader(name, value);
      xhr.onload = () => finish(() => resolve({
        ok: xhr.status >= 200 && xhr.status < 300,
        status: xhr.status,
        json: async () => JSON.parse(xhr.responseText),
      } as Response));
      xhr.onerror = () => finish(() => reject(new TypeError('Network request failed')));
      xhr.onabort = () => finish(() => reject(new TypeError('Request aborted')));
      signal.addEventListener('abort', abort, { once: true });
      if (signal.aborted) {
        abort();
      } else {
        xhr.send(init.body as XMLHttpRequestBodyInit | null);
      }
    } catch (error) {
      finish(() => reject(error));
    }
  });
}

export class ApiClient {
  constructor(private readonly options: ApiClientOptions) {}

  buildUrl(path: string) {
    return `${this.options.baseUrl}${path}`;
  }

  async getHeaders(extraHeaders?: Record<string, string>) {
    const resolvedHeaders = await this.options.getHeaders?.();
    return {
      ...this.options.headers,
      ...resolvedHeaders,
      ...extraHeaders,
    };
  }

  async request<T>(
    path: string,
    init: RequestInit = {},
    options: ApiRequestOptions = {},
  ): Promise<ApiResponse<T>> {
    const callerSignal = options.signal ?? init.signal ?? undefined;
    if (callerSignal?.aborted) {
      throw new ApiRequestError('cancelled', '请求已取消。', false);
    }

    const timeoutMs = options.timeoutMs ?? this.options.timeoutMs ?? DEFAULT_API_REQUEST_TIMEOUT_MS;
    const diagnosticsEnabled = isDevDiagnosticsEnabled();
    const requestId = diagnosticsEnabled ? createDiagnosticRequestId() : undefined;
    const method = String(init.method ?? 'GET').toUpperCase();
    const bodyKind = getDiagnosticBodyKind(init.body);
    const startedAt = Date.now();
    if (requestId) {
      logDevDiagnostic('info', 'api.request.started', {
        requestId,
        route: path,
        method,
        bodyKind,
      });
    }
    const controller = new AbortController();
    let timeoutReached = false;
    let timeoutId: ReturnType<typeof setTimeout> | undefined;
    let removeAbortListener: (() => void) | undefined;
    let rejectCancellation: ((error: ApiRequestError) => void) | undefined;
    let failureStage: 'headers' | 'fetch' | 'response_body' = 'headers';
    const cancellation = new Promise<never>((_, reject) => {
      rejectCancellation = reject;
    });
    const timeout = new Promise<never>((_, reject) => {
      timeoutId = setTimeout(() => {
        timeoutReached = true;
        controller.abort();
        reject(new ApiRequestError('timeout', '请求超时，请稍后重试。', true));
      }, timeoutMs);
    });

    if (callerSignal) {
      const abort = () => {
        controller.abort();
        rejectCancellation?.(new ApiRequestError('cancelled', 'Request cancelled', false));
      };
      callerSignal.addEventListener('abort', abort, { once: true });
      removeAbortListener = () => callerSignal.removeEventListener('abort', abort);
      if (callerSignal.aborted) abort();
    }

    const performRequest = async (): Promise<ApiResponse<T>> => {
      const headers = mergeHeaders(await this.getHeaders(), init.headers);
      if (requestId) headers['x-request-id'] = requestId;
      if (controller.signal.aborted) {
        throw new ApiRequestError(
          timeoutReached ? 'timeout' : 'cancelled',
          timeoutReached ? '请求超时，请稍后重试。' : '请求已取消。',
          timeoutReached,
        );
      }

      failureStage = 'fetch';
      const response = options.transport === 'xhr'
        ? await requestWithXhr(this.buildUrl(path), init, headers, controller.signal)
        : await fetch(this.buildUrl(path), {
            ...init,
            headers,
            signal: controller.signal,
          });

      let data: T;
      try {
        failureStage = 'response_body';
        data = await response.json() as T;
      } catch {
        throw new ApiRequestError('provider_failed', '服务器返回的数据格式异常。', false);
      }

      const envelope = data as { error?: { code?: unknown } } | null;
      const errorCode = typeof envelope?.error?.code === 'string'
        && /^[A-Za-z0-9_.:-]{1,80}$/.test(envelope.error.code)
        ? envelope.error.code
        : undefined;
      if (requestId) {
        logDevDiagnostic(response.ok ? 'info' : 'warn', 'api.response.received', {
          requestId,
          route: path,
          method,
          status: response.status,
          durationMs: Date.now() - startedAt,
          ...(errorCode ? { errorCode } : {}),
        });
      }
      return { ok: response.ok, status: response.status, data };
    };

    try {
      return await Promise.race([performRequest(), timeout, cancellation]);
    } catch (error) {
      if (requestId) {
        const errorCode = error instanceof ApiRequestError
          ? error.code
          : timeoutReached
            ? 'timeout'
            : callerSignal?.aborted
              ? 'cancelled'
              : 'network_error';
        logDevDiagnostic('warn', 'api.request.failed', {
          requestId,
          route: path,
          method,
          bodyKind,
          failureStage,
          durationMs: Date.now() - startedAt,
          errorCode,
          ...(error instanceof Error ? { errorName: error.name } : {}),
        });
      }
      if (error instanceof ApiRequestError) throw error;
      if (timeoutReached) {
        throw new ApiRequestError('timeout', '请求超时，请稍后重试。', true);
      }
      if (callerSignal?.aborted) {
        throw new ApiRequestError('cancelled', '请求已取消。', false);
      }
      throw new ApiRequestError('provider_failed', '网络请求失败，请稍后重试。', true);
    } finally {
      if (timeoutId !== undefined) clearTimeout(timeoutId);
      removeAbortListener?.();
    }
  }

  async get<T>(path: string, options?: ApiRequestOptions): Promise<T> {
    const response = await this.request<T>(path, { method: 'GET' }, options);
    return this.parse(response);
  }

  async post<T>(path: string, body: unknown, options?: ApiRequestOptions): Promise<T> {
    const response = await this.request<T>(path, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    }, options);
    return this.parse(response);
  }

  private parse<T>(response: ApiResponse<T>): T {
    if (!response.ok) {
      const payload = response.data as { message?: unknown; error?: { message?: unknown } } | null;
      const message = typeof payload?.message === 'string'
        ? payload.message
        : typeof payload?.error?.message === 'string'
          ? payload.error.message
          : `请求失败（HTTP ${response.status}）。`;
      throw new ApiRequestError('provider_failed', message, false);
    }
    return response.data;
  }
}
