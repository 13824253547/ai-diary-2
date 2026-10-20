import { Controller, Get, Headers } from '@nestjs/common';
import { resolveDeviceId } from './device-identity';

@Controller('health')
export class HealthController {
  @Get()
  getHealth(@Headers('x-device-id') deviceId?: string) {
    resolveDeviceId(deviceId);
    return {
      ok: true,
      service: 'orange-glow-ai-diary-backend',
      version: '0.1.0',
    };
  }
}
