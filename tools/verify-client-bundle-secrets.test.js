const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const { scanClientBundle } = require('./verify-client-bundle-secrets');

function withTemporaryDirectory(run) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'orange-glow-secret-scan-'));
  try {
    run(directory);
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
}

test('finds canaries in nested text and binary bundle resources without returning the value', () => {
  const canary = 'TEST_ONLY_SERVER_SECRET_CANARY_20261015';
  withTemporaryDirectory(directory => {
    const assetDirectory = path.join(directory, 'assets');
    fs.mkdirSync(assetDirectory);
    fs.writeFileSync(path.join(directory, 'metadata.json'), '{"platform":"ios"}');
    fs.writeFileSync(path.join(assetDirectory, 'bundle.hbc'), Buffer.concat([
      Buffer.from([0, 255, 12]),
      Buffer.from(canary),
      Buffer.from([0, 9]),
    ]));

    const result = scanClientBundle(directory, canary);

    assert.deepEqual(result, {
      filesScanned: 2,
      matches: ['assets/bundle.hbc'],
    });
    assert.equal(JSON.stringify(result).includes(canary), false);
  });
});

test('passes when the canary does not occur in exported files', () => {
  withTemporaryDirectory(directory => {
    fs.writeFileSync(path.join(directory, 'entry.js'), 'export const ready = true;');

    assert.deepEqual(scanClientBundle(directory, 'unused-test-canary'), {
      filesScanned: 1,
      matches: [],
    });
  });
});

test('requires a canary and an existing directory', () => {
  withTemporaryDirectory(directory => {
    assert.throws(() => scanClientBundle(directory, ''), /canary is required/);
    assert.throws(() => scanClientBundle(path.join(directory, 'missing'), 'marker'));
  });
});
