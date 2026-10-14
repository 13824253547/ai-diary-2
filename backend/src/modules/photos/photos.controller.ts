import { Controller, Get } from '@nestjs/common';

@Controller('photos')
export class PhotosController {
  @Get('capabilities')
  getCapabilities() {
    return {
      ok: true,
      data: {
        source: 'device-client',
        permissions: ['full', 'limited', 'denied', 'revoked'],
      },
    };
  }
}
