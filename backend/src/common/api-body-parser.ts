import type { INestApplication } from '@nestjs/common';

type ApiBodyParserApplication = {
  useBodyParser(
    parser: 'json' | 'urlencoded',
    options?: { strict?: boolean; extended?: boolean },
  ): unknown;
};

export function configureApiBodyParser(app: INestApplication) {
  const parserApp = app as unknown as ApiBodyParserApplication;
  parserApp.useBodyParser('json', { strict: false });
  parserApp.useBodyParser('urlencoded', { extended: true });
}
