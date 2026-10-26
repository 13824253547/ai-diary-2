import { Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { copyFile, mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import type { Prisma } from '@prisma/client';
import { PrismaService } from '../../common/prisma.service';

export const MAX_MATERIAL_PHOTOS_PER_UPLOAD = 12;
export const MAX_MATERIAL_LIBRARY_PHOTOS = 100;
const MAX_PHOTO_BYTES = 10 * 1024 * 1024;
const MAX_UPLOAD_BYTES = 48 * 1024 * 1024;

export type PhotoAssetUploadMetadata = {
  sourceAssetId: string;
  title: string;
  date?: string;
  filename?: string;
  width?: number;
  height?: number;
};

export type GeneratedPhotoAsset = {
  buffer: Buffer;
  mimeType: string;
  extension: string;
};

export type PhotoAssetUpload = {
  buffer: Buffer;
  mimetype: string;
};

export type DiaryPhotoUpload = {
  photoId: string;
  buffer: Buffer;
  mimeType: string;
  date?: string;
};

export class PhotoAssetError extends Error {
  constructor(
    readonly code: 'invalid_input' | 'limit_exceeded' | 'not_found' | 'asset_unreadable' | 'storage_failed',
    message: string,
  ) {
    super(message);
  }
}

function detectImage(buffer: Buffer) {
  if (buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
    return { mimeType: 'image/jpeg', extension: 'jpg' };
  }
  if (buffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) {
    return { mimeType: 'image/png', extension: 'png' };
  }
  if (buffer.length >= 12 && buffer.toString('ascii', 0, 4) === 'RIFF' && buffer.toString('ascii', 8, 12) === 'WEBP') {
    return { mimeType: 'image/webp', extension: 'webp' };
  }
  if (buffer.length >= 12 && buffer.toString('ascii', 4, 8) === 'ftyp') {
    const brand = buffer.toString('ascii', 8, 12);
    if (['heic', 'heix', 'hevc', 'hevx', 'mif1', 'msf1'].includes(brand)) {
      return { mimeType: 'image/heic', extension: 'heic' };
    }
  }
  throw new PhotoAssetError('asset_unreadable', '照片内容无法识别，请重新选择照片。');
}

function isMetadata(value: unknown): value is PhotoAssetUploadMetadata {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const item = value as Record<string, unknown>;
  return typeof item.sourceAssetId === 'string'
    && item.sourceAssetId.trim().length > 0
    && item.sourceAssetId.length <= 191
    && typeof item.title === 'string'
    && item.title.trim().length > 0
    && item.title.length <= 255
    && (item.date === undefined || (typeof item.date === 'string' && item.date.length <= 32))
    && (item.filename === undefined || (typeof item.filename === 'string' && item.filename.length <= 255))
    && (item.width === undefined || (Number.isSafeInteger(item.width) && Number(item.width) > 0 && Number(item.width) <= 50_000))
    && (item.height === undefined || (Number.isSafeInteger(item.height) && Number(item.height) > 0 && Number(item.height) <= 50_000));
}

@Injectable()
export class PhotoAssetService {
  private readonly root = resolve(
    process.env.PHOTO_ASSET_STORAGE_DIR?.trim() || join(process.cwd(), 'var', 'photo-assets'),
  );

  constructor(private readonly prisma: PrismaService) {}

  async listMaterials(ownerDeviceId: string) {
    const records = await this.prisma.materialPhoto.findMany({
      where: { ownerDeviceId },
      orderBy: [{ createdAt: 'desc' }, { id: 'asc' }],
    });
    return records.map(record => this.toAssetContract(record));
  }

  async uploadMaterials(
    ownerDeviceId: string,
    uploads: PhotoAssetUpload[],
    metadata: PhotoAssetUploadMetadata[],
  ) {
    if (!Array.isArray(uploads) || uploads.length < 1 || uploads.length > MAX_MATERIAL_PHOTOS_PER_UPLOAD
      || !Array.isArray(metadata) || metadata.length !== uploads.length
      || metadata.some(item => !isMetadata(item))) {
      throw new PhotoAssetError('invalid_input', `请选择 1 至 ${MAX_MATERIAL_PHOTOS_PER_UPLOAD} 张照片。`);
    }

    let totalBytes = 0;
    const prepared = uploads.map((upload, index) => {
      if (!upload || !Buffer.isBuffer(upload.buffer) || upload.buffer.length === 0) {
        throw new PhotoAssetError('asset_unreadable', '所选照片没有完整上传。');
      }
      if (upload.buffer.length > MAX_PHOTO_BYTES) {
        throw new PhotoAssetError('limit_exceeded', '单张照片不能超过 10 MB。');
      }
      totalBytes += upload.buffer.length;
      return {
        metadata: metadata[index],
        buffer: upload.buffer,
        image: detectImage(upload.buffer),
        id: randomUUID(),
        temporaryPath: join(this.root, '.staging', `${randomUUID()}.tmp`),
        destination: '',
      };
    });
    if (totalBytes > MAX_UPLOAD_BYTES) {
      throw new PhotoAssetError('limit_exceeded', '本次照片总量不能超过 48 MB。');
    }

    const movedPaths: string[] = [];
    try {
      for (const item of prepared) {
        item.destination = this.materialPath(ownerDeviceId, item.id, item.image.extension);
        await mkdir(join(this.root, '.staging'), { recursive: true, mode: 0o700 });
        await mkdir(join(this.root, 'materials', this.ownerKey(ownerDeviceId)), { recursive: true, mode: 0o700 });
        await writeFile(item.temporaryPath, item.buffer, { flag: 'wx', mode: 0o600 });
      }

      await this.prisma.$transaction(async tx => {
        await tx.$executeRaw`
          INSERT INTO MaterialPhotoQuota (ownerDeviceId, photoCount, updatedAt)
          VALUES (${ownerDeviceId}, 0, NOW(3))
          ON DUPLICATE KEY UPDATE ownerDeviceId = VALUES(ownerDeviceId)
        `;
        await tx.$queryRaw`
          SELECT ownerDeviceId FROM MaterialPhotoQuota
          WHERE ownerDeviceId = ${ownerDeviceId}
          FOR UPDATE
        `;

        const currentCount = await tx.materialPhoto.count({ where: { ownerDeviceId } });
        if (currentCount + prepared.length > MAX_MATERIAL_LIBRARY_PHOTOS) {
          throw new PhotoAssetError('limit_exceeded', `素材库最多保存 ${MAX_MATERIAL_LIBRARY_PHOTOS} 张照片，请先删除部分素材。`);
        }

        const rows = [];
        for (const item of prepared) {
          await rename(item.temporaryPath, item.destination);
          movedPaths.push(item.destination);
          rows.push({
            id: item.id,
            ownerDeviceId,
            sourceAssetId: item.metadata.sourceAssetId,
            filePath: this.relativePath(item.destination),
            filename: item.metadata.filename?.trim() || `${item.id}.${item.image.extension}`,
            mimeType: item.image.mimeType,
            size: item.buffer.length,
            title: item.metadata.title.trim(),
            date: item.metadata.date,
            width: item.metadata.width,
            height: item.metadata.height,
          });
        }
        if (rows.length) {
          await tx.materialPhoto.createMany({ data: rows });
          await tx.materialPhotoQuota.update({
            where: { ownerDeviceId },
            data: { photoCount: currentCount + prepared.length },
          });
        }
      });

    } catch (error) {
      await Promise.all([
        ...prepared.map(item => rm(item.temporaryPath, { force: true }).catch(() => undefined)),
        ...movedPaths.map(path => rm(path, { force: true }).catch(() => undefined)),
      ]);
      if (error instanceof PhotoAssetError) throw error;
      throw new PhotoAssetError('storage_failed', '照片没有成功保存，请稍后重试。');
    }

    await Promise.all(prepared.map(item => rm(item.temporaryPath, { force: true })));
    const records = await this.prisma.materialPhoto.findMany({
      where: {
        ownerDeviceId,
        id: { in: prepared.map(item => item.id) },
      },
    });
    const byId = new Map(records.map(record => [record.id, record]));
    return prepared.map(item => {
      const record = byId.get(item.id);
      if (!record) throw new PhotoAssetError('storage_failed', '照片保存结果缺失，请重试。');
      return this.toAssetContract(record);
    });
  }

  async findGeneratedMaterial(ownerDeviceId: string, requestId: string) {
    const record = await this.prisma.materialPhoto.findFirst({
      where: { ownerDeviceId, generationRequestId: requestId },
    });
    return record ? this.toAssetContract(record) : undefined;
  }

  async saveGeneratedMaterial(
    ownerDeviceId: string,
    requestId: string,
    description: string,
    image: GeneratedPhotoAsset,
  ) {
    const existing = await this.findGeneratedMaterial(ownerDeviceId, requestId);
    if (existing) return existing;

    const [asset] = await this.uploadMaterials(ownerDeviceId, [{
      buffer: image.buffer,
      mimetype: image.mimeType,
    }], [{
      sourceAssetId: requestId,
      title: description.slice(0, 255) || 'AI 配图',
      date: new Date().toISOString().slice(0, 10).replaceAll('-', '.'),
      filename: `generated-${requestId}.${image.extension}`,
    }]);
    if (!asset) throw new PhotoAssetError('storage_failed', '生成图片没有成功保存。');

    try {
      const updated = await this.prisma.materialPhoto.update({
        where: { id: asset.id },
        data: {
          generationRequestId: requestId,
          generationPrompt: description,
          generationSource: 'ark-seedream',
        },
      });
      return this.toAssetContract(updated);
    } catch {
      await this.deleteMaterials(ownerDeviceId, [asset.id]).catch(() => undefined);
      const raced = await this.findGeneratedMaterial(ownerDeviceId, requestId).catch(() => undefined);
      if (raced) return raced;
      throw new PhotoAssetError('storage_failed', '生成图片没有成功保存，请稍后重试。');
    }
  }

  async deleteMaterials(ownerDeviceId: string, photoIds: string[]) {
    if (!Array.isArray(photoIds) || photoIds.length < 1 || photoIds.length > MAX_MATERIAL_LIBRARY_PHOTOS
      || photoIds.some(id => typeof id !== 'string' || !id.trim())
      || new Set(photoIds).size !== photoIds.length) {
      throw new PhotoAssetError('invalid_input', '删除请求中的照片无效。');
    }

    let filePaths: string[] = [];
    await this.prisma.$transaction(async tx => {
      await tx.$executeRaw`
        INSERT INTO MaterialPhotoQuota (ownerDeviceId, photoCount, updatedAt)
        VALUES (${ownerDeviceId}, 0, NOW(3))
        ON DUPLICATE KEY UPDATE ownerDeviceId = VALUES(ownerDeviceId)
      `;
      await tx.$queryRaw`
        SELECT ownerDeviceId FROM MaterialPhotoQuota
        WHERE ownerDeviceId = ${ownerDeviceId}
        FOR UPDATE
      `;
      const records = await tx.materialPhoto.findMany({
        where: { ownerDeviceId, id: { in: photoIds } },
      });
      if (records.length !== photoIds.length) {
        throw new PhotoAssetError('not_found', '部分素材不存在或不属于当前设备。');
      }
      filePaths = records.map(record => this.absolutePath(record.filePath));
      await tx.materialPhoto.deleteMany({ where: { ownerDeviceId, id: { in: photoIds } } });
      const count = await tx.materialPhoto.count({ where: { ownerDeviceId } });
      await tx.materialPhotoQuota.update({
        where: { ownerDeviceId },
        data: { photoCount: count },
      });
    });
    await Promise.all(filePaths.map(path => rm(path, { force: true })));
    return { deletedPhotoIds: photoIds };
  }

  async ensureDiaryPhotoCopies(
    ownerDeviceId: string,
    diaryId: string,
    photoIds: string[],
    uploads: DiaryPhotoUpload[] = [],
    allowMissing = false,
  ) {
    const ids = [...new Set(photoIds)];
    if (!ids.length) return;
    const createdPaths: string[] = [];
    try {
      await this.prisma.$transaction(tx =>
        this.ensureDiaryPhotoCopiesInTransaction(tx, ownerDeviceId, diaryId, ids, uploads, createdPaths, allowMissing));
    } catch (error) {
      await this.removeCreatedCopies(createdPaths);
      if (error instanceof PhotoAssetError) throw error;
      throw new PhotoAssetError('storage_failed', '日记照片副本没有成功保存。');
    }
  }

  createDiaryPhotoSaveHook(ownerDeviceId: string, photoIds: string[], uploads: DiaryPhotoUpload[] = []) {
    const createdPaths: string[] = [];
    return {
      beforeCommit: (tx: Prisma.TransactionClient, diaryId: string) =>
        this.ensureDiaryPhotoCopiesInTransaction(
          tx,
          ownerDeviceId,
          diaryId,
          [...new Set(photoIds)],
          uploads,
          createdPaths,
        ),
      rollback: () => this.removeCreatedCopies(createdPaths),
    };
  }

  private async ensureDiaryPhotoCopiesInTransaction(
    tx: Prisma.TransactionClient,
    ownerDeviceId: string,
    diaryId: string,
    photoIds: string[],
    uploads: DiaryPhotoUpload[],
    createdPaths: string[],
    allowMissing = false,
  ) {
    if (!photoIds.length) return;
    const uploadByPhotoId = new Map<string, DiaryPhotoUpload>();
    let uploadBytes = 0;
    for (const upload of uploads) {
      if (!photoIds.includes(upload.photoId) || uploadByPhotoId.has(upload.photoId)
        || !Buffer.isBuffer(upload.buffer) || upload.buffer.length === 0) {
        throw new PhotoAssetError('invalid_input', '日记照片上传内容与引用不匹配。');
      }
      if (upload.buffer.length > MAX_PHOTO_BYTES) {
        throw new PhotoAssetError('limit_exceeded', '单张照片不能超过 10 MB。');
      }
      uploadBytes += upload.buffer.length;
      uploadByPhotoId.set(upload.photoId, upload);
    }
    if (uploadBytes > MAX_UPLOAD_BYTES) {
      throw new PhotoAssetError('limit_exceeded', '本次照片总量不能超过 48 MB。');
    }

    await tx.$executeRaw`
      INSERT INTO MaterialPhotoQuota (ownerDeviceId, photoCount, updatedAt)
      VALUES (${ownerDeviceId}, 0, NOW(3))
      ON DUPLICATE KEY UPDATE ownerDeviceId = VALUES(ownerDeviceId)
    `;
    await tx.$queryRaw`
      SELECT ownerDeviceId FROM MaterialPhotoQuota
      WHERE ownerDeviceId = ${ownerDeviceId}
      FOR UPDATE
    `;
    const existing = await tx.diaryPhotoCopy.findMany({
      where: { ownerDeviceId, diaryId, photoId: { in: photoIds } },
    });
    const existingIds = new Set(existing.map(item => item.photoId));
    const missingIds = photoIds.filter(id => !existingIds.has(id));
    if (!missingIds.length) return;

    const materialIds = missingIds.filter(id => !uploadByPhotoId.has(id));
    const directMaterials = materialIds.length
      ? await tx.materialPhoto.findMany({
          where: { ownerDeviceId, id: { in: materialIds } },
        })
      : [];
    const materialById = new Map(directMaterials.map(material => [material.id, material]));
    const sourceIds = materialIds.filter(id => !materialById.has(id));
    const sourceMaterials = sourceIds.length
      ? await tx.materialPhoto.findMany({
          where: { ownerDeviceId, sourceAssetId: { in: sourceIds } },
        })
      : [];
    const materialBySourceId = new Map<string, (typeof sourceMaterials)[number]>();
    const ambiguousSourceIds = new Set<string>();
    for (const material of sourceMaterials) {
      if (materialBySourceId.has(material.sourceAssetId)) ambiguousSourceIds.add(material.sourceAssetId);
      else materialBySourceId.set(material.sourceAssetId, material);
    }

    const rows = [];
    for (const photoId of missingIds) {
      const upload = uploadByPhotoId.get(photoId);
      const material = materialById.get(photoId)
        ?? (ambiguousSourceIds.has(photoId) ? undefined : materialBySourceId.get(photoId));
      if (!upload && !material) {
        if (allowMissing) continue;
        throw new PhotoAssetError('asset_unreadable', '部分日记照片无法读取，请重新选择后保存。');
      }

      const image = upload ? detectImage(upload.buffer) : undefined;
      const extension = image?.extension ?? material?.filePath.split('.').pop() ?? 'img';
      const destination = this.diaryPath(ownerDeviceId, diaryId, photoId, extension);
      await mkdir(join(this.root, 'diaries', this.ownerKey(ownerDeviceId), this.key(diaryId)), {
        recursive: true,
        mode: 0o700,
      });
      if (upload && image) {
        await writeFile(destination, upload.buffer, { flag: 'wx', mode: 0o600 });
      } else if (material) {
        try {
          const source = this.absolutePath(material.filePath);
          const buffer = await readFile(source);
          if (buffer.length !== material.size) {
            throw new PhotoAssetError('asset_unreadable', '素材原图已损坏，无法保存日记副本。');
          }
          await copyFile(source, destination);
        } catch (error) {
          await rm(destination, { force: true }).catch(() => undefined);
          if (allowMissing && error instanceof PhotoAssetError && error.code === 'asset_unreadable') continue;
          if (error instanceof PhotoAssetError) throw error;
          if (allowMissing) continue;
          throw new PhotoAssetError('asset_unreadable', '素材原图暂时无法读取，无法保存日记副本。');
        }
      }
      createdPaths.push(destination);
      rows.push({
        id: randomUUID(),
        ownerDeviceId,
        diaryId,
        photoId,
        filePath: this.relativePath(destination),
        filename: material?.filename ?? `${photoId}.${image?.extension ?? 'img'}`,
        mimeType: image?.mimeType ?? material!.mimeType,
        size: upload?.buffer.length ?? material!.size,
        title: material?.title ?? photoId,
        date: material?.date ?? upload?.date ?? null,
        width: material?.width ?? null,
        height: material?.height ?? null,
      });
    }
    if (rows.length) {
      await tx.diaryPhotoCopy.createMany({ data: rows, skipDuplicates: true });
    }
  }

  private async removeCreatedCopies(paths: string[]) {
    await Promise.all(paths.map(path => rm(path, { force: true }).catch(() => undefined)));
    paths.length = 0;
  }

  async listDiaryPhotoCopies(ownerDeviceId: string, diaryId: string) {
    const rows = await this.prisma.diaryPhotoCopy.findMany({
      where: { ownerDeviceId, diaryId },
      orderBy: { createdAt: 'asc' },
    });
    return rows.map(row => this.toAssetContract(row));
  }

  async listDiaryPhotoCopiesForDiaries(ownerDeviceId: string, diaryIds: string[]) {
    if (!Array.isArray(diaryIds) || diaryIds.length < 1 || diaryIds.length > 100
      || diaryIds.some(id => typeof id !== 'string' || !id.trim() || id.length > 191)
      || new Set(diaryIds).size !== diaryIds.length) {
      throw new PhotoAssetError('invalid_input', '日记照片查询参数无效。');
    }
    const diaries = await this.prisma.diary.findMany({
      where: { ownerDeviceId, id: { in: diaryIds } },
      select: { id: true, photoIds: true },
    });
    for (const diary of diaries) {
      const photoIds = Array.isArray(diary.photoIds)
        ? diary.photoIds.filter((id): id is string => typeof id === 'string' && id.trim().length > 0)
        : [];
      if (!photoIds.length) continue;
      await this.ensureDiaryPhotoCopies(ownerDeviceId, diary.id, photoIds, [], true);
    }

    const rows = await this.prisma.diaryPhotoCopy.findMany({
      where: { ownerDeviceId, diaryId: { in: diaryIds } },
      orderBy: [{ diaryId: 'asc' }, { createdAt: 'asc' }],
    });
    return rows.map(row => ({
      ...this.toAssetContract(row),
      id: row.photoId,
      sourceAssetId: row.photoId,
      diaryId: row.diaryId,
    }));
  }

  async readDiaryPhotoCopy(ownerDeviceId: string, diaryId: string, photoId: string) {
    const row = await this.prisma.diaryPhotoCopy.findFirst({
      where: { ownerDeviceId, diaryId, photoId },
    });
    if (!row) throw new PhotoAssetError('not_found', '日记照片不存在。');
    return this.readFile(row.filePath, row.mimeType);
  }

  async readAnyDiaryPhotoCopy(ownerDeviceId: string, photoId: string) {
    const rows = await this.prisma.diaryPhotoCopy.findMany({
      where: { ownerDeviceId, photoId },
      orderBy: { createdAt: 'asc' },
    });
    if (!rows.length) throw new PhotoAssetError('not_found', '日记照片不存在。');
    for (const row of rows) {
      try {
        return { buffer: await readFile(this.absolutePath(row.filePath)), mimeType: row.mimeType };
      } catch {
        continue;
      }
    }
    throw new PhotoAssetError('asset_unreadable', '日记照片副本暂时无法读取。');
  }

  async readMaterialPhoto(ownerDeviceId: string, photoId: string) {
    const row = await this.prisma.materialPhoto.findFirst({ where: { ownerDeviceId, id: photoId } });
    if (!row) throw new PhotoAssetError('not_found', '照片素材不存在。');
    return this.readFile(row.filePath, row.mimeType);
  }

  private async readFile(filePath: string, mimeType: string) {
    try {
      return { buffer: await readFile(this.absolutePath(filePath)), mimeType };
    } catch {
      throw new PhotoAssetError('asset_unreadable', '照片文件暂时无法读取。');
    }
  }

  private toAssetContract(record: {
    id: string;
    sourceAssetId?: string;
    photoId?: string;
    title: string;
    date: string | null;
    filename: string;
    mimeType: string;
    size: number;
    width: number | null;
    height: number | null;
    generationRequestId?: string | null;
    generationPrompt?: string | null;
    generationSource?: string | null;
    createdAt: Date;
  }) {
    return {
      id: record.id,
      sourceAssetId: record.sourceAssetId ?? record.photoId ?? record.id,
      title: record.title,
      date: record.date ?? '',
      filename: record.filename,
      mimeType: record.mimeType,
      size: record.size,
      width: record.width ?? undefined,
      height: record.height ?? undefined,
      generationRequestId: record.generationRequestId ?? undefined,
      generationPrompt: record.generationPrompt ?? undefined,
      generationSource: record.generationSource ?? undefined,
      createdAt: record.createdAt.toISOString(),
    };
  }

  private ownerKey(ownerDeviceId: string) {
    return this.key(ownerDeviceId);
  }

  private key(value: string) {
    return Buffer.from(value).toString('base64url');
  }

  private relativePath(absolutePath: string) {
    return absolutePath.slice(this.root.length + 1);
  }

  private absolutePath(filePath: string) {
    const absolutePath = resolve(this.root, filePath);
    if (!absolutePath.startsWith(`${this.root}/`)) {
      throw new PhotoAssetError('asset_unreadable', '照片存储路径无效。');
    }
    return absolutePath;
  }

  private materialPath(ownerDeviceId: string, photoId: string, extension: string) {
    return join(this.root, 'materials', this.ownerKey(ownerDeviceId), `${photoId}.${extension}`);
  }

  private diaryPath(ownerDeviceId: string, diaryId: string, photoId: string, extension: string) {
    return join(
      this.root,
      'diaries',
      this.ownerKey(ownerDeviceId),
      this.key(diaryId),
      `${this.key(photoId)}.${extension}`,
    );
  }
}
