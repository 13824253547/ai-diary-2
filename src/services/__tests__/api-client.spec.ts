import { ApiClient } from '../api-client';
import { logDevDiagnostic } from '../dev-diagnostics';

const originalFetch = global.fetch;

jest.mock('../dev-diagnostics', () => ({
  createDiagnosticRequestId: jest.fn(() => 'diag-request-test'),
  isDevDiagnosticsEnabled: jest.fn(() => true),
  logDevDiagnostic: jest.fn(),
}));

function createAbortableFetch() {
  return jest.fn((_input: RequestInfo | URL, init?: RequestInit) => new Promise<Response>((_, reject) => {
    init?.signal?.addEventListener('abort', () => {
      reject(Object.assign(new Error('aborted'), { name: 'AbortError' }));
    }, { once: true });
  }));
}

describe('ApiClient request lifecycle', () => {
  afterEach(() => {
    jest.useRealTimers();
    global.fetch = originalFetch;
    jest.clearAllMocks();
  });

  test('times out the request and returns a retryable timeout error', async () => {
    jest.useFakeTimers();
    global.fetch = createAbortableFetch() as unknown as typeof fetch;
    const client = new ApiClient({
      baseUrl: 'http://127.0.0.1:3001/api',
      timeoutMs: 25,
    });

    const pending = client.get('/memories');
    const assertion = expect(pending).rejects.toMatchObject({
      name: 'ApiRequestError',
      code: 'timeout',
      retryable: true,
    });
    await jest.advanceTimersByTimeAsync(25);
    await assertion;
  });

  test('propagates caller cancellation without classifying it as a timeout', async () => {
    global.fetch = createAbortableFetch() as unknown as typeof fetch;
    const client = new ApiClient({ baseUrl: 'http://127.0.0.1:3001/api' });
    const controller = new AbortController();
    const pending = client.get('/generation/jobs/job-1', { signal: controller.signal });
    controller.abort();

    await expect(pending).rejects.toMatchObject({
      name: 'ApiRequestError',
      code: 'cancelled',
      retryable: false,
    });
  });

  test('uses the configured timeout for JSON body parsing as well as fetch', async () => {
    jest.useFakeTimers();
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: () => new Promise(() => undefined),
    }) as unknown as typeof fetch;
    const client = new ApiClient({
      baseUrl: 'http://127.0.0.1:3001/api',
      timeoutMs: 10,
    });

    const pending = client.get('/memories');
    const assertion = expect(pending).rejects.toMatchObject({
      name: 'ApiRequestError',
      code: 'timeout',
      retryable: true,
    });
    await jest.advanceTimersByTimeAsync(10);
    await assertion;
  });

  test('classifies malformed JSON as a non-retryable provider response error', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: () => Promise.reject(new SyntaxError('invalid json')),
    }) as unknown as typeof fetch;
    const client = new ApiClient({ baseUrl: 'http://127.0.0.1:3001/api' });

    await expect(client.get('/memories')).rejects.toMatchObject({
      name: 'ApiRequestError',
      code: 'provider_failed',
      retryable: false,
    });
  });

  test('logs request body kind and failure stage without logging multipart contents', async () => {
    const privateValue = 'private-photo-content';
    const form = new FormData();
    form.append('metadata', privateValue);
    global.fetch = jest.fn().mockRejectedValue(new TypeError('Network request failed')) as unknown as typeof fetch;
    const client = new ApiClient({ baseUrl: 'http://127.0.0.1:3001/api' });

    await expect(client.request('/generation/jobs', {
      method: 'POST',
      body: form,
    })).rejects.toMatchObject({
      name: 'ApiRequestError',
      code: 'provider_failed',
    });

    expect(logDevDiagnostic).toHaveBeenCalledWith('warn', 'api.request.failed', expect.objectContaining({
      route: '/generation/jobs',
      method: 'POST',
      bodyKind: 'multipart',
      failureStage: 'fetch',
      errorName: 'TypeError',
    }));
    expect(JSON.stringify(jest.mocked(logDevDiagnostic).mock.calls)).not.toContain(privateValue);
  });

  test('uses XMLHttpRequest when native multipart transport is requested', async () => {
    const originalXhr = globalThis.XMLHttpRequest;
    let sentBody: XMLHttpRequestBodyInit | null = null;
    let sentHeaders: Record<string, string> = {};
    let openedUrl = '';
    class FakeXMLHttpRequest {
      status = 201;
      responseText = JSON.stringify({ ok: true, data: { jobId: 'job-1' } });
      responseType = '';
      onload: (() => void) | null = null;
      onerror: (() => void) | null = null;
      onabort: (() => void) | null = null;

      open(_method: string, url: string) {
        openedUrl = url;
      }

      setRequestHeader(name: string, value: string) {
        sentHeaders[name] = value;
      }

      send(body: XMLHttpRequestBodyInit | null) {
        sentBody = body;
        this.onload?.();
      }

      abort() {
        this.onabort?.();
      }
    }
    Object.defineProperty(globalThis, 'XMLHttpRequest', {
      configurable: true,
      value: FakeXMLHttpRequest,
    });
    global.fetch = jest.fn() as unknown as typeof fetch;
    const form = new FormData();
    form.append('photos', { uri: 'file:///photo.jpg', name: 'photo.jpg', type: 'image/jpeg' } as unknown as Blob);
    const client = new ApiClient({
      baseUrl: 'http://127.0.0.1:3001/api',
      getHeaders: () => ({ 'x-device-id': 'device-test-1' }),
    });

    try {
      const result = await client.request('/generation/jobs', {
        method: 'POST',
        body: form,
      }, { transport: 'xhr' });

      expect(result).toMatchObject({ ok: true, status: 201, data: { data: { jobId: 'job-1' } } });
      expect(openedUrl).toBe('http://127.0.0.1:3001/api/generation/jobs');
      expect(sentBody).toBe(form);
      expect(sentHeaders).toMatchObject({
        'x-device-id': 'device-test-1',
        'x-request-id': 'diag-request-test',
      });
      expect(sentHeaders).not.toHaveProperty('Content-Type');
      expect(global.fetch).not.toHaveBeenCalled();
    } finally {
      Object.defineProperty(globalThis, 'XMLHttpRequest', {
        configurable: true,
        value: originalXhr,
      });
    }
  });
});
