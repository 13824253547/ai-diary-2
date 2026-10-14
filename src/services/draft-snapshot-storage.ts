import * as FileSystem from 'expo-file-system/legacy';
import type { DraftSnapshotStore, PersistedDraftsSnapshot } from '../store/adapters/types';

const DRAFT_SNAPSHOT_FILE_NAME = 'orange-glow-drafts-v1.json';

function getDraftSnapshotFileUri() {
  return FileSystem.documentDirectory ? `${FileSystem.documentDirectory}${DRAFT_SNAPSHOT_FILE_NAME}` : undefined;
}

async function readDraftSnapshot() {
  if (typeof localStorage !== 'undefined') {
    const stored = localStorage.getItem(DRAFT_SNAPSHOT_FILE_NAME);
    return stored ? JSON.parse(stored) : undefined;
  }

  const fileUri = getDraftSnapshotFileUri();
  if (!fileUri) return undefined;

  try {
    const info = await FileSystem.getInfoAsync(fileUri);
    if (!info.exists) return undefined;
    const stored = await FileSystem.readAsStringAsync(fileUri);
    return stored ? JSON.parse(stored) : undefined;
  } catch {
    return undefined;
  }
}

async function persistDraftSnapshot(snapshot: PersistedDraftsSnapshot) {
  const serialized = JSON.stringify(snapshot);
  if (typeof localStorage !== 'undefined') {
    localStorage.setItem(DRAFT_SNAPSHOT_FILE_NAME, serialized);
    return;
  }

  const fileUri = getDraftSnapshotFileUri();
  if (!fileUri) return;
  await FileSystem.writeAsStringAsync(fileUri, serialized);
}

async function clearDraftSnapshot() {
  if (typeof localStorage !== 'undefined') {
    localStorage.removeItem(DRAFT_SNAPSHOT_FILE_NAME);
    return;
  }

  const fileUri = getDraftSnapshotFileUri();
  if (!fileUri) return;

  try {
    const info = await FileSystem.getInfoAsync(fileUri);
    if (info.exists) await FileSystem.deleteAsync(fileUri, { idempotent: true });
  } catch {
    // Ignore cleanup failures and let the next load attempt decide how to recover.
  }
}

export function createLocalDraftSnapshotStore(): DraftSnapshotStore {
  return {
    load: readDraftSnapshot,
    save: persistDraftSnapshot,
    clear: clearDraftSnapshot,
  };
}
