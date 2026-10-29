// Execute on the server through a locally built Node container, never expose key material.
const fs = require('node:fs');
const path = require('node:path');
const { generateKeyPairSync } = require('node:crypto');

const root = process.env.DEPLOYMENT_ROOT || '/deployment';
const release = process.env.INSTALLATION_RELEASE;
const previous = process.env.PREVIOUS_INSTALLATION_RELEASE;
if (!release || !/^[A-Za-z0-9-]+$/.test(release)) throw new Error('A safe release tag is required');
if (previous && !/^[A-Za-z0-9-]+$/.test(previous)) throw new Error('A safe previous release tag is required');
const backendFile = path.join(root, 'backend.env');
const releaseFile = path.join(root, '.env');
const composeFile = path.join(root, 'compose.production.yml');
const originalRelease = fs.readFileSync(releaseFile, 'utf8');
if (!/^RELEASE_TAG=.+$/m.test(originalRelease)) throw new Error('Existing release configuration is required');
const modules = [
  'identity-auth.guard', 'identity-auth.service', 'identity.controller',
  'identity.module', 'installation-auth.service', 'installation-token',
];
for (const name of modules) {
  if (!fs.statSync(path.join(root, 'identity-releases', release, `${name}.js`)).isFile()) {
    throw new Error('Compiled authentication module is missing');
  }
}
const originalCompose = fs.readFileSync(composeFile, 'utf8');
const anchor = '      - ./generation-tmp:/data/generation-tmp';
const mountLine = (tag, name) => `      - ./identity-releases/${tag}/${name}.js:/app/dist/modules/identity/${name}.js:ro`;
const existingMounts = originalCompose.match(/^ +\- \.\/identity-releases\/.+$/gm) || [];
if (!originalCompose.includes(anchor) || (existingMounts.length > 0 && (
  !previous || existingMounts.length !== modules.length || !modules.every(name => existingMounts.includes(mountLine(previous, name)))
))) {
  throw new Error('Compose layout is unexpected; review authentication mounts before deployment');
}
let updatedCompose = originalCompose;
if (existingMounts.length > 0) {
  for (const name of modules) updatedCompose = updatedCompose.replace(mountLine(previous, name), mountLine(release, name));
} else {
  updatedCompose = updatedCompose.replace(anchor, `${anchor}\n${modules.map(name => mountLine(release, name)).join('\n')}`);
}
const backup = path.join(root, 'backups', `installation-${release}`);
fs.mkdirSync(backup, { mode: 0o700 });
fs.copyFileSync(backendFile, path.join(backup, 'backend.env'));
fs.copyFileSync(releaseFile, path.join(backup, 'release.env'));
fs.copyFileSync(composeFile, path.join(backup, 'compose.production.yml'));
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
replaceFile(composeFile, updatedCompose);
console.log('Installation configuration applied; original configuration retained in protected backups.');
