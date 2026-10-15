const fs = require('node:fs');
const path = require('node:path');

function scanClientBundle(bundleDirectory, canary) {
  if (typeof canary !== 'string' || canary.length === 0) {
    throw new Error('A non-empty client bundle canary is required.');
  }

  const root = path.resolve(bundleDirectory);
  if (!fs.statSync(root).isDirectory()) {
    throw new Error('The client bundle path must be a directory.');
  }

  const marker = Buffer.from(canary);
  const matches = [];
  let filesScanned = 0;
  const visit = directory => {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      const fullPath = path.join(directory, entry.name);
      if (entry.isDirectory()) {
        visit(fullPath);
      } else if (entry.isFile()) {
        filesScanned += 1;
        if (fs.readFileSync(fullPath).includes(marker)) {
          matches.push(path.relative(root, fullPath));
        }
      }
    }
  };

  visit(root);
  return { filesScanned, matches };
}

function run(args = process.argv.slice(2), env = process.env) {
  const bundleDirectory = args[0];
  const canary = env.CLIENT_SECRET_SCAN_CANARY;
  if (!bundleDirectory || !canary) {
    console.error('Usage: CLIENT_SECRET_SCAN_CANARY=<temporary-canary> node tools/verify-client-bundle-secrets.js <export-directory>');
    return 2;
  }

  let result;
  try {
    result = scanClientBundle(bundleDirectory, canary);
  } catch (error) {
    console.error(error instanceof Error ? error.message : 'Unable to scan the client export.');
    return 2;
  }

  if (result.matches.length > 0) {
    console.error(`Client bundle canary found in: ${result.matches.join(', ')}`);
    return 1;
  }

  console.log(`No client bundle canary match in ${result.filesScanned} files.`);
  return 0;
}

if (require.main === module) {
  process.exitCode = run();
}

module.exports = { scanClientBundle, run };
