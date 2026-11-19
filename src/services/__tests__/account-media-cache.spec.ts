import { clearTransientAccountMediaCache } from '../legacy-account-data-cleanup';

const mockReadDirectoryAsync = jest.fn();
const mockDeleteAsync = jest.fn();

jest.mock('expo-file-system/legacy', () => ({
  cacheDirectory: 'file:///cache/',
  readDirectoryAsync: (...args: unknown[]) => mockReadDirectoryAsync(...args),
  deleteAsync: (...args: unknown[]) => mockDeleteAsync(...args),
}));

test('clears only new account material cache and leaves legacy files untouched', async () => {
  mockReadDirectoryAsync.mockResolvedValue([
    'diary-material-old.jpg',
    'account-diary-material-v1-new.jpg',
    'unrelated.jpg',
  ]);
  mockDeleteAsync.mockResolvedValue(undefined);

  await clearTransientAccountMediaCache();

  expect(mockDeleteAsync).toHaveBeenCalledTimes(1);
  expect(mockDeleteAsync).toHaveBeenCalledWith(
    'file:///cache/account-diary-material-v1-new.jpg',
    { idempotent: true },
  );
});
