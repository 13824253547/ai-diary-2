import * as FileSystem from 'expo-file-system/legacy';
import type { DraftSnapshotStore, PersistedDraftsSnapshot } from '../store/adapters/types';
import { appConfig } from '../config/app-config';
import { getAccountUserId } from './account-auth';
import { sha256 } from '@noble/hashes/sha256';
import { bytesToHex, utf8ToBytes } from '@noble/hashes/utils';

const DRAFT_SNAPSHOT_FILE_NAME = 'orange-glow-drafts-v1.json';

function getDraftSnapshotFileUri(fileName: string) {
  return FileSystem.documentDirectory ? `${FileSystem.documentDirectory}${fileName}` : undefined;
}

async function readDraftSnapshot(fileName: string) {
  if (typeof localStorage !== 'undefined') {
    const stored = localStorage.getItem(fileName);
    return stored === null ? undefined : JSON.parse(stored);
  }

  const fileUri = getDraftSnapshotFileUri(fileName);
  if (!fileUri) return undefined;

  const info = await FileSystem.getInfoAsync(fileUri);
  if (!info.exists) return undefined;
  const stored = await FileSystem.readAsStringAsync(fileUri);
  return JSON.parse(stored);
}

async function persistDraftSnapshot(snapshot: PersistedDraftsSnapshot, fileName: string) {
  const serialized = JSON.stringify(snapshot);
  if (typeof localStorage !== 'undefined') {
    localStorage.setItem(fileName, serialized);
    return;
  }

  const fileUri = getDraftSnapshotFileUri(fileName);
  if (!fileUri) return;
  await FileSystem.writeAsStringAsync(fileUri, serialized);
}

async function clearDraftSnapshot(fileName: string) {
  if (typeof localStorage !== 'undefined') {
    localStorage.removeItem(fileName);
    return;
  }

  const fileUri = getDraftSnapshotFileUri(fileName);
  if (!fileUri) return;

  const info = await FileSystem.getInfoAsync(fileUri);
  if (info.exists) await FileSystem.deleteAsync(fileUri, { idempotent: true });
}

async function accountScope() {
  if (process.env.JEST_WORKER_ID) return undefined;
  return `${appConfig.backendBaseUrl}:${await getAccountUserId()}`;
}

export function createLocalDraftSnapshotStore(getScope: () => Promise<string | undefined> = accountScope): DraftSnapshotStore {
  const fileName = async () => {
    const scope = await getScope();
    return scope
      ? `orange-glow-drafts-account-v1-${bytesToHex(sha256(utf8ToBytes(scope)))}.json`
      : DRAFT_SNAPSHOT_FILE_NAME;
  };
  return {
    load: async () => readDraftSnapshot(await fileName()),
    save: async snapshot => persistDraftSnapshot(snapshot, await fileName()),
    clear: async () => clearDraftSnapshot(await fileName()),
  };
}
