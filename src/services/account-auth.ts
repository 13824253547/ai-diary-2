import * as SecureStore from 'expo-secure-store';
import { sha256 } from '@noble/hashes/sha256';
import { bytesToHex, utf8ToBytes } from '@noble/hashes/utils';
import { Platform } from 'react-native';
import { appConfig } from '../config/app-config';
import { clearAccountPrivateData, clearTransientAccountMediaCache } from './legacy-account-data-cleanup';

function sessionKey() {
  return `orange-glow-account-session-v2-${bytesToHex(sha256(utf8ToBytes(appConfig.backendBaseUrl)))}`;
}

export type AccountSession = {
  accessToken: string;
  expiresAt: string;
  user: { id: string; username: string };
};

export type CaptchaChallenge = {
  challengeId: string;
  background: string;
  piece: string;
  width: number;
  height: number;
  pieceTop: number;
  pieceSize: number;
  expiresAt: string;
};

export type EmailCodeChallenge = {
  challengeId: string;
  expiresAt: string;
  maskedEmail?: string;
};

type Envelope<T> = { ok?: unknown; data?: T; error?: { code?: unknown; message?: unknown } };
type SessionListener = (session: AccountSession | undefined) => void;

let session: AccountSession | undefined;
let loadingSession: Promise<AccountSession | undefined> | undefined;
const listeners = new Set<SessionListener>();

export class AccountAuthError extends Error {
  constructor(message: string, readonly code: string, readonly status: number) {
    super(message);
    this.name = 'AccountAuthError';
  }
}

function notifySession() {
  for (const listener of listeners) listener(session);
}

export function subscribeAccountSession(listener: SessionListener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function validSession(value: unknown): value is AccountSession {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const record = value as Partial<AccountSession>;
  return typeof record.accessToken === 'string' && record.accessToken.length > 32
    && record.accessToken.length <= 4096
    && typeof record.expiresAt === 'string' && Date.parse(record.expiresAt) > Date.now()
    && !!record.user && typeof record.user.id === 'string' && record.user.id.length > 0
    && typeof record.user.username === 'string';
}

async function request<T>(
  path: string,
  method: string,
  body?: unknown,
  token?: string,
  timeoutMs = 15_000,
): Promise<{ status: number; data: Envelope<T> }> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(`${appConfig.backendBaseUrl}${path}`, {
      method,
      headers: {
        ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      signal: controller.signal,
    });
    let data: Envelope<T>;
    try {
      data = await response.json() as Envelope<T>;
    } catch {
      throw new AccountAuthError('服务器返回的数据无法读取。', 'invalid_response', response.status);
    }
    return { status: response.status, data };
  } catch (error) {
    if (error instanceof AccountAuthError) throw error;
    throw new AccountAuthError(
      controller.signal.aborted ? '请求超时，请重试。' : '网络暂时不可用，请重试。',
      controller.signal.aborted ? 'timeout' : 'network_error',
      0,
    );
  } finally {
    clearTimeout(timeout);
  }
}

function readError<T>(status: number, envelope: Envelope<T>): never {
  const error = envelope.error;
  throw new AccountAuthError(
    typeof error?.message === 'string' ? error.message : '请求未完成，请重试。',
    typeof error?.code === 'string' ? error.code : 'request_failed',
    status,
  );
}

async function persistSession(value: AccountSession | undefined) {
  if (Platform.OS !== 'web') {
    if (value) {
      await SecureStore.setItemAsync(sessionKey(), JSON.stringify(value), {
        keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
      });
    } else {
      await SecureStore.deleteItemAsync(sessionKey());
    }
  }
  session = value;
  notifySession();
}

export async function clearAccountSession() {
  loadingSession = undefined;
  await persistSession(undefined);
}

export function getCachedAccountSession() {
  return session;
}

export function isCurrentAccountSessionToken(token: string) {
  return session?.accessToken === token;
}

export async function clearAccountSessionIfToken(token: string) {
  if (session?.accessToken === token) await clearAccountSession();
}

export async function getAccountUserId() {
  const active = session ?? await restoreAccountSession();
  if (!active) throw new AccountAuthError('请先登录。', 'account_session_required', 401);
  return active.user.id;
}

export async function restoreAccountSession() {
  if (loadingSession) return loadingSession;
  loadingSession = (async () => {
    if (Platform.OS === 'web') {
      session = undefined;
      notifySession();
      return undefined;
    }
    let stored: unknown;
    try {
      const serialized = await SecureStore.getItemAsync(sessionKey());
      stored = serialized ? JSON.parse(serialized) as unknown : undefined;
    } catch {
      await persistSession(undefined);
      return undefined;
    }
    if (!validSession(stored)) {
      await persistSession(undefined);
      return undefined;
    }

    session = stored;
    notifySession();
    try {
      const response = await request<{ id: string; username: string }>('/auth/me', 'GET', undefined, stored.accessToken);
      if (response.status >= 500) return stored;
      if (response.status === 401 || response.status === 403 || response.data.ok !== true
        || response.data.data?.id !== stored.user.id) {
        await persistSession(undefined);
        return undefined;
      }
      return stored;
    } catch (error) {
      if (error instanceof AccountAuthError && (error.status === 0 || error.status >= 500)) return stored;
      await persistSession(undefined);
      return undefined;
    }
  })().finally(() => {
    loadingSession = undefined;
  });
  return loadingSession;
}

export async function getAccountAuthHeaders() {
  const active = session ?? await restoreAccountSession();
  if (!active) throw new AccountAuthError('请先登录。', 'account_session_required', 401);
  return { Authorization: `Bearer ${active.accessToken}` };
}

export async function requestCaptcha(purpose: 'register' | 'login'): Promise<CaptchaChallenge> {
  const response = await request<CaptchaChallenge>('/auth/captcha', 'POST', { purpose });
  if (response.status < 200 || response.status >= 300 || response.data.ok !== true
    || !response.data.data || typeof response.data.data.challengeId !== 'string'
    || typeof response.data.data.background !== 'string' || typeof response.data.data.piece !== 'string'
    || !Number.isFinite(response.data.data.width) || response.data.data.width <= 0
    || !Number.isFinite(response.data.data.height) || response.data.data.height <= 0
    || !Number.isFinite(response.data.data.pieceSize) || response.data.data.pieceSize <= 0
    || response.data.data.pieceSize > response.data.data.width
    || !Number.isFinite(response.data.data.pieceTop) || response.data.data.pieceTop < 0
    || response.data.data.pieceTop + response.data.data.pieceSize > response.data.data.height) {
    readError(response.status, response.data);
  }
  return response.data.data!;
}

function readEmailCodeChallenge<T extends EmailCodeChallenge>(
  status: number,
  envelope: Envelope<T>,
): T {
  const data = envelope.data;
  if (status >= 200 && status < 300 && envelope.ok === true
    && data && typeof data.challengeId === 'string'
    && typeof data.expiresAt === 'string' && Number.isFinite(Date.parse(data.expiresAt))) {
    return data;
  }
  readError(status, envelope);
}

export async function requestRegistrationEmailCode(
  email: string,
  captchaChallengeId: string,
  captchaX: number,
): Promise<EmailCodeChallenge> {
  const response = await request<EmailCodeChallenge>('/auth/register/email-code', 'POST', {
    email,
    captcha: { challengeId: captchaChallengeId, x: captchaX },
  }, undefined, 60_000);
  return readEmailCodeChallenge(response.status, response.data);
}

export async function requestAccountDeletionEmailCode(password: string): Promise<EmailCodeChallenge> {
  const active = session ?? await restoreAccountSession();
  if (!active) throw new AccountAuthError('请先登录。', 'account_session_required', 401);
  const response = await request<EmailCodeChallenge>(
    '/auth/account/deletion-code',
    'POST',
    { password },
    active.accessToken,
    60_000,
  );
  const challenge = readEmailCodeChallenge(response.status, response.data);
  if (typeof challenge.maskedEmail !== 'string') {
    throw new AccountAuthError('服务器返回的数据无法读取。', 'invalid_response', response.status);
  }
  return challenge;
}

async function submitCredentials(
  path: '/auth/login',
  username: string,
  password: string,
  challengeId: string,
  x: number,
) {
  const response = await request<AccountSession['user'] & { accessToken: string; tokenType: string; expiresAt: string }>(
    path,
    'POST',
    { username, password, captcha: { challengeId, x } },
  );
  const payload = response.data.data as unknown as {
    accessToken?: unknown;
    expiresAt?: unknown;
    user?: unknown;
  } | undefined;
  const received: AccountSession = {
    accessToken: typeof payload?.accessToken === 'string' ? payload.accessToken : '',
    expiresAt: typeof payload?.expiresAt === 'string' ? payload.expiresAt : '',
    user: payload?.user as AccountSession['user'],
  };
  if (response.status < 200 || response.status >= 300 || response.data.ok !== true || !validSession(received)) {
    readError(response.status, response.data);
  }
  await persistSession(received);
  return received;
}

export async function registerAccount(
  username: string,
  email: string,
  password: string,
  emailChallengeId: string,
  emailCode: string,
) {
  const response = await request<AccountSession['user'] & {
    accessToken: string;
    tokenType: string;
    expiresAt: string;
  }>('/auth/register', 'POST', {
    username,
    email,
    password,
    emailChallengeId,
    emailCode,
  });
  const payload = response.data.data as unknown as {
    accessToken?: unknown;
    expiresAt?: unknown;
    user?: unknown;
  } | undefined;
  const received: AccountSession = {
    accessToken: typeof payload?.accessToken === 'string' ? payload.accessToken : '',
    expiresAt: typeof payload?.expiresAt === 'string' ? payload.expiresAt : '',
    user: payload?.user as AccountSession['user'],
  };
  if (response.status < 200 || response.status >= 300 || response.data.ok !== true || !validSession(received)) {
    readError(response.status, response.data);
  }
  await persistSession(received);
  return received;
}

export function loginAccount(username: string, password: string, challengeId: string, x: number) {
  return submitCredentials('/auth/login', username, password, challengeId, x);
}

export async function logoutAccount() {
  const active = session ?? await restoreAccountSession();
  let revokeFailed = false;
  if (active) {
    try {
      const response = await request('/auth/logout', 'POST', {}, active.accessToken);
      revokeFailed = response.status < 200 || response.status >= 300;
    } catch {
      revokeFailed = true;
    }
  }
  try {
    await clearTransientAccountMediaCache();
  } finally {
    await clearAccountSession();
  }
  return { serverRevoked: !revokeFailed };
}

export async function deleteAccount(
  password: string,
  emailChallengeId: string,
  emailCode: string,
): Promise<{ cleanupPending: boolean }> {
  const active = session ?? await restoreAccountSession();
  if (!active) throw new AccountAuthError('请先登录。', 'account_session_required', 401);
  let cleanupPending = false;
  try {
    const response = await request('/auth/account', 'DELETE', {
      password,
      emailChallengeId,
      emailCode,
    }, active.accessToken);
    if (response.status < 200 || response.status >= 300 || response.data.ok !== true) {
      readError(response.status, response.data);
    }
  } catch (error) {
    if (!(error instanceof AccountAuthError) || error.code !== 'account_cleanup_pending') throw error;
    cleanupPending = true;
  }
  try {
    await clearAccountPrivateData(active.user.id);
  } finally {
    await clearAccountSession();
  }
  return { cleanupPending };
}
