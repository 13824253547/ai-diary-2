import { generateKeyPairSync, sign } from 'node:crypto';
import { InstallationAuthService, INSTALLATION_ENVIRONMENT } from './installation-auth.service';
import { verifyInstallationToken, signInstallationToken } from './installation-token';

describe('installation authentication', () => {
  const oldEnv = { ...process.env };
  let service: InstallationAuthService;
  let prisma: any;
  let keys: ReturnType<typeof generateKeyPairSync>;
  let publicKey: string;
  let challenges: Map<string, any>;
  let devices: Map<string, any>;
  let buckets: Map<string, any>;

  beforeEach(() => {
    process.env.DEVICE_IDENTITY_MODE = 'installation';
    process.env.DEVICE_AUTH_JWT_SECRET = 'installation-test-rate-limit-secret-32-bytes';
    process.env.INSTALLATION_AUTH_PRIVATE_KEY = generateKeyPairSync('ed25519').privateKey
      .export({ format: 'der', type: 'pkcs8' }).toString('base64');
    keys = generateKeyPairSync('ed25519');
    publicKey = keys.publicKey.export({ format: 'der', type: 'spki' }).subarray(-32).toString('hex');
    challenges = new Map();
    devices = new Map();
    buckets = new Map();
    prisma = {
      appAttestChallenge: {
        deleteMany: jest.fn(),
        create: jest.fn(({ data }) => challenges.set(data.id, { ...data })),
        findUnique: jest.fn(({ where }) => challenges.get(where.id)),
        updateMany: jest.fn(({ where, data }) => {
          const c = challenges.get(where.id);
          if (!c || c.consumedAt || c.expiresAt <= new Date()) return { count: 0 };
          Object.assign(c, data);
          return { count: 1 };
        }),
      },
      appAttestDevice: {
        findUnique: jest.fn(({ where }) => where.keyId ? devices.get(where.keyId)
          : [...devices.values()].find(d => d.deviceId === where.deviceId)),
        upsert: jest.fn(({ where, create }) => {
          if (!devices.has(where.keyId)) devices.set(where.keyId, { ...create, revokedAt: null });
          return devices.get(where.keyId);
        }),
      },
      appAttestRateLimit: {
        deleteMany: jest.fn(),
        update: jest.fn(({ where }) => {
          const bucket = buckets.get(where.id);
          bucket.count++;
          return bucket;
        }),
        upsert: jest.fn(({ where, create }) => {
          const bucket = buckets.get(where.id) ?? { ...create, count: 0 };
          bucket.count++;
          buckets.set(where.id, bucket);
          return bucket;
        }),
      },
    };
    service = new InstallationAuthService(prisma);
  });

  afterAll(() => { process.env = oldEnv; });

  async function proof() {
    const c = await service.createChallenge({ publicKey }, '192.0.2.1');
    return { publicKey, challengeId: c.challengeId, signature: sign(null, Buffer.from(c.payload), keys.privateKey).toString('hex') };
  }

  it('enrolls and renews the same identity, with one-hour asymmetric tokens', async () => {
    const first = await service.exchange(await proof());
    const second = await service.exchange(await proof());
    expect(first.deviceId).toBe(second.deviceId);
    expect(devices.size).toBe(1);
    const claims = verifyInstallationToken(first.accessToken)!;
    expect(claims.exp - claims.iat).toBe(3600);
    expect(await service.authenticate(first.accessToken)).toMatchObject({ sub: first.deviceId });
    expect(verifyInstallationToken(first.accessToken, Date.now() + 3_601_000)).toBeUndefined();
    const parts = first.accessToken.split('.');
    expect(verifyInstallationToken(`${parts[0]}.${Buffer.from('{"sub":"other"}').toString('base64url')}.${parts[2]}`)).toBeUndefined();
  });

  it('rejects replay, concurrent use, bad signatures, expiry and key substitution', async () => {
    const request = await proof();
    const results = await Promise.allSettled([service.exchange(request), service.exchange(request)]);
    expect(results.filter(r => r.status === 'fulfilled')).toHaveLength(1);
    await expect(service.exchange(request)).rejects.toMatchObject({ status: 401 });
    await expect(service.exchange({ ...await proof(), signature: '0'.repeat(128) })).rejects.toMatchObject({ status: 401 });
    const expired = await proof();
    challenges.get(expired.challengeId).expiresAt = new Date(0);
    await expect(service.exchange(expired)).rejects.toMatchObject({ status: 401 });
    const otherKey = generateKeyPairSync('ed25519').publicKey.export({ format: 'der', type: 'spki' }).subarray(-32).toString('hex');
    await expect(service.exchange({ ...await proof(), publicKey: otherKey })).rejects.toMatchObject({ status: 401 });
  });

  it('rejects revoked identities, wrong versions and another authentication method', async () => {
    const token = await service.exchange(await proof());
    const device = [...devices.values()][0];
    device.tokenVersion++;
    await expect(service.authenticate(token.accessToken)).rejects.toMatchObject({ status: 401 });
    device.tokenVersion--;
    device.environment = 'production';
    await expect(service.authenticate(token.accessToken)).rejects.toMatchObject({ status: 401 });
    device.environment = INSTALLATION_ENVIRONMENT;
    device.revokedAt = new Date();
    await expect(service.authenticate(token.accessToken)).rejects.toMatchObject({ status: 401 });
    await expect(service.createChallenge({ publicKey })).rejects.toMatchObject({ status: 401 });
  });

  it('limits new registrations by IP and does not store raw IP addresses', async () => {
    for (let n = 0; n < 20; n++) await service.createChallenge({ publicKey }, '192.0.2.2');
    await expect(service.createChallenge({ publicKey }, '192.0.2.2')).rejects.toMatchObject({ status: 429 });
    expect(prisma.appAttestChallenge.create).toHaveBeenCalledTimes(20);
    expect(JSON.stringify([...buckets])).not.toContain('192.0.2.2');
  });

  it.each([
    '/api/generation/jobs', '/api/generation/rewrite', '/api/photos/materials/ai',
    '/api/postcards/message',
    '/api/chat/conversations/c/turns/t/generate/stream', '/api/growth/reports/ensure-current',
  ])('limits costly route %s and keeps cancellation available', async path => {
    for (let n = 0; n < 6; n++) await service.limitBusiness('device-test', '192.0.2.5', 'POST', path);
    await expect(service.limitBusiness('device-test', '192.0.2.5', 'POST', path)).rejects.toMatchObject({ status: 429 });
    await expect(service.limitBusiness('device-test', '192.0.2.5', 'POST', '/api/generation/jobs/id/cancel')).resolves.toBeUndefined();
  });

  it('fails closed without configuration or with malformed enrollment', async () => {
    await expect(service.createChallenge({ publicKey: 'x' })).rejects.toMatchObject({ status: 401 });
    delete process.env.INSTALLATION_AUTH_PRIVATE_KEY;
    await expect(service.createChallenge({ publicKey })).rejects.toMatchObject({ status: 503 });
    expect(() => signInstallationToken('device-test', 'key', 1)).toThrow();
  });

  it('recovers first-bucket MySQL unique races without losing counts or bypassing limits', async () => {
    await service.limit('race', 'device', 1, 60_000);
    prisma.appAttestRateLimit.upsert.mockRejectedValueOnce({ code: 'P2002' });
    await expect(service.limit('race', 'device', 1, 60_000)).rejects.toMatchObject({ status: 429 });
    expect(prisma.appAttestRateLimit.update).toHaveBeenCalled();
    prisma.appAttestRateLimit.upsert.mockRejectedValueOnce(new Error('database down'));
    await expect(service.limit('race', 'device', 10, 60_000)).rejects.toThrow('database down');
  });

  it('recovers a concurrently registered public key without allocating another identity', async () => {
    const first = await service.exchange(await proof());
    prisma.appAttestDevice.upsert.mockRejectedValueOnce({ code: 'P2002' });
    const second = await service.exchange(await proof());
    expect(second.deviceId).toBe(first.deviceId);
    expect(devices.size).toBe(1);
  });
});
