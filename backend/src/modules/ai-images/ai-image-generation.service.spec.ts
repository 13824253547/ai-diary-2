import { PhotoAssetService } from '../photos/photo-asset.service';
import { AIImageProviderError, ArkSeedreamImageProvider } from './ark-seedream-image-provider';
import {
  AI_IMAGE_GENERATION_CONTRACT_VERSION,
  AIImageGenerationService,
  type AIImageGenerationRequest,
} from './ai-image-generation.service';

const request: AIImageGenerationRequest = {
  version: AI_IMAGE_GENERATION_CONTRACT_VERSION,
  requestId: 'image-request-1',
  attempt: 1,
  description: '雨后的老街',
  generatedAt: '2026-10-23T12:00:00.000Z',
};

describe('AIImageGenerationService', () => {
  test('persists provider output and returns the same asset for a matching replay', async () => {
    const asset = {
      id: 'material-1',
      generationRequestId: request.requestId,
      generationPrompt: request.description,
    };
    const provider = { generate: jest.fn().mockResolvedValue({ buffer: Buffer.from('image') }) };
    const assets = {
      findGeneratedMaterial: jest.fn()
        .mockResolvedValueOnce(undefined)
        .mockResolvedValueOnce(asset),
      saveGeneratedMaterial: jest.fn().mockResolvedValue(asset),
    };
    const service = new AIImageGenerationService(
      provider as unknown as ArkSeedreamImageProvider,
      assets as unknown as PhotoAssetService,
    );

    await expect(service.generate('device-1', request)).resolves.toEqual(asset);
    await expect(service.generate('device-1', request)).resolves.toEqual(asset);
    expect(provider.generate).toHaveBeenCalledTimes(1);
    expect(assets.saveGeneratedMaterial).toHaveBeenCalledWith(
      'device-1',
      request.requestId,
      request.description,
      { buffer: Buffer.from('image') },
    );
  });

  test('deduplicates concurrent matching requests and separates devices', async () => {
    const imageResolvers: Array<(value: { buffer: Buffer }) => void> = [];
    const provider = {
      generate: jest.fn(() => new Promise<{ buffer: Buffer }>(resolve => {
        imageResolvers.push(resolve);
      })),
    };
    const assets = {
      findGeneratedMaterial: jest.fn().mockResolvedValue(undefined),
      saveGeneratedMaterial: jest.fn().mockImplementation(async (ownerDeviceId: string) => ({
        id: `material-${ownerDeviceId}`,
        generationRequestId: request.requestId,
        generationPrompt: request.description,
      })),
    };
    const service = new AIImageGenerationService(
      provider as unknown as ArkSeedreamImageProvider,
      assets as unknown as PhotoAssetService,
    );

    const first = service.generate('device-1', request);
    const duplicate = service.generate('device-1', request);
    const otherDevice = service.generate('device-2', request);
    await Promise.resolve();
    await Promise.resolve();
    expect(provider.generate).toHaveBeenCalledTimes(2);
    imageResolvers.forEach(resolve => resolve({ buffer: Buffer.from('image') }));
    await expect(Promise.all([first, duplicate, otherDevice])).resolves.toEqual([
      expect.objectContaining({ id: 'material-device-1' }),
      expect.objectContaining({ id: 'material-device-1' }),
      expect.objectContaining({ id: 'material-device-2' }),
    ]);
  });

  test('rejects a request ID replayed with a different description', async () => {
    const provider = { generate: jest.fn() };
    const assets = {
      findGeneratedMaterial: jest.fn().mockResolvedValue({
        id: 'material-1',
        generationRequestId: request.requestId,
        generationPrompt: request.description,
      }),
      saveGeneratedMaterial: jest.fn(),
    };
    const service = new AIImageGenerationService(
      provider as unknown as ArkSeedreamImageProvider,
      assets as unknown as PhotoAssetService,
    );

    await expect(service.generate('device-1', { ...request, description: '海边日落' }))
      .rejects.toBeInstanceOf(AIImageProviderError);
    expect(provider.generate).not.toHaveBeenCalled();
  });
});
