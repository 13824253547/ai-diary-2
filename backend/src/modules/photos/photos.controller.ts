import { Controller, Get, Headers } from '@nestjs/common';
import { resolveDeviceId } from '../../common/device-identity';

@Controller('photos')
export class PhotosController {
  @Get('capabilities')
  getCapabilities(@Headers('x-device-id') deviceId?: string) {
    resolveDeviceId(deviceId);
    return {
      ok: true,
      data: {
        source: 'device-client',
        permissions: ['full', 'limited', 'denied', 'revoked'],
      },
    };
  }
}
