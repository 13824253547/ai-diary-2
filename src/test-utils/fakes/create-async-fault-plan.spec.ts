import { createDeferred } from './create-deferred';
import { createAsyncFaultPlan } from './create-async-fault-plan';

describe('createAsyncFaultPlan', () => {
  test('returns scripted values in order and reports plan usage', async () => {
    const plan = createAsyncFaultPlan([
      { type: 'resolve', value: 'first result' },
      { type: 'resolve', value: 'second result' },
    ]);

    await expect(plan.next()).resolves.toBe('first result');
    expect(plan.callCount).toBe(1);
    expect(plan.remainingCount).toBe(1);
    await expect(plan.next()).resolves.toBe('second result');
    expect(plan.callCount).toBe(2);
    expect(plan.remainingCount).toBe(0);
  });

  test('injects a rejection followed by an externally controlled deferred result', async () => {
    const deferred = createDeferred<string>();
    const plan = createAsyncFaultPlan([
      { type: 'reject', reason: new Error('write failed') },
      { type: 'deferred', deferred },
    ]);

    await expect(plan.next()).rejects.toThrow('write failed');
    const retry = plan.next();
    deferred.resolve('retry succeeded');
    await expect(retry).resolves.toBe('retry succeeded');
    expect(plan.callCount).toBe(2);
    expect(plan.remainingCount).toBe(0);
  });

  test('rejects when a call exceeds the scripted outcomes', async () => {
    const plan = createAsyncFaultPlan<string>([]);

    await expect(plan.next()).rejects.toThrow('No scripted async outcome remains');
    expect(plan.callCount).toBe(1);
    expect(plan.remainingCount).toBe(0);
  });
});
