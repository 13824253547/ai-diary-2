#!/usr/bin/env node

const crypto = require('node:crypto');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawn, spawnSync } = require('node:child_process');
const { Transform } = require('node:stream');
const { pipeline } = require('node:stream/promises');

const root = path.resolve(__dirname, '..');
const backend = path.join(root, 'backend');
const remoteRoot = '/opt/orange-glow-account';
const nginxFile = '/etc/nginx/orange-glow.locations.conf';
const remoteScript = fs.readFileSync(path.join(backend, 'deployment/deploy-account-remote.sh'), 'utf8');
const dependencyFiles = [
  'Dockerfile.production', '.dockerignore', 'package.json', 'package-lock.json',
  'deployment/migration/package.json', 'deployment/migration/package-lock.json',
];
// Only this reviewed Dockerfile layout supports the code-layer exclusions below.
const knownLayerLayoutDockerfileSha = 'f5b9ec2addc234ab1c5372634d4e2da627ad056905d1ae563753b88db44010b5';
const allowedEnvironmentKeys = [
  'PET_CHAT_PROVIDER', 'PET_CHAT_BASE_URL', 'PET_CHAT_MODEL', 'PET_CHAT_API_KEY',
  'PET_CHAT_TIMEOUT_MS', 'PET_CHAT_TEMPERATURE', 'PET_CHAT_MAX_TOKENS', 'PET_CHAT_HISTORY_ITEMS',
  'AI_IMAGE_PROVIDER', 'AI_IMAGE_MODEL', 'AI_IMAGE_API_KEY', 'AI_IMAGE_TIMEOUT_MS', 'AI_IMAGE_SIZE',
  'AI_PROVIDER_TIMEOUT_MS', 'AI_PROVIDER_MAX_ATTEMPTS', 'AI_PROVIDER_RESPONSE_FORMAT',
  'AI_PROVIDER_GENERATION_TEMPERATURE', 'AI_PROVIDER_REWRITE_TEMPERATURE',
  'SMTP_HOST', 'SMTP_PORT', 'SMTP_USER', 'SMTP_PASSWORD', 'SMTP_FROM',
];

function shellQuote(value) {
  return `'${value.replace(/'/g, "'\\''")}'`;
}

function validTarget(value) {
  return /^(?:[a-zA-Z_][a-zA-Z0-9_-]*@)?[a-zA-Z0-9][a-zA-Z0-9.-]*$/.test(value);
}

function supportedComposeVersion(value) {
  const match = value.trim().match(/^v?(\d+)\.(\d+)(?:\.\d+)?(?:[-+].*)?$/);
  return !!match && (Number(match[1]) > 2 || (Number(match[1]) === 2 && Number(match[2]) >= 30));
}

function validatePrismaVersions(backendLock, migrationLock) {
  const version = backendLock.packages?.['node_modules/@prisma/client']?.version;
  if (!version || backendLock.packages?.['node_modules/prisma']?.version !== version
    || migrationLock.packages?.['node_modules/prisma']?.version !== version) {
    throw new Error('Migration Prisma CLI and backend Prisma client versions must match.');
  }
}

function dependencyFingerprint(directory = backend, dependencyLayers = []) {
  const hash = crypto.createHash('sha256');
  for (const name of dependencyFiles) {
    const contents = fs.readFileSync(path.join(directory, name));
    hash.update(`${name}\0${contents.length}\0`);
    hash.update(contents);
  }
  hash.update(JSON.stringify(dependencyLayers));
  return hash.digest('hex');
}

function imageDependencyLayers(runtimeLayers, migrationLayers) {
  const valid = layers => Array.isArray(layers) && layers.every(layer => /^sha256:[a-f0-9]{64}$/.test(layer));
  if (!valid(runtimeLayers) || runtimeLayers.length < 4
    || !valid(migrationLayers) || migrationLayers.length < 2) {
    throw new Error('Could not determine image dependency layers safely.');
  }
  // The Dockerfile ends with runtime client/code/server layers and one migration schema layer.
  return [runtimeLayers.slice(0, -3), migrationLayers.slice(0, -1)];
}

function hasKnownLayerLayout(contents) {
  return crypto.createHash('sha256').update(contents).digest('hex') === knownLayerLayoutDockerfileSha;
}

function inspectImageLayers(tag) {
  return JSON.parse(run('docker', ['image', 'inspect', '--format', '{{json .RootFS.Layers}}', tag], { capture: true }));
}

function validateNginx(text) {
  const apiLocations = [...text.matchAll(/location[ \t]+\^~[ \t]+\/api\/[ \t]*\{([^{}]*)\}/g)];
  const pattern = /^[ \t]*proxy_pass[ \t]+http:\/\/127\.0\.0\.1:(?:3001|3002)[ \t]*;[ \t]*$/gm;
  if (apiLocations.length !== 1 || (text.match(pattern) || []).length !== 1
    || (apiLocations[0][1].match(pattern) || []).length !== 1) {
    throw new Error('Nginx must contain exactly one known API proxy target; manual review required.');
  }
}

function productionValues(source) {
  const values = Object.fromEntries(allowedEnvironmentKeys
    .filter(key => typeof source[key] === 'string' && source[key].trim())
    .map(key => [key, source[key]]));
  const required = [
    'PET_CHAT_PROVIDER', 'PET_CHAT_BASE_URL', 'PET_CHAT_MODEL', 'PET_CHAT_API_KEY',
    'SMTP_HOST', 'SMTP_PORT', 'SMTP_USER', 'SMTP_PASSWORD', 'SMTP_FROM',
  ];
  if (required.some(key => !values[key]?.trim())) {
    throw new Error('First deployment requires AI provider and SMTP settings in backend/.env.');
  }
  if (values.PET_CHAT_PROVIDER !== 'ark-openai-compatible') {
    throw new Error('First deployment requires the real Ark AI provider; mock output is not permitted.');
  }
  if (source.DIARY_GENERATION_PROVIDER?.trim()
    && source.DIARY_GENERATION_PROVIDER.trim() !== 'ark-openai-compatible') {
    throw new Error('DIARY_GENERATION_PROVIDER must be unset or use the real Ark provider.');
  }
  if (new URL(values.PET_CHAT_BASE_URL).protocol !== 'https:') {
    throw new Error('The AI provider URL must use HTTPS.');
  }
  if (values.SMTP_PORT !== '465' || values.SMTP_USER.toLowerCase() !== values.SMTP_FROM.toLowerCase()) {
    throw new Error('SMTP must use SSL port 465 and a sender matching SMTP_USER.');
  }
  for (const value of Object.values(values)) {
    if (/[\r\n\0]/.test(value)) throw new Error('Multiline environment values are not supported.');
  }
  return values;
}

function createBackupDirectory(release, home = os.homedir()) {
  let directory = home;
  for (const segment of ['.orange-glow-deploy', 'backups', release]) {
    directory = path.join(directory, segment);
    try {
      fs.mkdirSync(directory, { mode: 0o700 });
    } catch (error) {
      if (error.code !== 'EEXIST' || segment === release) throw error;
    }
    const info = fs.lstatSync(directory);
    if (!info.isDirectory() || info.isSymbolicLink() || (info.mode & 0o077) !== 0) {
      throw new Error('Local backup directories must be private and must not be symlinks.');
    }
  }
  return directory;
}

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: options.cwd || root,
    input: options.input,
    encoding: options.capture || options.input !== undefined ? 'utf8' : undefined,
    stdio: options.capture ? ['pipe', 'pipe', 'pipe'] : options.input !== undefined
      ? ['pipe', 'inherit', 'inherit']
      : 'inherit',
    maxBuffer: 4 * 1024 * 1024,
  });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error(`${command} failed with exit status ${result.status ?? 'unknown'}.`);
  }
  return options.capture ? result.stdout : undefined;
}

function sshArgs(target, command) {
  return ['-T', '-o', 'BatchMode=yes', '-o', 'StrictHostKeyChecking=yes',
    '-o', 'ConnectTimeout=10', '-o', 'ServerAliveInterval=15',
    '-o', 'ServerAliveCountMax=3', target, command];
}

function ssh(target, command, options) {
  return run('ssh', sshArgs(target, command), options);
}

function remoteAction(target, action, release, archiveSha = '', nginxSha = '', backendEnvSha = '', options) {
  const args = [action, release, archiveSha, nginxSha, backendEnvSha].map(shellQuote).join(' ');
  return ssh(target, `sudo -n bash -s -- ${args}`, { input: remoteScript, ...options });
}

function uploadProgress(total, report = console.log, now = Date.now) {
  let sent = 0;
  let lastReported = now();
  return new Transform({
    transform(chunk, _encoding, callback) {
      sent += chunk.length;
      const current = now();
      if (total > 0 && current - lastReported >= 5000) {
        const percent = Math.min(99, Math.floor(sent * 100 / total));
        report(`Upload: ${percent}% (${(sent / 1048576).toFixed(1)} / ${(total / 1048576).toFixed(1)} MiB sent)`);
        lastReported = current;
      }
      callback(null, chunk);
    },
  });
}

async function uploadFile(target, localFile, remoteFile, showProgress = false) {
  const child = spawn('ssh', sshArgs(target, `sudo -n tee ${shellQuote(remoteFile)} > /dev/null`), {
    cwd: root,
    stdio: ['pipe', 'inherit', 'inherit'],
  });
  const exit = new Promise((resolve, reject) => {
    child.once('error', reject);
    child.once('close', code => code === 0 ? resolve() : reject(new Error('File upload failed.')));
  });
  const source = fs.createReadStream(localFile);
  const transfer = showProgress
    ? pipeline(source, uploadProgress(fs.statSync(localFile).size), child.stdin)
    : pipeline(source, child.stdin);
  await Promise.all([transfer, exit]);
  if (showProgress) console.log('Upload: 100% (transfer complete; verifying on server)');
}

function rsyncAvailable(target) {
  const local = spawnSync('rsync', ['--version'], { stdio: 'ignore' });
  if (local.error || local.status !== 0) return false;
  return ssh(target, "sudo -n sh -c 'if command -v rsync >/dev/null 2>&1; then printf yes; else printf no; fi'", { capture: true }).trim() === 'yes';
}

function rsyncArchive(target, localFile, remoteFile) {
  const sshCommand = 'ssh -T -o BatchMode=yes -o StrictHostKeyChecking=yes -o ConnectTimeout=10 -o ServerAliveInterval=15 -o ServerAliveCountMax=3';
  run('rsync', [
    '--checksum', '--no-whole-file', '--progress', '--stats',
    '-e', sshCommand, '--rsync-path=sudo -n rsync', '--',
    localFile, `${target}:${remoteFile}`,
  ]);
}

async function fileSha256(file) {
  const hash = crypto.createHash('sha256');
  for await (const chunk of fs.createReadStream(file)) hash.update(chunk);
  return hash.digest('hex');
}

const provisioningScript = `
import hashlib, json, os, secrets, sys
root = '/opt/orange-glow-account/shared'
backend_path = root + '/backend.env'
mysql_path = root + '/mysql.env'
payload = json.load(sys.stdin)
values = payload['values']
release = payload['release']
expected = payload['expected']
candidate_path = '/opt/orange-glow-account/releases/' + release + '/backend-candidate.env'
def serialize(record):
    lines = []
    for key, value in record.items():
        if not isinstance(value, str) or any(c in value for c in '\\r\\n\\0'):
            raise SystemExit('Invalid environment value.')
        lines.append(key + '=' + value)
    return '\\n'.join(lines) + '\\n'
if expected == 'new':
    if os.path.exists(root):
        raise SystemExit('Isolated configuration already exists; manual review required.')
    db_pass = secrets.token_hex(24)
    values.update({
        'NODE_ENV': 'production', 'PORT': '3002',
        'DATABASE_URL': 'mysql://orange_account:' + db_pass + '@127.0.0.1:33308/orange_account',
        'ACCOUNT_AUTH_JWT_SECRET': secrets.token_hex(48),
        'DIARY_GENERATION_PROVIDER': 'ark-openai-compatible',
        'PHOTO_ASSET_STORAGE_DIR': '/data/photo-assets',
        'DIARY_GENERATION_TMP_DIR': '/data/generation-tmp',
    })
    mysql = {
        'MYSQL_DATABASE': 'orange_account', 'MYSQL_USER': 'orange_account',
        'MYSQL_PASSWORD': db_pass, 'MYSQL_ROOT_PASSWORD': secrets.token_hex(32),
    }
    os.mkdir(root, 0o700)
    for name in ('mysql-data', 'photo-assets', 'generation-tmp'):
        os.mkdir(root + '/' + name, 0o750)
    for name in ('photo-assets', 'generation-tmp'):
        os.chown(root + '/' + name, 1000, 1000)
    for name, record in (('backend.env', values), ('mysql.env', mysql)):
        fd = os.open(root + '/' + name, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
        with os.fdopen(fd, 'w', encoding='utf-8') as f:
            f.write(serialize(record))
    candidate = serialize(values)
else:
    if not os.path.isfile(backend_path) or not os.path.isfile(mysql_path):
        raise SystemExit('Incomplete isolated configuration exists; manual review required.')
    with open(backend_path, 'rb') as f:
        current = f.read()
    if hashlib.sha256(current).hexdigest() != expected:
        raise SystemExit('Backend configuration changed during deployment.')
    old_lines = current.decode('utf-8').splitlines()
    replace_keys = set(payload['replaceKeys'])
    kept = [line for line in old_lines if line.split('=', 1)[0] not in replace_keys]
    candidate = '\\n'.join(kept).rstrip() + '\\n' + serialize(values)
fd = os.open(candidate_path, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
with os.fdopen(fd, 'w', encoding='utf-8') as f:
    f.write(candidate)
print('Isolated configuration prepared; secret values not displayed.')
`;

async function main() {
  const args = process.argv.slice(2);
  if (args.includes('--help') || args.length === 0) {
    console.log('Usage: npm run deploy:backend -- --confirm-live');
    console.log('Builds locally, deploys an isolated account backend, and switches the existing API proxy.');
    return;
  }
  if (args.length !== 1 || args[0] !== '--confirm-live') throw new Error('Explicit --confirm-live is required.');
  validatePrismaVersions(
    JSON.parse(fs.readFileSync(path.join(backend, 'package-lock.json'), 'utf8')),
    JSON.parse(fs.readFileSync(path.join(backend, 'deployment/migration/package-lock.json'), 'utf8')),
  );
  const dotenv = require(require.resolve('dotenv', { paths: [backend] }));
  const deployConfigPath = path.join(root, '.env.deploy.local');
  const deployConfig = fs.existsSync(deployConfigPath)
    ? dotenv.parse(fs.readFileSync(deployConfigPath, 'utf8'))
    : {};
  const target = process.env.DEPLOY_SSH_TARGET || deployConfig.DEPLOY_SSH_TARGET || 'ubuntu@152.32.225.67';
  if (!validTarget(target)) throw new Error('DEPLOY_SSH_TARGET must be an SSH alias or user@host target.');
  const localEnvPath = path.join(backend, '.env');
  const values = productionValues(dotenv.parse(fs.readFileSync(localEnvPath, 'utf8')));
  const release = `r${new Date().toISOString().replace(/\D/g, '').slice(0, 14)}-${crypto.randomBytes(4).toString('hex')}`;
  const tag = `orange-glow-account-backend:${release}`;
  const archiveDir = fs.mkdtempSync(path.join(os.tmpdir(), 'orange-glow-deploy-'));
  const archive = path.join(archiveDir, 'images.tar');
  let locked = false;
  try {
    console.log('[1/6] Checking server and configuration...');
    ssh(target, "sudo -n true && command -v docker >/dev/null && command -v python3 >/dev/null && command -v nginx >/dev/null && test \"$(uname -m)\" = x86_64 && sudo -n docker info >/dev/null");
    ssh(target, `sudo -n bash -c ${shellQuote(`for item in ${nginxFile} ${remoteRoot} ${remoteRoot}/shared ${remoteRoot}/shared/backend.env ${remoteRoot}/shared/mysql.env ${remoteRoot}/shared/mysql-data ${remoteRoot}/shared/photo-assets ${remoteRoot}/shared/generation-tmp; do test ! -L "$item" || exit 1; done`)}`);
    const composeVersion = ssh(target, 'sudo -n docker compose version --short', { capture: true });
    if (!supportedComposeVersion(composeVersion)) {
      throw new Error('The server requires Docker Compose 2.30 or later for raw secret values.');
    }
    const nginx = ssh(target, `sudo -n cat ${shellQuote(nginxFile)}`, { capture: true });
    validateNginx(nginx);
    const nginxSha = crypto.createHash('sha256').update(nginx).digest('hex');
    const backupDir = createBackupDirectory(release);
    fs.writeFileSync(path.join(backupDir, 'nginx.locations.conf'), nginx, { mode: 0o600, flag: 'wx' });
    const currentBackendEnv = ssh(target,
      `if sudo -n test -e ${shellQuote(`${remoteRoot}/shared/backend.env`)}; then sudo -n cat ${shellQuote(`${remoteRoot}/shared/backend.env`)}; else printf '%s' '__ACCOUNT_CONFIG_ABSENT__'; fi`,
      { capture: true });
    const backendEnvSha = currentBackendEnv === '__ACCOUNT_CONFIG_ABSENT__'
      ? 'new'
      : crypto.createHash('sha256').update(currentBackendEnv).digest('hex');
    if (backendEnvSha !== 'new') {
      fs.writeFileSync(path.join(backupDir, 'backend.env'), currentBackendEnv, { mode: 0o600, flag: 'wx' });
    }
    console.log(`Original Nginx configuration saved locally: ${backupDir}`);

    console.log('[2/6] Building complete backend and migration images...');
    run('docker', ['buildx', 'build', '--platform', 'linux/amd64', '--target', 'runtime',
      '-f', 'backend/Dockerfile.production', '-t', tag, '--load', 'backend']);
    run('docker', ['buildx', 'build', '--platform', 'linux/amd64', '--target', 'migration',
      '-f', 'backend/Dockerfile.production', '-t', `${tag}-migration`, '--load', 'backend']);
    const knownLayerLayout = hasKnownLayerLayout(fs.readFileSync(path.join(backend, 'Dockerfile.production')));
    const dependencyLayers = knownLayerLayout
      ? imageDependencyLayers(inspectImageLayers(tag), inspectImageLayers(`${tag}-migration`))
      : [];
    const dependencySha = dependencyFingerprint(backend, dependencyLayers);
    const dependencyLayersSha = crypto.createHash('sha256').update(JSON.stringify(dependencyLayers)).digest('hex');
    console.log('[3/6] Preparing and hashing the complete image archive...');
    run('docker', ['save', '--output', archive, tag, `${tag}-migration`]);
    const archiveSha = await fileSha256(archive);
    const freeKb = Number(ssh(target, "df -Pk /opt | awk 'NR == 2 { print $4 }'", { capture: true }).trim());
    const requiredBytes = fs.statSync(archive).size * 3 + 256 * 1024 * 1024;
    if (!Number.isFinite(freeKb) || freeKb * 1024 < requiredBytes) {
      throw new Error('The server does not have enough free disk space for the full release and image load.');
    }
    remoteAction(target, 'stage', release);
    locked = true;
    ssh(target, `sudo -n python3 -c ${shellQuote(provisioningScript)}`, {
      input: JSON.stringify({ values, replaceKeys: allowedEnvironmentKeys, release, expected: backendEnvSha }),
    });
    await uploadFile(target, path.join(backend, 'deployment/compose.account.yml'),
      `${remoteRoot}/releases/${release}/compose.account.yml`);
    ssh(target, `sudo -n tee ${shellQuote(`${remoteRoot}/releases/${release}/dependency.sha256`)} > /dev/null`, {
      input: `${dependencySha}\n`,
    });
    const remoteArchive = `${remoteRoot}/releases/${release}/images.tar`;
    console.log('[4/6] Preparing image upload...');
    let seedState = knownLayerLayout ? 'full-rsync-unavailable' : 'full-unknown-image-layout';
    if (knownLayerLayout && rsyncAvailable(target)) {
      seedState = remoteAction(target, 'seed-archive', release, dependencySha, dependencyLayersSha, '', { capture: true }).trim();
    }
    if (seedState === 'seeded') {
      console.log('Dependency configuration unchanged; transferring archive differences with progress...');
      rsyncArchive(target, archive, remoteArchive);
    } else {
      const reasons = {
        'full-rsync-unavailable': 'rsync is unavailable',
        'full-unknown-image-layout': 'the Dockerfile layer layout requires review',
        'full-initial': 'this is the first release',
        'full-no-baseline': 'the previous release has no dependency baseline',
        'full-dependencies-changed': 'dependency configuration changed',
      };
      if (!reasons[seedState]) throw new Error('Unexpected archive preparation state.');
      console.log(`Uploading the full image archive (${(fs.statSync(archive).size / 1048576).toFixed(1)} MiB) with progress: ${reasons[seedState]}.`);
      await uploadFile(target, archive, remoteArchive, true);
    }
    console.log('[5/6] Verifying the complete archive and activating the new release...');
    remoteAction(target, 'activate', release, archiveSha, nginxSha, backendEnvSha);
    console.log(`[6/6] Release ${release} deployed. SMTP delivery and real-device acceptance remain separate.`);
  } finally {
    if (locked) {
      try { remoteAction(target, 'unlock', release); }
      catch { console.error('Deployment lock could not be removed; inspect the server before retrying.'); }
    }
    fs.rmSync(archiveDir, { recursive: true, force: true });
  }
}

if (require.main === module) {
  main().catch(error => {
    console.error(error instanceof Error ? error.message : 'Deployment failed.');
    process.exitCode = 1;
  });
}

module.exports = {
  validTarget, supportedComposeVersion, validateNginx, productionValues,
  createBackupDirectory, provisioningScript, validatePrismaVersions, dependencyFingerprint, uploadProgress,
  imageDependencyLayers, hasKnownLayerLayout,
};
