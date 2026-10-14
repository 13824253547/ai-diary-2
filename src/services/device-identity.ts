import * as FileSystem from 'expo-file-system/legacy';

const DEVICE_ID_FILE_NAME = 'orange-glow-device-id.txt';
const DEVICE_ID_PREFIX = 'device-';

let cachedDeviceId: string | undefined;
let pendingDeviceId: Promise<string> | undefined;

function isValidDeviceId(value: unknown): value is string {
  return typeof value === 'string' && value.startsWith(DEVICE_ID_PREFIX) && value.trim().length > DEVICE_ID_PREFIX.length;
}

function generateDeviceId() {
  const randomPart = typeof globalThis.crypto?.randomUUID === 'function'
    ? globalThis.crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
  return `${DEVICE_ID_PREFIX}${randomPart}`;
}

function getDeviceIdFileUri() {
  return FileSystem.documentDirectory ? `${FileSystem.documentDirectory}${DEVICE_ID_FILE_NAME}` : undefined;
}

async function readPersistedDeviceId() {
  if (process.env.JEST_WORKER_ID) return 'device-jest';

  if (typeof localStorage !== 'undefined') {
    const stored = localStorage.getItem(DEVICE_ID_FILE_NAME)?.trim();
    return isValidDeviceId(stored) ? stored : undefined;
  }

  const fileUri = getDeviceIdFileUri();
  if (!fileUri) return undefined;

  try {
    const info = await FileSystem.getInfoAsync(fileUri);
    if (!info.exists) return undefined;
    const stored = (await FileSystem.readAsStringAsync(fileUri)).trim();
    return isValidDeviceId(stored) ? stored : undefined;
  } catch {
    return undefined;
  }
}

async function persistDeviceId(deviceId: string) {
  if (process.env.JEST_WORKER_ID) return;

  if (typeof localStorage !== 'undefined') {
    localStorage.setItem(DEVICE_ID_FILE_NAME, deviceId);
    return;
  }

  const fileUri = getDeviceIdFileUri();
  if (!fileUri) return;
  await FileSystem.writeAsStringAsync(fileUri, deviceId);
}

export async function ensureDeviceIdentity() {
  if (cachedDeviceId) return cachedDeviceId;
  if (pendingDeviceId) return pendingDeviceId;

  pendingDeviceId = (async () => {
    const existing = await readPersistedDeviceId();
    if (existing) {
      cachedDeviceId = existing;
      return existing;
    }

    const created = generateDeviceId();
    try {
      await persistDeviceId(created);
    } catch {
      // Keep the generated id in memory even if persistence is temporarily unavailable.
    }
    cachedDeviceId = created;
    return created;
  })();

  try {
    return await pendingDeviceId;
  } finally {
    pendingDeviceId = undefined;
  }
}
