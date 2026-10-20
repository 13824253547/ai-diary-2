import { AIImageGenerationError, type AIImageGenerationResult } from '../../services/ai-image-generation-provider';
import { AI_IMAGE_GENERATION_CONTRACT_VERSION } from '../../contracts/ai-image-generation-contract';
import type { DiaryPhoto } from '../../types/diary';
import { createTestStore } from '../../test-utils/create-test-store';

function generatedPhoto(requestId: string, description: string): DiaryPhoto {
  return {
    id: `generated-${requestId}`,
    title: description.slice(0, 40),
    location: 'AI 配图',
    emoji: '✨',
    color: '#D9CCD4',
    date: '2026.10.15',
    uri: `file:///generated/${requestId}.png`,
    localUri: `file:///generated/${requestId}.png`,
    source: 'generated',
    generationRequestId: requestId,
    generationPrompt: description,
    generationSource: 'provider',
  };
}

describe('MAT-005 material image generation business', () => {
  test('rejects empty descriptions without creating a request', async () => {
    const { store } = createTestStore();

    const result = await store.getState().generateMaterialImage(' \n ');

    expect(result).toMatchObject({ ok: false, reason: 'invalid_input' });
    expect(store.getState().aiImageGenerationRequests).toHaveLength(0);
  });

  test('registers a clearly marked development mock as one new material asset', async () => {
    const { store } = createTestStore();

    const result = await store.getState().generateMaterialImage('日落时分，老街亮起温柔的灯');

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const photo = store.getState().photos.find(item => item.id === result.photoId);
    expect(result.source).toBe('mock');
    expect(result.photoId).not.toBe('photo-9');
    expect(photo).toMatchObject({
      source: 'generated',
      generationSource: 'mock',
      generationPrompt: '日落时分，老街亮起温柔的灯',
      generationRequestId: result.requestId,
    });
    expect(store.getState().materialPhotoIds.filter(id => id === result.photoId)).toHaveLength(1);
    expect(store.getState().aiImageGenerationRequests).toContainEqual(expect.objectContaining({
      id: result.requestId,
      attempt: 1,
      status: 'succeeded',
      source: 'mock',
      photoId: result.photoId,
    }));
  });

  test('deduplicates concurrent identical requests and registers one result', async () => {
    let calls = 0;
    const provider = {
      generate: async (request: { requestId: string; description: string }): Promise<AIImageGenerationResult> => {
        calls += 1;
        await Promise.resolve();
        return {
          version: AI_IMAGE_GENERATION_CONTRACT_VERSION,
          requestId: request.requestId,
          source: 'provider',
          photo: generatedPhoto(request.requestId, request.description),
        };
      },
      isAssetReadable: async () => true,
    };
    const { store } = createTestStore({ aiImageGenerationProvider: provider });

    const [first, second] = await Promise.all([
      store.getState().generateMaterialImage('海边的晚霞'),
      store.getState().generateMaterialImage('海边的晚霞'),
    ]);

    expect(calls).toBe(1);
    expect(first).toEqual(second);
    expect(store.getState().materialPhotoIds.filter(id => id === (first.ok ? first.photoId : ''))).toHaveLength(1);
    expect(store.getState().aiImageGenerationRequests).toHaveLength(1);
  });

  test('retains every in-flight request when more than twenty descriptions run concurrently', async () => {
    const resolvers = new Map<string, (result: AIImageGenerationResult) => void>();
    const provider = {
      generate: (request: { requestId: string; description: string }) => new Promise<AIImageGenerationResult>(resolve => {
        resolvers.set(request.requestId, result => resolve(result));
      }),
      isAssetReadable: async () => true,
    };
    const { store } = createTestStore({ aiImageGenerationProvider: provider });

    const pending = Array.from({ length: 25 }, (_, index) => (
      store.getState().generateMaterialImage(`并发配图-${index}`)
    ));
    await Promise.resolve();

    const requests = store.getState().aiImageGenerationRequests;
    expect(requests).toHaveLength(25);
    for (const request of requests) {
      resolvers.get(request.id)?.({
        version: AI_IMAGE_GENERATION_CONTRACT_VERSION,
        requestId: request.id,
        source: 'provider',
        photo: generatedPhoto(request.id, request.description),
      });
    }

    const results = await Promise.all(pending);
    expect(results.every(result => result.ok)).toBe(true);
    expect(store.getState().materialPhotoIds.filter(id => id.startsWith('generated-'))).toHaveLength(25);
  });

  test('does not register a late result after cancellation', async () => {
    let resolveGeneration: ((value: AIImageGenerationResult) => void) | undefined;
    const provider = {
      generate: (request: { requestId: string; description: string }) => new Promise<AIImageGenerationResult>(resolve => {
        resolveGeneration = value => resolve(value);
        void request;
      }),
      isAssetReadable: async () => true,
    };
    const { store } = createTestStore({ aiImageGenerationProvider: provider });

    const pending = store.getState().generateMaterialImage('雨后的城市');
    const requestId = store.getState().aiImageGenerationRequests[0].id;
    store.getState().cancelMaterialImageGeneration(requestId);
    resolveGeneration?.({
      version: AI_IMAGE_GENERATION_CONTRACT_VERSION,
      requestId,
      source: 'provider',
      photo: generatedPhoto(requestId, '雨后的城市'),
    });

    const result = await pending;
    expect(result).toMatchObject({ ok: false, reason: 'cancelled' });
    expect(store.getState().photos.some(photo => photo.generationRequestId === requestId)).toBe(false);
    expect(store.getState().materialPhotoIds).not.toContain(`generated-${requestId}`);
    expect(store.getState().aiImageGenerationRequests[0].status).toBe('cancelled');
  });

  test('fails closed on provider failure and malformed assets', async () => {
    const failing = createTestStore({
      aiImageGenerationProvider: {
        generate: async () => {
          throw new AIImageGenerationError('provider_failed', 'private provider detail');
        },
        isAssetReadable: async () => false,
      },
    });
    const failed = await failing.store.getState().generateMaterialImage('山间清晨');
    expect(failed).toMatchObject({ ok: false, reason: 'provider_failed', message: '配图暂时无法生成，请稍后重试。' });
    expect(failing.store.getState().aiImageGenerationRequests[0].status).toBe('failed');
    expect(failing.store.getState().photos.some(photo => photo.generationRequestId)).toBe(false);
    expect(failing.store.getState().issueLog.join('\n')).not.toContain('private provider detail');

    const malformed = createTestStore({
      aiImageGenerationProvider: {
        generate: async request => ({
          version: AI_IMAGE_GENERATION_CONTRACT_VERSION,
          requestId: request.requestId,
          source: 'provider',
          photo: { ...generatedPhoto(request.requestId, request.description), uri: undefined, localUri: undefined, image: undefined },
        }),
        isAssetReadable: async () => true,
      },
    });
    const rejected = await malformed.store.getState().generateMaterialImage('湖边小屋');
    expect(rejected).toMatchObject({ ok: false, reason: 'provider_failed' });
    expect(malformed.store.getState().materialPhotoIds.some(id => id.startsWith('generated-'))).toBe(false);
  });

  test('does not register a provider result that fails its readability check', async () => {
    const provider = {
      generate: async (request: { requestId: string; description: string }) => ({
        version: AI_IMAGE_GENERATION_CONTRACT_VERSION as typeof AI_IMAGE_GENERATION_CONTRACT_VERSION,
        requestId: request.requestId,
        source: 'provider' as const,
        photo: generatedPhoto(request.requestId, request.description),
      }),
      isAssetReadable: async () => false,
    };
    const { store } = createTestStore({ aiImageGenerationProvider: provider });

    const result = await store.getState().generateMaterialImage('湖边的清晨');

    expect(result).toMatchObject({ ok: false, reason: 'provider_failed' });
    expect(store.getState().photos.some(photo => photo.generationPrompt === '湖边的清晨')).toBe(false);
    expect(store.getState().materialPhotoIds.some(id => id.startsWith('generated-'))).toBe(false);
  });
});
