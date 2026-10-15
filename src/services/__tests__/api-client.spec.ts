import { ApiClient } from '../api-client';

const originalFetch = global.fetch;

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
});
