import type { Deferred } from './create-deferred';

export type AsyncFaultStep<T> =
  | { type: 'resolve'; value: T }
  | { type: 'reject'; reason: unknown }
  | { type: 'deferred'; deferred: Deferred<T> };

export function createAsyncFaultPlan<T>(steps: AsyncFaultStep<T>[]) {
  const plan = [...steps];
  let calls = 0;

  return {
    next(): Promise<T> {
      const step = plan[calls];
      calls += 1;
      if (!step) {
        return Promise.reject(new Error('No scripted async outcome remains'));
      }
      if (step.type === 'resolve') return Promise.resolve(step.value);
      if (step.type === 'reject') return Promise.reject(step.reason);
      return step.deferred.promise;
    },
    get callCount() {
      return calls;
    },
    get remainingCount() {
      return Math.max(plan.length - calls, 0);
    },
  };
}
