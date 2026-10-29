// Execute on the server through a locally built Node container, never expose key material.
const fs = require('node:fs');
const path = require('node:path');
const { generateKeyPairSync } = require('node:crypto');

const root = process.env.DEPLOYMENT_ROOT || '/deployment';
const release = process.env.INSTALLATION_RELEASE;
if (!release || !/^[A-Za-z0-9-]+$/.test(release)) throw new Error('A safe release tag is required');
const backendFile = path.join(root, 'backend.env');
const releaseFile = path.join(root, '.env');
const originalRelease = fs.readFileSync(releaseFile, 'utf8');
if (!/^RELEASE_TAG=.+$/m.test(originalRelease)) throw new Error('Existing release configuration is required');
const backup = path.join(root, 'backups', `installation-${release}`);
fs.mkdirSync(backup, { mode: 0o700 });
fs.copyFileSync(backendFile, path.join(backup, 'backend.env'));
fs.copyFileSync(releaseFile, path.join(backup, 'release.env'));
fs.chmodSync(path.join(backup, 'backend.env'), 0o600);
fs.chmodSync(path.join(backup, 'release.env'), 0o600);
let environment = fs.readFileSync(backendFile, 'utf8');
if (!/^INSTALLATION_AUTH_PRIVATE_KEY=/m.test(environment)) {
  const privateKey = generateKeyPairSync('ed25519').privateKey.export({ format: 'der', type: 'pkcs8' }).toString('base64');
  environment = environment.trimEnd() + `\nINSTALLATION_AUTH_PRIVATE_KEY=${privateKey}\n`;
}
environment = environment.replace(/^DEVICE_IDENTITY_MODE=.*$/m, 'DEVICE_IDENTITY_MODE=installation');
if (!/^DEVICE_IDENTITY_MODE=installation$/m.test(environment)) environment += 'DEVICE_IDENTITY_MODE=installation\n';
function replaceFile(file, contents) {
  fs.writeFileSync(`${file}.installation.tmp`, contents, { mode: 0o600, flag: 'wx' });
  fs.renameSync(`${file}.installation.tmp`, file);
}
replaceFile(backendFile, environment);
replaceFile(releaseFile, originalRelease.replace(/^RELEASE_TAG=.*$/m, `RELEASE_TAG=${release}`));
console.log('Installation configuration applied; original configuration retained in protected backups.');
