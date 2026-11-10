import * as FileSystem from 'expo-file-system/legacy';
import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';
import { sha256 } from '@noble/hashes/sha256';
import { bytesToHex, utf8ToBytes } from '@noble/hashes/utils';
import { appConfig } from '../config/app-config';

const CLEANUP_MARKER = 'orange-glow-account-cutover-cleaned-v1';
const LEGACY_SECURE_KEYS = [
  'orange-glow-attested-identity-v1',
  'orange-glow-app-attest-key-id-v1',
];

function isLegacyPrivateFile(name: string) {
  return name === 'orange-glow-device-id.txt'
    || name === 'orange-glow-drafts-v1.json'
    || name.startsWith('orange-glow-drafts-installation-v1-')
    || name.startsWith('ai-consent-device-');
}

async function removeFiles(directory: string | null | undefined, predicate: (name: string) => boolean) {
  if (!directory) return;
  const names = await FileSystem.readDirectoryAsync(directory).catch(() => []);
  await Promise.all(names.filter(predicate).map(name =>
    FileSystem.deleteAsync(`${directory}${name}`, { idempotent: true }),
  ));
}

export async function clearLegacyAnonymousLocalData() {
  if (Platform.OS !== 'web' && await SecureStore.getItemAsync(CLEANUP_MARKER) === 'done') return;

  if (typeof localStorage !== 'undefined') {
    const names: string[] = [];
    for (let index = 0; index < localStorage.length; index += 1) {
      const key = localStorage.key(index);
      if (key && isLegacyPrivateFile(key)) names.push(key);
    }
    names.forEach(key => localStorage.removeItem(key));
  }

  await removeFiles(FileSystem.documentDirectory, isLegacyPrivateFile);

  if (Platform.OS !== 'web') {
    const installationKey = `orange-glow-installation-v1-${bytesToHex(
      sha256(utf8ToBytes(appConfig.backendBaseUrl)),
    )}`;
    await Promise.all([
      SecureStore.deleteItemAsync(installationKey),
      ...LEGACY_SECURE_KEYS.map(key => SecureStore.deleteItemAsync(key)),
    ]);
    await SecureStore.setItemAsync(CLEANUP_MARKER, 'done', {
      keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
    });
  }
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
  await removeFiles(FileSystem.cacheDirectory, name => name.startsWith('diary-material-'));
}
