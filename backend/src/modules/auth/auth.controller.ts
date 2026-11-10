import { Body, Controller, Delete, Get, Post, Req } from '@nestjs/common';
import { isIP } from 'node:net';
import { AccountAuthService } from './account-auth.service';
import { CurrentSessionId, CurrentUserId, PublicRoute } from './auth-request';

type AuthRequest = {
  ip?: string;
  socket?: { remoteAddress?: string };
  headers?: Record<string, string | string[] | undefined>;
};

export function authClientAddress(request: AuthRequest) {
  const peer = request.socket?.remoteAddress;
  const loopback = peer === '::1' || peer === '127.0.0.1' || peer === '::ffff:127.0.0.1';
  const forwarded = request.headers?.['x-real-ip'];
  if (loopback && typeof forwarded === 'string' && isIP(forwarded.trim())) return forwarded.trim();
  return peer ?? request.ip ?? 'unknown';
}

@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AccountAuthService) {}

  @PublicRoute()
  @Post('captcha')
  createCaptcha(@Body() body: unknown, @Req() request: AuthRequest) {
    const purpose = body && typeof body === 'object' && !Array.isArray(body)
      ? (body as Record<string, unknown>).purpose
      : undefined;
    return this.auth.createCaptcha(purpose, authClientAddress(request));
  }

  @PublicRoute()
  @Post('register')
  register(@Body() body: unknown, @Req() request: AuthRequest) {
    return this.auth.register(body, authClientAddress(request));
  }

  @PublicRoute()
  @Post('register/email-code')
  requestRegistrationEmailCode(@Body() body: unknown, @Req() request: AuthRequest) {
    return this.auth.requestRegistrationEmailCode(body, authClientAddress(request));
  }

  @PublicRoute()
  @Post('login')
  login(@Body() body: unknown, @Req() request: AuthRequest) {
    return this.auth.login(body, authClientAddress(request));
  }

  @Get('me')
  getCurrentAccount(@CurrentUserId() userId: string) {
    return this.auth.getCurrentAccount(userId);
  }

  @Post('logout')
  logout(@CurrentSessionId() sessionId: string) {
    return this.auth.logout(sessionId);
  }

  @Post('account/deletion-code')
  requestAccountDeletionEmailCode(
    @Body() body: unknown,
    @CurrentUserId() userId: string,
    @Req() request: AuthRequest,
  ) {
    const password = body && typeof body === 'object' && !Array.isArray(body)
      ? (body as Record<string, unknown>).password
      : undefined;
    return this.auth.requestAccountDeletionEmailCode(userId, password, authClientAddress(request));
  }

  @Delete('account')
  deleteAccount(@CurrentUserId() userId: string, @Body() body: unknown) {
    const value = body && typeof body === 'object' && !Array.isArray(body)
      ? body as Record<string, unknown>
      : {};
    return this.auth.deleteAccount(
      userId,
      value.password,
      value.emailChallengeId,
      value.emailCode,
    );
  }
}
