import { Injectable } from '@nestjs/common';
import { PhotoAssetError, PhotoAssetService } from '../photos/photo-asset.service';
import { AIImageProviderError, ArkSeedreamImageProvider } from './ark-seedream-image-provider';

export const AI_IMAGE_GENERATION_CONTRACT_VERSION = 'ai-image-generation-v1';

export type AIImageGenerationRequest = {
  version: typeof AI_IMAGE_GENERATION_CONTRACT_VERSION;
  requestId: string;
  attempt: number;
  description: string;
  generatedAt: string;
};

type PersistedGeneratedAsset = Awaited<ReturnType<PhotoAssetService['saveGeneratedMaterial']>>;

@Injectable()
export class AIImageGenerationService {
  private readonly pending = new Map<string, {
    description: string;
    promise: Promise<PersistedGeneratedAsset>;
  }>();

  constructor(
    private readonly provider: ArkSeedreamImageProvider,
    private readonly assets: PhotoAssetService,
  ) {}

  async generate(ownerUserId: string, request: AIImageGenerationRequest, signal?: AbortSignal) {
    const existing = await this.assets.findGeneratedMaterial(ownerUserId, request.requestId);
    if (existing) {
      if (existing.generationPrompt !== request.description) {
        throw new AIImageProviderError('provider_failed');
      }
      return existing;
    }

    const key = `${ownerUserId}\u0000${request.requestId}`;
    const pending = this.pending.get(key);
    if (pending) {
      if (pending.description !== request.description) {
        throw new AIImageProviderError('provider_failed');
      }
      return pending.promise;
    }

    const operation = this.assets.assertMaterialCapacity(ownerUserId)
      .then(() => this.generateAndStore(ownerUserId, request, signal));
    const entry = { description: request.description, promise: operation };
    this.pending.set(key, entry);
    try {
      return await operation;
    } finally {
      if (this.pending.get(key) === entry) this.pending.delete(key);
    }
  }

  private async generateAndStore(
    ownerUserId: string,
    request: AIImageGenerationRequest,
    signal?: AbortSignal,
  ) {
    try {
      const image = await this.provider.generate(request.description, signal);
      if (signal?.aborted) throw new AIImageProviderError('provider_failed');
      return await this.assets.saveGeneratedMaterial(ownerUserId, request.requestId, request.description, image);
    } catch (error) {
      if (error instanceof AIImageProviderError || error instanceof PhotoAssetError) throw error;
      throw new AIImageProviderError('provider_failed');
    }
  }
}
