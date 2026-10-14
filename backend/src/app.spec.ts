import { Test } from '@nestjs/testing';
import { AppModule } from './app.module';
import { HealthController } from './common/health.controller';

describe('AppModule', () => {
  it('creates the health controller', async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    const controller = moduleRef.get(HealthController);
    expect(controller.getHealth()).toEqual({
      ok: true,
      service: 'orange-glow-ai-diary-backend',
      version: '0.1.0',
    });
  });
});
