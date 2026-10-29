import { HttpException, Injectable, ServiceUnavailableException, UnauthorizedException } from '@nestjs/common';
import { createHash, createHmac, createPublicKey, randomBytes, randomUUID, verify } from 'node:crypto';
import { PrismaService } from '../../common/prisma.service';
import { INSTALLATION_TOKEN_TTL_SECONDS, signInstallationToken, verifyInstallationToken } from './installation-token';

export const INSTALLATION_ENVIRONMENT = 'installation-ed25519-v1';
const CHALLENGE_TTL_MS = 5 * 60 * 1000;
const SPKI_PREFIX = Buffer.from('302a300506032b6570032100', 'hex');
type Challenge = { id: string; challenge: string; purpose: string; keyId: string | null };

function invalidIdentity() {
  return new UnauthorizedException({
    ok: false,
    error: { code: 'device_identity_required', message: '设备身份验证失败，请重试。', retryable: false },
  });
}

function isUniqueConflict(error: unknown) {
  return !!error && typeof error === 'object' && 'code' in error && error.code === 'P2002';
}

function parseKey(input: unknown) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw invalidIdentity();
  const body = input as Record<string, unknown>;
  if (typeof body.publicKey !== 'string' || !/^[a-f0-9]{64}$/.test(body.publicKey)) throw invalidIdentity();
  const bytes = Buffer.from(body.publicKey, 'hex');
  const publicKey = createPublicKey({ key: Buffer.concat([SPKI_PREFIX, bytes]), format: 'der', type: 'spki' });
  const keyId = `install-${createHash('sha256').update(bytes).digest('hex')}`;
  return { body, publicKey, keyId, publicKeyHex: body.publicKey };
}

function signingPayload(challenge: Challenge) {
  return JSON.stringify({
    protocol: INSTALLATION_ENVIRONMENT, action: 'authenticate-installation',
    challengeId: challenge.id, challenge: challenge.challenge, keyId: challenge.keyId,
  });
}

@Injectable()
export class InstallationAuthService {
  constructor(private readonly prisma: PrismaService) {}

  enabled() {
    return process.env.DEVICE_IDENTITY_MODE === 'installation';
  }

  private assertEnabled() {
    if (!this.enabled() || !process.env.INSTALLATION_AUTH_PRIVATE_KEY || !process.env.DEVICE_AUTH_JWT_SECRET) {
      throw new ServiceUnavailableException({
        ok: false,
        error: { code: 'identity_unavailable', message: '身份服务暂不可用，请稍后重试。', retryable: true },
      });
    }
  }

  async limit(scope: string, identity: string, maximum: number, windowMs: number) {
    const now = new Date();
    const window = Math.floor(now.getTime() / windowMs) * windowMs;
    const secret = process.env.DEVICE_AUTH_JWT_SECRET;
    if (!secret || Buffer.byteLength(secret) < 32) throw new ServiceUnavailableException('Identity rate limiter unavailable');
    const id = createHmac('sha256', secret).update(`${scope}:${identity.slice(0, 256)}:${window}`).digest('hex');
    await this.prisma.appAttestRateLimit.deleteMany({ where: { expiresAt: { lt: now } } });
    let rate;
    try {
      rate = await this.prisma.appAttestRateLimit.upsert({
        where: { id }, create: { id, count: 1, expiresAt: new Date(window + windowMs) },
        update: { count: { increment: 1 } },
      });
    } catch (error) {
      if (!isUniqueConflict(error)) throw error;
      // MySQL Prisma upsert can race at first creation; increment the winning row atomically.
      rate = await this.prisma.appAttestRateLimit.update({
        where: { id }, data: { count: { increment: 1 } },
      });
    }
    if (rate.count > maximum) {
      throw new HttpException({
        ok: false,
        error: { code: 'identity_rate_limited', message: '请求过于频繁，请稍后重试。', retryable: true },
      }, 429);
    }
  }

  async createChallenge(input: unknown, address = 'unknown') {
    this.assertEnabled();
    // Limit all calls before key parsing or device lookups, including malformed requests.
    await this.limit('installation-challenge-ip', address, 120, 3_600_000);
    const { keyId } = parseKey(input);
    const device = await this.prisma.appAttestDevice.findUnique({ where: { keyId } });
    if (device && (device.environment !== INSTALLATION_ENVIRONMENT || device.revokedAt)) throw invalidIdentity();
    if (!device) await this.limit('installation-registration-ip', address, 20, 3_600_000);
    else await this.limit('installation-refresh-key', keyId, 30, 3_600_000);
    const now = new Date();
    await this.prisma.appAttestChallenge.deleteMany({ where: { expiresAt: { lt: now } } });
    const challenge = {
      id: randomUUID(), challenge: randomBytes(32).toString('base64url'),
      purpose: 'installation-token', keyId,
    };
    await this.prisma.appAttestChallenge.create({
      data: { ...challenge, expiresAt: new Date(now.getTime() + CHALLENGE_TTL_MS) },
    });
    return { challengeId: challenge.id, keyId, payload: signingPayload(challenge) };
  }

  async exchange(input: unknown, address = 'unknown') {
    this.assertEnabled();
    await this.limit('installation-exchange-ip', address, 120, 3_600_000);
    const { body, publicKey, keyId, publicKeyHex } = parseKey(input);
    if (
      typeof body.challengeId !== 'string' || !/^[a-f0-9-]{36}$/.test(body.challengeId)
      || typeof body.signature !== 'string' || !/^[a-f0-9]{128}$/.test(body.signature)
    ) throw invalidIdentity();
    const now = new Date();
    const challenge = await this.prisma.appAttestChallenge.findUnique({ where: { id: body.challengeId } });
    if (
      !challenge || challenge.purpose !== 'installation-token' || challenge.keyId !== keyId
      || challenge.consumedAt || challenge.expiresAt <= now
    ) throw invalidIdentity();
    const consumed = await this.prisma.appAttestChallenge.updateMany({
      where: { id: challenge.id, purpose: 'installation-token', keyId, consumedAt: null, expiresAt: { gt: now } },
      data: { consumedAt: now },
    });
    if (consumed.count !== 1 || !verify(null, Buffer.from(signingPayload(challenge)), publicKey, Buffer.from(body.signature, 'hex'))) {
      throw invalidIdentity();
    }
    // Unique keyId makes retries and concurrent enrollment recover the same server identity.
    let device;
    try {
      device = await this.prisma.appAttestDevice.upsert({
        where: { keyId },
        create: {
          deviceId: `device-${randomUUID()}`, keyId, publicKey: publicKeyHex,
          environment: INSTALLATION_ENVIRONMENT, tokenVersion: 1, signCount: 0,
        },
        update: {},
      });
    } catch (error) {
      if (!isUniqueConflict(error)) throw error;
      device = await this.prisma.appAttestDevice.findUnique({ where: { keyId } });
    }
    if (!device || device.revokedAt || device.environment !== INSTALLATION_ENVIRONMENT || device.publicKey !== publicKeyHex) {
      throw invalidIdentity();
    }
    return {
      deviceId: device.deviceId, tokenType: 'Bearer',
      accessToken: signInstallationToken(device.deviceId, keyId, device.tokenVersion),
      expiresAt: new Date(Date.now() + INSTALLATION_TOKEN_TTL_SECONDS * 1000).toISOString(),
    };
  }

  async authenticate(token: string) {
    const claims = token.length <= 4096 ? verifyInstallationToken(token) : undefined;
    if (!claims) throw invalidIdentity();
    const device = await this.prisma.appAttestDevice.findUnique({ where: { deviceId: claims.sub } });
    if (
      !device || device.revokedAt || device.environment !== INSTALLATION_ENVIRONMENT
      || device.keyId !== claims.keyId || device.tokenVersion !== claims.ver
    ) throw invalidIdentity();
    return claims;
  }

  async limitBusiness(deviceId: string, address: string, method: string, path: string) {
    await this.limit('business-device', deviceId, 300, 60_000);
    await this.limit('business-ip', address, 1200, 60_000);
    const costly = method === 'POST' && (
      /^\/api\/generation\/jobs\/?$/.test(path)
      || /\/rewrite\/?$/.test(path)
      || /\/generate(?:\/stream)?\/?$/.test(path)
      || /^\/api\/photos\/materials\/ai\/?$/.test(path)
      || /^\/api\/postcards\/message\/?$/.test(path)
      || /^\/api\/growth\/(?:reports\/(?:ensure-current|retry)|flowers\/(?:initialize|retry))\/?$/.test(path)
    );
    if (costly) {
      await this.limit('ai-device-minute', deviceId, 6, 60_000);
      await this.limit('ai-device-day', deviceId, 100, 86_400_000);
      await this.limit('ai-ip-hour', address, 300, 3_600_000);
    }
  }
}
