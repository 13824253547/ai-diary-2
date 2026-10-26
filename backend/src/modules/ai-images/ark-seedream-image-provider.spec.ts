import { AIImageProviderError, ArkSeedreamImageProvider } from './ark-seedream-image-provider';

describe('ArkSeedreamImageProvider', () => {
  const originalEnvironment = {
    provider: process.env.AI_IMAGE_PROVIDER,
    model: process.env.AI_IMAGE_MODEL,
    key: process.env.AI_IMAGE_API_KEY,
    petChatKey: process.env.PET_CHAT_API_KEY,
    timeout: process.env.AI_IMAGE_TIMEOUT_MS,
    size: process.env.AI_IMAGE_SIZE,
  };
  const originalFetch = global.fetch;
  const provider = new ArkSeedreamImageProvider();

  beforeEach(() => {
    process.env.AI_IMAGE_PROVIDER = 'ark-seedream';
    process.env.AI_IMAGE_MODEL = 'seedream-endpoint';
    process.env.AI_IMAGE_API_KEY = 'server-only-test-key';
    delete process.env.PET_CHAT_API_KEY;
    process.env.AI_IMAGE_TIMEOUT_MS = '999999';
    process.env.AI_IMAGE_SIZE = '2K';
    global.fetch = jest.fn();
  });

  afterEach(() => {
    if (originalEnvironment.provider === undefined) delete process.env.AI_IMAGE_PROVIDER;
    else process.env.AI_IMAGE_PROVIDER = originalEnvironment.provider;
    if (originalEnvironment.model === undefined) delete process.env.AI_IMAGE_MODEL;
    else process.env.AI_IMAGE_MODEL = originalEnvironment.model;
    if (originalEnvironment.key === undefined) delete process.env.AI_IMAGE_API_KEY;
    else process.env.AI_IMAGE_API_KEY = originalEnvironment.key;
    if (originalEnvironment.petChatKey === undefined) delete process.env.PET_CHAT_API_KEY;
    else process.env.PET_CHAT_API_KEY = originalEnvironment.petChatKey;
    if (originalEnvironment.timeout === undefined) delete process.env.AI_IMAGE_TIMEOUT_MS;
    else process.env.AI_IMAGE_TIMEOUT_MS = originalEnvironment.timeout;
    if (originalEnvironment.size === undefined) delete process.env.AI_IMAGE_SIZE;
    else process.env.AI_IMAGE_SIZE = originalEnvironment.size;
    global.fetch = originalFetch;
  });

  test('fails closed when the server-side provider configuration is incomplete', async () => {
    delete process.env.AI_IMAGE_API_KEY;

    await expect(provider.generate('雨后的老街'))
      .rejects.toMatchObject<Partial<AIImageProviderError>>({ code: 'unconfigured' });
    expect(global.fetch).not.toHaveBeenCalled();
  });

  test('requests one base64 image from Ark and returns validated JPEG bytes', async () => {
    const jpeg = Buffer.from([0xff, 0xd8, 0xff, 0x01, 0x02]);
    jest.mocked(global.fetch).mockResolvedValue(new Response(JSON.stringify({
      data: [{ b64_json: jpeg.toString('base64') }],
    }), { status: 200 }));

    await expect(provider.generate('雨后的老街')).resolves.toMatchObject({
      buffer: jpeg,
      mimeType: 'image/jpeg',
      extension: 'jpg',
    });
    expect(global.fetch).toHaveBeenCalledWith(
      'https://ark.cn-beijing.volces.com/api/v3/images/generations',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({ authorization: 'Bearer server-only-test-key' }),
        body: expect.any(String),
      }),
    );
    const [, request] = jest.mocked(global.fetch).mock.calls[0] as [string, RequestInit];
    const body = JSON.parse(String(request.body)) as Record<string, unknown>;
    expect(body).toMatchObject({
      model: 'seedream-endpoint',
      response_format: 'b64_json',
      size: '2K',
    });
    expect(body.prompt).toContain('雨后的老街');
    expect(body.prompt).toContain('真实摄影、照片级写实');
    expect(body.prompt).toContain('禁止动漫、二次元、卡通、插画');
    expect(request.signal).toBeDefined();
    expect(request.signal?.aborted).toBe(false);
  });

  test('uses the configured pet-chat key when no image-specific key is set', async () => {
    delete process.env.AI_IMAGE_API_KEY;
    process.env.PET_CHAT_API_KEY = 'shared-server-test-key';
    jest.mocked(global.fetch).mockResolvedValue(new Response(JSON.stringify({
      data: [{ b64_json: Buffer.from([0xff, 0xd8, 0xff]).toString('base64') }],
    }), { status: 200 }));

    await provider.generate('夜色里的海边');

    expect(global.fetch).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        headers: expect.objectContaining({
          authorization: 'Bearer shared-server-test-key',
        }),
      }),
    );
  });

  test('uses 1.5K when image size is not explicitly configured', async () => {
    delete process.env.AI_IMAGE_SIZE;
    jest.mocked(global.fetch).mockResolvedValue(new Response(JSON.stringify({
      data: [{ b64_json: Buffer.from([0xff, 0xd8, 0xff]).toString('base64') }],
    }), { status: 200 }));

    await provider.generate('山间清晨');

    const [, request] = jest.mocked(global.fetch).mock.calls[0] as [string, RequestInit];
    expect(JSON.parse(String(request.body))).toMatchObject({ size: '1.5K' });
  });

  test('aborts when the configured provider deadline is reached', async () => {
    let abortSignal: AbortSignal | undefined;
    jest.mocked(global.fetch).mockImplementation((_input, init) => {
      abortSignal = init?.signal ?? undefined;
      return new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener('abort', () => {
          reject(Object.assign(new Error('aborted'), { name: 'AbortError' }));
        }, { once: true });
      });
    });
    process.env.AI_IMAGE_TIMEOUT_MS = '1';

    const pending = expect(provider.generate('一片海'))
      .rejects.toMatchObject<Partial<AIImageProviderError>>({ code: 'timeout' });
    await new Promise(resolve => setTimeout(resolve, 10));
    expect(abortSignal?.aborted).toBe(true);
    await pending;
  });

  test('rejects an invalid or unsupported image payload', async () => {
    jest.mocked(global.fetch).mockResolvedValue(new Response(JSON.stringify({
      data: [{ b64_json: Buffer.from('not an image').toString('base64') }],
    }), { status: 200 }));

    await expect(provider.generate('山间清晨'))
      .rejects.toMatchObject<Partial<AIImageProviderError>>({ code: 'invalid_response' });
  });
});
