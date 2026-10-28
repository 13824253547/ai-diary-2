import {
  AI_IMAGE_GENERATION_CONTRACT_VERSION,
  type AIImageGenerationRequestContract,
} from '../../contracts/ai-image-generation-contract';

jest.mock('expo-image', () => ({
  Image: { prefetch: jest.fn() },
}));

describe('HTTP AI image generation provider', () => {
  const originalWorkerId = process.env.JEST_WORKER_ID;
  let client: { request: jest.Mock; buildUrl: jest.Mock };
  let clientOptions: { getHeaders?: () => Promise<Record<string, string>> } | undefined;
  let imageModule: { Image: { prefetch: jest.Mock } };
  let createProvider: typeof import('../http-ai-image-generation-provider').createHttpAIImageGenerationProvider;

  beforeEach(() => {
    jest.resetModules();
    imageModule = require('expo-image') as typeof imageModule;
    delete process.env.JEST_WORKER_ID;
    clientOptions = undefined;
    client = {
      request: jest.fn(),
      buildUrl: jest.fn(path => `https://api.example.test${path}`),
    };
    jest.doMock('../api-client', () => ({
      ApiClient: jest.fn((options: typeof clientOptions) => {
        clientOptions = options;
        return client;
      }),
      ApiRequestError: class ApiRequestError extends Error {
        code = 'cancelled';
      },
      PROVIDER_REQUEST_CLIENT_TIMEOUT_MS: 360_000,
    }));
    jest.doMock('../device-identity', () => ({
      getDeviceIdentityHeaders: jest.fn(async () => ({
        'x-device-id': 'device-1',
        Authorization: 'Bearer test-token',
      })),
    }));
    createProvider = require('../http-ai-image-generation-provider')
      .createHttpAIImageGenerationProvider as typeof createProvider;
    imageModule.Image.prefetch.mockReset();
  });

  afterEach(() => {
    if (originalWorkerId === undefined) delete process.env.JEST_WORKER_ID;
    else process.env.JEST_WORKER_ID = originalWorkerId;
    jest.dontMock('../api-client');
    jest.dontMock('../device-identity');
    jest.resetModules();
  });

  test('submits the versioned request with identity and maps a durable asset to its authenticated URI', async () => {
    client.request.mockResolvedValue({
      ok: true,
      status: 200,
      data: {
        ok: true,
        data: {
          version: AI_IMAGE_GENERATION_CONTRACT_VERSION,
          requestId: 'image-request-1',
          source: 'provider',
          photo: {
            id: 'material-1',
            sourceAssetId: 'image-request-1',
            title: '雨后的老街',
            date: '2026.10.23',
            filename: 'generated-image-request-1.jpg',
            mimeType: 'image/jpeg',
            size: 5,
            generationRequestId: 'image-request-1',
            generationPrompt: '雨后的老街',
          },
        },
      },
    });
    imageModule.Image.prefetch.mockResolvedValue(true);
    const provider = createProvider();
    const request: AIImageGenerationRequestContract = {
      version: AI_IMAGE_GENERATION_CONTRACT_VERSION,
      requestId: 'image-request-1',
      attempt: 1,
      description: '雨后的老街',
      generatedAt: '2026-10-23T12:00:00.000Z',
    };

    const result = await provider.generate(request);

    expect(client.request).toHaveBeenCalledWith('/photos/materials/ai', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(request),
    }, {
      signal: undefined,
      timeoutMs: 360_000,
    });
    await expect(clientOptions?.getHeaders?.()).resolves.toEqual({
      'x-device-id': 'device-1',
      Authorization: 'Bearer test-token',
    });
    expect(result.photo).toMatchObject({
      id: 'material-1',
      source: 'generated',
      generationRequestId: 'image-request-1',
      generationPrompt: '雨后的老街',
      generationSource: 'provider',
      uri: 'https://api.example.test/photos/materials/material-1/content',
      remoteHeaders: { 'x-device-id': 'device-1', Authorization: 'Bearer test-token' },
    });
    await expect(provider.isAssetReadable(result.photo)).resolves.toBe(true);
    expect(imageModule.Image.prefetch).toHaveBeenCalledWith(result.photo.uri, {
      headers: result.photo.remoteHeaders,
      cachePolicy: 'memory',
    });
  });

  test('preserves the shared library capacity error from the server', async () => {
    client.request.mockResolvedValue({
      ok: false,
      status: 409,
      data: { ok: false, error: { code: 'limit_exceeded', message: 'server internals' } },
    });
    const provider = createProvider();
    const request: AIImageGenerationRequestContract = {
      version: AI_IMAGE_GENERATION_CONTRACT_VERSION,
      requestId: 'image-request-full',
      attempt: 1,
      description: '雨后的老街',
      generatedAt: '2026-10-23T12:00:00.000Z',
    };

    await expect(provider.generate(request)).rejects.toMatchObject({
      code: 'limit_exceeded',
      message: '素材库已满，请先删除部分照片。',
    });
    expect(imageModule.Image.prefetch).not.toHaveBeenCalled();
  });

  test('rejects a response that does not match the submitted prompt and request ID', async () => {
    client.request.mockResolvedValue({
      ok: true,
      data: {
        ok: true,
        data: {
          version: AI_IMAGE_GENERATION_CONTRACT_VERSION,
          requestId: 'another-request',
          source: 'provider',
          photo: {},
        },
      },
    });

    await expect(createProvider().generate({
      version: AI_IMAGE_GENERATION_CONTRACT_VERSION,
      requestId: 'image-request-1',
      attempt: 1,
      description: '雨后的老街',
      generatedAt: '2026-10-23T12:00:00.000Z',
    })).rejects.toMatchObject({ code: 'provider_failed' });
  });
});
