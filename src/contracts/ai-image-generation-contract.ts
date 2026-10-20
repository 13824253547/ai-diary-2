import type { DiaryPhoto } from '../types/diary';

export const AI_IMAGE_GENERATION_CONTRACT_VERSION = 'ai-image-generation-v1';

export type AIImageGenerationRequestContract = {
  version: typeof AI_IMAGE_GENERATION_CONTRACT_VERSION;
  requestId: string;
  attempt: number;
  description: string;
  generatedAt: string;
};

export type AIImageGenerationResultContract = {
  version: typeof AI_IMAGE_GENERATION_CONTRACT_VERSION;
  requestId: string;
  source: 'mock' | 'provider';
  photo: DiaryPhoto;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

export function isAIImageGenerationRequest(value: unknown): value is AIImageGenerationRequestContract {
  if (!isRecord(value)) return false;
  return value.version === AI_IMAGE_GENERATION_CONTRACT_VERSION
    && isNonEmptyString(value.requestId)
    && Number.isSafeInteger(value.attempt)
    && (value.attempt as number) > 0
    && isNonEmptyString(value.description)
    && typeof value.generatedAt === 'string'
    && Number.isFinite(Date.parse(value.generatedAt));
}

export function isAIImageGenerationResultForRequest(
  value: unknown,
  request: Pick<AIImageGenerationRequestContract, 'requestId' | 'description'>,
): value is AIImageGenerationResultContract {
  if (!isRecord(value)
    || value.version !== AI_IMAGE_GENERATION_CONTRACT_VERSION
    || value.requestId !== request.requestId
    || (value.source !== 'mock' && value.source !== 'provider')
    || !isRecord(value.photo)) return false;

  const photo = value.photo;
  return isNonEmptyString(photo.id)
    && isNonEmptyString(photo.title)
    && typeof photo.location === 'string'
    && typeof photo.emoji === 'string'
    && typeof photo.color === 'string'
    && typeof photo.date === 'string'
    && photo.source === 'generated'
    && photo.generationRequestId === request.requestId
    && photo.generationPrompt === request.description
    && photo.generationSource === value.source;
}
