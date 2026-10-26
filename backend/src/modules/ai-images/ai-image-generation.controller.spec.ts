import { BadRequestException } from '@nestjs/common';
import { EventEmitter } from 'node:events';
import { AIImageGenerationController } from './ai-image-generation.controller';
import { AIImageGenerationService } from './ai-image-generation.service';

const validRequest = {
  version: 'ai-image-generation-v1',
  requestId: 'image-request-1',
  attempt: 1,
  description: '雨后的老街',
  generatedAt: '2026-10-23T12:00:00.000Z',
};

function createHttpContext(body: unknown) {
  const request = Object.assign(new EventEmitter(), { body });
  const response = Object.assign(new EventEmitter(), { writableEnded: false });
  return {
    request: request as never,
    response: response as never,
  };
}

describe('AIImageGenerationController', () => {
  test('requires the device identity before validating a generation request', async () => {
    const generation = { generate: jest.fn() };
    const controller = new AIImageGenerationController(generation as unknown as AIImageGenerationService);
    const { request, response } = createHttpContext({});

    await expect(controller.generate(undefined, request, response))
      .rejects.toMatchObject({
        response: { error: { code: 'device_identity_required' } },
      });
    expect(generation.generate).not.toHaveBeenCalled();
  });

  test('rejects malformed contracts before submitting the provider task', async () => {
    const generation = { generate: jest.fn() };
    const controller = new AIImageGenerationController(generation as unknown as AIImageGenerationService);
    const { request, response } = createHttpContext({ ...validRequest, description: '   ' });

    await expect(controller.generate('device-1', request, response)).rejects.toBeInstanceOf(BadRequestException);
    expect(generation.generate).not.toHaveBeenCalled();
  });

  test('returns only a provider-backed asset registered for the requesting device', async () => {
    const asset = {
      id: 'material-1',
      sourceAssetId: validRequest.requestId,
      title: validRequest.description,
      date: '2026.10.23',
      filename: 'generated-image-request-1.jpg',
      mimeType: 'image/jpeg',
      size: 5,
    };
    const generation = { generate: jest.fn().mockResolvedValue(asset) };
    const controller = new AIImageGenerationController(generation as unknown as AIImageGenerationService);
    const { request, response } = createHttpContext(validRequest);

    await expect(controller.generate('device-1', request, response)).resolves.toEqual({
      ok: true,
      data: {
        version: 'ai-image-generation-v1',
        requestId: validRequest.requestId,
        source: 'provider',
        photo: {
          ...asset,
          generationRequestId: validRequest.requestId,
          generationPrompt: validRequest.description,
          generationSource: 'provider',
        },
      },
    });
    expect(generation.generate).toHaveBeenCalledWith('device-1', validRequest, expect.any(AbortSignal));
  });
});
