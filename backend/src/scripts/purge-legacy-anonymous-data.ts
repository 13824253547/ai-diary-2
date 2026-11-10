import { createHash } from 'node:crypto';
import { rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { PrismaClient } from '@prisma/client';
import { validateE2eDatabaseEnvironment } from './run-e2e-tests';

const OWNER_TABLES = [
  'Diary',
  'Draft',
  'SaveCommand',
  'GenerationJob',
  'DiscoveryStory',
  'DiscoveryLike',
  'MaterialPhoto',
  'MaterialPhotoQuota',
  'DiaryPhotoCopy',
  'DiaryAnchorExtraction',
  'DiaryAnchor',
  'AnchorCorrection',
  'AnchorCorrectionCommand',
  'ChatConversation',
  'ChatTurn',
  'ChatDailyAnchor',
  'ChatDailyAnchorSource',
  'ChatAnchorCorrection',
  'ChatAnchorCorrectionCommand',
  'GrowthFlower',
  'GrowthRecognitionRun',
  'GrowthMilestone',
  'GrowthInsightReport',
  'GrowthReportJob',
] as const;

const LEGACY_AUTH_TABLES = ['AppAttestChallenge', 'AppAttestRateLimit', 'AppAttestDevice'] as const;
const DEPENDENT_TABLES = ['ChatMessage'] as const;
const OWNER_TABLE_SET = new Set<string>(OWNER_TABLES);
const DEPENDENT_TABLE_SET = new Set<string>(DEPENDENT_TABLES);

function argumentValue(prefix: string) {
  return process.argv.find(value => value.startsWith(prefix))?.slice(prefix.length);
}

function validateTarget() {
  const databaseUrl = process.env.DATABASE_URL;
  const e2eUrl = process.env.E2E_DATABASE_URL;
  const production = process.argv.includes('--production');
  if (!production) {
    validateE2eDatabaseEnvironment(e2eUrl, databaseUrl);
    const assetRoot = process.env.PHOTO_ASSET_STORAGE_DIR;
    const tempRoot = process.env.DIARY_GENERATION_TMP_DIR;
    if (!assetRoot || !tempRoot || !path.isAbsolute(assetRoot) || !path.isAbsolute(tempRoot)) {
      throw new Error('E2E purge requires explicit absolute media and temporary roots.');
    }
    for (const root of [assetRoot, tempRoot]) {
      const resolved = path.resolve(root);
      if (!resolved.startsWith(`${tmpdir()}${path.sep}`)
        || !path.basename(resolved).startsWith('account-auth-purge-e2e-')) {
        throw new Error('E2E purge media roots must be isolated account-auth-purge-e2e-* directories under the system temp folder.');
      }
    }
    return { assetRoot: path.resolve(assetRoot), tempRoot: path.resolve(tempRoot) };
  }

  if (!databaseUrl) throw new Error('Production purge requires DATABASE_URL from the approved target environment.');
  let databaseName: string;
  try {
    databaseName = decodeURIComponent(new URL(databaseUrl).pathname.replace(/^\/+/, ''));
  } catch {
    throw new Error('Production DATABASE_URL is invalid.');
  }
  if (!databaseName || argumentValue('--confirm-production-database=') !== databaseName
    || !process.argv.includes('--confirm-delete-anonymous-data')) {
    throw new Error('Production purge requires --confirm-delete-anonymous-data and the exact --confirm-production-database=<name>.');
  }
  const assetRoot = process.env.PHOTO_ASSET_STORAGE_DIR;
  const tempRoot = process.env.DIARY_GENERATION_TMP_DIR;
  if (!assetRoot || !tempRoot || !path.isAbsolute(assetRoot) || !path.isAbsolute(tempRoot)) {
    throw new Error('Production purge requires explicit absolute media and temporary roots.');
  }
  return { assetRoot: path.resolve(assetRoot), tempRoot: path.resolve(tempRoot) };
}

async function inspect(prisma: PrismaClient) {
  const tables: Array<{ table: string; rows: number }> = [];
  const owners = new Set<string>();
  for (const table of OWNER_TABLES) {
    const result = await prisma.$queryRawUnsafe<Array<{ count: bigint | number }>>(
      `SELECT COUNT(*) AS count FROM \`${table}\``,
    );
    tables.push({ table, rows: Number(result[0]?.count ?? 0) });
    const rows = await prisma.$queryRawUnsafe<Array<{ ownerDeviceId: string }>>(
      `SELECT DISTINCT \`ownerDeviceId\` FROM \`${table}\` WHERE \`ownerDeviceId\` IS NOT NULL`,
    );
    rows.forEach(row => owners.add(row.ownerDeviceId));
  }
  for (const table of DEPENDENT_TABLES) {
    const result = await prisma.$queryRawUnsafe<Array<{ count: bigint | number }>>(
      `SELECT COUNT(*) AS count FROM \`${table}\``,
    );
    tables.push({ table, rows: Number(result[0]?.count ?? 0) });
  }
  return { tables, owners: [...owners] };
}

function ownerFolder(ownerId: string) {
  return Buffer.from(ownerId).toString('base64url');
}

async function directoryExists(filePath: string) {
  try {
    return (await stat(filePath)).isDirectory();
  } catch {
    return false;
  }
}

async function removeOwnerFiles(ownerId: string, assetRoot: string, tempRoot: string) {
  const ownerPath = ownerFolder(ownerId);
  const generationPath = createHash('sha256').update(ownerId).digest('hex');
  const paths = [
    path.join(assetRoot, 'materials', ownerPath),
    path.join(assetRoot, 'diaries', ownerPath),
    path.join(tempRoot, generationPath),
  ];
  for (const target of paths) {
    const resolved = path.resolve(target);
    const allowedRoot = resolved.startsWith(`${assetRoot}${path.sep}`)
      ? assetRoot
      : resolved.startsWith(`${tempRoot}${path.sep}`)
        ? tempRoot
        : undefined;
    if (!allowedRoot || resolved === allowedRoot) throw new Error('Refusing to remove a path outside the configured asset roots.');
    await rm(resolved, { recursive: true, force: true });
  }
}

async function purge(prisma: PrismaClient) {
  await prisma.$transaction(async tx => {
    await tx.$executeRawUnsafe('SET FOREIGN_KEY_CHECKS = 0');
    try {
      for (const table of DEPENDENT_TABLES) {
        if (!DEPENDENT_TABLE_SET.has(table)) throw new Error('Purge dependency table is not allowlisted.');
        await tx.$executeRawUnsafe(`DELETE FROM \`${table}\``);
      }
      for (const table of OWNER_TABLES) {
        if (!OWNER_TABLE_SET.has(table)) throw new Error('Purge table is not allowlisted.');
        await tx.$executeRawUnsafe(`DELETE FROM \`${table}\``);
      }
      for (const table of LEGACY_AUTH_TABLES) {
        await tx.$executeRawUnsafe(`DELETE FROM \`${table}\``);
      }
    } finally {
      await tx.$executeRawUnsafe('SET FOREIGN_KEY_CHECKS = 1');
    }
  });
}

async function main() {
  const dryRun = process.argv.includes('--dry-run');
  const confirmed = process.argv.includes('--confirm-delete-anonymous-data');
  if (!dryRun && !confirmed) {
    throw new Error('Choose --dry-run or pass --confirm-delete-anonymous-data.');
  }
  const roots = validateTarget();
  const prisma = new PrismaClient();
  try {
    const inventory = await inspect(prisma);
    let mediaDirectories = 0;
    for (const owner of inventory.owners) {
      const base = ownerFolder(owner);
      const hash = createHash('sha256').update(owner).digest('hex');
      for (const directory of [
        path.join(roots.assetRoot, 'materials', base),
        path.join(roots.assetRoot, 'diaries', base),
        path.join(roots.tempRoot, hash),
      ]) {
        if (await directoryExists(directory)) mediaDirectories += 1;
      }
    }
    console.log(JSON.stringify({
      mode: dryRun ? 'dry-run' : 'confirmed-purge',
      legacyOwnerCount: inventory.owners.length,
      tables: inventory.tables,
      mediaDirectories,
    }));
    if (dryRun) return;

    for (const owner of inventory.owners) {
      await removeOwnerFiles(owner, roots.assetRoot, roots.tempRoot);
    }
    await purge(prisma);
    console.log('Legacy anonymous database rows and media directories were removed.');
  } finally {
    await prisma.$disconnect();
  }
}

if (require.main === module) {
  void main().catch(error => {
    console.error(error instanceof Error ? error.message : 'Legacy anonymous data cleanup failed.');
    process.exitCode = 1;
  });
}
