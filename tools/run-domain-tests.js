// Use the existing TypeScript dependency; native image modules are numeric fixtures in Node.
const ts = require('typescript');
const fs = require('fs');
const path = require('path');
const os = require('os');
const root = path.resolve(__dirname, '..');
async function main() {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'ai-diary-domain-'));
  try {
    const files = [
      'src/contracts/core-diary-contract.ts',
      'src/contracts/ai-image-generation-contract.ts', 'src/contracts/insight-report-contract.ts',
      'src/types/diary.ts', 'src/types/diary-capabilities.ts', 'src/types/creation.ts', 'src/types/share.ts', 'src/types/companion.ts',
      'src/store/diary-domain.ts', 'src/store/create-app-store.ts', 'src/store/use-app-store.ts',
      'src/config/app-config.ts',
      'src/services/monthly-export.ts', 'src/services/chat-reply-provider.ts',
      'src/services/ai-image-generation-provider.ts', 'src/services/insight-report-provider.ts',
      'src/types/character-capabilities.ts',
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
    const writeStub = (file, source) => {
      const out = path.join(temp, file);
      fs.mkdirSync(path.dirname(out), { recursive: true });
      fs.writeFileSync(out, source);
    };
    writeStub('src/store/adapters/backend-core-diary-adapter.js', 'exports.createBackendCoreDiaryRepository = () => undefined;');
    writeStub('src/store/adapters/backend-discovery-adapter.js', 'exports.createBackendDiscoveryRepository = () => undefined;');
    writeStub('src/store/adapters/backend-anchor-correction-adapter.js', 'exports.createBackendAnchorCorrectionRepository = () => undefined;');
    writeStub('src/store/adapters/backend-anchor-read-model-adapter.js', 'exports.createBackendAnchorReadModelRepository = () => undefined;');
    writeStub('src/store/adapters/backend-pet-chat-adapter.js', 'exports.createBackendPetChatRepository = () => undefined;');
    writeStub('src/services/draft-snapshot-storage.js', 'exports.createLocalDraftSnapshotStore = () => undefined;');
    writeStub('src/services/photo-library.js', "exports.importDevicePhotoAssets = async () => ({ ok: false, reason: 'asset_unreadable', message: '照片不可读取' });");
    writeStub('src/services/photo-permission.js', "exports.getPhotoPermissionStatus = async () => ({ status: 'unknown', granted: false, canAskAgain: true });");
    fs.symlinkSync(path.join(root, 'node_modules'), path.join(temp, 'node_modules'), 'dir');
    process.env.JEST_WORKER_ID = 'legacy-domain-runner';
    const testModule = require(path.join(temp, 'tools/diary-domain.test.js'));
    await testModule.runCases(process.env.DIARY_DOMAIN_TEST_ORDER === 'reverse');
  } finally {
    fs.rmSync(temp, { recursive: true, force: true });
  }
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
