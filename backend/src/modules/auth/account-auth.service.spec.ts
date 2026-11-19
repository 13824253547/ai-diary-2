import * as argon2 from 'argon2';
import { PrismaService } from '../../common/prisma.service';
import { AccountAuthService } from './account-auth.service';

jest.mock('argon2', () => ({
  argon2id: 2,
  hash: jest.fn(async (password: string) => `argon2id-hash:${password}`),
  verify: jest.fn(async () => true),
}));

describe('AccountAuthService', () => {
  const previousSecret = process.env.ACCOUNT_AUTH_JWT_SECRET;
  let captchaRow: { id: string; purpose: string; targetX: number; consumedAt?: Date };
  let tx: Record<string, any>;
  let prisma: Record<string, any>;
  let assets: { deleteAccountAssets: jest.Mock };
  let generationPhotos: { clearOwner: jest.Mock };
  let emailMailer: { sendCode: jest.Mock };
  let emailChallengeRow: Record<string, any> | undefined;
  let emailChallengeModel: Record<string, jest.Mock>;
  let service: AccountAuthService;

  beforeAll(() => {
    process.env.ACCOUNT_AUTH_JWT_SECRET = 'account-service-test-secret-with-32-bytes';
  });

  afterAll(() => {
    if (previousSecret === undefined) delete process.env.ACCOUNT_AUTH_JWT_SECRET;
    else process.env.ACCOUNT_AUTH_JWT_SECRET = previousSecret;
  });

  beforeEach(() => {
    captchaRow = { id: '', purpose: 'register', targetX: 220 };
    emailChallengeRow = undefined;
    emailMailer = { sendCode: jest.fn().mockResolvedValue(undefined) };
    emailChallengeModel = {
      findFirst: jest.fn(async ({ where }) => {
        if (!emailChallengeRow
          || emailChallengeRow.id !== where.id
          || emailChallengeRow.email !== where.email
          || emailChallengeRow.purpose !== where.purpose
          || emailChallengeRow.ownerUserId !== where.ownerUserId
          || emailChallengeRow.consumedAt
          || emailChallengeRow.expiresAt <= where.expiresAt.gt
          || emailChallengeRow.attemptCount >= where.attemptCount.lt) return null;
        return { codeHash: emailChallengeRow.codeHash };
      }),
      updateMany: jest.fn(async ({ where, data }) => {
        if (!emailChallengeRow || emailChallengeRow.id !== where.id || emailChallengeRow.consumedAt) {
          return { count: 0 };
        }
        if (data.consumedAt) emailChallengeRow.consumedAt = data.consumedAt;
        if (data.attemptCount?.increment) emailChallengeRow.attemptCount += data.attemptCount.increment;
        return { count: 1 };
      }),
      deleteMany: jest.fn(async ({ where }) => {
        if (emailChallengeRow?.id === where.id) emailChallengeRow = undefined;
        return { count: 1 };
      }),
    };
    tx = {
      captchaChallenge: {
        findFirst: jest.fn(async ({ where }) =>
          captchaRow.id === where.id && captchaRow.purpose === where.purpose && !captchaRow.consumedAt
            ? { targetX: captchaRow.targetX }
            : null),
        updateMany: jest.fn(async ({ where, data }) => {
          if (captchaRow.id !== where.id || captchaRow.consumedAt) return { count: 0 };
          captchaRow.consumedAt = data.consumedAt;
          return { count: 1 };
        }),
      },
      userAccount: {
        create: jest.fn(async ({ data }) => data),
        update: jest.fn(async ({ data }) => data),
      },
      accountSession: {
        deleteMany: jest.fn(),
        create: jest.fn(async ({ data }) => data),
      },
      emailVerificationChallenge: emailChallengeModel,
    };
    prisma = {
      authRateLimit: {
        upsert: jest.fn().mockResolvedValue({ count: 1 }),
        update: jest.fn().mockResolvedValue({ count: 2 }),
      },
      captchaChallenge: {
        create: jest.fn(async ({ data }) => {
          captchaRow = { id: data.id, purpose: data.purpose, targetX: data.targetX };
          return data;
        }),
        deleteMany: jest.fn(),
      },
      emailVerificationChallenge: {
        findUnique: jest.fn(async ({ where }) => {
          const row = emailChallengeRow;
          if (!row) return null;
          return row.email === where.email_purpose.email
            && row.purpose === where.email_purpose.purpose
            ? { createdAt: row.createdAt }
            : null;
        }),
        upsert: jest.fn(async ({ create, update }) => {
          emailChallengeRow = emailChallengeRow?.email === create.email
            && emailChallengeRow?.purpose === create.purpose
            ? { ...emailChallengeRow, ...update }
            : { attemptCount: 0, createdAt: new Date(), ...create };
          return emailChallengeRow;
        }),
        deleteMany: emailChallengeModel.deleteMany,
      },
      userAccount: { findUnique: jest.fn().mockResolvedValue(null) },
      $transaction: jest.fn(async callback => callback(tx)),
    };
    assets = { deleteAccountAssets: jest.fn().mockResolvedValue(undefined) };
    generationPhotos = { clearOwner: jest.fn().mockResolvedValue(undefined) };
    service = new AccountAuthService(
      prisma as unknown as PrismaService,
      assets as never,
      generationPhotos as never,
      emailMailer as never,
    );
  });

  test('verifies an email after the puzzle and creates an account with a password hash', async () => {
    const challenge = await service.createCaptcha('register', '127.0.0.1');
    const emailChallenge = await service.requestRegistrationEmailCode({
      email: 'Travel.User@Example.com',
      captcha: { challengeId: challenge.data.challengeId, x: captchaRow.targetX },
    }, '127.0.0.1');
    const code = emailMailer.sendCode.mock.calls[0][1] as string;
    const result = await service.register({
      username: 'Travel_User',
      email: 'travel.user@example.com',
      password: 'secret-pass-123',
      emailChallengeId: emailChallenge.data.challengeId,
      emailCode: code,
    }, '127.0.0.1');

    expect(challenge.data.background).toMatch(/^data:image\/png;base64,/);
    expect(challenge.data.piece).toMatch(/^data:image\/png;base64,/);
    expect(emailChallenge.data).not.toHaveProperty('code');
    expect(emailMailer.sendCode).toHaveBeenCalledWith('travel.user@example.com', code, 'register');
    expect(result.data.user.username).toBe('travel_user');
    expect(tx.userAccount.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        username: 'travel_user',
        email: 'travel.user@example.com',
        emailVerifiedAt: expect.any(Date),
        passwordHash: expect.any(String),
      }),
    });
    const createInput = tx.userAccount.create.mock.calls[0][0].data;
    expect(createInput.passwordHash).not.toBe('secret-pass-123');
    expect(tx.accountSession.create).toHaveBeenCalledTimes(1);
  });

  test('increments an existing rate limit after a concurrent initial insert conflict', async () => {
    prisma.authRateLimit.upsert.mockRejectedValueOnce({ code: 'P2002' });
    await service.createCaptcha('register', '127.0.0.1');
    expect(prisma.authRateLimit.update).toHaveBeenCalledWith({
      where: { id: expect.any(String) },
      data: { count: { increment: 1 } },
      select: { count: true },
    });
  });

  test('consumes an incorrect puzzle answer and rejects replay', async () => {
    const challenge = await service.createCaptcha('register', '127.0.0.1');
    const input = {
      username: 'travel_user',
      email: 'travel@example.com',
      captcha: { challengeId: challenge.data.challengeId, x: captchaRow.targetX + 30 },
    };

    await expect(service.requestRegistrationEmailCode(input, '127.0.0.1')).rejects.toMatchObject({
      response: { error: { code: 'captcha_failed' } },
    });
    await expect(service.requestRegistrationEmailCode({
      ...input,
      captcha: { ...input.captcha, x: captchaRow.targetX },
    }, '127.0.0.1'))
      .rejects.toMatchObject({ response: { error: { code: 'captcha_failed' } } });
    expect(tx.userAccount.create).not.toHaveBeenCalled();
  });

  test('rejects an incorrect email code after five attempts without creating an account', async () => {
    const captcha = await service.createCaptcha('register', '127.0.0.1');
    const challenge = await service.requestRegistrationEmailCode({
      email: 'travel@example.com',
      captcha: { challengeId: captcha.data.challengeId, x: captchaRow.targetX },
    }, '127.0.0.1');
    const validCode = emailMailer.sendCode.mock.calls[0][1] as string;
    const incorrectCode = validCode === '000000' ? '000001' : '000000';
    const input = {
      username: 'travel_user',
      email: 'travel@example.com',
      password: 'secret-pass-123',
      emailChallengeId: challenge.data.challengeId,
      emailCode: incorrectCode,
    };

    for (let attempt = 0; attempt < 5; attempt += 1) {
      await expect(service.register(input, '127.0.0.1')).rejects.toMatchObject({
        response: { error: { code: 'email_verification_failed' } },
      });
    }
    await expect(service.register(input, '127.0.0.1')).rejects.toMatchObject({
      response: { error: { code: 'email_verification_failed' } },
    });

    expect(emailChallengeRow?.attemptCount).toBe(5);
    expect(tx.userAccount.create).not.toHaveBeenCalled();
  });

  test('rejects an expired registration email code', async () => {
    const captcha = await service.createCaptcha('register', '127.0.0.1');
    const challenge = await service.requestRegistrationEmailCode({
      email: 'travel@example.com',
      captcha: { challengeId: captcha.data.challengeId, x: captchaRow.targetX },
    }, '127.0.0.1');
    const code = emailMailer.sendCode.mock.calls[0][1] as string;
    emailChallengeRow!.expiresAt = new Date(Date.now() - 1);

    await expect(service.register({
      username: 'travel_user',
      email: 'travel@example.com',
      password: 'secret-pass-123',
      emailChallengeId: challenge.data.challengeId,
      emailCode: code,
    }, '127.0.0.1')).rejects.toMatchObject({
      response: { error: { code: 'email_verification_failed' } },
    });
    expect(tx.userAccount.create).not.toHaveBeenCalled();
  });

  test('consumes a registration email code once and rejects replay', async () => {
    const captcha = await service.createCaptcha('register', '127.0.0.1');
    const challenge = await service.requestRegistrationEmailCode({
      email: 'travel@example.com',
      captcha: { challengeId: captcha.data.challengeId, x: captchaRow.targetX },
    }, '127.0.0.1');
    const code = emailMailer.sendCode.mock.calls[0][1] as string;
    const input = {
      username: 'travel_user',
      email: 'travel@example.com',
      password: 'secret-pass-123',
      emailChallengeId: challenge.data.challengeId,
      emailCode: code,
    };

    await service.register(input, '127.0.0.1');
    await expect(service.register(input, '127.0.0.1')).rejects.toMatchObject({
      response: { error: { code: 'email_verification_failed' } },
    });
    expect(tx.userAccount.create).toHaveBeenCalledTimes(1);
    expect(emailChallengeRow?.consumedAt).toEqual(expect.any(Date));
  });

  test('removes the stored challenge when email delivery fails', async () => {
    emailMailer.sendCode.mockRejectedValueOnce(new Error('SMTP credentials rejected'));
    const captcha = await service.createCaptcha('register', '127.0.0.1');

    await expect(service.requestRegistrationEmailCode({
      email: 'travel@example.com',
      captcha: { challengeId: captcha.data.challengeId, x: captchaRow.targetX },
    }, '127.0.0.1')).rejects.toThrow('SMTP credentials rejected');

    expect(emailChallengeRow).toBeUndefined();
    expect(emailChallengeModel.deleteMany).toHaveBeenCalledWith({
      where: { id: expect.any(String) },
    });
  });

  test('returns the same registration challenge shape for an already registered email', async () => {
    const requestCode = async () => {
      const captcha = await service.createCaptcha('register', '127.0.0.1');
      return service.requestRegistrationEmailCode({
        email: 'travel@example.com',
        captcha: { challengeId: captcha.data.challengeId, x: captchaRow.targetX },
      }, '127.0.0.1');
    };

    const availableEmailResponse = await requestCode();
    prisma.userAccount.findUnique.mockResolvedValueOnce({ id: 'user-existing' });
    const registeredEmailResponse = await requestCode();

    expect(Object.keys(registeredEmailResponse.data).sort())
      .toEqual(Object.keys(availableEmailResponse.data).sort());
    expect(registeredEmailResponse.data).not.toHaveProperty('email');
    expect(registeredEmailResponse.data).not.toHaveProperty('code');
    expect(emailMailer.sendCode).toHaveBeenCalledTimes(1);
  });

  test('does not send an account deletion code when the password is incorrect', async () => {
    prisma.userAccount = {
      findUnique: jest.fn().mockResolvedValue({
        id: 'user-1',
        email: 'user@example.com',
        emailVerifiedAt: new Date(),
        passwordHash: 'argon-hash',
      }),
    };
    jest.mocked(argon2.verify).mockResolvedValueOnce(false);

    await expect(service.requestAccountDeletionEmailCode(
      'user-1',
      'secret-pass-123',
      '127.0.0.1',
    )).rejects.toMatchObject({
      response: { error: { code: 'invalid_credentials' } },
    });
    expect(emailMailer.sendCode).not.toHaveBeenCalled();
  });

  test('binds an account deletion email code to its account owner', async () => {
    prisma.userAccount = {
      findUnique: jest.fn().mockResolvedValue({
        id: 'user-1',
        email: 'user@example.com',
        emailVerifiedAt: new Date(),
        passwordHash: 'argon-hash',
      }),
    };
    const challenge = await service.requestAccountDeletionEmailCode(
      'user-1',
      'secret-pass-123',
      '127.0.0.1',
    );
    const code = emailMailer.sendCode.mock.calls[0][1] as string;
    prisma.userAccount.findUnique.mockResolvedValue({
      id: 'user-2',
      email: 'user@example.com',
      emailVerifiedAt: new Date(),
      passwordHash: 'argon-hash',
    });

    await expect(service.deleteAccount(
      'user-2',
      'secret-pass-123',
      challenge.data.challengeId,
      code,
    )).rejects.toMatchObject({
      response: { error: { code: 'email_verification_failed' } },
    });
    expect(emailChallengeRow?.consumedAt).toBeUndefined();
    expect(emailChallengeRow?.attemptCount).toBe(0);
  });

  test('replaces the prior active session on successful login', async () => {
    captchaRow = { id: 'login-challenge', purpose: 'login', targetX: 210 };
    jest.mocked(argon2.verify).mockResolvedValue(true);
    prisma.userAccount = {
      findUnique: jest.fn().mockResolvedValue({
        id: 'user-1',
        username: 'travel_user',
        passwordHash: 'argon-hash',
      }),
    };

    const response = await service.login({
      username: 'Travel_User',
      password: 'secret-pass-123',
      captcha: { challengeId: captchaRow.id, x: captchaRow.targetX },
    }, '127.0.0.1');

    expect(response.data.user.id).toBe('user-1');
    expect(tx.userAccount.update).toHaveBeenCalledWith({
      where: { id: 'user-1' },
      data: { updatedAt: expect.any(Date) },
    });
    expect(tx.accountSession.deleteMany).toHaveBeenCalledWith({ where: { userId: 'user-1' } });
    expect(tx.accountSession.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ userId: 'user-1', id: expect.any(String) }),
    });
  });

  test('keeps a retryable cleanup job and reports pending when account media removal fails', async () => {
    const deletionTx = new Proxy<Record<string, any>>({}, {
      get: (_target, property: string) => {
        if (property === 'emailVerificationChallenge') return emailChallengeModel;
        if (property === 'chatConversation') return {
          findMany: jest.fn().mockResolvedValue([]),
          deleteMany: jest.fn().mockResolvedValue({ count: 0 }),
        };
        if (property === 'userAccount') return { delete: jest.fn().mockResolvedValue({ id: 'user-1' }) };
        return {
          create: jest.fn().mockResolvedValue({}),
          deleteMany: jest.fn().mockResolvedValue({ count: 0 }),
        };
      },
    });
    prisma.userAccount = {
      findUnique: jest.fn().mockResolvedValue({
        id: 'user-1',
        email: 'user@example.com',
        emailVerifiedAt: new Date(),
        passwordHash: 'argon-hash',
      }),
    };
    prisma.accountDeletionJob = {
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      deleteMany: jest.fn().mockResolvedValue({ count: 0 }),
    };
    prisma.$transaction = jest.fn(async callback => callback(deletionTx));
    assets.deleteAccountAssets.mockRejectedValueOnce(new Error('storage unavailable'));
    jest.spyOn(
      service as unknown as { scheduleDeletionRetry: () => void },
      'scheduleDeletionRetry',
    ).mockImplementation(() => undefined);

    const deletionChallenge = await service.requestAccountDeletionEmailCode(
      'user-1',
      'secret-pass-123',
      '127.0.0.1',
    );
    const code = emailMailer.sendCode.mock.calls[0][1] as string;
    await expect(service.deleteAccount(
      'user-1',
      'secret-pass-123',
      deletionChallenge.data.challengeId,
      code,
    )).rejects.toMatchObject({
      response: { error: { code: 'account_cleanup_pending' } },
    });
    expect(prisma.accountDeletionJob.updateMany).toHaveBeenCalledWith({
      where: { ownerUserId: 'user-1', status: 'pending' },
      data: { attemptCount: { increment: 1 }, lastFailureCode: 'file_cleanup_failed' },
    });
    expect(generationPhotos.clearOwner).toHaveBeenCalledWith('user-1');
  });
});
