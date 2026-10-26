import * as FileSystem from 'expo-file-system/legacy';
import { requireOptionalNativeModule } from 'expo-modules-core';
import { Platform } from 'react-native';
import { appConfig } from '../config/app-config';
import {
  createDiagnosticRequestId,
  isDevDiagnosticsEnabled,
  logDevDiagnostic,
} from './dev-diagnostics';

const DEVICE_ID_FILE_NAME = 'orange-glow-device-id.txt';
const DEVICE_ID_PREFIX = 'device-';
const ATTESTED_IDENTITY_KEY = 'orange-glow-attested-identity-v1';
const ATTESTED_KEY_ID_KEY = 'orange-glow-app-attest-key-id-v1';
const TOKEN_REFRESH_WINDOW_MS = 24 * 60 * 60 * 1000;

let cachedDeviceId: string | undefined;
let pendingDeviceId: Promise<string> | undefined;
let cachedAttestedIdentity: AttestedDeviceIdentity | undefined;
let appIntegrityApi: AppIntegrityApi | null | undefined;
let secureStoreApi: SecureStoreApi | undefined;

function isValidDeviceId(value: unknown): value is string {
  return typeof value === 'string' && value.startsWith(DEVICE_ID_PREFIX) && value.trim().length > DEVICE_ID_PREFIX.length;
}

type AttestedDeviceIdentity = {
  deviceId: string;
  keyId: string;
  accessToken: string;
  expiresAt: string;
};

type IdentityChallenge = {
  challengeId: string;
  challenge: string;
};

type SignedTokenChallenge = IdentityChallenge & {
  keyId: string;
  deviceId: string;
  payload: string;
};

type AppIntegrityApi = {
  isSupported: boolean;
  generateKeyAsync(): Promise<string>;
  attestKeyAsync(keyId: string, challenge: string): Promise<string>;
  generateAssertionAsync(keyId: string, challenge: string): Promise<string>;
};
type SecureStoreApi = typeof import('expo-secure-store');

class IdentityRequestError extends Error {
  constructor(readonly status: number, readonly code: string, message: string) {
    super(message);
    this.name = 'IdentityRequestError';
  }
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

async function readLegacyDeviceId() {
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

async function persistLegacyDeviceId(deviceId: string) {
  if (process.env.JEST_WORKER_ID) return;

  if (typeof localStorage !== 'undefined') {
    localStorage.setItem(DEVICE_ID_FILE_NAME, deviceId);
    return;
  }

  const fileUri = getDeviceIdFileUri();
  if (!fileUri) return;
  await FileSystem.writeAsStringAsync(fileUri, deviceId);
}

async function requestIdentityApi<T>(path: string, body: unknown): Promise<T> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15_000);
  const diagnosticsEnabled = isDevDiagnosticsEnabled();
  const requestId = diagnosticsEnabled ? createDiagnosticRequestId() : undefined;
  const startedAt = Date.now();
  if (requestId) {
    logDevDiagnostic('info', 'identity.request.started', {
      requestId,
      route: path,
      method: 'POST',
    });
  }
  try {
    const response = await fetch(`${appConfig.backendBaseUrl}${path}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(requestId ? { 'x-request-id': requestId } : {}),
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    let result: unknown;
    try {
      result = await response.json();
    } catch {
      throw new IdentityRequestError(response.status, 'invalid_response', 'Identity service returned an invalid response.');
    }
    if (requestId) {
      const error = (result as { error?: { code?: unknown } } | null)?.error;
      logDevDiagnostic(response.ok ? 'info' : 'warn', 'identity.response.received', {
        requestId,
        route: path,
        method: 'POST',
        status: response.status,
        durationMs: Date.now() - startedAt,
        ...(typeof error?.code === 'string' ? { errorCode: error.code } : {}),
      });
    }
    if (!response.ok) {
      const error = (result as { error?: { code?: unknown; message?: unknown } } | null)?.error;
      throw new IdentityRequestError(
        response.status,
        typeof error?.code === 'string' ? error.code : 'identity_request_failed',
        typeof error?.message === 'string' ? error.message : 'Identity request failed.',
      );
    }
    return result as T;
  } catch (error) {
    if (requestId) {
      logDevDiagnostic('warn', 'identity.request.failed', {
        requestId,
        route: path,
        method: 'POST',
        durationMs: Date.now() - startedAt,
        errorCode: error instanceof IdentityRequestError
          ? error.code
          : controller.signal.aborted
            ? 'identity_timeout'
            : 'network_error',
        ...(error instanceof Error ? { errorName: error.name } : {}),
      });
    }
    if (error instanceof IdentityRequestError) throw error;
    if (controller.signal.aborted) {
      throw new IdentityRequestError(408, 'identity_timeout', 'Device identity request timed out.');
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

function isDevelopmentRuntime() {
  return typeof __DEV__ !== 'undefined' && __DEV__;
}

function getAppIntegrity() {
  if (appIntegrityApi === undefined) {
    appIntegrityApi = requireOptionalNativeModule<AppIntegrityApi>('ExpoAppIntegrity');
  }
  return appIntegrityApi;
}

function requireAppIntegrity() {
  const api = getAppIntegrity();
  if (!api) throw new Error('ExpoAppIntegrity native module is unavailable.');
  return api;
}

function getSecureStore() {
  secureStoreApi ??= require('expo-secure-store') as SecureStoreApi;
  return secureStoreApi;
}

async function saveAttestedIdentity(identity: AttestedDeviceIdentity) {
  const secureStore = getSecureStore();
  await secureStore.setItemAsync(ATTESTED_KEY_ID_KEY, identity.keyId);
  await secureStore.setItemAsync(ATTESTED_IDENTITY_KEY, JSON.stringify(identity));
  cachedAttestedIdentity = identity;
  cachedDeviceId = identity.deviceId;
}

async function readAttestedIdentity() {
  if (cachedAttestedIdentity) return cachedAttestedIdentity;
  const stored = await getSecureStore().getItemAsync(ATTESTED_IDENTITY_KEY);
  if (!stored) return undefined;
  try {
    const parsed = JSON.parse(stored) as Partial<AttestedDeviceIdentity>;
    if (
      isValidDeviceId(parsed.deviceId)
      && typeof parsed.keyId === 'string'
      && typeof parsed.accessToken === 'string'
      && typeof parsed.expiresAt === 'string'
      && Number.isFinite(Date.parse(parsed.expiresAt))
    ) {
      cachedAttestedIdentity = parsed as AttestedDeviceIdentity;
      return cachedAttestedIdentity;
    }
  } catch {
    // Ignore malformed local credentials and start enrollment again.
  }
  return undefined;
}

async function issueTokenForKey(keyId: string): Promise<AttestedDeviceIdentity> {
  const challenge = await requestIdentityApi<SignedTokenChallenge>('/identity/token/challenge', { keyId });
  const assertion = await requireAppIntegrity().generateAssertionAsync(keyId, challenge.payload);
  const issued = await requestIdentityApi<Omit<AttestedDeviceIdentity, 'keyId'>>('/identity/token/refresh', {
    challengeId: challenge.challengeId,
    keyId,
    assertion,
  });
  return { ...issued, keyId };
}

async function attestNewKey(keyId?: string): Promise<AttestedDeviceIdentity> {
  const appIntegrity = requireAppIntegrity();
  const secureStore = getSecureStore();
  const activeKeyId = keyId ?? await appIntegrity.generateKeyAsync();
  await secureStore.setItemAsync(ATTESTED_KEY_ID_KEY, activeKeyId);
  const challenge = await requestIdentityApi<IdentityChallenge>('/identity/attestation/challenge', {});
  const attestation = await appIntegrity.attestKeyAsync(activeKeyId, challenge.challenge);
  const issued = await requestIdentityApi<Omit<AttestedDeviceIdentity, 'keyId'>>('/identity/attestation/register', {
    challengeId: challenge.challengeId,
    keyId: activeKeyId,
    attestation,
  });
  const identity = { ...issued, keyId: activeKeyId };
  await saveAttestedIdentity(identity);
  return identity;
}

async function ensureAttestedIdentity() {
  const stored = await readAttestedIdentity();
  if (stored && Date.parse(stored.expiresAt) > Date.now() + TOKEN_REFRESH_WINDOW_MS) return stored;

  if (stored) {
    const refreshed = await issueTokenForKey(stored.keyId);
    if (refreshed.deviceId !== stored.deviceId) {
      throw new IdentityRequestError(401, 'device_identity_mismatch', 'The attested key is bound to another device identity.');
    }
    const identity = refreshed;
    await saveAttestedIdentity(identity);
    return identity;
  }

  const keyId = await getSecureStore().getItemAsync(ATTESTED_KEY_ID_KEY);
  if (keyId) {
    try {
      const recovered = await issueTokenForKey(keyId);
      await saveAttestedIdentity(recovered);
      return recovered;
    } catch (error) {
      if (
        !(error instanceof IdentityRequestError)
        || error.code !== 'device_attestation_not_registered'
        || error.status !== 404
      ) {
        throw error;
      }
    }
    return attestNewKey(keyId);
  }
  return attestNewKey();
}

export async function ensureDeviceIdentity() {
  if (
    cachedDeviceId
    && (!cachedAttestedIdentity || Date.parse(cachedAttestedIdentity.expiresAt) > Date.now() + TOKEN_REFRESH_WINDOW_MS)
  ) {
    return cachedDeviceId;
  }
  if (pendingDeviceId) return pendingDeviceId;

  pendingDeviceId = (async () => {
    if (process.env.JEST_WORKER_ID) {
      cachedDeviceId = 'device-jest';
      return cachedDeviceId;
    }
    if (Platform.OS === 'ios') {
      logDevDiagnostic('info', 'identity.bootstrap.started', { platform: Platform.OS });
      try {
        const appIntegrity = getAppIntegrity();
        if (!appIntegrity) {
          logDevDiagnostic('warn', 'identity.attestation.unavailable', {
            platform: Platform.OS,
            outcome: 'native_module_missing',
          });
        } else if (!appIntegrity.isSupported) {
          logDevDiagnostic('info', 'identity.attestation.unavailable', {
            platform: Platform.OS,
            outcome: 'device_unsupported',
          });
        } else {
          logDevDiagnostic('info', 'identity.attestation.started', { platform: Platform.OS });
          return (await ensureAttestedIdentity()).deviceId;
        }
      } catch (error) {
        if (!isDevelopmentRuntime()) throw error;
        logDevDiagnostic('warn', 'identity.attestation.failed', {
          platform: Platform.OS,
          outcome: 'development_fallback',
          ...(error instanceof Error ? { errorName: error.name } : {}),
        });
      }
    }

    if (!isDevelopmentRuntime()) {
      throw new Error('This release requires a supported, server-verified device identity.');
    }
    const existing = await readLegacyDeviceId();
    if (existing) {
      logDevDiagnostic('info', 'identity.bootstrap.completed', {
        platform: Platform.OS,
        source: 'legacy_existing',
      });
      cachedDeviceId = existing;
      return existing;
    }
    const created = generateDeviceId();
    try {
      await persistLegacyDeviceId(created);
    } catch {
      // Keep the development identity in memory if local persistence is unavailable.
    }
    logDevDiagnostic('info', 'identity.bootstrap.completed', {
      platform: Platform.OS,
      source: 'legacy_development',
    });
    cachedDeviceId = created;
    return created;
  })();

  try {
    return await pendingDeviceId;
  } finally {
    pendingDeviceId = undefined;
  }
}

export async function getDeviceIdentityHeaders() {
  const deviceId = await ensureDeviceIdentity();
  const identity = cachedAttestedIdentity;
  const headers: Record<string, string> = { 'x-device-id': deviceId };
  if (identity && identity.deviceId === deviceId) {
    headers.Authorization = `Bearer ${identity.accessToken}`;
  }
  return headers;
}
