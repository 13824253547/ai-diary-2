import { Controller, Get } from '@nestjs/common';

@Controller('health')
export class HealthController {
  @Get()
  getHealth() {
    return {
      ok: true,
      service: 'orange-glow-ai-diary-backend',
      version: '0.1.0',
    };
  }
}
