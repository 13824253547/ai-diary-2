import { createParamDecorator, ExecutionContext, SetMetadata, UnauthorizedException } from '@nestjs/common';

export const PUBLIC_ROUTE = 'publicRoute';
export const PublicRoute = () => SetMetadata(PUBLIC_ROUTE, true);

export type AccountRequest = {
  auth?: { userId: string; sessionId: string };
};

export const CurrentUserId = createParamDecorator((_data: unknown, context: ExecutionContext) => {
  const request = context.switchToHttp().getRequest<AccountRequest>();
  if (!request.auth?.userId) {
    throw new UnauthorizedException({
      ok: false,
      error: { code: 'account_session_invalid', message: '请先登录。', retryable: false },
    });
  }
  return request.auth.userId;
});

export const CurrentSessionId = createParamDecorator((_data: unknown, context: ExecutionContext) => {
  const request = context.switchToHttp().getRequest<AccountRequest>();
  if (!request.auth?.sessionId) {
    throw new UnauthorizedException({
      ok: false,
      error: { code: 'account_session_invalid', message: '请先登录。', retryable: false },
    });
  }
  return request.auth.sessionId;
});
