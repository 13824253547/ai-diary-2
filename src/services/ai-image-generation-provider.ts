import { art } from '../theme/assets';
import {
  AI_IMAGE_GENERATION_CONTRACT_VERSION,
  type AIImageGenerationRequestContract,
  type AIImageGenerationResultContract,
} from '../contracts/ai-image-generation-contract';
import type { DiaryPhoto } from '../types/diary';

export type AIImageGenerationRequest = AIImageGenerationRequestContract & {
  signal?: AbortSignal;
};

export type AIImageGenerationResult = AIImageGenerationResultContract;

export type AIImageGenerationProvider = {
  generate: (request: AIImageGenerationRequest) => Promise<AIImageGenerationResult>;
  isAssetReadable: (photo: DiaryPhoto) => Promise<boolean>;
};

export class AIImageGenerationError extends Error {
  constructor(
    readonly code: 'cancelled' | 'provider_failed',
    message: string,
  ) {
    super(message);
  }
}

export function hasReadableImageSource(photo: DiaryPhoto) {
  const image = photo.image as unknown;
  const hasBundledImage = typeof image === 'number'
    || (
      typeof image === 'object'
      && image !== null
      && (
        ('uri' in image && typeof image.uri === 'string' && image.uri.trim().length > 0)
        || ('testUri' in image && typeof image.testUri === 'string' && image.testUri.trim().length > 0)
      )
    );
  return hasBundledImage || Boolean(photo.uri?.trim()) || Boolean(photo.localUri?.trim());
}

export function createMockAIImageGenerationProvider(): AIImageGenerationProvider {
  return {
    async generate(request) {
      if (request.signal?.aborted) {
        throw new AIImageGenerationError('cancelled', 'image generation cancelled');
      }
      await Promise.resolve();
      if (request.signal?.aborted) {
        throw new AIImageGenerationError('cancelled', 'image generation cancelled');
      }
      return {
        version: AI_IMAGE_GENERATION_CONTRACT_VERSION,
        requestId: request.requestId,
        source: 'mock',
        photo: {
          id: `generated-${request.requestId}`,
          title: request.description.slice(0, 40),
          location: 'AI 配图',
          emoji: '✨',
          color: '#D9CCD4',
          date: request.generatedAt.slice(0, 10).replaceAll('-', '.'),
          image: art.night,
          source: 'generated',
          generationRequestId: request.requestId,
          generationPrompt: request.description,
          generationSource: 'mock',
        },
      };
    },
    async isAssetReadable(photo) {
      return hasReadableImageSource(photo);
    },
  };
}

export function createUnconfiguredAIImageGenerationProvider(): AIImageGenerationProvider {
  return {
    async generate() {
      throw new AIImageGenerationError('provider_failed', 'image generation provider is not configured');
    },
    async isAssetReadable() {
      return false;
    },
  };
}
