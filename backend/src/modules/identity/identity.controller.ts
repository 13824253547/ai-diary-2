import { Controller, Get, Headers } from '@nestjs/common';
import { resolveDeviceId } from '../../common/device-identity';

@Controller('identity')
export class IdentityController {
  @Get('me')
  getIdentity(@Headers('x-device-id') deviceId?: string) {
    return {
      id: resolveDeviceId(deviceId),
      type: 'anonymous-device',
    };
  }
}
