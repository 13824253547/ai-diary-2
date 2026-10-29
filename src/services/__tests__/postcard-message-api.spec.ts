import {
  generatePostcardMessage,
  PostcardMessageRequestError,
} from '../postcard-message-api';

jest.mock('../device-identity', () => ({
  getDeviceIdentityHeaders: jest.fn(async () => ({
    Authorization: 'Bearer test-token',
    'x-device-id': 'device-1',
  })),
}));

function response(status: number, data: unknown): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => data,
  } as Response;
}

describe('postcard message API', () => {
  let fetchSpy: jest.SpyInstance;

  beforeEach(() => {
    fetchSpy = jest.spyOn(global, 'fetch');
  });

  afterEach(() => {
    fetchSpy.mockRestore();
  });

  test('sends only the selected material ID and location with installation identity', async () => {
    fetchSpy.mockResolvedValueOnce(response(200, {
      ok: true,
      version: 'postcard-message-v1',
      data: { message: '海风轻吻落日' },
    }));

    await expect(generatePostcardMessage('material-1', '苏州')).resolves.toBe('海风轻吻落日');
    const [url, request] = fetchSpy.mock.calls[0] as [string, RequestInit];
    expect(url).toMatch(/\/postcards\/message$/);
    expect(request.headers).toMatchObject({
      Authorization: 'Bearer test-token',
      'x-device-id': 'device-1',
    });
    expect(JSON.parse(String(request.body))).toEqual({
      version: 'postcard-message-v1',
      photoId: 'material-1',
      location: '苏州',
    });
  });

  test('rejects multiline and over-12-character provider results', async () => {
    fetchSpy.mockResolvedValueOnce(response(200, {
      ok: true,
      version: 'postcard-message-v1',
      data: { message: '第一行\n第二行' },
    }));
    await expect(generatePostcardMessage('material-1', '')).rejects.toMatchObject({
      name: 'PostcardMessageRequestError',
      retryable: false,
    });

    fetchSpy.mockResolvedValueOnce(response(200, {
      ok: true,
      version: 'postcard-message-v1',
      data: { message: '一二三四五六七八九十一二三' },
    }));
    await expect(generatePostcardMessage('material-1', '')).rejects.toBeInstanceOf(PostcardMessageRequestError);
    expect(fetchSpy).toHaveBeenCalledTimes(2);
  });

  test('does not retry a terminal server rejection or send invalid inputs', async () => {
    fetchSpy.mockResolvedValueOnce(response(503, {
      ok: false,
      error: { message: '寄语服务暂不可用。', retryable: false },
    }));
    await expect(generatePostcardMessage('material-1', '')).rejects.toMatchObject({ retryable: false });
    await expect(generatePostcardMessage('', '')).rejects.toMatchObject({ retryable: false });
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });

  test('silently retries transient server failures three times with three-second intervals', async () => {
    jest.useFakeTimers();
    try {
      for (let retry = 0; retry < 3; retry += 1) {
        fetchSpy.mockResolvedValueOnce(response(503, {
          ok: false,
          error: { message: 'temporary failure', retryable: true },
        }));
      }
      fetchSpy.mockResolvedValueOnce(response(200, {
        ok: true,
        version: 'postcard-message-v1',
        data: { message: '海风轻吻落日' },
      }));

      const result = generatePostcardMessage('material-1', '');
      await jest.advanceTimersByTimeAsync(9_000);
      await expect(result).resolves.toBe('海风轻吻落日');
      expect(fetchSpy).toHaveBeenCalledTimes(4);
    } finally {
      jest.useRealTimers();
    }
  });
});
