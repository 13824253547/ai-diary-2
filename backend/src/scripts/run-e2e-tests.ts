import { spawnSync } from 'node:child_process';
import path from 'node:path';

const backendRoot = path.resolve(__dirname, '../..');

export function validateE2eDatabaseUrl(value: string | undefined) {
  if (!value) {
    throw new Error('Set E2E_DATABASE_URL to a disposable local e2e database.');
  }

  let databaseUrl: URL;
  try {
    databaseUrl = new URL(value);
  } catch {
    throw new Error('E2E_DATABASE_URL must be a valid MySQL URL.');
  }

  if (databaseUrl.protocol !== 'mysql:') {
    throw new Error('E2E_DATABASE_URL must use the MySQL protocol.');
  }

  if (!['localhost', '127.0.0.1', '[::1]'].includes(databaseUrl.hostname)) {
    throw new Error('E2E_DATABASE_URL must point to a local MySQL server.');
  }

  const databaseName = decodeURIComponent(databaseUrl.pathname.replace(/^\/+/, ''));
  if (!/^ai_diary_(test|e2e)(_[a-z0-9]+)*$/i.test(databaseName)) {
    throw new Error('E2E_DATABASE_URL must target an ai_diary_test_* or ai_diary_e2e_* database.');
  }

  return value;
}

export function validateE2eDatabaseEnvironment(
  e2eDatabaseUrl: string | undefined,
  databaseUrl: string | undefined,
) {
  const safeDatabaseUrl = validateE2eDatabaseUrl(e2eDatabaseUrl);
  if (databaseUrl !== safeDatabaseUrl) {
    throw new Error('DATABASE_URL must match the validated E2E_DATABASE_URL.');
  }
  return safeDatabaseUrl;
}

export function runE2eTests(args: string[], databaseUrl = process.env.E2E_DATABASE_URL) {
  const safeDatabaseUrl = validateE2eDatabaseUrl(databaseUrl);
  const jestPath = require.resolve('jest/bin/jest', { paths: [backendRoot] });
  const result = spawnSync(
    process.execPath,
    [jestPath, '--runInBand', '--config', 'test/jest-e2e.json', ...args],
    {
      cwd: backendRoot,
      env: {
        ...process.env,
        E2E_DATABASE_URL: safeDatabaseUrl,
        DATABASE_URL: safeDatabaseUrl,
        REDIS_URL: process.env.REDIS_URL ?? 'redis://127.0.0.1:36379',
      },
      stdio: 'inherit',
    },
  );

  if (result.error) {
    throw result.error;
  }

  return result.status ?? 1;
}

if (require.main === module) {
  try {
    process.exitCode = runE2eTests(process.argv.slice(2));
  } catch (error) {
    console.error(error instanceof Error ? error.message : 'Unable to start backend e2e tests.');
    process.exitCode = 2;
  }
}
