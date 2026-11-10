import { ServiceUnavailableException } from '@nestjs/common';
import nodemailer from 'nodemailer';
import { EmailVerificationMailer } from './email-verification-mailer';

jest.mock('nodemailer', () => ({
  __esModule: true,
  default: { createTransport: jest.fn() },
}));

describe('EmailVerificationMailer', () => {
  const originalEnv = { ...process.env };
  const transport = {
    sendMail: jest.fn(),
    close: jest.fn(),
  };
  let mailer: EmailVerificationMailer;

  beforeEach(() => {
    jest.clearAllMocks();
    process.env.SMTP_HOST = 'smtp.qiye.aliyun.com';
    process.env.SMTP_PORT = '465';
    process.env.SMTP_USER = 'developer2@perspectivar.com';
    process.env.SMTP_FROM = 'developer2@perspectivar.com';
    process.env.SMTP_PASSWORD = 'test-only-smtp-secret';
    jest.mocked(nodemailer.createTransport).mockReturnValue(transport as never);
    transport.sendMail.mockResolvedValue({ messageId: 'test-message-id' });
    mailer = new EmailVerificationMailer();
  });

  afterAll(() => {
    process.env = { ...originalEnv };
  });

  test('sends a verification message over authenticated enterprise SMTP without returning secrets', async () => {
    await expect(mailer.sendCode('member@example.com', '004271', 'register')).resolves.toBeUndefined();
    expect(nodemailer.createTransport).toHaveBeenCalledWith(expect.objectContaining({
      host: 'smtp.qiye.aliyun.com',
      port: 465,
      secure: true,
      auth: { user: 'developer2@perspectivar.com', pass: 'test-only-smtp-secret' },
    }));
    expect(transport.sendMail).toHaveBeenCalledWith(expect.objectContaining({
      from: 'developer2@perspectivar.com',
      to: 'member@example.com',
      subject: 'AI旅行日记注册验证码',
      text: expect.stringContaining('004271'),
    }));
    expect(transport.close).toHaveBeenCalledTimes(1);
  });

  test('does not attempt SMTP when the local password is missing', async () => {
    delete process.env.SMTP_PASSWORD;

    await expect(mailer.sendCode('member@example.com', '004271', 'delete'))
      .rejects.toBeInstanceOf(ServiceUnavailableException);
    expect(nodemailer.createTransport).not.toHaveBeenCalled();
  });

  test('hides transport diagnostics when delivery fails', async () => {
    transport.sendMail.mockRejectedValueOnce(new Error('private smtp details'));

    await expect(mailer.sendCode('member@example.com', '004271', 'delete'))
      .rejects.toMatchObject({
        response: { error: { code: 'email_delivery_unavailable' } },
      });
    expect(transport.close).toHaveBeenCalledTimes(1);
  });
});
