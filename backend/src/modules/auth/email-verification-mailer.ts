import { Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';
import nodemailer from 'nodemailer';

export type EmailVerificationPurpose = 'register' | 'delete';

@Injectable()
export class EmailVerificationMailer {
  private readonly logger = new Logger(EmailVerificationMailer.name);

  async sendCode(email: string, code: string, purpose: EmailVerificationPurpose) {
    const user = process.env.SMTP_USER?.trim();
    const password = process.env.SMTP_PASSWORD;
    const from = process.env.SMTP_FROM?.trim() || user;
    const host = process.env.SMTP_HOST?.trim() || 'smtp.qiye.aliyun.com';
    const port = Number(process.env.SMTP_PORT || 465);
    if (!user || !password || !from || from.toLowerCase() !== user.toLowerCase()
      || !Number.isInteger(port) || port < 1 || port > 65_535) {
      throw this.unavailable();
    }

    const transporter = nodemailer.createTransport({
      host,
      port,
      secure: port === 465,
      auth: { user, pass: password },
      connectionTimeout: 10_000,
      greetingTimeout: 10_000,
      socketTimeout: 15_000,
    });
    const subject = purpose === 'register'
      ? 'AI旅行日记注册验证码'
      : 'AI旅行日记账号注销验证码';
    const text = `你的验证码是 ${code}，10 分钟内有效。若这不是你发起的操作，请忽略此邮件。`;
    try {
      await transporter.sendMail({
        from,
        to: email,
        subject,
        text,
        html: `<p>你的验证码是 <strong>${code}</strong>，10 分钟内有效。</p><p>若这不是你发起的操作，请忽略此邮件。</p>`,
      });
    } catch {
      this.logger.warn('Email verification delivery failed.');
      throw this.unavailable();
    } finally {
      transporter.close();
    }
  }

  private unavailable() {
    return new ServiceUnavailableException({
      ok: false,
      error: {
        code: 'email_delivery_unavailable',
        message: '邮箱验证服务暂不可用，请稍后重试。',
        retryable: true,
      },
    });
  }
}
