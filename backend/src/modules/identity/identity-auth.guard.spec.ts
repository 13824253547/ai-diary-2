import { UnauthorizedException } from '@nestjs/common';
import { IdentityAuthGuard } from './identity-auth.guard';
const TEST_TOKEN = `${Buffer.from(JSON.stringify({ alg: 'HS256' })).toString('base64url')}.payload.signature`;

function createContext(request: {
  method: string;
  path: string;
  headers: Record<string, string | string[] | undefined>;
}) {
  return {
    switchToHttp: () => ({ getRequest: () => request }),
  } as never;
}

describe('IdentityAuthGuard', () => {
  const previousNodeEnv = process.env.NODE_ENV;
  const previousMode = process.env.DEVICE_IDENTITY_MODE;
  const identityAuth = {
    isAttestedMode: jest.fn(),
    authenticateAccessToken: jest.fn(),
  };
  const installationAuth = {
    enabled: jest.fn().mockReturnValue(false),
    authenticate: jest.fn(),
    limitBusiness: jest.fn(),
  };
  const guard = new IdentityAuthGuard(identityAuth as never, installationAuth as never);

  beforeEach(() => {
    process.env.NODE_ENV = 'development';
    process.env.DEVICE_IDENTITY_MODE = 'attested';
    identityAuth.isAttestedMode.mockReturnValue(true);
    identityAuth.authenticateAccessToken.mockResolvedValue({ sub: 'device-server-id' });
    identityAuth.authenticateAccessToken.mockClear();
    installationAuth.enabled.mockReturnValue(false);
    installationAuth.limitBusiness.mockClear();
  });

  afterAll(() => {
    if (previousNodeEnv === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = previousNodeEnv;
    if (previousMode === undefined) delete process.env.DEVICE_IDENTITY_MODE;
    else process.env.DEVICE_IDENTITY_MODE = previousMode;
  });

  it('requires a signed server token and matching device ownership header', async () => {
    await expect(guard.canActivate(createContext({
      method: 'GET',
      path: '/api/diaries',
      headers: { 'x-device-id': 'device-server-id' },
    }))).rejects.toBeInstanceOf(UnauthorizedException);

    await expect(guard.canActivate(createContext({
      method: 'GET',
      path: '/api/diaries',
      headers: {
        authorization: `Bearer ${TEST_TOKEN}`,
        'x-device-id': 'device-client-substitution',
      },
    }))).rejects.toBeInstanceOf(UnauthorizedException);

    await expect(guard.canActivate(createContext({
      method: 'GET',
      path: '/api/diaries',
      headers: {
        authorization: `Bearer ${TEST_TOKEN}`,
        'x-device-id': 'device-server-id',
      },
    }))).resolves.toBe(true);
    expect(identityAuth.authenticateAccessToken).toHaveBeenCalledWith(TEST_TOKEN);
  });

  it('keeps registration endpoints reachable before a server-issued identity exists', async () => {
    await expect(guard.canActivate(createContext({
      method: 'POST',
      path: '/api/identity/attestation/challenge',
      headers: {},
    }))).resolves.toBe(true);
    expect(identityAuth.authenticateAccessToken).not.toHaveBeenCalled();
  });

  it('never allows production to downgrade to the legacy identity mode', async () => {
    process.env.NODE_ENV = 'production';
    process.env.DEVICE_IDENTITY_MODE = 'legacy';
    identityAuth.isAttestedMode.mockImplementation(() => process.env.NODE_ENV === 'production');

    await expect(guard.canActivate(createContext({
      method: 'GET',
      path: '/api/diaries',
      headers: { 'x-device-id': 'device-server-id' },
    }))).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('validates installation tokens and limits authenticated requests before business code', async () => {
    installationAuth.enabled.mockReturnValue(true);
    installationAuth.authenticate.mockResolvedValue({ sub: 'device-server-id' });
    await expect(guard.canActivate(createContext({
      method: 'GET', path: '/api/diaries',
      headers: {
        authorization: `Bearer ${Buffer.from(JSON.stringify({ alg: 'EdDSA' })).toString('base64url')}.payload.signature`,
        'x-device-id': 'device-server-id',
      },
    }))).resolves.toBe(true);
    expect(installationAuth.authenticate).toHaveBeenCalled();
    expect(installationAuth.limitBusiness).toHaveBeenCalledWith('device-server-id', 'unknown', 'GET', '/api/diaries');
    expect(identityAuth.authenticateAccessToken).not.toHaveBeenCalled();
  });

  it.each(['/api/identity/installation/challenge', '/api/identity/installation/exchange'])(
    'allows only the enrollment POST route %s without a token', async path => {
      installationAuth.enabled.mockReturnValue(true);
      await expect(guard.canActivate(createContext({ method: 'POST', path, headers: {} }))).resolves.toBe(true);
      await expect(guard.canActivate(createContext({ method: 'GET', path, headers: {} }))).rejects.toBeInstanceOf(UnauthorizedException);
    },
  );
});
