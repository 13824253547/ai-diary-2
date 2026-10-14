import { createAppSelectors, createAppStore, createDefaultAppStoreDeps, type AppStoreDeps } from '../store/create-app-store';

export function createTestStore(overrides: Partial<AppStoreDeps> = {}) {
  let nextSequence = 1;
  const deps = createDefaultAppStoreDeps({
    ...overrides,
    now: overrides.now ?? (() => 1_700_000_000_000),
    createId: overrides.createId ?? (prefix => `${prefix}-test-${nextSequence++}`),
  });
  const store = createAppStore(deps);
  const selectors = createAppSelectors(store, deps);

  return { store, selectors, deps };
}
