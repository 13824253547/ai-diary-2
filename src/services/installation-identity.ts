import { ed25519 } from '@noble/curves/ed25519';
import { sha256 } from '@noble/hashes/sha256';
import { bytesToHex, hexToBytes, utf8ToBytes } from '@noble/hashes/utils';
import { appConfig } from '../config/app-config';

export type InstallationIdentity = {
  deviceId: string;
  accessToken: string;
  expiresAt: string;
};
type StoredInstallation = { seed: string; identity?: InstallationIdentity };
type Dependencies = {
  read(key: string): Promise<string | null>;
  write(key: string, value: string): Promise<void>;
  randomBytes(): Promise<Uint8Array>;
  request<T>(path: string, body: unknown): Promise<T>;
  now?: () => number;
  wait?: (ms: number) => Promise<void>;
};
const REFRESH_WINDOW_MS = 5 * 60 * 1000;

function validIdentity(value: unknown, now: number): value is InstallationIdentity {
  if (!value || typeof value !== 'object') return false;
  const identity = value as Partial<InstallationIdentity>;
  return typeof identity.deviceId === 'string' && /^device-[a-f0-9-]{36}$/.test(identity.deviceId)
    && typeof identity.accessToken === 'string' && identity.accessToken.length >= 100 && identity.accessToken.length <= 4096
    && typeof identity.expiresAt === 'string' && Number.isFinite(Date.parse(identity.expiresAt))
    && Date.parse(identity.expiresAt) > now && Date.parse(identity.expiresAt) <= now + 65 * 60 * 1000;
}

export function createInstallationIdentity(dependencies: Dependencies, baseUrl = appConfig.backendBaseUrl) {
  const storageKey = `orange-glow-installation-v1-${bytesToHex(sha256(utf8ToBytes(baseUrl)))}`;
  let stored: StoredInstallation | undefined;
  let pending: Promise<InstallationIdentity> | undefined;
  const now = dependencies.now ?? Date.now;

  async function authenticate(): Promise<InstallationIdentity> {
    if (!stored) {
      const raw = await dependencies.read(storageKey);
      if (raw) {
        const parsed = JSON.parse(raw) as StoredInstallation;
        if (!parsed || typeof parsed.seed !== 'string' || !/^[a-f0-9]{64}$/.test(parsed.seed)) {
          throw new Error('设备凭证无法读取，请重试。');
        }
        stored = parsed;
      } else {
        const random = await dependencies.randomBytes();
        if (random.length !== 32) throw new Error('无法创建安全的设备凭证。');
        const created = { seed: bytesToHex(random) };
        // Persist before enrollment so a lost response cannot orphan the installation.
        await dependencies.write(storageKey, JSON.stringify(created));
        stored = created;
      }
    }
    if (stored.identity && validIdentity(stored.identity, now())
      && Date.parse(stored.identity.expiresAt) > now() + REFRESH_WINDOW_MS) return stored.identity;

    const seed = hexToBytes(stored.seed);
    const publicKey = bytesToHex(ed25519.getPublicKey(seed));
    const keyId = `install-${bytesToHex(sha256(hexToBytes(publicKey)))}`;
    const challenge = await dependencies.request<{ challengeId: string; keyId: string; payload: string }>(
      '/identity/installation/challenge', { publicKey },
    );
    if (
      !challenge || typeof challenge.challengeId !== 'string' || !/^[a-f0-9-]{36}$/.test(challenge.challengeId)
      || challenge.keyId !== keyId || typeof challenge.payload !== 'string' || challenge.payload.length > 1024
    ) throw new Error('身份服务返回无效挑战，请重试。');
    const payload = JSON.parse(challenge.payload);
    if (
      payload?.protocol !== 'installation-ed25519-v1' || payload.action !== 'authenticate-installation'
      || payload.keyId !== keyId || payload.challengeId !== challenge.challengeId
      || typeof payload.challenge !== 'string' || !/^[A-Za-z0-9_-]{43}$/.test(payload.challenge)
    ) throw new Error('身份服务返回无效挑战，请重试。');
    const identity = await dependencies.request<InstallationIdentity>('/identity/installation/exchange', {
      challengeId: challenge.challengeId, publicKey,
      signature: bytesToHex(ed25519.sign(utf8ToBytes(challenge.payload), seed)),
    });
    if (!validIdentity(identity, now()) || (stored.identity && identity.deviceId !== stored.identity.deviceId)) {
      throw new Error('设备身份不一致，请重试。');
    }
    const updated = { seed: stored.seed, identity };
    await dependencies.write(storageKey, JSON.stringify(updated));
    stored = updated;
    return identity;
  }

  return {
    ensure(): Promise<InstallationIdentity> {
      if (pending) return pending;
      pending = (async () => {
        for (let attempt = 0; ; attempt++) {
          try {
            return await authenticate();
          } catch (error) {
            const failure = error as { status?: number; code?: string };
            const retryable = error instanceof TypeError || failure?.code === 'identity_timeout'
              || (typeof failure?.status === 'number' && failure.status >= 500);
            if (!retryable || attempt >= 3) throw error;
            await (dependencies.wait ?? (ms => new Promise(resolve => setTimeout(resolve, ms))))(3000);
          }
        }
      })().finally(() => { pending = undefined; });
      return pending;
    },
  };
}

export function nativeInstallationDependencies(request: Dependencies['request']): Dependencies {
  const store = require('expo-secure-store') as typeof import('expo-secure-store');
  return {
    read: key => store.getItemAsync(key),
    write: (key, value) => store.setItemAsync(key, value, {
      keychainAccessible: store.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
    }),
    randomBytes: () => (require('expo-crypto') as typeof import('expo-crypto')).getRandomBytesAsync(32),
    request,
  };
}
