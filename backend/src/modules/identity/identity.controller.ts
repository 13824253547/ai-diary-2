import { Body, Controller, Get, Headers, Post, Req } from '@nestjs/common';
import { resolveDeviceId } from '../../common/device-identity';
import { IdentityAuthService } from './identity-auth.service';

@Controller('identity')
export class IdentityController {
  constructor(private readonly identityAuth: IdentityAuthService) {}

  @Get('me')
  getIdentity(@Headers('x-device-id') deviceId?: string) {
    return {
      id: resolveDeviceId(deviceId),
      type: 'anonymous-device',
    };
  }

  @Post('attestation/challenge')
  createAttestationChallenge(@Req() request: { ip?: string; socket?: { remoteAddress?: string } }) {
    return this.identityAuth.createAttestationChallenge(request.socket?.remoteAddress ?? request.ip);
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
