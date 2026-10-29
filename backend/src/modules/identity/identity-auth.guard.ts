import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { IdentityAuthService } from './identity-auth.service';
import { InstallationAuthService } from './installation-auth.service';
import { identityClientAddress } from './identity.controller';

const PUBLIC_IDENTITY_ROUTES = new Set([
  'POST /api/identity/attestation/challenge',
  'POST /api/identity/attestation/register',
  'POST /api/identity/token/challenge',
  'POST /api/identity/token/refresh',
  'POST /api/identity/installation/challenge',
  'POST /api/identity/installation/exchange',
]);

@Injectable()
export class IdentityAuthGuard implements CanActivate {
  constructor(
    private readonly identityAuth: IdentityAuthService,
    private readonly installationAuth: InstallationAuthService,
  ) {}

  async canActivate(context: ExecutionContext) {
    if (!this.identityAuth.isAttestedMode() && !this.installationAuth.enabled()) return true;

    const request = context.switchToHttp().getRequest<{
      method: string;
      path: string;
      headers: Record<string, string | string[] | undefined>;
      socket?: { remoteAddress?: string };
    }>();
    if (PUBLIC_IDENTITY_ROUTES.has(`${request.method.toUpperCase()} ${request.path}`)) return true;

    const authorization = request.headers.authorization;
    const authorizationValue = Array.isArray(authorization) ? undefined : authorization;
    const token = authorizationValue?.match(/^Bearer (.+)$/i)?.[1];
    if (!token) throw this.invalidIdentity();

    if (token.length > 4096) throw this.invalidIdentity();
    let installationToken = false;
    try {
      installationToken = JSON.parse(Buffer.from(token.split('.')[0], 'base64url').toString())?.alg === 'EdDSA';
    } catch {
      throw this.invalidIdentity();
    }
    const claims = installationToken && this.installationAuth.enabled()
      ? await this.installationAuth.authenticate(token)
      : await this.identityAuth.authenticateAccessToken(token);
    const headerValue = request.headers['x-device-id'];
    const requestDeviceId = Array.isArray(headerValue) ? undefined : headerValue?.trim();
    if (!requestDeviceId || requestDeviceId !== claims.sub) throw this.invalidIdentity();
    if (this.installationAuth.enabled()) {
      await this.installationAuth.limitBusiness(claims.sub, identityClientAddress(request) ?? 'unknown', request.method.toUpperCase(), request.path);
    }
    return true;
  }

  private invalidIdentity() {
    return new UnauthorizedException({
      ok: false,
      error: {
        code: 'device_identity_required',
        message: '需要有效的设备身份，请重试。',
        retryable: false,
      },
    });
  }
}
