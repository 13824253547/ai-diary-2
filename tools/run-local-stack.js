#!/usr/bin/env node

const { spawn, spawnSync } = require('node:child_process');
const net = require('node:net');
const os = require('node:os');
const path = require('node:path');

const projectRoot = path.resolve(__dirname, '..');
const backendRoot = path.join(projectRoot, 'backend');
const composeFile = 'backend/docker-compose.local.yml';
const runDevProcess = path.join(projectRoot, 'tools/run-dev-process.js');
const databaseName = 'ai_diary_e2e_local_startup_20261112';
const databaseUrl = `mysql://root:root@127.0.0.1:33306/${databaseName}`;
const redisUrl = 'redis://127.0.0.1:36379';
const backendPort = Number(process.env.LOCAL_BACKEND_PORT || 3001);
const metroPort = Number(process.env.LOCAL_METRO_PORT || 8081);
const generationTempDir = path.join(os.tmpdir(), 'orange-glow-ai-diary-local-generation');

function isPrivateIpv4(value) {
  if (net.isIP(value) !== 4) return false;
  const [first, second] = value.split('.').map(Number);
  return first === 10
    || (first === 172 && second >= 16 && second <= 31)
    || (first === 192 && second === 168)
    || first === 127;
}

function runChecked(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: options.cwd || projectRoot,
    env: options.env || process.env,
    encoding: options.capture ? 'utf8' : undefined,
    stdio: options.capture ? 'pipe' : 'inherit',
  });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error(`${command} exited with status ${result.status ?? 1}.`);
  }
  return options.capture ? result.stdout.trim() : '';
}

function assertSafeDatabaseTarget() {
  const url = new URL(databaseUrl);
  const name = decodeURIComponent(url.pathname.slice(1));
  if (url.protocol !== 'mysql:' || url.hostname !== '127.0.0.1'
    || !/^ai_diary_e2e_[a-z0-9_]+$/i.test(name)
    || name !== databaseName) {
    throw new Error('Refusing to start with a non-isolated local database.');
  }
}

function getLanAddress() {
  const override = process.env.LOCAL_BACKEND_HOST?.trim();
  if (override) {
    if (!isPrivateIpv4(override)) {
      throw new Error('LOCAL_BACKEND_HOST must be a private IPv4 address.');
    }
    return override;
  }

  const route = spawnSync('route', ['-n', 'get', 'default'], { encoding: 'utf8' });
  const interfaceName = route.status === 0
    ? route.stdout.match(/^\s*interface:\s*(\S+)/m)?.[1]
    : undefined;
  if (interfaceName) {
    const address = spawnSync('ipconfig', ['getifaddr', interfaceName], { encoding: 'utf8' });
    const value = address.status === 0 ? address.stdout.trim() : '';
    if (isPrivateIpv4(value)) return value;
  }
  return '127.0.0.1';
}

function assertPortAvailable(port) {
  const result = spawnSync('lsof', ['-nP', `-iTCP:${port}`, '-sTCP:LISTEN', '-t'], {
    encoding: 'utf8',
  });
  if (result.error) throw result.error;
  if (result.status === 0 && result.stdout.trim()) {
    throw new Error(`Port ${port} is already in use. Stop that service before starting this stack.`);
  }
}

function ensureLocalDatabase(environment) {
  runChecked('docker', ['compose', '-f', composeFile, 'up', '-d', 'mysql', 'redis']);
  const existing = runChecked('docker', [
    'compose', '-f', composeFile, 'exec', '-T', 'mysql',
    'mysql', '-uroot', '-proot', '-N', '-e', `SHOW DATABASES LIKE '${databaseName}'`,
  ], { capture: true });

  if (!existing) {
    runChecked('docker', [
      'compose', '-f', composeFile, 'exec', '-T', 'mysql',
      'mysql', '-uroot', '-proot', '-e',
      `CREATE DATABASE ${databaseName} CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`,
    ]);
  }

  runChecked('npx', ['prisma', 'migrate', 'deploy'], {
    cwd: backendRoot,
    env: environment,
  });
}

function startManagedProcess(name, command, args, cwd, environment) {
  return spawn(process.execPath, [runDevProcess, name, command, ...args], {
    cwd,
    env: environment,
    stdio: 'inherit',
  });
}

function supervise(children) {
  let stopping = false;
  let exitCode = 0;

  const finishIfStopped = () => {
    if (stopping && children.every(child => child.exitCode !== null || child.signalCode !== null)) {
      process.exitCode = exitCode;
    }
  };

  const stop = (code, signal = 'SIGTERM') => {
    if (stopping) return;
    stopping = true;
    exitCode = code;
    for (const child of children) {
      if (child.exitCode === null && child.signalCode === null) child.kill(signal);
    }
    finishIfStopped();
  };

  process.on('SIGINT', () => stop(0, 'SIGINT'));
  process.on('SIGTERM', () => stop(0, 'SIGTERM'));

  for (const child of children) {
    child.on('error', error => {
      console.error(`Unable to start a local service: ${error.message}`);
      stop(1);
    });
    child.on('exit', (code, signal) => {
      if (!stopping) {
        console.error(`A local service exited (code=${code}, signal=${signal}).`);
        stop(code && code > 0 ? code : 1);
      }
      finishIfStopped();
    });
  }
}

function main() {
  assertSafeDatabaseTarget();
  assertPortAvailable(backendPort);
  assertPortAvailable(metroPort);

  const lanAddress = getLanAddress();
  const apiUrl = `http://${lanAddress}:${backendPort}/api`;
  const backendEnvironment = {
    ...process.env,
    DATABASE_URL: databaseUrl,
    E2E_DATABASE_URL: databaseUrl,
    REDIS_URL: redisUrl,
    NODE_ENV: 'development',
    PORT: String(backendPort),
    DIARY_GENERATION_TMP_DIR: generationTempDir,
  };

  ensureLocalDatabase(backendEnvironment);
  console.log(`Local API: ${apiUrl}`);
  console.log(`Isolated database: ${databaseName}`);
  console.log('Press Ctrl+C to stop the backend and Expo. MySQL and Redis remain running.');

  const backend = startManagedProcess(
    'backend',
    path.join(backendRoot, 'node_modules/.bin/ts-node'),
    ['src/main.ts'],
    backendRoot,
    backendEnvironment,
  );
  const metro = startManagedProcess(
    'metro',
    path.join(projectRoot, 'node_modules/.bin/expo'),
    ['start', '--lan', '--port', String(metroPort)],
    projectRoot,
    {
      ...process.env,
      EXPO_PUBLIC_BACKEND_BASE_URL: apiUrl,
    },
  );
  supervise([backend, metro]);
}

try {
  main();
} catch (error) {
  console.error(error instanceof Error ? error.message : 'Unable to start the local development stack.');
  process.exitCode = 1;
}
