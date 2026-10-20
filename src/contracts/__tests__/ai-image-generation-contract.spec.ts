import {
  AI_IMAGE_GENERATION_CONTRACT_VERSION,
  isAIImageGenerationRequest,
  isAIImageGenerationResultForRequest,
} from '../ai-image-generation-contract';

const request = {
  version: AI_IMAGE_GENERATION_CONTRACT_VERSION,
  requestId: 'image-request-1',
  attempt: 1,
  description: '雨后的老街',
  generatedAt: '2026-10-16T10:00:00.000Z',
};

const result = {
  version: AI_IMAGE_GENERATION_CONTRACT_VERSION,
  requestId: request.requestId,
  source: 'mock',
  photo: {
    id: 'generated-image-request-1',
    title: '雨后的老街',
    location: 'AI 配图',
    emoji: '✨',
    color: '#D9CCD4',
    date: '2026.10.16',
    uri: 'file:///generated/image-request-1.png',
    source: 'generated',
    generationRequestId: request.requestId,
    generationPrompt: request.description,
    generationSource: 'mock',
  },
};

describe('AI image generation contract', () => {
  test('accepts a versioned request and matching result', () => {
    expect(isAIImageGenerationRequest(request)).toBe(true);
    expect(isAIImageGenerationResultForRequest(result, request)).toBe(true);
  });

  test.each([
    ['unsupported contract version', { ...request, version: 'ai-image-generation-v0' }],
    ['empty request identifier', { ...request, requestId: ' ' }],
    ['invalid attempt', { ...request, attempt: 0 }],
    ['blank description', { ...request, description: '\n ' }],
    ['invalid timestamp', { ...request, generatedAt: 'not-a-date' }],
  ])('rejects requests with %s', (_label, value) => {
    expect(isAIImageGenerationRequest(value)).toBe(false);
  });

  test.each([
    ['unsupported version', { ...result, version: 'ai-image-generation-v2' }],
    ['mismatched request identifier', { ...result, requestId: 'other-request' }],
    ['unmarked generated asset', { ...result, photo: { ...result.photo, source: 'device' } }],
    ['mismatched description', { ...result, photo: { ...result.photo, generationPrompt: '其他描述' } }],
    ['mismatched source marker', { ...result, photo: { ...result.photo, generationSource: 'provider' } }],
  ])('rejects results with %s', (_label, value) => {
    expect(isAIImageGenerationResultForRequest(value, request)).toBe(false);
  });

  test('rejects provider responses with a different description or request id', () => {
    expect(isAIImageGenerationResultForRequest(result, {
      requestId: 'other-request',
      description: request.description,
    })).toBe(false);
    expect(isAIImageGenerationResultForRequest(result, {
      requestId: request.requestId,
      description: '不同描述',
    })).toBe(false);
  });
});
