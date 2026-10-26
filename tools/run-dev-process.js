#!/usr/bin/env node

const { spawn } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

const [name, command, ...args] = process.argv.slice(2);
if (!['metro', 'backend'].includes(name) || !command) {
  console.error('Usage: node tools/run-dev-process.js <metro|backend> <command> [args...]');
  process.exit(2);
}

const projectRoot = path.resolve(__dirname, '..');
const logDirectory = path.join(projectRoot, '.dev-logs');
fs.mkdirSync(logDirectory, { recursive: true });
const logPath = path.join(logDirectory, `${name}.log`);
const maxLogBytes = 4 * 1024 * 1024;
if (fs.existsSync(logPath) && fs.statSync(logPath).size > maxLogBytes) {
  const backupPath = `${logPath}.1`;
  if (fs.existsSync(backupPath)) fs.rmSync(backupPath, { force: true });
  fs.renameSync(logPath, backupPath);
}
const logStream = fs.createWriteStream(logPath, { flags: 'a' });
logStream.write(`\n[${new Date().toISOString()}] starting ${name}\n`);

const child = spawn(command, args, {
  cwd: process.cwd(),
  env: name === 'metro' ? { ...process.env, CI: 'false' } : process.env,
  stdio: ['inherit', 'pipe', 'pipe'],
});

function shouldPersistLine(line) {
  if (line.includes('[dev-diagnostics]')) return true;
  if (name === 'metro') {
    return /^(Starting project|Starting Metro Bundler|warning: Bundler cache|Waiting on http|Logs for your project)/i
      .test(line.trim())
      || /Unable to resolve module|TransformError|SyntaxError:|Failed to bundle|Bundling failed|Metro has encountered an error/i
        .test(line);
  }
  return /^\[Nest\].*(Starting Nest application|Nest application successfully started|LOG \[(RoutesResolver|InstanceLoader)\])/
    .test(line.trim());
}

function relay(stream, output) {
  let pending = '';
  stream.on('data', chunk => {
    output.write(chunk);
    pending += chunk.toString('utf8');
    const lines = pending.split(/\r?\n/);
    pending = lines.pop() ?? '';
    for (const line of lines) {
      if (shouldPersistLine(line)) logStream.write(`${line}\n`);
    }
  });
  stream.on('end', () => {
    if (pending && shouldPersistLine(pending)) logStream.write(`${pending}\n`);
  });
}

relay(child.stdout, process.stdout);
relay(child.stderr, process.stderr);

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => child.kill(signal));
}

child.on('error', error => {
  console.error(`Unable to start ${name}: ${error.message}`);
  logStream.end();
  process.exitCode = 1;
});

child.on('exit', (code, signal) => {
  logStream.write(`\n[${new Date().toISOString()}] ${name} exited code=${code} signal=${signal}\n`);
  logStream.end();
  process.exitCode = code ?? 1;
});
