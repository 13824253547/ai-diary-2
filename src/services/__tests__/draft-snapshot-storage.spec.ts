jest.mock('expo-file-system/legacy', () => ({
  documentDirectory: 'file:///documents/',
  getInfoAsync: jest.fn(),
  readAsStringAsync: jest.fn(),
  writeAsStringAsync: jest.fn(),
  deleteAsync: jest.fn(),
}));

import * as FileSystem from 'expo-file-system/legacy';
import { createLocalDraftSnapshotStore } from '../draft-snapshot-storage';

describe('local draft snapshot storage', () => {
  const originalLocalStorage = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');

  beforeAll(() => {
    Object.defineProperty(globalThis, 'localStorage', {
      configurable: true,
      value: undefined,
    });
  });

  afterAll(() => {
    if (originalLocalStorage) {
      Object.defineProperty(globalThis, 'localStorage', originalLocalStorage);
    } else {
      delete (globalThis as unknown as { localStorage?: Storage }).localStorage;
    }
  });

  beforeEach(() => {
    jest.clearAllMocks();
    jest.mocked(FileSystem.getInfoAsync).mockResolvedValue({
      exists: true,
    } as Awaited<ReturnType<typeof FileSystem.getInfoAsync>>);
  });

  test('surfaces malformed persisted JSON instead of treating it as an empty snapshot', async () => {
    jest.mocked(FileSystem.readAsStringAsync).mockResolvedValueOnce('{invalid json');
    const snapshotStore = createLocalDraftSnapshotStore();

    await expect(snapshotStore.load()).rejects.toBeInstanceOf(SyntaxError);
    expect(FileSystem.getInfoAsync).toHaveBeenCalledWith(
      'file:///documents/orange-glow-drafts-v1.json',
    );
  });

  test('surfaces an empty existing file instead of treating it as a missing snapshot', async () => {
    jest.mocked(FileSystem.readAsStringAsync).mockResolvedValueOnce('');
    const snapshotStore = createLocalDraftSnapshotStore();

    await expect(snapshotStore.load()).rejects.toBeInstanceOf(SyntaxError);
  });

  test('surfaces an empty localStorage value instead of treating it as a missing snapshot', async () => {
    const localStorageMock = {
      getItem: jest.fn().mockReturnValue(''),
      setItem: jest.fn(),
      removeItem: jest.fn(),
      clear: jest.fn(),
      key: jest.fn(),
      length: 0,
    } as Storage;
    Object.defineProperty(globalThis, 'localStorage', {
      configurable: true,
      value: localStorageMock,
    });
    const snapshotStore = createLocalDraftSnapshotStore();

    try {
      await expect(snapshotStore.load()).rejects.toBeInstanceOf(SyntaxError);
    } finally {
      Object.defineProperty(globalThis, 'localStorage', {
        configurable: true,
        value: undefined,
      });
    }
  });

  test('surfaces file read failures so hydration can preserve the original snapshot', async () => {
    const readError = new Error('snapshot read failed');
    jest.mocked(FileSystem.readAsStringAsync).mockRejectedValueOnce(readError);
    const snapshotStore = createLocalDraftSnapshotStore();

    await expect(snapshotStore.load()).rejects.toBe(readError);
  });

  test('surfaces file cleanup failures so the store does not treat stale snapshots as cleared', async () => {
    const cleanupError = new Error('snapshot cleanup failed');
    jest.mocked(FileSystem.deleteAsync).mockRejectedValueOnce(cleanupError);
    const snapshotStore = createLocalDraftSnapshotStore();

    await expect(snapshotStore.clear()).rejects.toBe(cleanupError);
    expect(FileSystem.deleteAsync).toHaveBeenCalledWith(
      'file:///documents/orange-glow-drafts-v1.json',
      { idempotent: true },
    );
  });

  test('isolates account snapshots without reading or deleting the old anonymous snapshot', async () => {
    jest.mocked(FileSystem.readAsStringAsync).mockResolvedValue('{}');
    const first = createLocalDraftSnapshotStore(async () => 'https://production/api:device-one');
    const second = createLocalDraftSnapshotStore(async () => 'https://staging/api:device-one');
    const third = createLocalDraftSnapshotStore(async () => 'https://production/api:device-two');
    await first.load();
    await second.load();
    await third.load();
    const paths = jest.mocked(FileSystem.readAsStringAsync).mock.calls.map(([uri]) => uri);
    expect(new Set(paths).size).toBe(3);
    expect(paths.every(uri => uri.includes('orange-glow-drafts-account-v1-'))).toBe(true);
    expect(paths).not.toContain('file:///documents/orange-glow-drafts-v1.json');
    await first.clear();
    expect(FileSystem.deleteAsync).toHaveBeenCalledWith(paths[0], { idempotent: true });
  });

  test('resolves the account namespace for every operation so account switches stay isolated', async () => {
    let scope = 'https://production/api:user-one';
    const storage = createLocalDraftSnapshotStore(async () => scope);
    await storage.load();
    scope = 'https://production/api:user-two';
    await storage.load();
    const paths = jest.mocked(FileSystem.readAsStringAsync).mock.calls.map(([uri]) => uri);
    expect(paths).toHaveLength(2);
    expect(paths[0]).not.toBe(paths[1]);
  });

  test('does not access shared snapshots when account identity cannot be resolved', async () => {
    const storage = createLocalDraftSnapshotStore(async () => { throw new Error('account unavailable'); });
    await expect(storage.load()).rejects.toThrow('account unavailable');
    expect(FileSystem.readAsStringAsync).not.toHaveBeenCalled();
    expect(FileSystem.deleteAsync).not.toHaveBeenCalled();
  });
});
