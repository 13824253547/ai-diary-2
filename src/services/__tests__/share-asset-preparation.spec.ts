import { createShareAssetPreparationService } from '../share-asset-preparation';
import type { DiaryItem, DiaryPhoto } from '../../types/diary';

function createDiary(overrides: Partial<DiaryItem> = {}): DiaryItem {
  return {
    id: overrides.id ?? 'diary-1',
    type: 'travel',
    status: 'ready',
    title: overrides.title ?? '匿名日记',
    subtitle: overrides.subtitle ?? '',
    location: overrides.location ?? '台南',
    date: overrides.date ?? '2026.10.14',
    summary: overrides.summary ?? 'summary',
    helperMessage: '',
    characterId: 'character-blue',
    companionName: overrides.companionName ?? '同行人',
    privacy: overrides.privacy ?? 'anonymous',
    photoIds: overrides.photoIds ?? ['photo-1'],
    coverPhotoId: overrides.coverPhotoId ?? 'photo-1',
    blocks: overrides.blocks ?? [],
    exportedImage: false,
    exportedPdf: false,
    shareModes: [],
    exportModes: [],
    version: overrides.version ?? 1,
    posterPhotoIds: overrides.posterPhotoIds ?? ['photo-1'],
    people: overrides.people,
    anonymous: overrides.anonymous ?? true,
    publicBlockIds: overrides.publicBlockIds,
    createdInSession: false,
  };
}

function createPhoto(overrides: Partial<DiaryPhoto> = {}): DiaryPhoto {
  return {
    id: overrides.id ?? 'photo-1',
    title: 'photo',
    location: '台南',
    emoji: '📷',
    color: '#fff',
    date: '2026.10.14',
    uri: overrides.uri ?? `file://${overrides.id ?? 'photo-1'}.jpg`,
    width: overrides.width ?? 100,
    height: overrides.height ?? 100,
    personIds: overrides.personIds,
    faceRects: overrides.faceRects,
    image: overrides.image,
    localUri: overrides.localUri,
    albumId: overrides.albumId,
    albumTitle: overrides.albumTitle,
    filename: overrides.filename,
    source: overrides.source,
    selected: overrides.selected,
  };
}

describe('share asset preparation', () => {
  test('reuses the same cached anonymous asset for the same diary version and target', async () => {
    const renderer = jest.fn(async ({ cacheKey }: { cacheKey: string }) => `file://${cacheKey}.svg`);
    const service = createShareAssetPreparationService({
      renderAnonymousAsset: renderer,
      isPreparedAssetReadable: async () => true,
    });
    const diary = createDiary();
    const photo = createPhoto({
      faceRects: [{ x: 0.1, y: 0.2, width: 0.3, height: 0.4 }],
      personIds: ['person-friend'],
    });

    const first = await service.prepareDiaryShareAssets({
      diary,
      target: 'save',
      getPhotoById: () => photo,
    });
    const second = await service.prepareDiaryShareAssets({
      diary,
      target: 'save',
      getPhotoById: () => photo,
    });

    expect(first.ok).toBe(true);
    expect(second.ok).toBe(true);
    expect(renderer).toHaveBeenCalledTimes(1);
  });

  test('isolates anonymous asset cache by diary, target, and version', async () => {
    const renderer = jest.fn(async ({ cacheKey }: { cacheKey: string }) => `file://${cacheKey}.svg`);
    const service = createShareAssetPreparationService({
      renderAnonymousAsset: renderer,
    });
    const photo = createPhoto({
      faceRects: [{ x: 0.1, y: 0.2, width: 0.3, height: 0.4 }],
      personIds: ['person-friend'],
    });

    await service.prepareDiaryShareAssets({
      diary: createDiary({ version: 1 }),
      target: 'save',
      getPhotoById: () => photo,
    });
    await service.prepareDiaryShareAssets({
      diary: createDiary({ version: 1 }),
      target: 'pdf',
      getPhotoById: () => photo,
    });
    await service.prepareDiaryShareAssets({
      diary: createDiary({ version: 2 }),
      target: 'save',
      getPhotoById: () => photo,
    });
    await service.prepareDiaryShareAssets({
      diary: createDiary({ id: 'diary-2', version: 1 }),
      target: 'save',
      getPhotoById: () => photo,
    });

    expect(renderer).toHaveBeenCalledTimes(4);
    expect(renderer.mock.calls.map(call => call[0].cacheKey)).toEqual([
      expect.stringContaining('diary-1::1::save::photo-1'),
      expect.stringContaining('diary-1::1::pdf::photo-1'),
      expect.stringContaining('diary-1::2::save::photo-1'),
      expect.stringContaining('diary-2::1::save::photo-1'),
    ]);
  });

  test('fails when a known person photo lacks face rects', async () => {
    const service = createShareAssetPreparationService();
    const result = await service.prepareDiaryShareAssets({
      diary: createDiary(),
      target: 'save',
      getPhotoById: () => createPhoto({
        personIds: ['person-friend'],
        faceRects: undefined,
      }),
    });

    expect(result).toEqual({
      ok: false,
      reason: 'missing_face_rects',
      message: '当前有照片缺少可用的人脸遮挡区域，暂时不能匿名分享。',
    });
  });

  test.each([
    ['non-finite coordinates', { x: Number.NaN, y: 0.2, width: 0.3, height: 0.4 }],
    ['zero-area rectangles', { x: 0.2, y: 0.2, width: 0, height: 0.4 }],
    ['rectangles outside the image', { x: 1.1, y: 0.2, width: 0.3, height: 0.4 }],
  ])('rejects anonymous assets with %s', async (_description, faceRect) => {
    const renderer = jest.fn(async () => 'file://should-not-render.png');
    const service = createShareAssetPreparationService({
      renderAnonymousAsset: renderer,
      isPreparedAssetReadable: async () => true,
    });

    const result = await service.prepareDiaryShareAssets({
      diary: createDiary(),
      target: 'save',
      getPhotoById: () => createPhoto({
        personIds: ['person-friend'],
        faceRects: [faceRect],
      }),
    });

    expect(result).toEqual({
      ok: false,
      reason: 'invalid_face_rects',
      message: '当前有照片包含无效的人脸遮挡区域，暂时不能匿名分享。',
    });
    expect(renderer).not.toHaveBeenCalled();
  });

  test('does not keep a failed render in cache', async () => {
    const renderer = jest
      .fn<Promise<string>, [{ cacheKey: string }]>()
      .mockRejectedValueOnce(new Error('boom'))
      .mockResolvedValueOnce('file://masked.svg');
    const service = createShareAssetPreparationService({
      renderAnonymousAsset: renderer,
      isPreparedAssetReadable: async () => true,
    });
    const diary = createDiary();
    const photo = createPhoto({
      faceRects: [{ x: 0.1, y: 0.2, width: 0.3, height: 0.4 }],
      personIds: ['person-friend'],
    });

    const first = await service.prepareDiaryShareAssets({
      diary,
      target: 'save',
      getPhotoById: () => photo,
    });
    const second = await service.prepareDiaryShareAssets({
      diary,
      target: 'save',
      getPhotoById: () => photo,
    });

    expect(first).toEqual({
      ok: false,
      reason: 'render_failed',
      message: '匿名资源准备失败，请稍后重试。',
    });
    expect(second.ok).toBe(true);
    expect(renderer).toHaveBeenCalledTimes(2);
  });

  test('fails when the rendered anonymous asset is unreadable', async () => {
    const renderer = jest.fn(async () => 'file://missing-masked.png');
    const service = createShareAssetPreparationService({
      renderAnonymousAsset: renderer,
      isPreparedAssetReadable: async () => false,
    });

    const result = await service.prepareDiaryShareAssets({
      diary: createDiary(),
      target: 'save',
      getPhotoById: () => createPhoto({
        faceRects: [{ x: 0.1, y: 0.2, width: 0.3, height: 0.4 }],
        personIds: ['person-friend'],
      }),
    });

    expect(result).toEqual({
      ok: false,
      reason: 'render_failed',
      message: '匿名资源准备失败，请稍后重试。',
    });
    expect(renderer).toHaveBeenCalledTimes(1);
  });

  test('renders a masked png asset without mutating the source image', async () => {
    const Jimp = require('jimp-compact');
    const fs = require('fs');
    const os = require('os');
    const path = require('path');

    const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'share-asset-'));
    const sourcePath = path.join(tempRoot, 'source.png');
    const cacheDirectory = `file://${tempRoot}/cache/`;
    const maskColor = Jimp.rgbaToInt(192, 182, 170, 255);
    fs.mkdirSync(path.join(tempRoot, 'cache', 'anonymous-share-assets'), { recursive: true });

    const source = await new Jimp(10, 10, 0xff8844ff);
    await source.writeAsync(sourcePath);

    const service = createShareAssetPreparationService({
      getCacheDirectory: () => cacheDirectory,
    });
    const result = await service.prepareDiaryShareAssets({
      diary: createDiary(),
      target: 'save',
      getPhotoById: () => createPhoto({
        uri: `file://${sourcePath}`,
        localUri: `file://${sourcePath}`,
        width: 10,
        height: 10,
        faceRects: [{ x: 0.2, y: 0.3, width: 0.3, height: 0.4 }],
        personIds: ['person-friend'],
      }),
    });

    expect(result.ok).toBe(true);
    if (!result.ok) {
      throw new Error('expected share asset preparation to succeed');
    }
    expect(result.assets[0]).toMatchObject({
      photoId: 'photo-1',
      anonymous: true,
    });
    expect(result.assets[0]?.uri.endsWith('.png')).toBe(true);

    const sourceAfter = await Jimp.read(sourcePath);
    const masked = await Jimp.read(result.assets[0]?.uri.replace(/^file:\/\//, ''));

    expect(masked.getPixelColor(0, 0)).toBe(sourceAfter.getPixelColor(0, 0));
    expect(masked.getPixelColor(3, 4)).toBe(maskColor);
    expect(sourceAfter.getPixelColor(3, 4)).not.toBe(maskColor);
  });

  test('clips partially out-of-bounds face rectangles to the source image pixels', async () => {
    const Jimp = require('jimp-compact');
    const fs = require('fs');
    const os = require('os');
    const path = require('path');

    const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'share-asset-edge-'));
    const sourcePath = path.join(tempRoot, 'source.png');
    const cacheDirectory = `file://${tempRoot}/cache/`;
    const maskColor = Jimp.rgbaToInt(192, 182, 170, 255);
    fs.mkdirSync(path.join(tempRoot, 'cache', 'anonymous-share-assets'), { recursive: true });
    await new Jimp(10, 10, 0xff8844ff).writeAsync(sourcePath);

    const service = createShareAssetPreparationService({
      getCacheDirectory: () => cacheDirectory,
    });
    const result = await service.prepareDiaryShareAssets({
      diary: createDiary(),
      target: 'save',
      getPhotoById: () => createPhoto({
        uri: `file://${sourcePath}`,
        localUri: `file://${sourcePath}`,
        width: 10,
        height: 10,
        faceRects: [{ x: -0.1, y: 0.3, width: 0.3, height: 0.4 }],
        personIds: ['person-friend'],
      }),
    });

    expect(result.ok).toBe(true);
    if (!result.ok) {
      throw new Error('expected clipped face rect to produce an anonymous asset');
    }
    const masked = await Jimp.read(result.assets[0]?.uri.replace(/^file:\/\//, ''));
    expect(masked.getPixelColor(0, 4)).toBe(maskColor);
    expect(masked.getPixelColor(1, 4)).toBe(maskColor);
    expect(masked.getPixelColor(2, 4)).not.toBe(maskColor);
  });
});
