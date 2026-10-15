import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { PrismaClient } from '@prisma/client';

const requiredConfirmation = '--confirm-current-schema-is-final';
const migrationNames = [
  '20261015000000_initial_schema',
  '20261015001000_diary_content_snapshot',
];
const backendRoot = path.resolve(__dirname, '..');
const prismaCliPath = require.resolve('prisma/build/index.js');

function runPrisma(args: string[]) {
  const result = spawnSync(process.execPath, [prismaCliPath, ...args], {
    cwd: backendRoot,
    env: process.env,
    encoding: 'utf8',
  });
  if (result.error) throw result.error;
  return result;
}

function requirePrismaSuccess(args: string[]) {
  const result = runPrisma(args);
  if (result.status !== 0) {
    throw new Error(`${args.join(' ')} failed:\n${result.stdout}${result.stderr}`);
  }
  if (result.stdout) process.stdout.write(result.stdout);
}

async function baselineExistingDatabase() {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) throw new Error('DATABASE_URL is required.');
  if (!process.argv.includes(requiredConfirmation)) {
    throw new Error(`Pass ${requiredConfirmation} after verifying the target database.`);
  }

  const prisma = new PrismaClient();
  try {
    const migrationTable = await prisma.$queryRaw<Array<{ tableName: string }>>`
      SELECT table_name AS tableName
      FROM information_schema.tables
      WHERE table_schema = DATABASE()
        AND table_name = '_prisma_migrations'
    `;
    const history = migrationTable.length
      ? await prisma.$queryRaw<Array<{
        migration_name: string;
        finished_at: Date | null;
        rolled_back_at: Date | null;
      }>>`
        SELECT migration_name, finished_at, rolled_back_at
        FROM _prisma_migrations
        ORDER BY started_at
      `
      : [];

    if (history.length > migrationNames.length) {
      throw new Error('Existing migration history contains unknown entries; refusing to baseline.');
    }
    history.forEach((entry, index) => {
      if (
        entry.migration_name !== migrationNames[index]
        || entry.finished_at === null
        || entry.rolled_back_at !== null
      ) {
        throw new Error('Existing migration history is not a clean prefix; refusing to baseline.');
      }
    });

    const diff = runPrisma([
      'migrate',
      'diff',
      '--exit-code',
      '--from-url',
      databaseUrl,
      '--to-schema-datamodel',
      'prisma/schema.prisma',
    ]);
    if (diff.error) throw diff.error;
    if (diff.status === 2) {
      throw new Error(`Database schema differs from the current Prisma datamodel; refusing to baseline:\n${diff.stdout}${diff.stderr}`);
    }
    if (diff.status !== 0) {
      throw new Error(`Unable to verify database schema before baselining:\n${diff.stdout}${diff.stderr}`);
    }
    if (diff.stdout) process.stdout.write(diff.stdout);

    for (const migrationName of migrationNames.slice(history.length)) {
      requirePrismaSuccess(['migrate', 'resolve', '--applied', migrationName]);
    }
    requirePrismaSuccess(['migrate', 'status']);
  } finally {
    await prisma.$disconnect();
  }
}

baselineExistingDatabase().catch(error => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
