import * as FileSystem from 'expo-file-system/legacy';
import { sha256 } from '@noble/hashes/sha256';
import { bytesToHex, utf8ToBytes } from '@noble/hashes/utils';
import { appConfig } from '../config/app-config';
import { ACCOUNT_MATERIAL_CACHE_PREFIX } from './account-media-cache';

async function removeFiles(directory: string | null | undefined, predicate: (name: string) => boolean) {
  if (!directory) return;
  const names = await FileSystem.readDirectoryAsync(directory).catch(() => []);
  await Promise.all(names.filter(predicate).map(name =>
    FileSystem.deleteAsync(`${directory}${name}`, { idempotent: true }),
  ));
}

export async function clearAccountPrivateData(userId: string) {
  const scope = `${appConfig.backendBaseUrl}:${userId}`;
  const snapshotName = `orange-glow-drafts-account-v1-${bytesToHex(
    sha256(utf8ToBytes(scope)),
  )}.json`;
  if (typeof localStorage !== 'undefined') {
    localStorage.removeItem(snapshotName);
    localStorage.removeItem(`ai-consent-user-${encodeURIComponent(userId)}.json`);
  }
  if (FileSystem.documentDirectory) {
    await Promise.all([
      FileSystem.deleteAsync(`${FileSystem.documentDirectory}${snapshotName}`, { idempotent: true }),
      FileSystem.deleteAsync(`${FileSystem.documentDirectory}ai-consent-user-${encodeURIComponent(userId)}.json`, { idempotent: true }),
    ]);
  }
}

export async function clearTransientAccountMediaCache() {
  await removeFiles(FileSystem.cacheDirectory, name => name.startsWith(ACCOUNT_MATERIAL_CACHE_PREFIX));
}
