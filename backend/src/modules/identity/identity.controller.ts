import { Body, Controller, Get, Headers, Post, Req } from '@nestjs/common';
import { resolveDeviceId } from '../../common/device-identity';
import { IdentityAuthService } from './identity-auth.service';
import { InstallationAuthService } from './installation-auth.service';
import { isIP } from 'node:net';

type IdentityRequest = {
  ip?: string;
  socket?: { remoteAddress?: string };
  headers?: Record<string, string | string[] | undefined>;
};

export function identityClientAddress(request: IdentityRequest) {
  const peer = request.socket?.remoteAddress;
  const loopback = peer === '::1' || peer === '127.0.0.1' || peer === '::ffff:127.0.0.1';
  const forwarded = request.headers?.['x-real-ip'];
  // Nginx overwrites this header; only the local reverse proxy may supply it.
  if (loopback && typeof forwarded === 'string' && isIP(forwarded.trim())) {
    return forwarded.trim();
  }
  return peer ?? request.ip;
}

@Controller('identity')
export class IdentityController {
  constructor(
    private readonly identityAuth: IdentityAuthService,
    private readonly installationAuth: InstallationAuthService,
  ) {}

  @Post('installation/challenge')
  createInstallationChallenge(@Body() body: unknown, @Req() request: IdentityRequest) {
    return this.installationAuth.createChallenge(body, identityClientAddress(request));
  }

  @Post('installation/exchange')
  exchangeInstallationProof(@Body() body: unknown, @Req() request: IdentityRequest) {
    return this.installationAuth.exchange(body, identityClientAddress(request));
  }

  @Get('me')
  getIdentity(@Headers('x-device-id') deviceId?: string) {
    return {
      id: resolveDeviceId(deviceId),
      type: 'anonymous-device',
    };
  }

  @Post('attestation/challenge')
  createAttestationChallenge(@Req() request: IdentityRequest) {
    return this.identityAuth.createAttestationChallenge(identityClientAddress(request));
  }

  @Post('attestation/register')
  registerAttestedDevice(@Body() body: unknown) {
    return this.identityAuth.registerAttestedDevice(body);
  }

  @Post('token/challenge')
  createTokenChallenge(@Body() body: unknown) {
    return this.identityAuth.createTokenChallenge(body);
  }

  @Post('token/refresh')
  refreshDeviceToken(@Body() body: unknown) {
    return this.identityAuth.issueDeviceToken(body);
  }
}
