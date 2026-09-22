// Use the existing TypeScript dependency; native image modules are numeric fixtures in Node.
const ts = require('typescript');
const fs = require('fs');
const path = require('path');
const os = require('os');
const root = path.resolve(__dirname, '..');
const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'ai-diary-domain-'));
try {
  const files = [
    'src/types/diary.ts', 'src/types/creation.ts', 'src/types/share.ts', 'src/types/companion.ts',
    'src/store/diary-domain.ts', 'src/store/use-app-store.ts',
    'src/mocks/diaries.ts', 'src/mocks/photos.ts', 'src/mocks/characters.ts',
    'src/mocks/companions.ts', 'src/mocks/creation.ts', 'src/mocks/share-options.ts',
    'tools/diary-domain.test.ts',
  ];
  for (const file of files) {
    const source = fs.readFileSync(path.join(root, file), 'utf8').replace(/require\(['"][^'"]+\.(png|jpg|jpeg|webp)['"]\)/g, '1');
    const output = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true } }).outputText;
    const out = path.join(temp, file.replace(/\.ts$/, '.js'));
    fs.mkdirSync(path.dirname(out), { recursive: true }); fs.writeFileSync(out, output);
  }
  fs.mkdirSync(path.join(temp, 'src/theme'), { recursive: true });
  fs.writeFileSync(path.join(temp, 'src/theme/assets.js'), 'exports.art = new Proxy({}, {get: () => 1});');
  fs.symlinkSync(path.join(root, 'node_modules'), path.join(temp, 'node_modules'), 'dir');
  require(path.join(temp, 'tools/diary-domain.test.js'));
} finally {
  fs.rmSync(temp, { recursive: true, force: true });
}
