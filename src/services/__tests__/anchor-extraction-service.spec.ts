import type {
  AnchorExtractionRequest,
  AnchorExtractionResult,
  AnchorExtractionSnapshot,
} from '../../contracts/anchor-contract';
import { createMockAnchorExtractionProvider } from '../anchor-extraction-provider';
import { AnchorExtractionError, createAnchorExtractionService } from '../anchor-extraction-service';

function snapshot(overrides: Partial<AnchorExtractionSnapshot> = {}): AnchorExtractionSnapshot {
  return {
    diaryId: 'diary-1',
    diaryVersion: 4,
    blocks: [{ id: 'paragraph-1', type: 'text', content: '沿着旧街慢慢走。' }],
    ...overrides,
  };
}

describe('anchor extraction service boundary', () => {
  test('rejects malformed snapshots without calling a provider', async () => {
    const provider = { extract: jest.fn() };
    const service = createAnchorExtractionService({
      provider,
      createRequestId: () => 'anchor-request-1',
      isCurrentSourceVersion: () => true,
    });

    await expect(service.extract(snapshot({ diaryVersion: 0 })))
      .rejects.toMatchObject({ code: 'invalid_input' });
    await expect(service.extract(snapshot({
      blocks: [{ id: 'paragraph-1', type: 'text', content: ' ' }],
    }))).rejects.toMatchObject({ code: 'invalid_input' });
    expect(provider.extract).not.toHaveBeenCalled();
  });

  test('marks deterministic development output as mock and preserves explicit source references', async () => {
    const service = createAnchorExtractionService({
      provider: createMockAnchorExtractionProvider(),
      createRequestId: () => 'anchor-request-1',
      isCurrentSourceVersion: () => true,
    });

    const result = await service.extract(snapshot());

    expect(result).toMatchObject({
      requestId: 'anchor-request-1',
      diaryId: 'diary-1',
      diaryVersion: 4,
      source: 'mock',
      anchors: [{
        tagId: 'mock-unclassified',
        sourceBlockId: 'paragraph-1',
        excerpt: '沿着旧街慢慢走。',
      }],
    });
  });

  test('coalesces concurrent requests for the same source version', async () => {
    let resolveProvider: ((result: AnchorExtractionResult) => void) | undefined;
    const provider = {
      extract: jest.fn((request: AnchorExtractionRequest) => new Promise<AnchorExtractionResult>(resolve => {
        resolveProvider = resolve;
        void request;
      })),
    };
    const service = createAnchorExtractionService({
      provider,
      createRequestId: () => 'anchor-request-1',
      isCurrentSourceVersion: () => true,
    });
    const source = snapshot();

    const first = service.extract(source);
    const second = service.extract(source);
    await Promise.resolve();
    expect(provider.extract).toHaveBeenCalledTimes(1);
    resolveProvider?.({
      requestId: 'anchor-request-1',
      diaryId: 'diary-1',
      diaryVersion: 4,
      source: 'provider',
      anchors: [{
        id: 'anchor-1',
        tagId: 'topic-a',
        sourceBlockId: 'paragraph-1',
        excerpt: '沿着旧街慢慢走。',
      }],
    });

    await expect(Promise.all([first, second])).resolves.toHaveLength(2);
  });

  test('rejects malformed or cross-source provider results', async () => {
    const source = snapshot();
    const malformedResults: AnchorExtractionResult[] = [
      {
        requestId: 'wrong-request',
        diaryId: source.diaryId,
        diaryVersion: source.diaryVersion,
        source: 'provider',
        anchors: [],
      },
      {
        requestId: 'anchor-request-1',
        diaryId: source.diaryId,
        diaryVersion: source.diaryVersion,
        source: 'provider',
        anchors: [{
          id: 'anchor-1',
          tagId: 'topic-a',
          sourceBlockId: 'private-other-block',
          excerpt: '与来源无关的正文。',
        }],
      },
    ];

    for (const invalidResult of malformedResults) {
      const service = createAnchorExtractionService({
        provider: { extract: async () => invalidResult },
        createRequestId: () => 'anchor-request-1',
        isCurrentSourceVersion: () => true,
      });
      await expect(service.extract(source)).rejects.toMatchObject({ code: 'provider_failed' });
    }
  });

  test('drops results when the source diary version changed during extraction', async () => {
    const service = createAnchorExtractionService({
      provider: createMockAnchorExtractionProvider(),
      createRequestId: () => 'anchor-request-1',
      isCurrentSourceVersion: (_diaryId, version) => version === 5,
    });

    await expect(service.extract(snapshot({ diaryVersion: 4 })))
      .rejects.toBeInstanceOf(AnchorExtractionError);
    await expect(service.extract(snapshot({ diaryVersion: 4 })))
      .rejects.toMatchObject({ code: 'stale' });
  });

  test('honors caller cancellation and does not accept a late result', async () => {
    let resolveProvider: ((result: AnchorExtractionResult) => void) | undefined;
    let markProviderStarted!: () => void;
    let providerSignal: AbortSignal | undefined;
    const providerStarted = new Promise<void>(resolve => {
      markProviderStarted = resolve;
    });
    const provider = {
      extract: (request: AnchorExtractionRequest) => new Promise<AnchorExtractionResult>(resolve => {
        resolveProvider = resolve;
        providerSignal = request.signal;
        markProviderStarted();
      }),
    };
    const service = createAnchorExtractionService({
      provider,
      createRequestId: () => 'anchor-request-1',
      isCurrentSourceVersion: () => true,
    });
    const controller = new AbortController();
    const pending = service.extract(snapshot(), { signal: controller.signal });
    await providerStarted;
    const cancellation = expect(pending).rejects.toMatchObject({ code: 'cancelled' });
    controller.abort();
    await cancellation;
    expect(providerSignal?.aborted).toBe(true);
    resolveProvider?.({
      requestId: 'anchor-request-1',
      diaryId: 'diary-1',
      diaryVersion: 4,
      source: 'provider',
      anchors: [],
    });
  });

  test('one caller cancellation does not cancel a coalesced extraction for another waiter', async () => {
    let resolveProvider: ((result: AnchorExtractionResult) => void) | undefined;
    let markProviderStarted!: () => void;
    let providerSignal: AbortSignal | undefined;
    const providerStarted = new Promise<void>(resolve => {
      markProviderStarted = resolve;
    });
    const provider = {
      extract: jest.fn((request: AnchorExtractionRequest) => new Promise<AnchorExtractionResult>(resolve => {
        resolveProvider = resolve;
        providerSignal = request.signal;
        markProviderStarted();
      })),
    };
    const service = createAnchorExtractionService({
      provider,
      createRequestId: () => 'anchor-request-1',
      isCurrentSourceVersion: () => true,
    });
    const controller = new AbortController();
    const cancelledWaiter = service.extract(snapshot(), { signal: controller.signal });
    const activeWaiter = service.extract(snapshot());
    await providerStarted;
    expect(provider.extract).toHaveBeenCalledTimes(1);

    const cancellation = expect(cancelledWaiter).rejects.toMatchObject({ code: 'cancelled' });
    controller.abort();
    await cancellation;
    expect(providerSignal?.aborted).toBe(false);

    const result: AnchorExtractionResult = {
      requestId: 'anchor-request-1',
      diaryId: 'diary-1',
      diaryVersion: 4,
      source: 'provider',
      anchors: [],
    };
    resolveProvider?.(result);
    await expect(activeWaiter).resolves.toEqual(result);
  });
});
