const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { Readable, Writable } = require('node:stream');
const { pipeline } = require('node:stream/promises');
const test = require('node:test');
const {
  validTarget, supportedComposeVersion, validateNginx, productionValues,
  createBackupDirectory, provisioningScript, validatePrismaVersions, dependencyFingerprint, uploadProgress, imageDependencyLayers,
  hasKnownLayerLayout,
} = require('./deploy-backend.cjs');

const release1 = 'r20261119010203-1234abcd';
const release2 = 'r20261119010204-1234abcd';
const release3 = 'r20261119010205-1234abcd';
const release0 = 'r20261119010202-1234abcd';
const release4 = 'r20261119010206-1234abcd';
const release5 = 'r20261119010207-1234abcd';
const release6 = 'r20261119010208-1234abcd';
const nginxSource = 'location ^~ /api/ {\n    proxy_pass http://127.0.0.1:3001;\n}\n';
const values = {
  PET_CHAT_PROVIDER: 'ark-openai-compatible',
  PET_CHAT_BASE_URL: 'https://provider.example.test/v1',
  PET_CHAT_MODEL: 'model',
  PET_CHAT_API_KEY: 'test-key',
  SMTP_HOST: 'smtp.example.test',
  SMTP_PORT: '465',
  SMTP_USER: 'sender@example.test',
  SMTP_PASSWORD: "test'$\\password",
  SMTP_FROM: 'sender@example.test',
};

function hash(data) {
  return crypto.createHash('sha256').update(data).digest('hex');
}

test('dependency fingerprint changes only when image dependency configuration changes', t => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'orange-account-fingerprint-'));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  const files = [
    'Dockerfile.production', '.dockerignore', 'package.json', 'package-lock.json',
    'deployment/migration/package.json', 'deployment/migration/package-lock.json',
  ];
  fs.mkdirSync(path.join(directory, 'deployment/migration'), { recursive: true });
  for (const name of files) fs.writeFileSync(path.join(directory, name), `initial ${name}`);
  const first = dependencyFingerprint(directory);
  fs.writeFileSync(path.join(directory, 'source.ts'), 'new complete application code');
  assert.equal(dependencyFingerprint(directory), first);
  for (const name of files) {
    const filename = path.join(directory, name);
    fs.appendFileSync(filename, '\nchanged');
    assert.notEqual(dependencyFingerprint(directory), first, name);
    fs.writeFileSync(filename, `initial ${name}`);
  }
  assert.notEqual(dependencyFingerprint(directory, [['old-layer']]), dependencyFingerprint(directory, [['new-layer']]));
});

test('image fingerprint includes dependency layers but excludes complete code layers', () => {
  const layer = char => `sha256:${char.repeat(64)}`;
  const runtime = [layer('a'), layer('b'), layer('c'), layer('d'), layer('e')];
  const migration = [layer('f'), layer('a'), layer('b')];
  assert.deepEqual(imageDependencyLayers(runtime, migration), [
    [layer('a'), layer('b')], [layer('f'), layer('a')],
  ]);
  assert.throws(() => imageDependencyLayers([], migration));
  assert.throws(() => imageDependencyLayers(runtime, ['invalid', layer('a')]));
  const dockerfile = fs.readFileSync(path.join(__dirname, '../backend/Dockerfile.production'));
  assert.equal(hasKnownLayerLayout(dockerfile), true);
  assert.equal(hasKnownLayerLayout(Buffer.concat([dockerfile, Buffer.from('\n# changed')])), false);
});

test('full upload progress reports sent bytes without prematurely claiming success', async () => {
  const messages = [];
  let time = 0;
  const received = [];
  const tracker = uploadProgress(8, message => messages.push(message), () => {
    time += 5001;
    return time;
  });
  await pipeline(
    Readable.from([Buffer.from('abcd'), Buffer.from('efgh')]),
    tracker,
    new Writable({ write(chunk, _encoding, callback) { received.push(chunk); callback(); } }),
  );
  assert.equal(Buffer.concat(received).toString(), 'abcdefgh');
  assert.match(messages[0], /50%/);
  assert.match(messages[1], /99%/);
  assert.equal(messages.some(message => message.includes('100%')), false);
});

test('rsync reconstructs a complete archive using an unchanged basis', t => {
  if (spawnSync('rsync', ['--version'], { stdio: 'ignore' }).status !== 0) {
    t.skip('rsync is unavailable');
    return;
  }
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'orange-account-rsync-'));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  const previous = crypto.randomBytes(2 * 1024 * 1024);
  const next = Buffer.from(previous);
  next.fill(42, 1024 * 1024, 1024 * 1024 + 4096);
  const source = path.join(directory, 'new.tar');
  const target = path.join(directory, 'seed.tar');
  fs.writeFileSync(source, next);
  fs.writeFileSync(target, previous);
  const result = spawnSync('rsync', [
    '--checksum', '--no-whole-file', '--progress', '--stats', '--', source, target,
  ], { encoding: 'utf8', timeout: 30000 });
  assert.equal(result.status, 0, result.stderr);
  assert.equal(hash(fs.readFileSync(target)), hash(next));
  const matched = result.stdout.match(/(?:^|\n)Matched data:\s*([\d,]+)/i);
  assert.ok(matched, result.stdout);
  assert.ok(Number(matched[1].replaceAll(',', '')) > 1024 * 1024, result.stdout);
});

test('pins the migration CLI to the backend Prisma client version', () => {
  const backendLock = require('../backend/package-lock.json');
  const migrationLock = require('../backend/deployment/migration/package-lock.json');
  assert.doesNotThrow(() => validatePrismaVersions(backendLock, migrationLock));
  assert.throws(() => validatePrismaVersions(backendLock, { packages: {} }));
  assert.throws(() => validatePrismaVersions(backendLock, {
    packages: { 'node_modules/prisma': { version: '0.0.0' } },
  }));
});

test('validates SSH targets, API route, and real-provider configuration', () => {
  assert.equal(validTarget('ubuntu@152.32.225.67'), true);
  assert.equal(validTarget('orange-glow'), true);
  assert.equal(validTarget('-oProxyCommand=bad'), false);
  assert.equal(validTarget('user@host;echo bad'), false);
  assert.equal(supportedComposeVersion('v2.30.0'), true);
  assert.equal(supportedComposeVersion('2.35.1-desktop.1'), true);
  assert.equal(supportedComposeVersion('v2.29.9'), false);
  assert.doesNotThrow(() => validateNginx(nginxSource));
  assert.throws(() => validateNginx('location /other {\nproxy_pass http://127.0.0.1:3001;\n}'));
  assert.throws(() => validateNginx(`${nginxSource}${nginxSource}`));
  assert.equal(productionValues(values).SMTP_PASSWORD, values.SMTP_PASSWORD);
  assert.throws(() => productionValues({ ...values, PET_CHAT_PROVIDER: 'deterministic' }));
  assert.throws(() => productionValues({ ...values, DIARY_GENERATION_PROVIDER: 'deterministic' }));
  assert.doesNotThrow(() => productionValues({ ...values, DIARY_GENERATION_PROVIDER: 'ark-openai-compatible' }));
  assert.throws(() => productionValues({ ...values, SMTP_FROM: 'other@example.test' }));
  assert.throws(() => productionValues({ ...values, PET_CHAT_BASE_URL: 'http://provider.example.test' }));
});

test('creates private local backups and refuses symlinked backup locations', t => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'orange-account-backup-test-'));
  t.after(() => fs.rmSync(home, { recursive: true, force: true }));
  const dir = createBackupDirectory(release1, home);
  assert.equal(fs.statSync(dir).mode & 0o777, 0o700);
  assert.throws(() => createBackupDirectory(release1, home));
  const otherHome = fs.mkdtempSync(path.join(os.tmpdir(), 'orange-account-backup-link-'));
  t.after(() => fs.rmSync(otherHome, { recursive: true, force: true }));
  fs.symlinkSync(dir, path.join(otherHome, '.orange-glow-deploy'));
  assert.throws(() => createBackupDirectory(release2, otherHome));
});

test('provisions isolated credentials once and stages updates without changing the active configuration', t => {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'orange-account-provision-test-'));
  t.after(() => fs.rmSync(temp, { recursive: true, force: true }));
  const shared = path.join(temp, 'shared');
  const releases = path.join(temp, 'releases');
  fs.mkdirSync(path.join(releases, release1), { recursive: true });
  fs.mkdirSync(path.join(releases, release2), { recursive: true });
  const script = provisioningScript
    .replaceAll('/opt/orange-glow-account/shared', shared)
    .replaceAll('/opt/orange-glow-account/releases/', `${releases}/`)
    .replace("os.chown(root + '/' + name, 1000, 1000)", 'pass');
  const invoke = payload => spawnSync('python3', ['-c', script], {
    input: JSON.stringify(payload), encoding: 'utf8',
  });
  const first = invoke({ values, release: release1, expected: 'new', replaceKeys: Object.keys(values) });
  assert.equal(first.status, 0, first.stderr);
  const composeEnv = filename => {
    const compose = path.join(temp, 'compose.yml');
    fs.writeFileSync(compose, `services:\n  app:\n    image: example:test\n    env_file:\n      - path: "${filename}"\n        format: raw\n`);
    const result = spawnSync('docker', ['compose', '-f', compose, 'config', '--format', 'json'], { encoding: 'utf8' });
    assert.equal(result.status, 0, result.stderr);
    return JSON.parse(result.stdout).services.app.environment;
  };
  const active = fs.readFileSync(path.join(shared, 'backend.env'), 'utf8');
  const parsed = composeEnv(path.join(shared, 'backend.env'));
  assert.equal(parsed.SMTP_PASSWORD.replaceAll('$$', '$'), values.SMTP_PASSWORD);
  assert.match(parsed.DATABASE_URL, /^mysql:\/\/orange_account:[a-f0-9]+@127\.0\.0\.1:33308\/orange_account$/);
  assert.equal(parsed.DIARY_GENERATION_PROVIDER, 'ark-openai-compatible');
  assert.equal(fs.statSync(path.join(shared, 'backend.env')).mode & 0o777, 0o600);
  const updated = { ...values, SMTP_PASSWORD: 'new-smtp-password' };
  const second = invoke({ values: updated, release: release2, expected: hash(active), replaceKeys: Object.keys(values) });
  assert.equal(second.status, 0, second.stderr);
  assert.equal(fs.readFileSync(path.join(shared, 'backend.env'), 'utf8'), active);
  const candidate = composeEnv(path.join(releases, release2, 'backend-candidate.env'));
  assert.equal(candidate.SMTP_PASSWORD, 'new-smtp-password');
  assert.equal(candidate.ACCOUNT_AUTH_JWT_SECRET, parsed.ACCOUNT_AUTH_JWT_SECRET);
  assert.equal(candidate.DATABASE_URL, parsed.DATABASE_URL);
  const conflict = invoke({ values, release: release2, expected: '0'.repeat(64), replaceKeys: Object.keys(values) });
  assert.notEqual(conflict.status, 0);
  assert.equal(fs.readFileSync(path.join(shared, 'backend.env'), 'utf8'), active);
});

test('Docker passes raw secret characters to a container unchanged', t => {
  if (spawnSync('docker', ['image', 'inspect', 'python:3.11-slim'], { stdio: 'ignore' }).status !== 0) {
    t.skip('Local python:3.11-slim image or Docker daemon is unavailable.');
    return;
  }
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'orange-account-raw-env-test-'));
  t.after(() => fs.rmSync(temp, { recursive: true, force: true }));
  const secret = "test'$\\password#tail";
  const envFile = path.join(temp, 'test.env');
  const compose = path.join(temp, 'compose.yml');
  fs.writeFileSync(envFile, `TEST_SECRET=${secret}\n`, { mode: 0o600 });
  fs.writeFileSync(compose, `services:
  app:
    image: python:3.11-slim
    network_mode: none
    env_file:
      - path: "${envFile}"
        format: raw
    command: ["python", "-c", "import os,sys; sys.stdout.write(os.environ['TEST_SECRET'])"]
`);
  const result = spawnSync('docker', [
    'compose', '-p', 'orange-account-raw-env-test', '-f', compose,
    'run', '--rm', '--no-deps', '--pull', 'never', 'app',
  ], { encoding: 'utf8', timeout: 60_000 });
  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.stdout, secret);
});

function fakeBin(directory, name, script) {
  const filename = path.join(directory, name);
  fs.writeFileSync(filename, script, { mode: 0o755 });
}

test('remote activation preserves isolated data and rolls back a failed route reload', t => {
  const temp = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'orange-account-remote-test-')));
  t.after(() => fs.rmSync(temp, { recursive: true, force: true }));
  const accountRoot = path.join(temp, 'account');
  const nginx = path.join(temp, 'nginx.conf');
  const bin = path.join(temp, 'bin');
  const log = path.join(temp, 'commands.log');
  const reloadCount = path.join(temp, 'reload-count');
  fs.mkdirSync(bin);
  fs.writeFileSync(nginx, nginxSource);
  fakeBin(bin, 'docker', `#!/bin/bash
echo "$*" >> "$MOCK_LOG"
if [ "$1" = inspect ]; then
  if [[ "$3" == *Mounts* ]]; then echo "$MOCK_ROOT/shared/mysql-data"; else echo healthy; fi
elif [ "$1" = image ] && [ "$2" = inspect ] && [ -n "\${MOCK_RUNTIME_LAYERS:-}" ]; then
  if [[ "$*" == *-migration* ]]; then echo "$MOCK_MIGRATION_LAYERS"; else echo "$MOCK_RUNTIME_LAYERS"; fi
elif [ "$1" = compose ] && [[ "$*" == *" ps -q mysql"* ]]; then echo mysql-id
elif [ "$1" = compose ] && [[ "$*" == *" ps -q backend"* ]]; then echo backend-id
elif [ "$1" = compose ] && [[ "$*" == *"prisma migrate status"* ]] && [ "\${MOCK_PENDING:-0}" = 1 ]; then exit 1
elif [ "$1" = exec ]; then printf '%s' "\${MOCK_TABLES:-}"
fi
`);
  fakeBin(bin, 'nginx', '#!/bin/bash\nexit 0\n');
  fakeBin(bin, 'systemctl', `#!/bin/bash
if [ "\${MOCK_FAIL_RELOAD_ONCE:-0}" = 1 ] && [ ! -e "$MOCK_RELOAD_COUNT" ]; then
  touch "$MOCK_RELOAD_COUNT"
  exit 1
fi
exit 0
`);
  fakeBin(bin, 'sleep', '#!/bin/bash\nexit 0\n');
  fakeBin(bin, 'mv', `#!/bin/bash
if [ "$1" = -Tf ]; then exec python3 -c 'import os,sys; os.replace(sys.argv[1],sys.argv[2])' "$2" "$3"; fi
exec /bin/mv "$@"
`);
  const original = fs.readFileSync(path.join(__dirname, '../backend/deployment/deploy-account-remote.sh'), 'utf8');
  const script = original
    .replace('root=/opt/orange-glow-account', `root=${JSON.stringify(accountRoot)}`)
    .replace('nginx_file=/etc/nginx/orange-glow.locations.conf', `nginx_file=${JSON.stringify(nginx)}`);
  const env = { ...process.env, PATH: `${bin}:${process.env.PATH}`, MOCK_LOG: log, MOCK_ROOT: accountRoot, MOCK_RELOAD_COUNT: reloadCount };
  const execute = (action, release, archiveSha = '', nginxSha = '', envSha = '', extraEnv = {}) =>
    spawnSync('bash', ['-s', '--', action, release, archiveSha, nginxSha, envSha], {
      input: script, env: { ...env, ...extraEnv }, encoding: 'utf8',
    });
  const setupRelease = (release, candidate) => {
    assert.equal(execute('stage', release).status, 0);
    const dir = path.join(accountRoot, 'releases', release);
    fs.writeFileSync(path.join(dir, 'images.tar'), `image-${release}`);
    fs.writeFileSync(path.join(dir, 'compose.account.yml'), 'same-compose');
    fs.writeFileSync(path.join(dir, 'backend-candidate.env'), candidate);
    return dir;
  };

  const zeroDir = setupRelease(release0, 'initial backend configuration\n');
  fs.unlinkSync(path.join(zeroDir, 'images.tar'));
  const initialSeed = execute('seed-archive', release0, 'a'.repeat(64), 'c'.repeat(64));
  assert.equal(initialSeed.status, 0, initialSeed.stderr);
  assert.equal(initialSeed.stdout.trim(), 'full-initial');
  fs.writeFileSync(path.join(zeroDir, 'images.tar'), `image-${release0}`);
  fs.mkdirSync(path.join(accountRoot, 'shared', 'mysql-data'), { recursive: true });
  fs.mkdirSync(path.join(accountRoot, 'shared', 'photo-assets'));
  fs.mkdirSync(path.join(accountRoot, 'shared', 'generation-tmp'));
  fs.writeFileSync(path.join(accountRoot, 'shared', 'backend.env'), 'initial backend configuration\n');
  fs.writeFileSync(path.join(accountRoot, 'shared', 'mysql.env'), 'mysql configuration\n');
  const nonempty = execute('activate', release0, hash(`image-${release0}`), hash(nginxSource), 'new', { MOCK_TABLES: 'existing_table' });
  assert.notEqual(nonempty.status, 0);
  assert.equal(fs.existsSync(path.join(accountRoot, 'shared', 'migration.inprogress')), false);
  assert.equal(fs.readFileSync(nginx, 'utf8'), nginxSource);
  assert.equal(execute('unlock', release0).status, 0);

  const firstDir = setupRelease(release1, 'initial backend configuration\n');
  const first = execute('activate', release1, hash(`image-${release1}`), hash(nginxSource), 'new');
  assert.equal(first.status, 0, first.stderr);
  assert.equal(fs.readlinkSync(path.join(accountRoot, 'current')), firstDir);
  assert.match(fs.readFileSync(nginx, 'utf8'), /127\.0\.0\.1:3002/);
  assert.equal(execute('unlock', release1).status, 0);

  const originalEnv = fs.readFileSync(path.join(accountRoot, 'shared', 'backend.env'), 'utf8');
  const previousRoute = fs.readFileSync(nginx, 'utf8');
  const secondDir = setupRelease(release2, 'updated backend configuration\n');
  fs.unlinkSync(path.join(secondDir, 'images.tar'));
  const noBaseline = execute('seed-archive', release2, 'a'.repeat(64), 'c'.repeat(64));
  assert.equal(noBaseline.status, 0, noBaseline.stderr);
  assert.equal(noBaseline.stdout.trim(), 'full-no-baseline');
  const layer = char => `sha256:${char.repeat(64)}`;
  const runtimeLayers = [layer('a'), layer('b'), layer('c'), layer('d'), layer('e')];
  const migrationLayers = [layer('f'), layer('a'), layer('b')];
  const layerSha = hash(JSON.stringify(imageDependencyLayers(runtimeLayers, migrationLayers)));
  const verifiedImage = execute('seed-archive', release2, 'a'.repeat(64), layerSha, '', {
    MOCK_RUNTIME_LAYERS: JSON.stringify(runtimeLayers),
    MOCK_MIGRATION_LAYERS: JSON.stringify(migrationLayers),
  });
  assert.equal(verifiedImage.status, 0, verifiedImage.stderr);
  assert.equal(verifiedImage.stdout.trim(), 'seeded');
  assert.equal(fs.readFileSync(path.join(secondDir, 'images.tar'), 'utf8'), `image-${release1}`);
  fs.unlinkSync(path.join(secondDir, 'images.tar'));
  fs.writeFileSync(path.join(firstDir, 'dependency.sha256'), `${'a'.repeat(64)}\n`);
  const seeded = execute('seed-archive', release2, 'a'.repeat(64), layerSha);
  assert.equal(seeded.status, 0, seeded.stderr);
  assert.equal(seeded.stdout.trim(), 'seeded');
  assert.equal(fs.readFileSync(path.join(secondDir, 'images.tar'), 'utf8'), `image-${release1}`);
  fs.writeFileSync(path.join(secondDir, 'images.tar'), `image-${release2}`);
  assert.equal(fs.readFileSync(path.join(firstDir, 'images.tar'), 'utf8'), `image-${release1}`);
  const corrupt = execute('activate', release2, '0'.repeat(64), hash(previousRoute), hash(originalEnv));
  assert.notEqual(corrupt.status, 0);
  assert.equal(fs.readFileSync(nginx, 'utf8'), previousRoute);
  const failed = execute('activate', release2, hash(`image-${release2}`), hash(previousRoute), hash(originalEnv), { MOCK_FAIL_RELOAD_ONCE: '1' });
  assert.notEqual(failed.status, 0);
  assert.equal(fs.readFileSync(nginx, 'utf8'), previousRoute);
  assert.equal(fs.readFileSync(path.join(accountRoot, 'shared', 'backend.env'), 'utf8'), originalEnv);
  assert.equal(fs.readlinkSync(path.join(accountRoot, 'current')), firstDir);
  assert.match(fs.readFileSync(log, 'utf8'), new RegExp(`${release1}/release.env.*up -d --no-deps backend`));
  assert.equal(execute('unlock', release2).status, 0);

  setupRelease(release3, 'updated backend configuration\n');
  const pending = execute('activate', release3, hash(`image-${release3}`), hash(previousRoute), hash(originalEnv), { MOCK_PENDING: '1' });
  assert.notEqual(pending.status, 0);
  assert.equal(fs.readFileSync(nginx, 'utf8'), previousRoute);
  assert.equal(fs.readFileSync(path.join(accountRoot, 'shared', 'backend.env'), 'utf8'), originalEnv);
  assert.equal(fs.readlinkSync(path.join(accountRoot, 'current')), firstDir);
  assert.equal(execute('unlock', release3).status, 0);

  setupRelease(release4, 'updated backend configuration\n');
  const photoPath = path.join(accountRoot, 'shared', 'photo-assets');
  fs.renameSync(photoPath, `${photoPath}-original`);
  fs.symlinkSync(`${photoPath}-original`, photoPath);
  const linked = execute('activate', release4, hash(`image-${release4}`), hash(previousRoute), hash(originalEnv));
  assert.notEqual(linked.status, 0);
  assert.equal(fs.readFileSync(nginx, 'utf8'), previousRoute);
  assert.equal(execute('unlock', release4).status, 0);

  const fifthDir = setupRelease(release5, 'updated backend configuration\n');
  fs.unlinkSync(path.join(fifthDir, 'images.tar'));
  const changed = execute('seed-archive', release5, 'b'.repeat(64), 'c'.repeat(64));
  assert.equal(changed.status, 0, changed.stderr);
  assert.equal(changed.stdout.trim(), 'full-dependencies-changed');
  assert.equal(fs.existsSync(path.join(fifthDir, 'images.tar')), false);
  assert.equal(execute('unlock', release5).status, 0);

  const sixthDir = setupRelease(release6, 'updated backend configuration\n');
  fs.unlinkSync(path.join(sixthDir, 'images.tar'));
  const fingerprint = path.join(firstDir, 'dependency.sha256');
  fs.renameSync(fingerprint, `${fingerprint}.real`);
  fs.symlinkSync(`${fingerprint}.real`, fingerprint);
  const linkedFingerprint = execute('seed-archive', release6, 'a'.repeat(64), 'c'.repeat(64));
  assert.notEqual(linkedFingerprint.status, 0);
  assert.equal(fs.existsSync(path.join(sixthDir, 'images.tar')), false);
  assert.equal(execute('unlock', release6).status, 0);
});
