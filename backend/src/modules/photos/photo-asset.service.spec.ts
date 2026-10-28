import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { Prisma } from '@prisma/client';
import { PrismaService } from '../../common/prisma.service';
import { PhotoAssetError, PhotoAssetService } from './photo-asset.service';

describe('PhotoAssetService', () => {
  let root: string;
  let previousStorageDir: string | undefined;
  let service: PhotoAssetService;
  let materialRows: Array<Record<string, unknown>>;
  let diaryRows: Array<Record<string, unknown>>;
  let savedDiaryRows: Array<Record<string, unknown>>;
  let discoveryRows: Array<Record<string, unknown>>;
  let prisma: {
    $executeRaw: jest.Mock;
    $queryRaw: jest.Mock;
    $transaction: jest.Mock;
    materialPhotoQuota: Record<string, jest.Mock>;
    materialPhoto: Record<string, jest.Mock>;
    diaryPhotoCopy: Record<string, jest.Mock>;
    diary: Record<string, jest.Mock>;
    discoveryStory: Record<string, jest.Mock>;
  };

  beforeEach(async () => {
    previousStorageDir = process.env.PHOTO_ASSET_STORAGE_DIR;
    root = await mkdtemp(join(tmpdir(), 'orange-glow-photo-assets-'));
    process.env.PHOTO_ASSET_STORAGE_DIR = root;
    materialRows = [];
    diaryRows = [];
    savedDiaryRows = [];
    discoveryRows = [];
    const matches = (row: Record<string, unknown>, where: Record<string, unknown>) =>
      Object.entries(where).every(([key, value]) => {
        if (value && typeof value === 'object' && 'in' in value) {
          return ((value as { in: unknown[] }).in).includes(row[key]);
        }
        if (value && typeof value === 'object' && 'not' in value) {
          return row[key] !== (value as { not: unknown }).not;
        }
        return row[key] === value;
      });
    const materialPhoto = {
      findMany: jest.fn(async ({ where }: { where: Record<string, unknown> }) =>
        materialRows.filter(row => matches(row, where))),
      findFirst: jest.fn(async ({ where }: { where: Record<string, unknown> }) =>
        materialRows.find(row => matches(row, where)) ?? null),
      count: jest.fn(async ({ where }: { where: Record<string, unknown> }) =>
        materialRows.filter(row => matches(row, where)).length),
      createMany: jest.fn(async ({ data }: { data: Array<Record<string, unknown>> }) => {
        materialRows.push(...data.map(row => ({
          ...row,
          createdAt: new Date('2026-10-23T00:00:00.000Z'),
          updatedAt: new Date('2026-10-23T00:00:00.000Z'),
        })));
        return { count: data.length };
      }),
      update: jest.fn(async ({ where, data }: {
        where: Record<string, unknown>;
        data: Record<string, unknown>;
      }) => {
        const row = materialRows.find(item => matches(item, where));
        if (!row) throw new Error('material not found');
        Object.assign(row, data);
        return row;
      }),
      deleteMany: jest.fn(async ({ where }: { where: Record<string, unknown> }) => {
        const deleted = materialRows.filter(row => matches(row, where));
        materialRows = materialRows.filter(row => !matches(row, where));
        return { count: deleted.length };
      }),
    };
    const diaryPhotoCopy = {
      findMany: jest.fn(async ({ where }: { where: Record<string, unknown> }) =>
        diaryRows.filter(row => matches(row, where))),
      findFirst: jest.fn(async ({ where }: { where: Record<string, unknown> }) =>
        diaryRows.find(row => matches(row, where)) ?? null),
      createMany: jest.fn(async ({ data }: { data: Array<Record<string, unknown>> }) => {
        diaryRows.push(...data.map(row => ({
          ...row,
          createdAt: new Date('2026-10-23T00:00:00.000Z'),
        })));
        return { count: data.length };
      }),
    };
    const diary = {
      findMany: jest.fn(async ({ where }: { where: Record<string, unknown> }) =>
        savedDiaryRows.filter(row => matches(row, where))),
      findFirst: jest.fn(async ({ where }: { where: Record<string, unknown> }) =>
        savedDiaryRows.find(row => matches(row, where)) ?? null),
    };
    const discoveryStory = {
      findFirst: jest.fn(async ({ where }: { where: Record<string, unknown> }) =>
        discoveryRows.find(row => matches(row, where)) ?? null),
    };
    const materialPhotoQuota = {
      update: jest.fn(async () => ({})),
    };
    const tx = {
      $executeRaw: jest.fn(async () => 1),
      $queryRaw: jest.fn(async () => []),
      materialPhotoQuota,
      materialPhoto,
      diaryPhotoCopy,
      diary,
      discoveryStory,
    };
    prisma = {
      $executeRaw: tx.$executeRaw,
      $queryRaw: tx.$queryRaw,
      $transaction: jest.fn(async (callback: (value: typeof tx) => unknown) => callback(tx)),
      materialPhotoQuota,
      materialPhoto,
      diaryPhotoCopy,
      diary,
      discoveryStory,
    };
    service = new PhotoAssetService(prisma as unknown as PrismaService);
  });

  afterEach(async () => {
    if (previousStorageDir === undefined) delete process.env.PHOTO_ASSET_STORAGE_DIR;
    else process.env.PHOTO_ASSET_STORAGE_DIR = previousStorageDir;
    await rm(root, { recursive: true, force: true });
  });

  function upload(sourceAssetId: string, buffer = Buffer.from([0xff, 0xd8, 0xff, 0x01, 0x02])) {
    return service.uploadMaterials('device-1', [{
      buffer,
      mimetype: 'image/jpeg',
    }], [{
      sourceAssetId,
      title: sourceAssetId,
      filename: `${sourceAssetId}.jpg`,
    }]);
  }

  test('stores repeated uploads of one source as separate assets per device', async () => {
    const first = await upload('asset-1');
    const duplicate = await upload('asset-1');

    expect(first[0]?.id).not.toBe(duplicate[0]?.id);
    expect(first[0]?.sourceAssetId).toBe(duplicate[0]?.sourceAssetId);
    expect(materialRows).toHaveLength(2);
    expect(prisma.$transaction).toHaveBeenCalledTimes(2);
    expect((await service.listMaterials('device-2'))).toEqual([]);
  });

  test('persists generated image bytes with request provenance and reuses the same request asset', async () => {
    const image = {
      buffer: Buffer.from([0xff, 0xd8, 0xff, 0x01, 0x02]),
      mimeType: 'image/jpeg',
      extension: 'jpg',
    };
    const generated = await service.saveGeneratedMaterial(
      'device-1',
      'image-request-1',
      '雨后的老街',
      image,
    );
    const replayed = await service.saveGeneratedMaterial(
      'device-1',
      'image-request-1',
      '雨后的老街',
      image,
    );

    expect(generated).toMatchObject({
      sourceAssetId: 'image-request-1',
      generationRequestId: 'image-request-1',
      generationPrompt: '雨后的老街',
      generationSource: 'ark-seedream',
    });
    expect(replayed.id).toBe(generated.id);
    expect(materialRows).toHaveLength(1);
    expect(await readFile(join(root, String(materialRows[0]?.filePath)))).toEqual(image.buffer);
    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
  });

  test('counts generated images and uploaded photos in the same device quota', async () => {
    materialRows.push(...Array.from({ length: 99 }, (_, index) => ({
      id: `existing-${index}`,
      ownerDeviceId: 'device-1',
    })));
    await service.assertMaterialCapacity('device-1');
    const image = {
      buffer: Buffer.from([0xff, 0xd8, 0xff, 0x01, 0x02]),
      mimeType: 'image/jpeg',
      extension: 'jpg',
    };
    const generated = await service.saveGeneratedMaterial('device-1', 'request-at-limit', '海边日落', image);

    expect(generated.generationRequestId).toBe('request-at-limit');
    expect(materialRows).toHaveLength(100);
    await expect(service.assertMaterialCapacity('device-1'))
      .rejects.toMatchObject<Partial<PhotoAssetError>>({ code: 'limit_exceeded' });
    await expect(upload('next-device-photo'))
      .rejects.toMatchObject<Partial<PhotoAssetError>>({ code: 'limit_exceeded' });
    await expect(service.assertMaterialCapacity('device-2')).resolves.toBeUndefined();
    expect(materialRows).toHaveLength(100);
  });

  test('copies original bytes into an independent diary asset that survives material deletion', async () => {
    const [material] = await upload('asset-1');
    if (!material) throw new Error('material upload returned no asset');

    await service.ensureDiaryPhotoCopies('device-1', 'diary-1', [material.id]);
    const diaryPhoto = await service.readDiaryPhotoCopy('device-1', 'diary-1', material.id);
    expect(diaryPhoto.buffer).toEqual(Buffer.from([0xff, 0xd8, 0xff, 0x01, 0x02]));
    expect(diaryRows[0]?.filePath).not.toBe(materialRows[0]?.filePath);

    await service.deleteMaterials('device-1', [material.id]);

    expect(materialRows).toHaveLength(0);
    expect(await service.readDiaryPhotoCopy('device-1', 'diary-1', material.id)).toEqual(diaryPhoto);
    expect(await service.readAnyDiaryPhotoCopy('device-1', material.id)).toEqual(diaryPhoto);
  });

  test('resolves exact material IDs but leaves ambiguous legacy source IDs untouched', async () => {
    const firstBytes = Buffer.from([0xff, 0xd8, 0xff, 0x01, 0x02]);
    const secondBytes = Buffer.from([0xff, 0xd8, 0xff, 0x03, 0x04]);
    const [first] = await upload('asset-duplicate', firstBytes);
    const [second] = await upload('asset-duplicate', secondBytes);
    if (!first || !second) throw new Error('material upload returned no asset');

    await service.ensureDiaryPhotoCopies('device-1', 'diary-exact', [second.id]);
    await service.ensureDiaryPhotoCopies('device-1', 'diary-legacy', ['asset-duplicate'], [], true);

    await expect(service.readDiaryPhotoCopy('device-1', 'diary-exact', second.id))
      .resolves.toMatchObject({ buffer: secondBytes });
    await expect(service.readDiaryPhotoCopy('device-1', 'diary-legacy', 'asset-duplicate'))
      .rejects.toMatchObject<Partial<PhotoAssetError>>({ code: 'not_found' });
    expect(diaryRows.find(row => row.diaryId === 'diary-exact')?.filePath)
      .not.toBe(materialRows.find(row => row.id === first.id)?.filePath);
    expect(diaryRows.some(row => row.diaryId === 'diary-legacy')).toBe(false);
  });

  test('writes uploaded local photo bytes directly into the diary copy', async () => {
    const photoId = 'device-photo-1';
    const bytes = Buffer.from([0xff, 0xd8, 0xff, 0x09, 0x08]);
    const hook = service.createDiaryPhotoSaveHook('device-1', [photoId], [{
      photoId,
      buffer: bytes,
      mimeType: 'image/jpeg',
      date: '2026.10.20',
    }]);

    await hook.beforeCommit(prisma as unknown as Prisma.TransactionClient, 'diary-uploaded');

    await expect(service.readDiaryPhotoCopy('device-1', 'diary-uploaded', photoId))
      .resolves.toMatchObject({ buffer: bytes, mimeType: 'image/jpeg' });
    expect(diaryRows[0]).toMatchObject({
      photoId,
      diaryId: 'diary-uploaded',
      date: '2026.10.20',
    });
  });

  test('serves only selected photos from an active published discovery story', async () => {
    const bytes = Buffer.from([0xff, 0xd8, 0xff, 0x01]);
    await writeFile(join(root, 'public-story-photo.jpg'), bytes);
    discoveryRows.push({
      id: 'story-1',
      ownerDeviceId: 'device-1',
      sourceDiaryId: 'diary-1',
      sourceDiaryVersion: 2,
      publicationStatus: 'published',
      publishedAt: new Date(),
      withdrawnAt: null,
      publicPhotoIds: ['photo-1'],
    });
    savedDiaryRows.push({
      id: 'diary-1',
      ownerDeviceId: 'device-1',
      version: 2,
      privacy: 'public-comments',
    });
    diaryRows.push({
      ownerDeviceId: 'device-1',
      diaryId: 'diary-1',
      photoId: 'photo-1',
      filePath: 'public-story-photo.jpg',
      mimeType: 'image/jpeg',
    });

    await expect(service.readDiscoveryPhotoCopy('story-1', 'photo-1'))
      .resolves.toMatchObject({ buffer: bytes, mimeType: 'image/jpeg' });
    await expect(service.readDiscoveryPhotoCopy('story-1', 'photo-2'))
      .rejects.toMatchObject<Partial<PhotoAssetError>>({ code: 'not_found' });

    discoveryRows[0].publicationStatus = 'withdrawn';
    discoveryRows[0].withdrawnAt = new Date();
    await expect(service.readDiscoveryPhotoCopy('story-1', 'photo-1'))
      .rejects.toMatchObject<Partial<PhotoAssetError>>({ code: 'not_found' });
  });

  test('removes staged diary copies when the surrounding diary save rolls back', async () => {
    const [material] = await upload('asset-1');
    if (!material) throw new Error('material upload returned no asset');
    const hook = service.createDiaryPhotoSaveHook('device-1', [material.id]);

    await hook.beforeCommit(prisma as unknown as Prisma.TransactionClient, 'diary-rollback');

    const stagedPath = join(root, String(diaryRows[0]?.filePath));
    await expect(readFile(stagedPath)).resolves.toEqual(Buffer.from([0xff, 0xd8, 0xff, 0x01, 0x02]));
    await hook.rollback();
    await expect(readFile(stagedPath)).rejects.toMatchObject({ code: 'ENOENT' });
  });

  test('keeps the same photo copy separately for every diary that references it', async () => {
    const [material] = await upload('asset-1');
    if (!material) throw new Error('material upload returned no asset');

    await service.ensureDiaryPhotoCopies('device-1', 'diary-1', [material.id]);
    await service.ensureDiaryPhotoCopies('device-1', 'diary-2', [material.id]);

    expect(diaryRows).toHaveLength(2);
    const copies = await service.listDiaryPhotoCopiesForDiaries('device-1', ['diary-1', 'diary-2']);
    expect(copies.map(copy => [copy.diaryId, copy.id])).toEqual([
      ['diary-1', material.id],
      ['diary-2', material.id],
    ]);
  });

  test('backfills missing legacy diary copies when listing saved photo assets', async () => {
    const [material] = await upload('legacy-device-photo');
    if (!material) throw new Error('material upload returned no asset');
    savedDiaryRows.push({
      id: 'diary-legacy',
      ownerDeviceId: 'device-1',
      photoIds: ['legacy-device-photo'],
    });

    const copies = await service.listDiaryPhotoCopiesForDiaries('device-1', ['diary-legacy']);

    expect(copies).toMatchObject([{
      id: 'legacy-device-photo',
      sourceAssetId: 'legacy-device-photo',
      diaryId: 'diary-legacy',
    }]);
    await expect(service.readDiaryPhotoCopy('device-1', 'diary-legacy', material.sourceAssetId))
      .resolves.toMatchObject({ buffer: Buffer.from([0xff, 0xd8, 0xff, 0x01, 0x02]) });
  });

  test('keeps readable diary photos available when another legacy source file is missing', async () => {
    const [missing] = await upload('legacy-missing-photo');
    const [available] = await upload('legacy-available-photo');
    if (!missing || !available) throw new Error('material upload returned no asset');
    const missingRow = materialRows.find(row => row.id === missing.id);
    if (!missingRow || typeof missingRow.filePath !== 'string') throw new Error('missing material file path');
    await rm(join(root, missingRow.filePath), { force: true });
    savedDiaryRows.push({
      id: 'diary-partial-backfill',
      ownerDeviceId: 'device-1',
      photoIds: [missing.sourceAssetId, available.sourceAssetId],
    });

    const copies = await service.listDiaryPhotoCopiesForDiaries('device-1', ['diary-partial-backfill']);

    expect(copies.map(copy => copy.sourceAssetId)).toEqual([available.sourceAssetId]);
    await expect(service.readDiaryPhotoCopy('device-1', 'diary-partial-backfill', available.sourceAssetId))
      .resolves.toMatchObject({ buffer: Buffer.from([0xff, 0xd8, 0xff, 0x01, 0x02]) });
  });

  test('rejects a request containing more than twelve files', async () => {
    const uploads = Array.from({ length: 13 }, () => ({
      buffer: Buffer.from([0xff, 0xd8, 0xff, 0x01, 0x02]),
      mimetype: 'image/jpeg',
    }));
    const metadata = Array.from({ length: 13 }, (_, index) => ({
      sourceAssetId: `asset-${index + 1}`,
      title: `asset-${index + 1}`,
      filename: `asset-${index + 1}.jpg`,
    }));

    await expect(service.uploadMaterials('device-1', uploads, metadata))
      .rejects.toMatchObject<Partial<PhotoAssetError>>({ code: 'invalid_input' });
    expect(materialRows).toHaveLength(0);
  });

  test('allows one hundred materials and rejects the one-hundred-and-first asset', async () => {
    for (let index = 1; index <= 100; index += 1) await upload(`asset-${index}`);

    await expect(upload('asset-101')).rejects.toMatchObject<Partial<PhotoAssetError>>({
      code: 'limit_exceeded',
    });
    expect(materialRows).toHaveLength(100);
  });
});
