const fs = require('node:fs');
const crypto = require('node:crypto');
const { spawnSync } = require('node:child_process');
const path = require('node:path');

const source = fs.readFileSync(path.join(__dirname, '../backend/.env'), 'utf8');
const values = {};
for (const line of source.split(/\r?\n/)) {
  const match = line.match(/^([A-Z][A-Z0-9_]*)=(.*)$/);
  if (match) values[match[1]] = match[2].replace(/^"|"$/g, '');
}
const keys = [
  'PET_CHAT_PROVIDER', 'PET_CHAT_BASE_URL', 'PET_CHAT_MODEL', 'PET_CHAT_API_KEY',
  'PET_CHAT_TIMEOUT_MS', 'PET_CHAT_TEMPERATURE', 'PET_CHAT_MAX_TOKENS', 'PET_CHAT_HISTORY_ITEMS',
  'AI_IMAGE_PROVIDER', 'AI_IMAGE_MODEL', 'AI_IMAGE_API_KEY', 'AI_IMAGE_TIMEOUT_MS', 'AI_IMAGE_SIZE',
  'AI_PROVIDER', 'AI_PROVIDER_BASE_URL', 'AI_PROVIDER_MODEL', 'AI_PROVIDER_API_KEY',
  'DIARY_GENERATION_PROVIDER',
];
const backend = Object.fromEntries(keys.filter(key => values[key]).map(key => [key, values[key]]));
if (!backend.PET_CHAT_API_KEY || backend.PET_CHAT_PROVIDER !== 'ark-openai-compatible') {
  throw new Error('Expected configured server-side provider credentials.');
}
const databasePassword = crypto.randomBytes(24).toString('hex');
Object.assign(backend, {
  NODE_ENV: 'production',
  PORT: '3001',
  DATABASE_URL: `mysql://orange_glow:${databasePassword}@127.0.0.1:33307/orange_glow`,
  REDIS_URL: 'redis://127.0.0.1:36380',
  DEVICE_IDENTITY_MODE: 'attested',
  APP_ATTEST_TEAM_ID: 'JWTMTK2F34',
  APP_ATTEST_BUNDLE_ID: 'io.com.shihangbiji.www.aidiary',
  DEVICE_AUTH_JWT_SECRET: crypto.randomBytes(48).toString('hex'),
  PHOTO_ASSET_STORAGE_DIR: '/data/photo-assets',
  DIARY_GENERATION_TMP_DIR: '/data/generation-tmp',
  DIARY_GENERATION_TMP_TTL_MS: '7200000',
  DIARY_GENERATION_CLEANUP_INTERVAL_MS: '300000',
});
const mysql = {
  MYSQL_DATABASE: 'orange_glow',
  MYSQL_USER: 'orange_glow',
  MYSQL_PASSWORD: databasePassword,
  MYSQL_ROOT_PASSWORD: crypto.randomBytes(32).toString('hex'),
};
function serialize(record) {
  return Object.entries(record).map(([key, value]) => {
    if (/[\r\n]/.test(value)) throw new Error('Invalid multiline environment value.');
    return `${key}=${value}`;
  }).join('\n') + '\n';
}
const files = {
  'backend.env': serialize(backend),
  'mysql.env': serialize(mysql),
  '.env': 'RELEASE_TAG=20261029-01\n',
};
// The secrets travel only through SSH stdin, never argv, output or local files.
const script = `import json,os,sys
root='/opt/orange-glow'
files=json.load(sys.stdin)
for name in files:
    if name not in ('backend.env','mysql.env','.env') or os.path.exists(root+'/'+name):
        raise SystemExit('Refusing to overwrite existing environment')
for name,content in files.items():
    fd=os.open(root+'/'+name,os.O_WRONLY|os.O_CREAT|os.O_EXCL,0o600)
    with os.fdopen(fd,'w') as file:
        file.write(content)
print('Production environment initialized; secret values not displayed')
`;
const socket = process.env.DEPLOY_SSH_SOCKET;
if (!socket) throw new Error('DEPLOY_SSH_SOCKET is required.');
const remote = `sudo -n python3 -c '${script.replace(/'/g, "'\\''")}'`;
const result = spawnSync('ssh', ['-S', socket, '-o', 'BatchMode=yes', 'ubuntu@152.32.225.67', remote], {
  input: JSON.stringify(files),
  encoding: 'utf8',
});
if (result.status !== 0) throw new Error('Environment initialization failed; inspect access and existing files.');
process.stdout.write(result.stdout);
