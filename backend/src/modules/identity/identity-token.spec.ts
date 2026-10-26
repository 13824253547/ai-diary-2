import { signDeviceAccessToken, verifyDeviceAccessToken } from './identity-token';

describe('device access tokens', () => {
  const previousSecret = process.env.DEVICE_AUTH_JWT_SECRET;

  beforeEach(() => {
    process.env.DEVICE_AUTH_JWT_SECRET = 'test-secret-that-is-long-enough-for-hmac';
  });

  afterAll(() => {
    if (previousSecret === undefined) delete process.env.DEVICE_AUTH_JWT_SECRET;
    else process.env.DEVICE_AUTH_JWT_SECRET = previousSecret;
  });

  it('signs a scoped token that expires after its configured lifetime', () => {
    const now = Date.UTC(2026, 9, 21);
    const token = signDeviceAccessToken('device-server-id', 'attested-key-id', 3, now);

    expect(verifyDeviceAccessToken(token, false, now)).toMatchObject({
      sub: 'device-server-id',
      keyId: 'attested-key-id',
      ver: 3,
    });
    expect(verifyDeviceAccessToken(token, false, now + 31 * 24 * 60 * 60 * 1000)).toBeUndefined();
    expect(verifyDeviceAccessToken(token, true, now + 31 * 24 * 60 * 60 * 1000)).toBeDefined();
  });

  it('rejects a token with a modified payload or an invalid signing secret', () => {
    const token = signDeviceAccessToken('device-server-id', 'attested-key-id', 1);
    const [header, payload, signature] = token.split('.');
    const modified = `${header}.${Buffer.from(JSON.stringify({ sub: 'device-other' })).toString('base64url')}.${signature}`;
    expect(verifyDeviceAccessToken(modified)).toBeUndefined();

    process.env.DEVICE_AUTH_JWT_SECRET = 'short';
    expect(() => signDeviceAccessToken('device-server-id', 'attested-key-id', 1)).toThrow(
      'DEVICE_AUTH_JWT_SECRET must contain at least 32 bytes',
    );
  });
});
