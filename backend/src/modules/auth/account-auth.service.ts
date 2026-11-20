import {
  BadRequestException,
  ConflictException,
  Injectable,
  HttpException,
  HttpStatus,
  ServiceUnavailableException,
  UnauthorizedException,
  Logger,
  OnModuleInit,
} from '@nestjs/common';
import { randomBytes, randomInt, randomUUID, createHmac, timingSafeEqual } from 'node:crypto';
import type { Prisma } from '@prisma/client';
import * as argon2 from 'argon2';
import { PrismaService } from '../../common/prisma.service';
import { TemporaryGenerationPhotoStore } from '../../common/temporary-generation-photo-store';
import { PhotoAssetService } from '../photos/photo-asset.service';
import { signAccountToken, verifyAccountToken } from './account-token';
import { EmailVerificationMailer, type EmailVerificationPurpose } from './email-verification-mailer';
import { CAPTCHA_HEIGHT, CAPTCHA_PIECE_SIZE, CAPTCHA_WIDTH, chooseCaptchaPositions, createCaptchaImage } from './captcha-image';

const CAPTCHA_TTL_MS = 2 * 60 * 1000;
const EMAIL_CODE_TTL_MS = 10 * 60 * 1000;
const EMAIL_CODE_MAX_ATTEMPTS = 5;
const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;
const USERNAME_PATTERN = /^[a-z0-9_]{4,32}$/;

type CaptchaPurpose = 'register' | 'login';

function authError(code: string, message: string, status = 400) {
  const payload = { ok: false, error: { code, message, retryable: false } };
  if (status === 401) return new UnauthorizedException(payload);
  if (status === 409) return new ConflictException(payload);
  if (status === 429) return new HttpException(payload, HttpStatus.TOO_MANY_REQUESTS);
  if (status >= 500) return new ServiceUnavailableException(payload);
  return new BadRequestException(payload);
}

function normalizeUsername(input: unknown) {
  if (typeof input !== 'string') return undefined;
  const value = input.trim().toLowerCase();
  return USERNAME_PATTERN.test(value) ? value : undefined;
}

function validPassword(input: unknown): input is string {
  return typeof input === 'string' && input.length >= 8 && input.length <= 128;
}

function normalizeEmail(input: unknown) {
  if (typeof input !== 'string') return undefined;
  const value = input.trim().toLowerCase();
  if (value.length > 320 || value.length < 6) return undefined;
  const parts = value.split('@');
  if (parts.length !== 2 || !parts[0] || parts[0].length > 64) return undefined;
  const [local, domain] = parts;
  if (domain.length > 253 || !domain.includes('.')
    || !/^[a-z0-9.!#$%&'*+/=?^_`{|}~-]+$/.test(local)
    || !/^[a-z0-9.-]+$/.test(domain)
    || domain.split('.').some(label => !label || label.startsWith('-') || label.endsWith('-'))) {
    return undefined;
  }
  return value;
}

function captchaPurpose(input: unknown): CaptchaPurpose | undefined {
  return input === 'login' || input === 'register' ? input : undefined;
}

@Injectable()
export class AccountAuthService implements OnModuleInit {
  private readonly logger = new Logger(AccountAuthService.name);
  private deletionRetryTimer?: ReturnType<typeof setTimeout>;

  constructor(
    private readonly prisma: PrismaService,
    private readonly assets: PhotoAssetService,
    private readonly generationPhotos: TemporaryGenerationPhotoStore,
    private readonly emailMailer: EmailVerificationMailer,
  ) {}

  async onModuleInit() {
    await this.processPendingDeletionJobs();
  }

  async createCaptcha(input: unknown, address: string) {
    const purpose = captchaPurpose(input);
    if (!purpose) throw authError('invalid_input', '验证请求无效。');
    await this.checkRateLimit(`captcha-ip:${address}`, 30, 60 * 60 * 1000);

    const now = new Date();
    const id = randomUUID();
    const seed = randomBytes(16).toString('hex');
    const { targetX, targetY, left, right } = chooseCaptchaPositions();
    const { background, piece } = await createCaptchaImage(targetX, targetY, targetX === left ? right : left);
    await this.prisma.captchaChallenge.create({
      data: {
        id,
        purpose,
        targetX,
        imageSeed: seed,
        expiresAt: new Date(now.getTime() + CAPTCHA_TTL_MS),
      },
    });
    await this.prisma.captchaChallenge.deleteMany({ where: { expiresAt: { lt: now } } });

    return {
      ok: true,
      data: {
        challengeId: id,
        background: `data:image/png;base64,${background.toString('base64')}`,
        piece: `data:image/png;base64,${piece.toString('base64')}`,
        width: CAPTCHA_WIDTH,
        height: CAPTCHA_HEIGHT,
        pieceTop: targetY,
        pieceSize: CAPTCHA_PIECE_SIZE,
        expiresAt: new Date(now.getTime() + CAPTCHA_TTL_MS).toISOString(),
      },
    };
  }

  async requestRegistrationEmailCode(input: unknown, address: string) {
    const request = this.readEmailCodeRequest(input);
    await this.checkRateLimit(`register-email-ip:${address}`, 10, 60 * 60 * 1000);
    if (!await this.consumeCaptcha(request.challengeId, 'register', request.x)) {
      throw authError('captcha_failed', '图形验证未通过，请重新验证。');
    }
    await this.checkRateLimit(`register-email:${request.email}`, 5, 60 * 60 * 1000);

    const existing = await this.prisma.userAccount.findUnique({
      where: { email: request.email },
      select: { id: true },
    });
    if (existing) {
      return {
        ok: true,
        data: {
          challengeId: randomUUID(),
          expiresAt: new Date(Date.now() + EMAIL_CODE_TTL_MS).toISOString(),
        },
      };
    }
    return this.issueEmailCode(request.email, 'register');
  }

  async requestAccountDeletionEmailCode(userId: string, passwordInput: unknown, address: string) {
    await this.checkRateLimit(`delete-email-ip:${address}`, 5, 60 * 60 * 1000);
    if (!validPassword(passwordInput)) throw authError('invalid_input', '请输入当前密码。');
    const account = await this.prisma.userAccount.findUnique({
      where: { id: userId },
      select: { id: true, email: true, emailVerifiedAt: true, passwordHash: true },
    });
    if (!account || !await argon2.verify(account.passwordHash, passwordInput).catch(() => false)) {
      throw authError('invalid_credentials', '密码不正确，无法发送注销验证码。', 401);
    }
    if (!account.emailVerifiedAt) {
      throw authError('account_email_unverified', '该账号没有可用的已验证邮箱。', 400);
    }
    await this.checkRateLimit(`delete-email-user:${userId}`, 3, 60 * 60 * 1000);
    await this.checkRateLimit(`delete-email-address:${account.email}`, 3, 60 * 60 * 1000);
    const challenge = await this.issueEmailCode(account.email, 'delete', userId);
    return {
      ok: true,
      data: {
        ...challenge.data,
        maskedEmail: this.maskEmail(account.email),
      },
    };
  }

  async register(input: unknown, address: string) {
    const data = this.readRegistrationInput(input);
    await this.checkRateLimit(`register-ip:${address}`, 20, 60 * 60 * 1000);
    const username = normalizeUsername(data.username);
    const email = normalizeEmail(data.email);
    const emailChallengeId = data.emailChallengeId;
    if (!username || !email || !validPassword(data.password)
      || !emailChallengeId || emailChallengeId.length > 64 || !/^\d{6}$/.test(data.emailCode)) {
      throw authError('invalid_credentials_format', '用户名、邮箱、密码或验证码格式不符合要求。');
    }

    const passwordHash = await argon2.hash(data.password, {
      type: argon2.argon2id,
      memoryCost: 19_456,
      timeCost: 2,
      parallelism: 1,
    });
    const userId = randomUUID();
    const sessionId = randomUUID();
    const now = new Date();
    const expiresAt = new Date(now.getTime() + SESSION_TTL_MS);
    let emailVerified: boolean;
    try {
      emailVerified = await this.prisma.$transaction(async tx => {
        if (!await this.consumeEmailCode(tx, {
          challengeId: emailChallengeId,
          email,
          purpose: 'register',
          code: data.emailCode,
        })) return false;
        await tx.userAccount.create({
          data: { id: userId, username, email, emailVerifiedAt: now, passwordHash },
        });
        await tx.accountSession.create({ data: { id: sessionId, userId, expiresAt } });
        return true;
      });
    } catch (error) {
      if ((error as { code?: unknown })?.code === 'P2002') {
        throw authError('account_unavailable', '该用户名或邮箱暂不可用。', 409);
      }
      throw error;
    }
    if (!emailVerified) {
      throw authError('email_verification_failed', '邮箱验证码无效、已过期或已使用。');
    }
    return this.sessionResponse(userId, sessionId, username, now);
  }

  async login(input: unknown, address: string) {
    const data = this.readAuthInput(input);
    await this.checkRateLimit(`login-ip:${address}`, 80, 60 * 60 * 1000);
    const username = normalizeUsername(data.username);
    const rateKey = username ? `login-user:${username}` : 'login-user:invalid';
    await this.checkRateLimit(rateKey, 20, 15 * 60 * 1000);
    if (!await this.consumeCaptcha(data.challengeId, 'login', data.x)) {
      throw authError('captcha_failed', '图形验证未通过，请重新验证。');
    }

    const account = username
      ? await this.prisma.userAccount.findUnique({ where: { username } })
      : null;
    const password = typeof data.password === 'string' && data.password.length <= 128 ? data.password : '';
    let passwordMatches = false;
    if (account) {
      passwordMatches = await argon2.verify(account.passwordHash, password).catch(() => false);
    } else {
      await argon2.hash(password || 'invalid-password-placeholder', {
        type: argon2.argon2id,
        memoryCost: 19_456,
        timeCost: 2,
        parallelism: 1,
      });
    }
    if (!account || !passwordMatches) {
      throw authError('invalid_credentials', '用户名或密码不正确。', 401);
    }

    const now = new Date();
    const sessionId = randomUUID();
    const expiresAt = new Date(now.getTime() + SESSION_TTL_MS);
    await this.prisma.$transaction(async tx => {
      await tx.userAccount.update({
        where: { id: account.id },
        data: { updatedAt: now },
      });
      await tx.accountSession.deleteMany({ where: { userId: account.id } });
      await tx.accountSession.create({ data: { id: sessionId, userId: account.id, expiresAt } });
    });
    return this.sessionResponse(account.id, sessionId, account.username, now);
  }

  async getCurrentAccount(userId: string) {
    const account = await this.prisma.userAccount.findUnique({
      where: { id: userId },
      select: { id: true, username: true, createdAt: true },
    });
    if (!account) throw authError('account_not_found', '账号不存在或已注销。', 401);
    return { ok: true, data: account };
  }

  async logout(sessionId: string) {
    await this.prisma.accountSession.updateMany({
      where: { id: sessionId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    return { ok: true };
  }

  async deleteAccount(
    userId: string,
    passwordInput: unknown,
    emailChallengeIdInput: unknown,
    emailCodeInput: unknown,
  ) {
    if (!validPassword(passwordInput)) throw authError('invalid_input', '请输入当前密码。');
    const emailChallengeId = typeof emailChallengeIdInput === 'string' && emailChallengeIdInput.length <= 64
      ? emailChallengeIdInput
      : undefined;
    const emailCode = typeof emailCodeInput === 'string' && /^\d{6}$/.test(emailCodeInput)
      ? emailCodeInput
      : undefined;
    if (!emailChallengeId || !emailCode) {
      throw authError('invalid_input', '请输入邮箱验证码。');
    }
    const account = await this.prisma.userAccount.findUnique({
      where: { id: userId },
      select: { id: true, email: true, emailVerifiedAt: true, passwordHash: true },
    });
    if (!account || !await argon2.verify(account.passwordHash, passwordInput).catch(() => false)) {
      throw authError('invalid_credentials', '密码不正确，账号未注销。', 401);
    }
    if (!account.emailVerifiedAt) {
      throw authError('account_email_unverified', '该账号没有可用的已验证邮箱。', 400);
    }
    const emailVerified = await this.prisma.$transaction(async tx => {
      if (!await this.consumeEmailCode(tx, {
        challengeId: emailChallengeId,
        email: account.email,
        purpose: 'delete',
        ownerUserId: userId,
        code: emailCode,
      })) return false;
      await tx.accountDeletionJob.create({
        data: { id: randomUUID(), ownerUserId: userId, status: 'pending' },
      });
      const conversations = await tx.chatConversation.findMany({
        where: { ownerUserId: userId },
        select: { id: true },
      });
      const conversationIds = conversations.map(item => item.id);

      await tx.discoveryLike.deleteMany({ where: { ownerUserId: userId } });
      await tx.discoveryStory.deleteMany({ where: { ownerUserId: userId } });
      await tx.generationJob.deleteMany({ where: { ownerUserId: userId } });
      await tx.saveCommand.deleteMany({ where: { ownerUserId: userId } });
      await tx.draft.deleteMany({ where: { ownerUserId: userId } });
      await tx.diaryPhotoCopy.deleteMany({ where: { ownerUserId: userId } });
      await tx.materialPhoto.deleteMany({ where: { ownerUserId: userId } });
      await tx.materialPhotoQuota.deleteMany({ where: { ownerUserId: userId } });

      await tx.chatDailyAnchorSource.deleteMany({ where: { ownerUserId: userId } });
      await tx.chatAnchorCorrectionCommand.deleteMany({ where: { ownerUserId: userId } });
      await tx.chatAnchorCorrection.deleteMany({ where: { ownerUserId: userId } });
      await tx.chatMessage.deleteMany({ where: { conversationId: { in: conversationIds } } });
      await tx.chatTurn.deleteMany({ where: { ownerUserId: userId } });
      await tx.chatConversation.deleteMany({ where: { ownerUserId: userId } });

      await tx.anchorCorrectionCommand.deleteMany({ where: { ownerUserId: userId } });
      await tx.anchorCorrection.deleteMany({ where: { ownerUserId: userId } });
      await tx.diaryAnchor.deleteMany({ where: { ownerUserId: userId } });
      await tx.diaryAnchorExtraction.deleteMany({ where: { ownerUserId: userId } });
      await tx.chatDailyAnchor.deleteMany({ where: { ownerUserId: userId } });

      await tx.growthFlower.deleteMany({ where: { ownerUserId: userId } });
      await tx.growthRecognitionRun.deleteMany({ where: { ownerUserId: userId } });
      await tx.growthMilestone.deleteMany({ where: { ownerUserId: userId } });
      await tx.growthInsightReport.deleteMany({ where: { ownerUserId: userId } });
      await tx.growthReportJob.deleteMany({ where: { ownerUserId: userId } });
      await tx.diary.deleteMany({ where: { ownerUserId: userId } });

      await tx.emailVerificationChallenge.deleteMany({
        where: { OR: [{ ownerUserId: userId }, { email: account.email }] },
      });
      await tx.accountSession.deleteMany({ where: { userId } });
      await tx.userAccount.delete({ where: { id: userId } });
      return true;
    });
    if (!emailVerified) {
      throw authError('email_verification_failed', '邮箱验证码无效、已过期或已使用。');
    }
    await this.finishDeletion(userId);
    return { ok: true };
  }

  private async processPendingDeletionJobs() {
    const jobs = await this.prisma.accountDeletionJob.findMany({
      where: { status: 'pending' },
      select: { ownerUserId: true },
      take: 100,
    });
    for (const job of jobs) {
      try {
        await this.finishDeletion(job.ownerUserId);
      } catch {
        this.logger.warn('Account data cleanup will be retried.');
      }
    }
  }

  private async finishDeletion(userId: string) {
    const results = await Promise.allSettled([
      this.assets.deleteAccountAssets(userId),
      this.generationPhotos.clearOwner(userId),
    ]);
    if (results.some(result => result.status === 'rejected')) {
      await this.prisma.accountDeletionJob.updateMany({
        where: { ownerUserId: userId, status: 'pending' },
        data: { attemptCount: { increment: 1 }, lastFailureCode: 'file_cleanup_failed' },
      });
      this.scheduleDeletionRetry();
      throw authError('account_cleanup_pending', '账号数据已进入清理流程，请稍后查看结果。', 503);
    }
    await this.prisma.accountDeletionJob.deleteMany({ where: { ownerUserId: userId } });
  }

  private scheduleDeletionRetry() {
    if (this.deletionRetryTimer) return;
    this.deletionRetryTimer = setTimeout(() => {
      this.deletionRetryTimer = undefined;
      void this.processPendingDeletionJobs();
    }, 30_000);
    this.deletionRetryTimer.unref?.();
  }

  async authenticate(token: string) {
    const claims = verifyAccountToken(token);
    const session = await this.prisma.accountSession.findUnique({
      where: { id: claims.sid },
      select: { userId: true, expiresAt: true, revokedAt: true },
    });
    if (
      !session || session.userId !== claims.sub || session.revokedAt
      || session.expiresAt.getTime() <= Date.now()
    ) throw authError('account_session_invalid', '登录状态已失效，请重新登录。', 401);
    return claims;
  }

  private readEmailCodeRequest(input: unknown) {
    if (!input || typeof input !== 'object' || Array.isArray(input)) {
      throw authError('invalid_input', '邮箱验证请求无效。');
    }
    const value = input as Record<string, unknown>;
    const email = normalizeEmail(value.email);
    const captcha = value.captcha;
    if (!email || !captcha || typeof captcha !== 'object' || Array.isArray(captcha)) {
      throw authError('invalid_input', '请输入有效邮箱并完成图形验证。');
    }
    const proof = captcha as Record<string, unknown>;
    if (typeof proof.challengeId !== 'string' || proof.challengeId.length > 64
      || typeof proof.x !== 'number' || !Number.isFinite(proof.x)) {
      throw authError('invalid_input', '图形验证参数无效。');
    }
    return { email, challengeId: proof.challengeId, x: Math.round(proof.x) };
  }

  private readRegistrationInput(input: unknown) {
    if (!input || typeof input !== 'object' || Array.isArray(input)) {
      throw authError('invalid_input', '注册请求无效。');
    }
    const value = input as Record<string, unknown>;
    return {
      username: value.username,
      password: value.password,
      email: value.email,
      emailChallengeId: typeof value.emailChallengeId === 'string' ? value.emailChallengeId : undefined,
      emailCode: typeof value.emailCode === 'string' ? value.emailCode : '',
    };
  }

  private async issueEmailCode(
    email: string,
    purpose: EmailVerificationPurpose,
    ownerUserId?: string,
  ) {
    const now = new Date();
    await this.checkRateLimit(`email-code-cooldown:${purpose}:${email}`, 1, 60_000);
    const existing = await this.prisma.emailVerificationChallenge.findUnique({
      where: { email_purpose: { email, purpose } },
      select: { createdAt: true },
    });
    if (existing && now.getTime() - existing.createdAt.getTime() < 60_000) {
      throw authError('rate_limited', '验证码发送过于频繁，请稍后再试。', 429);
    }
    const challengeId = randomUUID();
    const code = randomInt(0, 1_000_000).toString().padStart(6, '0');
    const expiresAt = new Date(now.getTime() + EMAIL_CODE_TTL_MS);
    await this.prisma.emailVerificationChallenge.upsert({
      where: { email_purpose: { email, purpose } },
      create: {
        id: challengeId,
        email,
        purpose,
        ownerUserId: ownerUserId ?? null,
        codeHash: this.emailCodeHash(challengeId, email, purpose, code),
        expiresAt,
      },
      update: {
        id: challengeId,
        ownerUserId: ownerUserId ?? null,
        codeHash: this.emailCodeHash(challengeId, email, purpose, code),
        attemptCount: 0,
        expiresAt,
        consumedAt: null,
        createdAt: now,
      },
    });
    await this.prisma.emailVerificationChallenge.deleteMany({
      where: { expiresAt: { lt: now }, NOT: { id: challengeId } },
    });
    try {
      await this.emailMailer.sendCode(email, code, purpose);
    } catch (error) {
      await this.prisma.emailVerificationChallenge.deleteMany({ where: { id: challengeId } });
      throw error;
    }
    return {
      ok: true,
      data: { challengeId, expiresAt: expiresAt.toISOString() },
    };
  }

  private async consumeEmailCode(
    tx: Prisma.TransactionClient,
    input: {
      challengeId: string;
      email: string;
      purpose: EmailVerificationPurpose;
      ownerUserId?: string;
      code: string;
    },
  ) {
    const now = new Date();
    const challenge = await tx.emailVerificationChallenge.findFirst({
      where: {
        id: input.challengeId,
        email: input.email,
        purpose: input.purpose,
        ownerUserId: input.ownerUserId ?? null,
        consumedAt: null,
        expiresAt: { gt: now },
        attemptCount: { lt: EMAIL_CODE_MAX_ATTEMPTS },
      },
      select: { codeHash: true },
    });
    if (!challenge) return false;

    const expected = Buffer.from(challenge.codeHash, 'hex');
    const received = Buffer.from(
      this.emailCodeHash(input.challengeId, input.email, input.purpose, input.code),
      'hex',
    );
    if (expected.length !== received.length || !timingSafeEqual(expected, received)) {
      await tx.emailVerificationChallenge.updateMany({
        where: {
          id: input.challengeId,
          consumedAt: null,
          attemptCount: { lt: EMAIL_CODE_MAX_ATTEMPTS },
        },
        data: { attemptCount: { increment: 1 } },
      });
      return false;
    }
    const consumed = await tx.emailVerificationChallenge.updateMany({
      where: {
        id: input.challengeId,
        email: input.email,
        purpose: input.purpose,
        ownerUserId: input.ownerUserId ?? null,
        consumedAt: null,
        expiresAt: { gt: now },
        attemptCount: { lt: EMAIL_CODE_MAX_ATTEMPTS },
      },
      data: { consumedAt: now },
    });
    return consumed.count === 1;
  }

  private emailCodeHash(challengeId: string, email: string, purpose: EmailVerificationPurpose, code: string) {
    const secret = process.env.ACCOUNT_AUTH_JWT_SECRET;
    if (!secret || Buffer.byteLength(secret) < 32) {
      throw new ServiceUnavailableException({
        ok: false,
        error: { code: 'auth_unavailable', message: '账号服务暂不可用。', retryable: false },
      });
    }
    return createHmac('sha256', secret)
      .update(`${challengeId}:${email}:${purpose}:${code}`)
      .digest('hex');
  }

  private maskEmail(email: string) {
    const [local, domain] = email.split('@');
    return `${local.slice(0, 1)}***@${domain}`;
  }

  private readAuthInput(input: unknown) {
    if (!input || typeof input !== 'object' || Array.isArray(input)) {
      throw authError('invalid_input', '账号请求无效。');
    }
    const value = input as Record<string, unknown>;
    const captcha = value.captcha;
    if (!captcha || typeof captcha !== 'object' || Array.isArray(captcha)) {
      throw authError('invalid_input', '请完成图形验证。');
    }
    const proof = captcha as Record<string, unknown>;
    if (
      typeof proof.challengeId !== 'string' || proof.challengeId.length > 64
      || typeof proof.x !== 'number' || !Number.isFinite(proof.x)
    ) throw authError('invalid_input', '图形验证参数无效。');
    return {
      username: value.username,
      password: value.password,
      challengeId: proof.challengeId,
      x: Math.round(proof.x),
    };
  }

  private async consumeCaptcha(challengeId: string, purpose: CaptchaPurpose, x: number) {
    const now = new Date();
    return this.prisma.$transaction(async tx => {
      const challenge = await tx.captchaChallenge.findFirst({
        where: { id: challengeId, purpose, consumedAt: null, expiresAt: { gt: now } },
        select: { targetX: true },
      });
      if (!challenge) return false;
      const consumed = await tx.captchaChallenge.updateMany({
        where: { id: challengeId, purpose, consumedAt: null, expiresAt: { gt: now } },
        data: { consumedAt: now },
      });
      return consumed.count === 1 && Math.abs(challenge.targetX - x) <= 5;
    });
  }

  private async checkRateLimit(key: string, limit: number, windowMs: number) {
    const secret = process.env.ACCOUNT_AUTH_JWT_SECRET;
    if (!secret || Buffer.byteLength(secret) < 32) {
      throw new ServiceUnavailableException({
        ok: false,
        error: { code: 'auth_unavailable', message: '账号服务暂不可用。', retryable: false },
      });
    }
    const now = new Date();
    const bucket = Math.floor(now.getTime() / windowMs);
    const id = createHmac('sha256', secret).update(`${key}:${bucket}`).digest('hex');
    const expiresAt = new Date((bucket + 1) * windowMs);
    let counter: { count: number };
    try {
      counter = await this.prisma.authRateLimit.upsert({
        where: { id },
        create: { id, count: 1, expiresAt },
        update: { count: { increment: 1 } },
        select: { count: true },
      });
    } catch (error) {
      if ((error as { code?: unknown })?.code !== 'P2002') throw error;
      counter = await this.prisma.authRateLimit.update({
        where: { id },
        data: { count: { increment: 1 } },
        select: { count: true },
      });
    }
    if (counter.count > limit) {
      throw authError('rate_limited', '请求过于频繁，请稍后再试。', 429);
    }
  }

  private sessionResponse(userId: string, sessionId: string, username: string, now: Date) {
    const iat = Math.floor(now.getTime() / 1000);
    const exp = iat + Math.floor(SESSION_TTL_MS / 1000);
    const accessToken = signAccountToken({ sub: userId, sid: sessionId, iat, exp });
    return {
      ok: true,
      data: {
        accessToken,
        tokenType: 'Bearer',
        expiresAt: new Date(exp * 1000).toISOString(),
        user: { id: userId, username },
      },
    };
  }
}
