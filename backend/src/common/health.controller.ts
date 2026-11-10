import { Controller, Get } from '@nestjs/common';
import { PublicRoute } from '../modules/auth/auth-request';

@Controller('health')
export class HealthController {
  @Get()
  @PublicRoute()
  getHealth() {
    return {
      ok: true,
      service: 'orange-glow-ai-diary-backend',
      version: '0.1.0',
    };
  }
}
