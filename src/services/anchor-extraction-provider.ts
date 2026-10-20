import {
  type AnchorExtractionRequest,
  type AnchorExtractionResult,
} from '../contracts/anchor-contract';

export type AnchorExtractionProvider = {
  extract: (request: AnchorExtractionRequest) => Promise<AnchorExtractionResult>;
};

export class AnchorExtractionProviderError extends Error {
  constructor(
    readonly code: 'cancelled' | 'provider_failed',
    message: string,
  ) {
    super(message);
    this.name = 'AnchorExtractionProviderError';
  }
}

export function createMockAnchorExtractionProvider(): AnchorExtractionProvider {
  return {
    async extract(request) {
      if (request.signal?.aborted) {
        throw new AnchorExtractionProviderError('cancelled', 'anchor extraction cancelled');
      }
      await Promise.resolve();
      if (request.signal?.aborted) {
        throw new AnchorExtractionProviderError('cancelled', 'anchor extraction cancelled');
      }
      return {
        requestId: request.requestId,
        diaryId: request.snapshot.diaryId,
        diaryVersion: request.snapshot.diaryVersion,
        source: 'mock',
        anchors: request.snapshot.blocks.map(block => ({
          id: `mock-anchor-${request.requestId}-${block.id}`,
          tagId: 'mock-unclassified',
          sourceBlockId: block.id,
          excerpt: block.content,
        })),
      };
    },
  };
}

export function createUnconfiguredAnchorExtractionProvider(): AnchorExtractionProvider {
  return {
    async extract() {
      throw new AnchorExtractionProviderError('provider_failed', 'anchor extraction provider is not configured');
    },
  };
}
