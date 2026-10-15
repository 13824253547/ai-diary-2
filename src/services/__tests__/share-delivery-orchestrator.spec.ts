import { createShareDeliveryOrchestrator } from '../share-delivery-orchestrator';
import { createShareExportFileService } from '../share-export-file-service';
import { createAsyncFaultPlan } from '../../test-utils/fakes/create-async-fault-plan';
import type { DiaryItem, DiaryPhoto } from '../../types/diary';

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
    photoIds: overrides.photoIds ?? ['photo-1'],
    coverPhotoId: overrides.coverPhotoId ?? 'photo-1',
    blocks: overrides.blocks ?? [{ id: 'block-1', type: 'text', content: '一路走一路拍。', photoIds: ['photo-1'] }],
    exportedImage: overrides.exportedImage ?? false,
    exportedPdf: overrides.exportedPdf ?? false,
    shareModes: overrides.shareModes ?? [],
    exportModes: overrides.exportModes ?? [],
    version: overrides.version ?? 1,
    publicBlockIds: overrides.publicBlockIds,
    posterPhotoIds: overrides.posterPhotoIds ?? ['photo-1'],
    people: overrides.people ?? [],
    createdInSession: overrides.createdInSession ?? false,
    anonymous: overrides.anonymous ?? false,
  };
}

function createDeferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error?: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

describe('share delivery orchestrator', () => {
  const photo = createPhoto();
  const getPhotoById = (photoId: string) => (photoId === photo.id ? photo : undefined);

  test('blocks private outward shares before preparing assets or calling adapters', async () => {
    const prepareAssets = jest.fn();
    const deliverToPlatform = jest.fn();
    const onConfirmed = jest.fn();
    const orchestrator = createShareDeliveryOrchestrator({
      prepareAssets,
      deliverToPlatform,
      onConfirmed,
    });

    const result = await orchestrator.execute({
      diary: createDiary({ privacy: 'private' }),
      mode: 'moments',
      getPhotoById,
    });

    expect(result).toEqual({
      ok: false,
      mode: 'moments',
      reason: 'privacy_required',
      message: '这篇日记还是私密的，请先调整公开范围。',
    });
    expect(prepareAssets).not.toHaveBeenCalled();
    expect(deliverToPlatform).not.toHaveBeenCalled();
    expect(onConfirmed).not.toHaveBeenCalled();
  });

  test('records a confirmed export only after a real file result returns', async () => {
    const diary = createDiary();
    const onConfirmed = jest.fn();
    const exportToFile = jest.fn(async () => ({
      ok: true as const,
      fileUri: 'file:///tmp/share-diary-1.pdf',
    }));
    const orchestrator = createShareDeliveryOrchestrator({
      createOperationId: () => 'share-op-1',
      prepareAssets: async () => ({
        ok: true,
        assets: [{ photoId: 'photo-1', uri: 'file:///tmp/photo-1.png', anonymous: false }],
      }),
      exportToFile,
      onConfirmed,
    });

    const result = await orchestrator.execute({
      diary,
      mode: 'pdf',
      getPhotoById,
    });

    expect(result).toEqual({
      ok: true,
      operationId: 'share-op-1',
      mode: 'pdf',
      fileUri: 'file:///tmp/share-diary-1.pdf',
      assets: [{ photoId: 'photo-1', uri: 'file:///tmp/photo-1.png', anonymous: false }],
    });
    expect(exportToFile).toHaveBeenCalledWith({
      operationId: 'share-op-1',
      diary,
      mode: 'pdf',
      assets: [{ photoId: 'photo-1', uri: 'file:///tmp/photo-1.png', anonymous: false }],
    });
    expect(onConfirmed).toHaveBeenCalledWith({
      diaryId: 'diary-1',
      version: 1,
      mode: 'pdf',
      operationId: 'share-op-1',
      fileUri: 'file:///tmp/share-diary-1.pdf',
    });
    expect(diary.exportModes).toEqual([]);
    expect(diary.exportedPdf).toBe(false);
  });

  test('does not confirm local export history when writing the real file fails', async () => {
    const fs = require('fs');
    const os = require('os');
    const path = require('path');
    const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'share-delivery-write-failure-'));
    const writeFault = createAsyncFaultPlan<void>([
      { type: 'reject', reason: new Error('simulated disk full') },
    ]);
    const exportFileService = createShareExportFileService({
      getOutputDirectory: () => `file://${tempRoot}/`,
      writeFile: () => writeFault.next(),
    });
    const onConfirmed = jest.fn();
    const diary = createDiary({ privacy: 'private' });
    const orchestrator = createShareDeliveryOrchestrator({
      createOperationId: () => 'share-op-write-failure',
      prepareAssets: async () => ({ ok: true, assets: [] }),
      exportToFile: input => exportFileService.exportFile(input),
      onConfirmed,
    });

    try {
      await expect(orchestrator.execute({
        diary,
        mode: 'pdf',
        getPhotoById,
      })).resolves.toEqual({
        ok: false,
        operationId: 'share-op-write-failure',
        mode: 'pdf',
        reason: 'delivery_failed',
        message: '导出文件生成失败：simulated disk full',
      });
      expect(onConfirmed).not.toHaveBeenCalled();
      expect(diary.exportModes).toEqual([]);
      expect(diary.exportedPdf).toBe(false);
      expect(writeFault.callCount).toBe(1);
      expect(writeFault.remainingCount).toBe(0);
    } finally {
      fs.rmSync(tempRoot, { recursive: true, force: true });
    }
  });

  test('does not record cancelled deliveries as successful share history', async () => {
    const prepareAssets = jest.fn(async () => ({
      ok: true as const,
      assets: [{ photoId: 'photo-1', uri: 'file:///tmp/photo-1.png', anonymous: false }],
    }));
    const deliverToPlatform = jest.fn(async () => ({
      ok: false as const,
      reason: 'cancelled' as const,
      message: '用户取消了这次分享。',
    }));
    const onConfirmed = jest.fn();
    const orchestrator = createShareDeliveryOrchestrator({
      createOperationId: () => 'share-op-2',
      prepareAssets,
      deliverToPlatform,
      onConfirmed,
    });

    const result = await orchestrator.execute({
      diary: createDiary(),
      mode: 'x',
      getPhotoById,
    });

    expect(result).toEqual({
      ok: false,
      operationId: 'share-op-2',
      mode: 'x',
      reason: 'cancelled',
      message: '用户取消了这次分享。',
    });
    expect(prepareAssets).toHaveBeenCalledTimes(1);
    expect(deliverToPlatform).toHaveBeenCalledTimes(1);
    expect(onConfirmed).not.toHaveBeenCalled();
  });

  test('dedupes repeated in-flight submissions by diary version and target scope', async () => {
    const prepareAssets = jest.fn(async ({ diary }: { diary: DiaryItem }) => ({
      ok: true as const,
      assets: [{ photoId: diary.photoIds[0] ?? 'photo-1', uri: `file:///tmp/${diary.id}-${diary.version}.png`, anonymous: false }],
    }));
    const onConfirmed = jest.fn();
    const versionOneExport = createDeferred<{ ok: true; fileUri: string }>();
    const versionTwoExport = createDeferred<{ ok: true; fileUri: string }>();
    const exportToFile = jest.fn(
      ({ diary }: { diary: DiaryItem }) =>
        (diary.version === 1 ? versionOneExport.promise : versionTwoExport.promise),
    );
    const ids = ['share-op-3', 'share-op-4'];
    const orchestrator = createShareDeliveryOrchestrator({
      createOperationId: () => ids.shift() ?? 'share-op-fallback',
      prepareAssets,
      exportToFile,
      onConfirmed,
    });

    const diaryV1 = createDiary({ version: 1 });
    const first = orchestrator.execute({ diary: diaryV1, mode: 'save', getPhotoById });
    const duplicate = orchestrator.execute({ diary: diaryV1, mode: 'save', getPhotoById });
    const diaryV2 = createDiary({ version: 2 });
    const secondVersion = orchestrator.execute({ diary: diaryV2, mode: 'save', getPhotoById });

    await Promise.resolve();

    expect(prepareAssets).toHaveBeenCalledTimes(2);
    expect(exportToFile).toHaveBeenCalledTimes(2);

    versionOneExport.resolve({ ok: true, fileUri: 'file:///tmp/diary-v1.png' });
    versionTwoExport.resolve({ ok: true, fileUri: 'file:///tmp/diary-v2.png' });

    await expect(first).resolves.toMatchObject({
      ok: true,
      operationId: 'share-op-3',
      mode: 'save',
      fileUri: 'file:///tmp/diary-v1.png',
    });
    await expect(duplicate).resolves.toMatchObject({
      ok: true,
      operationId: 'share-op-3',
      mode: 'save',
      fileUri: 'file:///tmp/diary-v1.png',
    });
    await expect(secondVersion).resolves.toMatchObject({
      ok: true,
      operationId: 'share-op-4',
      mode: 'save',
      fileUri: 'file:///tmp/diary-v2.png',
    });
    expect(onConfirmed).toHaveBeenCalledTimes(2);
    expect(onConfirmed).toHaveBeenNthCalledWith(1, {
      diaryId: 'diary-1',
      version: 1,
      mode: 'save',
      operationId: 'share-op-3',
      fileUri: 'file:///tmp/diary-v1.png',
    });
    expect(onConfirmed).toHaveBeenNthCalledWith(2, {
      diaryId: 'diary-1',
      version: 2,
      mode: 'save',
      operationId: 'share-op-4',
      fileUri: 'file:///tmp/diary-v2.png',
    });
  });
});
