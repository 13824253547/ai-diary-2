import { createHmac, timingSafeEqual } from 'node:crypto';

const TOKEN_ISSUER = 'orange-glow-ai-diary';
const TOKEN_AUDIENCE = 'orange-glow-ai-diary-api';
export const DEVICE_ACCESS_TOKEN_TTL_SECONDS = 60 * 60 * 24 * 30;

export type DeviceAccessClaims = {
  sub: string;
  keyId: string;
  ver: number;
  iat: number;
  exp: number;
  iss: typeof TOKEN_ISSUER;
  aud: typeof TOKEN_AUDIENCE;
};

function getSigningSecret() {
  const secret = process.env.DEVICE_AUTH_JWT_SECRET;
  if (!secret || Buffer.byteLength(secret) < 32) {
    throw new Error('DEVICE_AUTH_JWT_SECRET must contain at least 32 bytes');
  }
  return secret;
}

function encode(value: unknown) {
  return Buffer.from(JSON.stringify(value)).toString('base64url');
}

export function signDeviceAccessToken(deviceId: string, keyId: string, tokenVersion: number, now = Date.now()) {
  const issuedAt = Math.floor(now / 1000);
  const header = encode({ alg: 'HS256', typ: 'JWT' });
  const payload = encode({
    sub: deviceId,
    keyId,
    ver: tokenVersion,
    iat: issuedAt,
    exp: issuedAt + DEVICE_ACCESS_TOKEN_TTL_SECONDS,
    iss: TOKEN_ISSUER,
    aud: TOKEN_AUDIENCE,
  });
  const signingInput = `${header}.${payload}`;
  const signature = createHmac('sha256', getSigningSecret()).update(signingInput).digest('base64url');
  return `${signingInput}.${signature}`;
}

export function verifyDeviceAccessToken(token: string, allowExpired = false, now = Date.now()): DeviceAccessClaims | undefined {
  try {
    const parts = token.split('.');
    if (parts.length !== 3) return undefined;
    const [encodedHeader, encodedPayload, suppliedSignature] = parts;
    const signingInput = `${encodedHeader}.${encodedPayload}`;
    const expectedSignature = createHmac('sha256', getSigningSecret()).update(signingInput).digest();
    const actualSignature = Buffer.from(suppliedSignature, 'base64url');
    if (actualSignature.length !== expectedSignature.length || !timingSafeEqual(actualSignature, expectedSignature)) {
      return undefined;
    }

    const header = JSON.parse(Buffer.from(encodedHeader, 'base64url').toString('utf8')) as { alg?: unknown; typ?: unknown };
    const claims = JSON.parse(Buffer.from(encodedPayload, 'base64url').toString('utf8')) as Partial<DeviceAccessClaims>;
    const currentTime = Math.floor(now / 1000);
    if (
      header.alg !== 'HS256'
      || header.typ !== 'JWT'
      || typeof claims.sub !== 'string'
      || !claims.sub
      || typeof claims.keyId !== 'string'
      || !claims.keyId
      || !Number.isSafeInteger(claims.ver)
      || !Number.isSafeInteger(claims.iat)
      || !Number.isSafeInteger(claims.exp)
      || claims.iss !== TOKEN_ISSUER
      || claims.aud !== TOKEN_AUDIENCE
      || (allowExpired ? (claims.exp as number) <= currentTime - DEVICE_ACCESS_TOKEN_TTL_SECONDS : (claims.exp as number) <= currentTime)
      || (claims.iat as number) > currentTime + 60
    ) {
      return undefined;
    }
    return claims as DeviceAccessClaims;
  } catch {
    return undefined;
  }
}
