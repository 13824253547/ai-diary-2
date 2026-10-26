import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { configureApiBodyParser } from './common/api-body-parser';
import { devRequestDiagnostics } from './common/dev-request-diagnostics.middleware';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, { bodyParser: false });
  configureApiBodyParser(app);
  app.use(devRequestDiagnostics);
  app.setGlobalPrefix('api');
  await app.listen(process.env.PORT ? Number(process.env.PORT) : 3001);
}

void bootstrap();
