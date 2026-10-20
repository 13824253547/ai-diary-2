import {
  isAnchorExtractionResult,
  isAnchorExtractionSnapshot,
  type AnchorExtractionRequest,
  type AnchorExtractionResult,
  type AnchorExtractionSnapshot,
} from '../contracts/anchor-contract';
import {
  AnchorExtractionProviderError,
  type AnchorExtractionProvider,
} from './anchor-extraction-provider';

export class AnchorExtractionError extends Error {
  constructor(
    readonly code: 'invalid_input' | 'cancelled' | 'provider_failed' | 'stale' | 'version_conflict',
    message: string,
  ) {
    super(message);
    this.name = 'AnchorExtractionError';
  }
}

export type AnchorExtractionServiceOptions = {
  provider: AnchorExtractionProvider;
  createRequestId: () => string;
  isCurrentSourceVersion: (diaryId: string, version: number) => boolean | Promise<boolean>;
};

export type AnchorExtractionService = {
  extract: (
    snapshot: AnchorExtractionSnapshot,
    options?: { attempt?: number; signal?: AbortSignal },
  ) => Promise<AnchorExtractionResult>;
};

type InflightExtraction = {
  fingerprint: string;
  promise: Promise<AnchorExtractionResult>;
  controller: AbortController;
  waiters: number;
  settled: boolean;
};

function isAbortError(error: unknown) {
  return error instanceof AnchorExtractionProviderError
    && error.code === 'cancelled';
}

function raceWithAbort<T>(work: Promise<T>, signal: AbortSignal) {
  if (signal.aborted) {
    return Promise.reject(new AnchorExtractionError('cancelled', '锚点提取已取消。'));
  }
  let removeListener: (() => void) | undefined;
  const aborted = new Promise<never>((_, reject) => {
    const onAbort = () => reject(new AnchorExtractionError('cancelled', '锚点提取已取消。'));
    signal.addEventListener('abort', onAbort, { once: true });
    removeListener = () => signal.removeEventListener('abort', onAbort);
    if (signal.aborted) onAbort();
  });
  return Promise.race([work, aborted]).finally(() => removeListener?.());
}

function waitForInflight(
  operation: InflightExtraction,
  signal?: AbortSignal,
): Promise<AnchorExtractionResult> {
  if (signal?.aborted) {
    if (operation.waiters === 0 && !operation.settled) operation.controller.abort();
    return Promise.reject(new AnchorExtractionError('cancelled', '锚点提取已取消。'));
  }

  operation.waiters += 1;
  let released = false;
  const release = () => {
    if (released) return;
    released = true;
    operation.waiters -= 1;
    if (operation.waiters === 0 && !operation.settled) operation.controller.abort();
  };

  const result = signal
    ? raceWithAbort(operation.promise, signal)
    : operation.promise;
  return result.finally(release);
}

function assertResultMatchesSnapshot(
  value: unknown,
  request: AnchorExtractionRequest,
): asserts value is AnchorExtractionResult {
  if (!isAnchorExtractionResult(value) || value.requestId !== request.requestId) {
    throw new AnchorExtractionError('provider_failed', '锚点提取结果结构无效。');
  }
  if (
    value.diaryId !== request.snapshot.diaryId
    || value.diaryVersion !== request.snapshot.diaryVersion
  ) {
    throw new AnchorExtractionError('stale', '锚点提取结果与来源版本不匹配。');
  }
  const sourceBlockIds = new Set(request.snapshot.blocks.map(block => block.id));
  if (value.anchors.some(anchor => !sourceBlockIds.has(anchor.sourceBlockId))) {
    throw new AnchorExtractionError('provider_failed', '锚点结果引用了无关正文。');
  }
}

export function createAnchorExtractionService(
  options: AnchorExtractionServiceOptions,
): AnchorExtractionService {
  const inflight = new Map<string, InflightExtraction>();

  return {
    extract(snapshot, requestOptions = {}) {
      if (!isAnchorExtractionSnapshot(snapshot)) {
        return Promise.reject(new AnchorExtractionError('invalid_input', '锚点提取来源无效。'));
      }
      const attempt = requestOptions.attempt ?? 1;
      if (!Number.isSafeInteger(attempt) || attempt < 1) {
        return Promise.reject(new AnchorExtractionError('invalid_input', '锚点提取尝试次数无效。'));
      }
      if (requestOptions.signal?.aborted) {
        return Promise.reject(new AnchorExtractionError('cancelled', '锚点提取已取消。'));
      }
      const key = `${snapshot.diaryId}:${snapshot.diaryVersion}`;
      const current = inflight.get(key);
      if (current) {
        if (!current.controller.signal.aborted && !current.settled) {
          const fingerprint = JSON.stringify(snapshot.blocks);
          if (current.fingerprint !== fingerprint) {
            return Promise.reject(new AnchorExtractionError('version_conflict', '同一日记版本对应了不同正文快照。'));
          }
          return waitForInflight(current, requestOptions.signal);
        }
        inflight.delete(key);
      }

      const requestId = options.createRequestId();
      if (!requestId.trim()) {
        return Promise.reject(new AnchorExtractionError('invalid_input', '锚点提取请求标识无效。'));
      }
      const controller = new AbortController();
      if (requestOptions.signal?.aborted) {
        return Promise.reject(new AnchorExtractionError('cancelled', '锚点提取已取消。'));
      }

      const request: AnchorExtractionRequest = {
        requestId,
        attempt,
        snapshot: {
          diaryId: snapshot.diaryId,
          diaryVersion: snapshot.diaryVersion,
          blocks: snapshot.blocks.map(block => ({ ...block })),
        },
        signal: controller.signal,
      };
      const work = Promise.resolve().then(async () => {
        if (controller.signal.aborted) {
          throw new AnchorExtractionError('cancelled', '锚点提取已取消。');
        }
        let providerResult: unknown;
        try {
          providerResult = await options.provider.extract(request);
        } catch (error) {
          if (isAbortError(error) || controller.signal.aborted) {
            throw new AnchorExtractionError('cancelled', '锚点提取已取消。');
          }
          throw new AnchorExtractionError('provider_failed', '锚点提取暂时不可用。');
        }
        assertResultMatchesSnapshot(providerResult, request);
        if (controller.signal.aborted) {
          throw new AnchorExtractionError('cancelled', '锚点提取已取消。');
        }
        let isCurrent: boolean;
        try {
          isCurrent = await options.isCurrentSourceVersion(snapshot.diaryId, snapshot.diaryVersion);
        } catch {
          throw new AnchorExtractionError('provider_failed', '无法确认锚点来源版本。');
        }
        if (!isCurrent) {
          throw new AnchorExtractionError('stale', '日记已更新，旧版本锚点结果已丢弃。');
        }
        return providerResult;
      });

      let operation: InflightExtraction;
      const result = raceWithAbort(work, controller.signal).finally(() => {
        operation.settled = true;
        if (inflight.get(key) === operation) inflight.delete(key);
      });
      operation = {
        fingerprint: JSON.stringify(snapshot.blocks),
        promise: result,
        controller,
        waiters: 0,
        settled: false,
      };
      inflight.set(key, operation);
      return waitForInflight(operation, requestOptions.signal);
    },
  };
}
