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
});
