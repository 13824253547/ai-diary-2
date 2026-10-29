import { createPrivateKey, createPublicKey, sign, verify } from 'node:crypto';
import type { DeviceAccessClaims } from './identity-token';

export const INSTALLATION_TOKEN_TTL_SECONDS = 3600;
const ISSUER = 'orange-glow-ai-diary';
const AUDIENCE = 'orange-glow-ai-diary-api';

function signingKey() {
  const encoded = process.env.INSTALLATION_AUTH_PRIVATE_KEY;
  if (!encoded) throw new Error('INSTALLATION_AUTH_PRIVATE_KEY is required');
  const key = createPrivateKey({ key: Buffer.from(encoded, 'base64'), format: 'der', type: 'pkcs8' });
  if (key.asymmetricKeyType !== 'ed25519') throw new Error('Installation signing key must be Ed25519');
  return key;
}

function encode(value: unknown) {
  return Buffer.from(JSON.stringify(value)).toString('base64url');
}

export function signInstallationToken(deviceId: string, keyId: string, ver: number, now = Date.now()) {
  const iat = Math.floor(now / 1000);
  const body = `${encode({ alg: 'EdDSA', typ: 'JWT' })}.${encode({
    sub: deviceId, keyId, ver, iat, exp: iat + INSTALLATION_TOKEN_TTL_SECONDS,
    iss: ISSUER, aud: AUDIENCE, amr: 'installation-key',
  })}`;
  return `${body}.${sign(null, Buffer.from(body), signingKey()).toString('base64url')}`;
}

export function verifyInstallationToken(token: string, now = Date.now()): DeviceAccessClaims | undefined {
  try {
    const parts = token.split('.');
    if (parts.length !== 3) return undefined;
    const [header, payload, signature] = parts;
    if (!verify(null, Buffer.from(`${header}.${payload}`), createPublicKey(signingKey()), Buffer.from(signature, 'base64url'))) {
      return undefined;
    }
    const h = JSON.parse(Buffer.from(header, 'base64url').toString());
    const c = JSON.parse(Buffer.from(payload, 'base64url').toString());
    const time = Math.floor(now / 1000);
    if (
      h?.alg !== 'EdDSA' || h?.typ !== 'JWT' || c?.amr !== 'installation-key'
      || c.iss !== ISSUER || c.aud !== AUDIENCE
      || typeof c.sub !== 'string' || !/^device-[a-f0-9-]{36}$/.test(c.sub)
      || typeof c.keyId !== 'string' || !/^install-[a-f0-9]{64}$/.test(c.keyId)
      || !Number.isSafeInteger(c.ver) || c.ver < 1
      || !Number.isSafeInteger(c.iat) || !Number.isSafeInteger(c.exp)
      || c.iat > time + 60 || c.exp <= time || c.exp <= c.iat
      || c.exp - c.iat > INSTALLATION_TOKEN_TTL_SECONDS
    ) return undefined;
    return c;
  } catch {
    return undefined;
  }
}
