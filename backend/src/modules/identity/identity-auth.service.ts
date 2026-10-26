import {
  HttpException,
  HttpStatus,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { createHmac, randomBytes, randomUUID } from 'node:crypto';
import { PrismaService } from '../../common/prisma.service';
import { AppAttestVerifier } from './app-attest-verifier';
import {
  DEVICE_ACCESS_TOKEN_TTL_SECONDS,
  signDeviceAccessToken,
  verifyDeviceAccessToken,
  type DeviceAccessClaims,
} from './identity-token';

const CHALLENGE_TTL_MS = 5 * 60 * 1000;
const MAX_ATTESTATION_BASE64_LENGTH = 96 * 1024;
const MAX_ASSERTION_BASE64_LENGTH = 32 * 1024;
const APP_BUNDLE_ID_DEFAULT = 'io.com.shihangbiji.www.aidiary';

type AttestationChallenge = {
  challengeId: string;
  challenge: string;
};

type SignedTokenChallenge = AttestationChallenge & {
  keyId: string;
  deviceId: string;
  payload: string;
};

type IssuedDeviceToken = {
  deviceId: string;
  accessToken: string;
  tokenType: 'Bearer';
  expiresAt: string;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isAttestedMode() {
  if (process.env.NODE_ENV === 'production') return true;
  return process.env.DEVICE_IDENTITY_MODE === 'attested';
}

function assertAttestedConfiguration() {
  const teamIdentifier = process.env.APP_ATTEST_TEAM_ID;
  const signingSecret = process.env.DEVICE_AUTH_JWT_SECRET;
  if (!teamIdentifier || !/^[A-Z0-9]{10}$/.test(teamIdentifier)) {
    throw new ServiceUnavailableException({
      ok: false,
      error: {
        code: 'device_attestation_unconfigured',
        message: 'Device attestation is not configured.',
        retryable: false,
      },
    });
  }
  if (!signingSecret || Buffer.byteLength(signingSecret) < 32) {
    throw new ServiceUnavailableException({
      ok: false,
      error: {
        code: 'device_attestation_unconfigured',
        message: 'Device attestation is not configured.',
        retryable: false,
      },
    });
  }
  return {
    teamIdentifier,
    bundleIdentifier: process.env.APP_ATTEST_BUNDLE_ID || APP_BUNDLE_ID_DEFAULT,
    allowDevelopmentEnvironment: process.env.NODE_ENV !== 'production',
  };
}

function tokenPayload(challenge: SignedTokenChallenge) {
  return JSON.stringify({
    action: 'issue-device-token',
    challengeId: challenge.challengeId,
    challenge: challenge.challenge,
    deviceId: challenge.deviceId,
    keyId: challenge.keyId,
  });
}

@Injectable()
export class IdentityAuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly verifier: AppAttestVerifier,
  ) {}

  isAttestedMode() {
    return isAttestedMode();
  }

  async createAttestationChallenge(remoteAddress = 'unknown'): Promise<AttestationChallenge> {
    assertAttestedConfiguration();
    const now = new Date();
    const rateLimit = Number(process.env.APP_ATTEST_CHALLENGES_PER_IP_PER_HOUR ?? 20);
    if (!Number.isSafeInteger(rateLimit) || rateLimit < 1 || rateLimit > 10_000) {
      throw new ServiceUnavailableException({
        ok: false,
        error: {
          code: 'device_attestation_unconfigured',
          message: 'Device attestation is not configured.',
          retryable: false,
        },
      });
    }
    const windowMs = 60 * 60 * 1000;
    const windowStart = Math.floor(now.getTime() / windowMs) * windowMs;
    const bucketId = createHmac('sha256', process.env.DEVICE_AUTH_JWT_SECRET!)
      .update(`${remoteAddress.slice(0, 128)}:${windowStart}`)
      .digest('hex');
    await this.prisma.appAttestRateLimit.deleteMany({
      where: { expiresAt: { lt: now } },
    });
    const rate = await this.prisma.appAttestRateLimit.upsert({
      where: { id: bucketId },
      create: { id: bucketId, count: 1, expiresAt: new Date(windowStart + windowMs) },
      update: { count: { increment: 1 } },
    });
    if (rate.count > rateLimit) {
      throw new HttpException({
        ok: false,
        error: {
          code: 'device_attestation_rate_limited',
          message: 'Too many device attestation requests.',
          retryable: true,
        },
      }, HttpStatus.TOO_MANY_REQUESTS);
    }
    await this.prisma.appAttestChallenge.deleteMany({
      where: { expiresAt: { lt: now } },
    });
    const challengeId = randomUUID();
    const challenge = randomBytes(32).toString('base64url');
    await this.prisma.appAttestChallenge.create({
      data: {
        id: challengeId,
        challenge,
        purpose: 'attestation',
        expiresAt: new Date(now.getTime() + CHALLENGE_TTL_MS),
      },
    });
    return { challengeId, challenge };
  }

  async registerAttestedDevice(input: unknown): Promise<IssuedDeviceToken> {
    const config = assertAttestedConfiguration();
    if (
      !isRecord(input)
      || typeof input.challengeId !== 'string'
      || typeof input.keyId !== 'string'
      || input.keyId.length < 20
      || input.keyId.length > 128
      || typeof input.attestation !== 'string'
      || input.attestation.length < 16
      || input.attestation.length > MAX_ATTESTATION_BASE64_LENGTH
      || !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(input.attestation)
    ) {
      throw this.invalidProof();
    }

    const challenge = await this.consumeChallenge(input.challengeId, 'attestation');
    let result;
    try {
      result = await this.verifier.verifyAttestation({
        attestation: Buffer.from(input.attestation, 'base64'),
        challenge: challenge.challenge,
        keyId: input.keyId,
        bundleIdentifier: config.bundleIdentifier,
        teamIdentifier: config.teamIdentifier,
        allowDevelopmentEnvironment: config.allowDevelopmentEnvironment,
      });
    } catch {
      throw this.invalidProof();
    }
    if (result.keyId !== input.keyId) throw this.invalidProof();

    const deviceId = `device-${randomUUID()}`;
    try {
      await this.prisma.appAttestDevice.create({
        data: {
          deviceId,
          keyId: result.keyId,
          publicKey: result.publicKey,
          signCount: 0,
          tokenVersion: 1,
          environment: result.environment,
        },
      });
    } catch {
      throw this.invalidProof();
    }
    return this.issueToken(deviceId, result.keyId, 1);
  }

  async createTokenChallenge(input: unknown): Promise<SignedTokenChallenge> {
    assertAttestedConfiguration();
    if (!isRecord(input) || typeof input.keyId !== 'string' || input.keyId.length > 128) {
      throw this.invalidProof();
    }
    const device = await this.prisma.appAttestDevice.findUnique({
      where: { keyId: input.keyId },
    });
    if (!device) {
      throw new NotFoundException({
        ok: false,
        error: {
          code: 'device_attestation_not_registered',
          message: 'No attested device is registered for this key.',
          retryable: false,
        },
      });
    }
    if (device.revokedAt) throw this.invalidProof();

    const now = new Date();
    await this.prisma.appAttestChallenge.deleteMany({
      where: { expiresAt: { lt: now } },
    });
    const challengeId = randomUUID();
    const challenge = randomBytes(32).toString('base64url');
    const signedChallenge: SignedTokenChallenge = {
      challengeId,
      challenge,
      keyId: device.keyId,
      deviceId: device.deviceId,
      payload: '',
    };
    signedChallenge.payload = tokenPayload(signedChallenge);
    await this.prisma.appAttestChallenge.create({
      data: {
        id: challengeId,
        challenge,
        purpose: 'device-token',
        keyId: device.keyId,
        deviceId: device.deviceId,
        expiresAt: new Date(now.getTime() + CHALLENGE_TTL_MS),
      },
    });
    return signedChallenge;
  }

  async issueDeviceToken(input: unknown): Promise<IssuedDeviceToken> {
    assertAttestedConfiguration();
    if (
      !isRecord(input)
      || typeof input.challengeId !== 'string'
      || typeof input.keyId !== 'string'
      || typeof input.assertion !== 'string'
      || input.assertion.length < 16
      || input.assertion.length > MAX_ASSERTION_BASE64_LENGTH
      || !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(input.assertion)
    ) {
      throw this.invalidProof();
    }
    const challenge = await this.consumeChallenge(input.challengeId, 'device-token');
    if (challenge.keyId !== input.keyId || !challenge.deviceId) throw this.invalidProof();
    const device = await this.prisma.appAttestDevice.findUnique({
      where: { keyId: input.keyId },
    });
    if (!device || device.deviceId !== challenge.deviceId || device.revokedAt) throw this.invalidProof();

    const signedChallenge: SignedTokenChallenge = {
      challengeId: challenge.id,
      challenge: challenge.challenge,
      keyId: challenge.keyId,
      deviceId: challenge.deviceId,
      payload: '',
    };
    signedChallenge.payload = tokenPayload(signedChallenge);

    let result;
    try {
      result = await this.verifier.verifyAssertion({
        assertion: Buffer.from(input.assertion, 'base64'),
        payload: signedChallenge.payload,
        publicKey: device.publicKey,
        bundleIdentifier: process.env.APP_ATTEST_BUNDLE_ID || APP_BUNDLE_ID_DEFAULT,
        teamIdentifier: process.env.APP_ATTEST_TEAM_ID!,
        signCount: device.signCount,
      });
    } catch {
      throw this.invalidProof();
    }
    const updated = await this.prisma.appAttestDevice.updateMany({
      where: {
        deviceId: device.deviceId,
        keyId: device.keyId,
        signCount: device.signCount,
        revokedAt: null,
      },
      data: { signCount: result.signCount },
    });
    if (updated.count !== 1) throw this.invalidProof();
    return this.issueToken(device.deviceId, device.keyId, device.tokenVersion);
  }

  async authenticateAccessToken(token: string): Promise<DeviceAccessClaims> {
    if (!token || token.length > 4096) throw this.invalidProof();
    let claims: DeviceAccessClaims | undefined;
    try {
      claims = verifyDeviceAccessToken(token);
    } catch {
      throw this.invalidProof();
    }
    if (!claims) throw this.invalidProof();
    const device = await this.prisma.appAttestDevice.findUnique({
      where: { deviceId: claims.sub },
    });
    if (
      !device
      || device.revokedAt
      || device.keyId !== claims.keyId
      || device.tokenVersion !== claims.ver
    ) {
      throw this.invalidProof();
    }
    return claims;
  }

  private async consumeChallenge(id: string, purpose: string) {
    const now = new Date();
    const challenge = await this.prisma.appAttestChallenge.findUnique({ where: { id } });
    if (!challenge || challenge.purpose !== purpose || challenge.expiresAt <= now || challenge.consumedAt) {
      throw this.invalidProof();
    }
    const consumed = await this.prisma.appAttestChallenge.updateMany({
      where: { id, purpose, consumedAt: null, expiresAt: { gt: now } },
      data: { consumedAt: now },
    });
    if (consumed.count !== 1) throw this.invalidProof();
    return challenge;
  }

  private issueToken(deviceId: string, keyId: string, tokenVersion: number): IssuedDeviceToken {
    const now = Date.now();
    const accessToken = signDeviceAccessToken(deviceId, keyId, tokenVersion, now);
    return {
      deviceId,
      accessToken,
      tokenType: 'Bearer',
      expiresAt: new Date(now + DEVICE_ACCESS_TOKEN_TTL_SECONDS * 1000).toISOString(),
    };
  }

  private invalidProof() {
    return new UnauthorizedException({
      ok: false,
      error: {
        code: 'device_attestation_invalid',
        message: 'Device attestation could not be verified.',
        retryable: false,
      },
    });
  }
}
