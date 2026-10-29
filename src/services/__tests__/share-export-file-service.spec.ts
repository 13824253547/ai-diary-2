import { createShareExportFileService } from '../share-export-file-service';
import { createAsyncFaultPlan } from '../../test-utils/fakes/create-async-fault-plan';
import type { DiaryItem, DiaryPhoto } from '../../types/diary';
import type { PreparedShareAsset } from '../share-asset-preparation';

function createDiary(overrides: Partial<DiaryItem> = {}): DiaryItem {
  return {
    id: overrides.id ?? 'diary-1',
    type: overrides.type ?? 'travel',
    status: overrides.status ?? 'ready',
    title: overrides.title ?? '台南慢游日记',
    subtitle: overrides.subtitle ?? '和朋友一起出发',
    location: overrides.location ?? '台南',
    date: overrides.date ?? '2026.01.10',
    summary: overrides.summary ?? '一路走一路拍，晚风很舒服。',
    helperMessage: overrides.helperMessage ?? '记录今天的小事',
    characterId: overrides.characterId ?? 'character-blue',
    companionName: overrides.companionName ?? '小林',
    privacy: overrides.privacy ?? 'public-comments',
    photoIds: overrides.photoIds ?? ['photo-1', 'photo-2'],
    coverPhotoId: overrides.coverPhotoId ?? 'photo-1',
    blocks: overrides.blocks ?? [
      { id: 'block-1', type: 'text', title: '在古城里，把时间放慢', content: '一路走一路拍，晚风很舒服。', photoIds: ['photo-1'] },
      { id: 'block-2', type: 'quote', content: '旅行不是走了多远，而是把日子过慢了一点。' },
      { id: 'block-3', type: 'photo', photoId: 'photo-2', caption: '把巷子里的日常，装进相机。' },
    ],
    exportedImage: overrides.exportedImage ?? false,
    exportedPdf: overrides.exportedPdf ?? false,
    shareModes: overrides.shareModes ?? [],
    exportModes: overrides.exportModes ?? [],
    version: overrides.version ?? 2,
    publicBlockIds: overrides.publicBlockIds,
    posterPhotoIds: overrides.posterPhotoIds ?? ['photo-1', 'photo-2'],
    people: overrides.people ?? [],
    createdInSession: overrides.createdInSession ?? false,
    anonymous: overrides.anonymous ?? false,
  };
}

function createPhoto(overrides: Partial<DiaryPhoto> = {}): DiaryPhoto {
  return {
    id: overrides.id ?? 'photo-1',
    title: overrides.title ?? 'Photo',
    location: overrides.location ?? '台南',
    emoji: overrides.emoji ?? '📷',
    color: overrides.color ?? '#F5C28B',
    date: overrides.date ?? '2026.01.10',
    uri: overrides.uri ?? 'file:///tmp/photo-1.png',
    localUri: overrides.localUri ?? 'file:///tmp/photo-1.png',
    width: overrides.width ?? 1200,
    height: overrides.height ?? 900,
    personIds: overrides.personIds ?? [],
    faceRects: overrides.faceRects,
    source: overrides.source ?? 'device',
  };
}

async function createTempImage(
  filePath: string,
  color: number,
  overrides: Partial<DiaryPhoto> = {},
): Promise<{ photo: DiaryPhoto; asset: PreparedShareAsset }> {
  const Jimp = require('jimp-compact');
  const image = await new Jimp(120, 80, color);
  await image.writeAsync(filePath);
  const photo = createPhoto({
    ...overrides,
    id: overrides.id ?? 'photo-1',
    uri: `file://${filePath}`,
    localUri: `file://${filePath}`,
    width: 120,
    height: 80,
  });
  return {
    photo,
    asset: {
      photoId: photo.id,
      uri: `file://${filePath}`,
      anonymous: false,
    },
  };
}

describe('share export file service', () => {
  test('fails closed for image export until a native renderer is available', async () => {
    const service = createShareExportFileService();

    await expect(service.exportFile({
      diary: createDiary(),
      mode: 'save',
      assets: [],
      operationId: 'share-op-image-1',
    })).resolves.toEqual({
      ok: false,
      reason: 'unsupported',
      message: '长图导出尚未接入真实文字渲染和系统相册保存。',
    });
  });

  test('writes a pdf export file with the expected header and content bytes', async () => {
    const fs = require('fs');
    const os = require('os');
    const path = require('path');
    const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'share-export-pdf-'));
    const outputRoot = `file://${tempRoot}/`;
    const firstImage = await createTempImage(path.join(tempRoot, 'photo-1.png'), 0xf28d35ff, { id: 'photo-1' });
    const service = createShareExportFileService({
      getOutputDirectory: () => outputRoot,
    });

    const result = await service.exportFile({
      diary: createDiary({ anonymous: true, summary: '同行人的名字已经被替换。' }),
      mode: 'pdf',
      assets: [firstImage.asset],
      operationId: 'share-op-pdf-1',
    });

    expect(result.ok).toBe(true);
    if (!result.ok) {
      throw new Error(result.message);
    }
    expect(result.fileUri).toMatch(/\.pdf$/);

    const pdfBuffer = fs.readFileSync(result.fileUri.replace(/^file:\/\//, ''));
    const pdfText = pdfBuffer.toString('utf8');
    expect(pdfText.startsWith('%PDF-1.4')).toBe(true);
    expect(pdfText).toContain('/Encoding /UniGB-UCS2-H');
    expect(pdfText).toContain('/Metadata 7 0 R');
    expect(pdfText).toContain('ContentProducer');
    expect(pdfText).toContain('orange-glow-ai-diary');
    const noticeHex = Array.from('含AI生成内容，可经用户编辑，请核对')
      .map(character => character.charCodeAt(0).toString(16).padStart(4, '0').toUpperCase()).join('');
    expect(pdfText).toContain(`<${noticeHex}> Tj`);
    expect(pdfText).toContain('<53F0535761626E3865E58BB0> Tj');
    expect(pdfText).toContain('<533F540D65E58BB0FF0C4EBA72695DF2906E6321> Tj');
    expect(pdfText).toContain('<5DF251C6590756FE72470020003100205F20> Tj');
  });

  test('returns delivery_failed when the output file writer fails', async () => {
    const fs = require('fs');
    const os = require('os');
    const path = require('path');
    const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'share-export-write-failure-'));
    const writeFault = createAsyncFaultPlan<void>([
      { type: 'reject', reason: new Error('simulated disk full') },
    ]);
    const writeFile = jest.fn(() => writeFault.next());
    const service = createShareExportFileService({
      getOutputDirectory: () => `file://${tempRoot}/`,
      writeFile,
    });

    try {
      await expect(service.exportFile({
        diary: createDiary(),
        mode: 'pdf',
        assets: [],
        operationId: 'share-op-write-failure',
      })).resolves.toEqual({
        ok: false,
        reason: 'delivery_failed',
        message: '导出文件生成失败：simulated disk full',
      });
      expect(writeFile).toHaveBeenCalledTimes(1);
      expect(writeFault.callCount).toBe(1);
      expect(writeFault.remainingCount).toBe(0);
    } finally {
      fs.rmSync(tempRoot, { recursive: true, force: true });
    }
  });
});
