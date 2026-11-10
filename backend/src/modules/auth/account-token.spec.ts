import { UnauthorizedException } from '@nestjs/common';
import { signAccountToken, verifyAccountToken } from './account-token';

describe('account access token', () => {
  const previousSecret = process.env.ACCOUNT_AUTH_JWT_SECRET;

  beforeAll(() => {
    process.env.ACCOUNT_AUTH_JWT_SECRET = 'test-secret-with-at-least-32-characters';
  });

  afterAll(() => {
    if (previousSecret === undefined) delete process.env.ACCOUNT_AUTH_JWT_SECRET;
    else process.env.ACCOUNT_AUTH_JWT_SECRET = previousSecret;
  });

  test('signs and verifies an account and single-session identity', () => {
    const token = signAccountToken({ sub: 'user-1', sid: 'session-1', iat: 100, exp: 200 });
    expect(verifyAccountToken(token, 150)).toEqual({
      sub: 'user-1',
      sid: 'session-1',
      iat: 100,
      exp: 200,
    });
  });

  test.each([
    ['tampered payload', (token: string) => `${token.slice(0, -1)}x`],
    ['expired payload', (token: string) => token],
  ])('rejects %s tokens', (name, transform) => {
    const token = signAccountToken({ sub: 'user-1', sid: 'session-1', iat: 100, exp: 200 });
    const candidate = name === 'expired payload'
      ? signAccountToken({ sub: 'user-1', sid: 'session-1', iat: 100, exp: 120 })
      : transform(token);
    expect(() => verifyAccountToken(candidate, 150)).toThrow(UnauthorizedException);
  });
});
