import { HttpCoreDiaryRepository } from '../http-core-diary-repository';
import { ApiClient } from '../../services/api-client';

const originalFetch = global.fetch;

function createAbortableFetch() {
  return jest.fn((_input: RequestInfo | URL, init?: RequestInit) => new Promise<Response>((_, reject) => {
    init?.signal?.addEventListener('abort', () => {
      reject(Object.assign(new Error('aborted'), { name: 'AbortError' }));
    }, { once: true });
  }));
}

describe('HTTP repository request lifecycle', () => {
  afterEach(() => {
    jest.useRealTimers();
    global.fetch = originalFetch;
  });

  test('returns a retryable timeout result for an expired request', async () => {
    jest.useFakeTimers();
    global.fetch = createAbortableFetch() as unknown as typeof fetch;
    const repository = new HttpCoreDiaryRepository(new ApiClient({
      baseUrl: 'http://127.0.0.1:3001/api',
      timeoutMs: 20,
    }));

    const pending = repository.getGenerationJob('job-1');
    await jest.advanceTimersByTimeAsync(20);

    await expect(pending).resolves.toMatchObject({
      ok: false,
      error: {
        code: 'timeout',
        retryable: true,
      },
    });
  });

  test('returns a cancelled result when the caller aborts', async () => {
    global.fetch = createAbortableFetch() as unknown as typeof fetch;
    const repository = new HttpCoreDiaryRepository(new ApiClient({
      baseUrl: 'http://127.0.0.1:3001/api',
    }));
    const controller = new AbortController();
    const pending = repository.getGenerationJob('job-1', { signal: controller.signal });
    controller.abort();

    await expect(pending).resolves.toMatchObject({
      ok: false,
      error: {
        code: 'cancelled',
        retryable: false,
      },
    });
  });

  test('rejects a malformed diary response without throwing out of the repository', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ ok: true, data: null }),
    }) as unknown as typeof fetch;
    const repository = new HttpCoreDiaryRepository(new ApiClient({
      baseUrl: 'http://127.0.0.1:3001/api',
    }));

    await expect(repository.getDiary('diary-1')).resolves.toMatchObject({
      ok: false,
      error: {
        code: 'provider_failed',
        retryable: false,
      },
    });
  });
});
