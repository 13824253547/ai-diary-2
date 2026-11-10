import { createHmac, timingSafeEqual } from 'node:crypto';
import { UnauthorizedException, ServiceUnavailableException } from '@nestjs/common';

export type AccountClaims = {
  sub: string;
  sid: string;
  iat: number;
  exp: number;
};

function secret() {
  const value = process.env.ACCOUNT_AUTH_JWT_SECRET;
  if (!value || Buffer.byteLength(value) < 32) {
    throw new ServiceUnavailableException({
      ok: false,
      error: { code: 'auth_unavailable', message: '账号服务暂不可用。', retryable: false },
    });
  }
  return value;
}

function signature(input: string) {
  return createHmac('sha256', secret()).update(input).digest('base64url');
}

export function signAccountToken(claims: AccountClaims) {
  const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url');
  const payload = Buffer.from(JSON.stringify(claims)).toString('base64url');
  const unsigned = `${header}.${payload}`;
  return `${unsigned}.${signature(unsigned)}`;
}

export function verifyAccountToken(token: string, now = Math.floor(Date.now() / 1000)): AccountClaims {
  const parts = token.split('.');
  if (parts.length !== 3 || parts.some(part => part.length === 0)) throw invalidToken();
  let header: unknown;
  let claims: unknown;
  try {
    header = JSON.parse(Buffer.from(parts[0], 'base64url').toString('utf8'));
    claims = JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8'));
  } catch {
    throw invalidToken();
  }
  if (
    typeof header !== 'object' || header === null || (header as Record<string, unknown>).alg !== 'HS256'
    || typeof claims !== 'object' || claims === null
  ) throw invalidToken();
  const value = claims as Partial<AccountClaims>;
  if (
    typeof value.sub !== 'string' || value.sub.length < 1 || value.sub.length > 191
    || typeof value.sid !== 'string' || value.sid.length < 1 || value.sid.length > 64
    || !Number.isSafeInteger(value.iat) || !Number.isSafeInteger(value.exp)
    || value.iat! > now + 60 || value.exp! <= now || value.exp! - value.iat! > 31 * 24 * 60 * 60
  ) throw invalidToken();

  const expected = Buffer.from(signature(`${parts[0]}.${parts[1]}`));
  const actual = Buffer.from(parts[2]);
  if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) throw invalidToken();
  return value as AccountClaims;
}

function invalidToken() {
  return new UnauthorizedException({
    ok: false,
    error: { code: 'account_session_invalid', message: '登录状态已失效，请重新登录。', retryable: false },
  });
}
