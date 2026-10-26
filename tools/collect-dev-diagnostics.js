#!/usr/bin/env node

const { execFileSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

const BUNDLE_ID = 'io.com.shihangbiji.www.aidiary';
const projectRoot = path.resolve(__dirname, '..');
const logDirectory = path.join(projectRoot, '.dev-logs');
const args = process.argv.slice(2);
const linesIndex = args.indexOf('--lines');
const simulatorIndex = args.indexOf('--simulator');
const lineLimit = Math.max(1, Math.min(1000, Number(args[linesIndex + 1]) || 160));
const simulatorArg = simulatorIndex >= 0 ? args[simulatorIndex + 1] : 'booted';
const includeNativeLogs = args.includes('--native');

function readTail(filePath) {
  if (!fs.existsSync(filePath)) return undefined;
  return fs.readFileSync(filePath, 'utf8').split(/\r?\n/).slice(-lineLimit).join('\n').trim();
}

function getBootedSimulator() {
  const data = JSON.parse(execFileSync('xcrun', ['simctl', 'list', 'devices', 'booted', '--json'], {
    encoding: 'utf8',
    timeout: 10_000,
  }));
  for (const devices of Object.values(data.devices || {})) {
    const device = devices.find(item => item.state === 'Booted');
    if (device) return device.udid;
  }
  return undefined;
}

function readSimulatorDiagnostics() {
  const simulatorId = simulatorArg === 'booted' ? getBootedSimulator() : simulatorArg;
  if (!simulatorId) return { simulatorId: undefined, output: 'No booted iOS simulator found.' };
  try {
    const dataContainer = execFileSync(
      'xcrun',
      ['simctl', 'get_app_container', simulatorId, BUNDLE_ID, 'data'],
      { encoding: 'utf8', timeout: 10_000 },
    ).trim();
    const documentDirectory = path.join(dataContainer, 'Documents');
    const older = readTail(path.join(documentDirectory, 'orange-glow-diagnostics.jsonl.1'));
    const recent = readTail(path.join(documentDirectory, 'orange-glow-diagnostics.jsonl'));
    return {
      simulatorId,
      output: [older, recent].filter(Boolean).join('\n') || 'No app diagnostics yet. Open the app and reproduce the issue first.',
    };
  } catch (error) {
    return {
      simulatorId,
      output: `Unable to read app sandbox: ${error.message}`,
    };
  }
}

function readNativeSimulatorLogs(simulatorId) {
  if (!includeNativeLogs || !simulatorId) return undefined;
  try {
    return execFileSync('xcrun', [
      'simctl',
      'spawn',
      simulatorId,
      'log',
      'show',
      '--last',
      '10m',
      '--style',
      'compact',
      '--predicate',
      'process == "AIDiary2"',
    ], {
      encoding: 'utf8',
      timeout: 20_000,
      maxBuffer: 5 * 1024 * 1024,
    }).split(/\r?\n/).slice(-lineLimit).join('\n').trim();
  } catch (error) {
    return `Unable to read simulator native logs: ${error.message}`;
  }
}

const simulatorDiagnostics = readSimulatorDiagnostics();
const sections = [
  ['SIMULATOR', simulatorDiagnostics],
  ['METRO', { output: readTail(path.join(logDirectory, 'metro.log')) || 'No captured Metro output yet.' }],
  ['BACKEND REQUESTS', { output: readTail(path.join(logDirectory, 'backend.jsonl')) || 'No backend request diagnostics yet.' }],
  ['BACKEND PROCESS', { output: readTail(path.join(logDirectory, 'backend.log')) || 'No captured backend process output yet.' }],
];
const nativeLogs = readNativeSimulatorLogs(simulatorDiagnostics.simulatorId);
if (nativeLogs !== undefined) sections.unshift(['IOS NATIVE (10M)', { output: nativeLogs || 'No native log entries.' }]);

for (const [title, section] of sections) {
  const suffix = title === 'SIMULATOR' && section.simulatorId ? ` (${section.simulatorId})` : '';
  process.stdout.write(`\n===== ${title}${suffix} =====\n${section.output}\n`);
}
