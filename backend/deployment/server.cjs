require('reflect-metadata');
const { NestFactory } = require('@nestjs/core');
const { AppModule } = require('../dist/app.module');
const { configureApiBodyParser } = require('../dist/common/api-body-parser');
const { devRequestDiagnostics } = require('../dist/common/dev-request-diagnostics.middleware');

// Host networking keeps the trusted proxy on loopback, without exposing the API.
async function start() {
  const app = await NestFactory.create(AppModule, { bodyParser: false });
  configureApiBodyParser(app);
  app.use(devRequestDiagnostics);
  app.setGlobalPrefix('api');
  app.enableShutdownHooks();
  await app.listen(Number(process.env.PORT || 3001), '127.0.0.1');
}

start().catch(() => {
  console.error('Backend startup failed; check protected service configuration.');
  process.exitCode = 1;
});
