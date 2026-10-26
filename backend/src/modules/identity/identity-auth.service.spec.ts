import { UnauthorizedException } from '@nestjs/common';
import { PrismaService } from '../../common/prisma.service';
import { AppAttestVerifier } from './app-attest-verifier';
import { IdentityAuthService } from './identity-auth.service';
import { verifyDeviceAccessToken } from './identity-token';

const KEY_ID = 'A'.repeat(44);
const DEVICE_ID = 'device-server-issued-id';
const PUBLIC_KEY = '-----BEGIN PUBLIC KEY-----\ntest\n-----END PUBLIC KEY-----';

describe('IdentityAuthService', () => {
  const previousEnvironment = {
    nodeEnv: process.env.NODE_ENV,
    mode: process.env.DEVICE_IDENTITY_MODE,
    team: process.env.APP_ATTEST_TEAM_ID,
    bundle: process.env.APP_ATTEST_BUNDLE_ID,
    secret: process.env.DEVICE_AUTH_JWT_SECRET,
    rateLimit: process.env.APP_ATTEST_CHALLENGES_PER_IP_PER_HOUR,
  };

  let prisma: {
    appAttestChallenge: {
      create: jest.Mock;
      deleteMany: jest.Mock;
      findUnique: jest.Mock;
      updateMany: jest.Mock;
    };
    appAttestDevice: {
      create: jest.Mock;
      findUnique: jest.Mock;
      updateMany: jest.Mock;
    };
    appAttestRateLimit: {
      deleteMany: jest.Mock;
      upsert: jest.Mock;
    };
  };
  let verifier: {
    verifyAttestation: jest.Mock;
    verifyAssertion: jest.Mock;
  };
  let service: IdentityAuthService;

  beforeEach(() => {
    process.env.NODE_ENV = 'development';
    process.env.DEVICE_IDENTITY_MODE = 'attested';
    process.env.APP_ATTEST_TEAM_ID = 'ABCDEFGHIJ';
    process.env.APP_ATTEST_BUNDLE_ID = 'io.com.shihangbiji.www.aidiary';
    process.env.DEVICE_AUTH_JWT_SECRET = 'test-secret-that-is-long-enough-for-hmac';
    process.env.APP_ATTEST_CHALLENGES_PER_IP_PER_HOUR = '20';

    prisma = {
      appAttestChallenge: {
        create: jest.fn().mockResolvedValue(undefined),
        deleteMany: jest.fn().mockResolvedValue({ count: 0 }),
        findUnique: jest.fn(),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
      appAttestDevice: {
        create: jest.fn().mockResolvedValue(undefined),
        findUnique: jest.fn(),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
      appAttestRateLimit: {
        deleteMany: jest.fn().mockResolvedValue({ count: 0 }),
        upsert: jest.fn().mockResolvedValue({ count: 1 }),
      },
    };
    verifier = {
      verifyAttestation: jest.fn(),
      verifyAssertion: jest.fn(),
    };
    service = new IdentityAuthService(
      prisma as unknown as PrismaService,
      verifier as unknown as AppAttestVerifier,
    );
  });

  afterAll(() => {
    if (previousEnvironment.nodeEnv === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = previousEnvironment.nodeEnv;
    if (previousEnvironment.mode === undefined) delete process.env.DEVICE_IDENTITY_MODE;
    else process.env.DEVICE_IDENTITY_MODE = previousEnvironment.mode;
    if (previousEnvironment.team === undefined) delete process.env.APP_ATTEST_TEAM_ID;
    else process.env.APP_ATTEST_TEAM_ID = previousEnvironment.team;
    if (previousEnvironment.bundle === undefined) delete process.env.APP_ATTEST_BUNDLE_ID;
    else process.env.APP_ATTEST_BUNDLE_ID = previousEnvironment.bundle;
    if (previousEnvironment.secret === undefined) delete process.env.DEVICE_AUTH_JWT_SECRET;
    else process.env.DEVICE_AUTH_JWT_SECRET = previousEnvironment.secret;
    if (previousEnvironment.rateLimit === undefined) delete process.env.APP_ATTEST_CHALLENGES_PER_IP_PER_HOUR;
    else process.env.APP_ATTEST_CHALLENGES_PER_IP_PER_HOUR = previousEnvironment.rateLimit;
  });

  it('issues a fresh server identity only after the one-time attestation verifies', async () => {
    const challenge = {
      id: 'challenge-1',
      challenge: 'random-one-time-challenge',
      purpose: 'attestation',
      keyId: null,
      deviceId: null,
      method: null,
      path: null,
      bodyHash: null,
      expiresAt: new Date(Date.now() + 60_000),
      consumedAt: null,
      createdAt: new Date(),
    };
    prisma.appAttestChallenge.findUnique.mockResolvedValue(challenge);
    verifier.verifyAttestation.mockReturnValue({
      keyId: KEY_ID,
      publicKey: PUBLIC_KEY,
      environment: 'development',
    });

    const result = await service.registerAttestedDevice({
      challengeId: challenge.id,
      keyId: KEY_ID,
      attestation: Buffer.from('valid-attestation-object').toString('base64'),
    });

    expect(result.deviceId).toMatch(/^device-/);
    expect(result.deviceId).not.toBe(DEVICE_ID);
    expect(result.tokenType).toBe('Bearer');
    expect(verifyDeviceAccessToken(result.accessToken)?.sub).toBe(result.deviceId);
    expect(verifier.verifyAttestation).toHaveBeenCalledWith(expect.objectContaining({
      challenge: challenge.challenge,
      keyId: KEY_ID,
      bundleIdentifier: 'io.com.shihangbiji.www.aidiary',
      teamIdentifier: 'ABCDEFGHIJ',
      allowDevelopmentEnvironment: true,
    }));
    expect(prisma.appAttestChallenge.updateMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ id: challenge.id, consumedAt: null }),
    }));
    expect(prisma.appAttestDevice.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        deviceId: result.deviceId,
        keyId: KEY_ID,
        publicKey: PUBLIC_KEY,
        signCount: 0,
      }),
    }));
  });

  it('limits challenge creation by a keyed IP bucket shared through the database', async () => {
    process.env.APP_ATTEST_CHALLENGES_PER_IP_PER_HOUR = '1';
    prisma.appAttestRateLimit.upsert
      .mockResolvedValueOnce({ count: 1 })
      .mockResolvedValueOnce({ count: 2 });

    await expect(service.createAttestationChallenge('192.0.2.18')).resolves.toMatchObject({
      challengeId: expect.any(String),
      challenge: expect.any(String),
    });
    await expect(service.createAttestationChallenge('192.0.2.18')).rejects.toMatchObject({
      status: 429,
    });

    const firstBucketId = prisma.appAttestRateLimit.upsert.mock.calls[0][0].where.id;
    expect(firstBucketId).toMatch(/^[a-f0-9]{64}$/);
    expect(prisma.appAttestRateLimit.upsert.mock.calls[1][0].where.id).toBe(firstBucketId);
  });

  it('rejects a challenge that is expired, already consumed, or replayed concurrently', async () => {
    prisma.appAttestChallenge.findUnique.mockResolvedValue({
      id: 'challenge-1',
      purpose: 'attestation',
      challenge: 'random-one-time-challenge',
      expiresAt: new Date(Date.now() + 60_000),
      consumedAt: null,
    });
    prisma.appAttestChallenge.updateMany.mockResolvedValue({ count: 0 });

    await expect(service.registerAttestedDevice({
      challengeId: 'challenge-1',
      keyId: KEY_ID,
      attestation: Buffer.from('valid-attestation-object').toString('base64'),
    })).rejects.toBeInstanceOf(UnauthorizedException);
    expect(verifier.verifyAttestation).not.toHaveBeenCalled();
  });

  it('binds token issuance to a one-time challenge and advances the App Attest counter', async () => {
    const device = {
      deviceId: DEVICE_ID,
      keyId: KEY_ID,
      publicKey: PUBLIC_KEY,
      signCount: 0,
      tokenVersion: 1,
      revokedAt: null,
    };
    prisma.appAttestDevice.findUnique.mockResolvedValue(device);
    const challenge = await service.createTokenChallenge({ keyId: KEY_ID });
    prisma.appAttestChallenge.findUnique.mockResolvedValue({
      id: challenge.challengeId,
      challenge: challenge.challenge,
      purpose: 'device-token',
      keyId: KEY_ID,
      deviceId: DEVICE_ID,
      expiresAt: new Date(Date.now() + 60_000),
      consumedAt: null,
    });
    verifier.verifyAssertion.mockReturnValue({ signCount: 1 });

    const result = await service.issueDeviceToken({
      challengeId: challenge.challengeId,
      keyId: KEY_ID,
      assertion: Buffer.from('valid-assertion-object').toString('base64'),
    });

    expect(challenge.payload).toContain(DEVICE_ID);
    expect(verifier.verifyAssertion).toHaveBeenCalledWith(expect.objectContaining({
      payload: challenge.payload,
      publicKey: PUBLIC_KEY,
      signCount: 0,
    }));
    expect(prisma.appAttestDevice.updateMany).toHaveBeenCalledWith({
      where: { deviceId: DEVICE_ID, keyId: KEY_ID, signCount: 0, revokedAt: null },
      data: { signCount: 1 },
    });
    expect(verifyDeviceAccessToken(result.accessToken)?.sub).toBe(DEVICE_ID);
  });
});
