import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { PrismaService } from '../../common/prisma.service';
import { AccountRequest, PUBLIC_ROUTE } from './auth-request';
import { verifyAccountToken } from './account-token';

type RequestWithHeaders = AccountRequest & {
  headers: Record<string, string | string[] | undefined>;
};

@Injectable()
export class AccountAuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly prisma: PrismaService,
  ) {}

  async canActivate(context: ExecutionContext) {
    if (this.reflector.getAllAndOverride<boolean>(PUBLIC_ROUTE, [
      context.getHandler(),
      context.getClass(),
    ])) return true;

    const request = context.switchToHttp().getRequest<RequestWithHeaders>();
    const authorization = request.headers.authorization;
    const value = Array.isArray(authorization) ? undefined : authorization;
    const token = value?.match(/^Bearer ([A-Za-z0-9_.-]{1,4096})$/i)?.[1];
    if (!token) throw this.invalidSession();

    let claims;
    try {
      claims = verifyAccountToken(token);
    } catch {
      throw this.invalidSession();
    }
    const session = await this.prisma.accountSession.findUnique({
      where: { id: claims.sid },
      select: { userId: true, expiresAt: true, revokedAt: true },
    });
    if (
      !session || session.userId !== claims.sub || session.revokedAt
      || session.expiresAt.getTime() <= Date.now()
    ) throw this.invalidSession();

    request.auth = { userId: claims.sub, sessionId: claims.sid };
    return true;
  }

  private invalidSession() {
    return new UnauthorizedException({
      ok: false,
      error: { code: 'account_session_invalid', message: '登录状态已失效，请重新登录。', retryable: false },
    });
  }
}
