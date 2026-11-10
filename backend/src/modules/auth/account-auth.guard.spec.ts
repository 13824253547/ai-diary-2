import { UnauthorizedException } from '@nestjs/common';
import { AccountAuthGuard } from './account-auth.guard';
import { signAccountToken } from './account-token';

describe('AccountAuthGuard', () => {
  const previousSecret = process.env.ACCOUNT_AUTH_JWT_SECRET;
  const reflector = { getAllAndOverride: jest.fn().mockReturnValue(false) };
  const prisma = {
    accountSession: { findUnique: jest.fn() },
  };

  beforeAll(() => {
    process.env.ACCOUNT_AUTH_JWT_SECRET = 'guard-test-secret-with-at-least-32-bytes';
  });

  afterAll(() => {
    if (previousSecret === undefined) delete process.env.ACCOUNT_AUTH_JWT_SECRET;
    else process.env.ACCOUNT_AUTH_JWT_SECRET = previousSecret;
  });

  beforeEach(() => jest.clearAllMocks());

  function context(headers: Record<string, string | string[] | undefined>, path = '/api/diaries') {
    const request: { headers: typeof headers; auth?: unknown } = { headers };
    return {
      request,
      execution: {
        getHandler: () => ({}),
        getClass: () => ({}),
        switchToHttp: () => ({ getRequest: () => request }),
      } as never,
    };
  }

  test('rejects missing and malformed bearer credentials', async () => {
    const guard = new AccountAuthGuard(reflector as never, prisma as never);
    const { execution: missing } = context({});
    await expect(guard.canActivate(missing)).rejects.toBeInstanceOf(UnauthorizedException);
    const { execution: malformed } = context({ authorization: 'Bearer broken.token.value' });
    await expect(guard.canActivate(malformed)).rejects.toBeInstanceOf(UnauthorizedException);
    expect(prisma.accountSession.findUnique).not.toHaveBeenCalled();
  });

  test('injects the verified account principal and never reads a client user ID header', async () => {
    prisma.accountSession.findUnique.mockResolvedValue({
      userId: 'user-1',
      expiresAt: new Date(Date.now() + 60_000),
      revokedAt: null,
    });
    const token = signAccountToken({
      sub: 'user-1',
      sid: 'session-1',
      iat: Math.floor(Date.now() / 1000),
      exp: Math.floor(Date.now() / 1000) + 60,
    });
    const { execution, request } = context({
      authorization: `Bearer ${token}`,
      'x-user-id': 'attacker',
      'x-device-id': 'obsolete-owner',
    });
    const guard = new AccountAuthGuard(reflector as never, prisma as never);

    await expect(guard.canActivate(execution)).resolves.toBe(true);
    expect(request.auth).toEqual({ userId: 'user-1', sessionId: 'session-1' });
    expect(prisma.accountSession.findUnique).toHaveBeenCalledWith({
      where: { id: 'session-1' },
      select: { userId: true, expiresAt: true, revokedAt: true },
    });
  });

  test('rejects revoked or mismatched database sessions', async () => {
    prisma.accountSession.findUnique.mockResolvedValue({
      userId: 'another-user',
      expiresAt: new Date(Date.now() + 60_000),
      revokedAt: null,
    });
    const token = signAccountToken({
      sub: 'user-1',
      sid: 'session-1',
      iat: Math.floor(Date.now() / 1000),
      exp: Math.floor(Date.now() / 1000) + 60,
    });
    const { execution } = context({ authorization: `Bearer ${token}` });
    const guard = new AccountAuthGuard(reflector as never, prisma as never);
    await expect(guard.canActivate(execution)).rejects.toBeInstanceOf(UnauthorizedException);
  });

  test('allows explicitly public routes without a bearer token', async () => {
    reflector.getAllAndOverride.mockReturnValueOnce(true);
    const { execution } = context({});
    const guard = new AccountAuthGuard(reflector as never, prisma as never);
    await expect(guard.canActivate(execution)).resolves.toBe(true);
    expect(prisma.accountSession.findUnique).not.toHaveBeenCalled();
  });
});
