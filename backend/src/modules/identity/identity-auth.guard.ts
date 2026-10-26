import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { IdentityAuthService } from './identity-auth.service';

const PUBLIC_IDENTITY_ROUTES = new Set([
  'POST /api/identity/attestation/challenge',
  'POST /api/identity/attestation/register',
  'POST /api/identity/token/challenge',
  'POST /api/identity/token/refresh',
]);

@Injectable()
export class IdentityAuthGuard implements CanActivate {
  constructor(private readonly identityAuth: IdentityAuthService) {}

  async canActivate(context: ExecutionContext) {
    if (!this.identityAuth.isAttestedMode()) return true;

    const request = context.switchToHttp().getRequest<{
      method: string;
      path: string;
      headers: Record<string, string | string[] | undefined>;
    }>();
    if (PUBLIC_IDENTITY_ROUTES.has(`${request.method.toUpperCase()} ${request.path}`)) return true;

    const authorization = request.headers.authorization;
    const authorizationValue = Array.isArray(authorization) ? undefined : authorization;
    const token = authorizationValue?.match(/^Bearer (.+)$/i)?.[1];
    if (!token) throw this.invalidIdentity();

    const claims = await this.identityAuth.authenticateAccessToken(token);
    const headerValue = request.headers['x-device-id'];
    const requestDeviceId = Array.isArray(headerValue) ? undefined : headerValue?.trim();
    if (!requestDeviceId || requestDeviceId !== claims.sub) throw this.invalidIdentity();
    return true;
  }

  private invalidIdentity() {
    return new UnauthorizedException({
      ok: false,
      error: {
        code: 'device_identity_required',
        message: 'A valid attested device identity is required.',
        retryable: false,
      },
    });
  }
}
