import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { createHash } from 'node:crypto';
import { mkdir, readFile, readdir, rm, rmdir, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { DiaryGenerationProviderError, type GenerationPhotoInput } from './diary-generation.service';

export type UploadedGenerationPhoto = {
  photoId: string;
  mimeType: string;
  buffer: Buffer;
  date?: string;
};

type StoredGenerationPhoto = Omit<UploadedGenerationPhoto, 'buffer'> & {
  filename: string;
};

export class GenerationPhotoInputError extends Error {
  constructor(readonly code: 'invalid_input' | 'asset_unreadable', message: string) {
    super(message);
  }
}

const SUPPORTED_IMAGE_TYPES = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif',
]);

function positiveInteger(value: string | undefined, fallback: number) {
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : fallback;
}

function safeKey(value: string) {
  return createHash('sha256').update(value).digest('hex');
}

function isValidCaptureDateHint(value: string) {
  const match = /^(\d{4})\.(\d{2})\.(\d{2})$/.exec(value);
  if (!match) return false;
  const [, yearText, monthText, dayText] = match;
  const year = Number(yearText);
  const month = Number(monthText);
  const day = Number(dayText);
  const parsed = new Date(0);
  parsed.setFullYear(year, month - 1, day);
  parsed.setHours(0, 0, 0, 0);
  return parsed.getFullYear() === year && parsed.getMonth() === month - 1 && parsed.getDate() === day;
}

function hasImageSignature(mimeType: string, buffer: Buffer) {
  switch (mimeType.trim().toLowerCase()) {
    case 'image/jpeg':
      return buffer.length >= 3
        && buffer[0] === 0xff
        && buffer[1] === 0xd8
        && buffer[2] === 0xff;
    case 'image/png':
      return buffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
    case 'image/webp':
      return buffer.length >= 12
        && buffer.toString('ascii', 0, 4) === 'RIFF'
        && buffer.toString('ascii', 8, 12) === 'WEBP';
    case 'image/gif':
      return buffer.toString('ascii', 0, 6) === 'GIF87a'
        || buffer.toString('ascii', 0, 6) === 'GIF89a';
    default:
      return false;
  }
}

function validateUploads(
  selectedPhotoIds: string[],
  uploads: UploadedGenerationPhoto[],
) {
  if (uploads.length !== selectedPhotoIds.length) {
    throw new GenerationPhotoInputError('asset_unreadable', '所选照片没有全部上传，请返回后重新选择。');
  }
  const seen = new Set<string>();
  let totalBytes = 0;
  const maxFileBytes = positiveInteger(process.env.DIARY_GENERATION_MAX_FILE_BYTES, 10 * 1024 * 1024);
  const maxTotalBytes = positiveInteger(process.env.DIARY_GENERATION_MAX_TOTAL_BYTES, 48 * 1024 * 1024);

  uploads.forEach((photo, index) => {
    if (
      !photo
      || typeof photo.photoId !== 'string'
      || !photo.photoId.trim()
      || typeof photo.mimeType !== 'string'
      || photo.photoId !== selectedPhotoIds[index]
      || seen.has(photo.photoId)
      || !Buffer.isBuffer(photo.buffer)
      || photo.buffer.length === 0
    ) {
      throw new GenerationPhotoInputError('asset_unreadable', '所选照片与上传内容不匹配或无法读取。');
    }
    if (!SUPPORTED_IMAGE_TYPES.has(photo.mimeType.trim().toLowerCase())) {
      throw new GenerationPhotoInputError('invalid_input', '照片格式暂不支持，请选择 JPEG、PNG、WebP 或 GIF 图片。');
    }
    if (!hasImageSignature(photo.mimeType, photo.buffer)) {
      throw new GenerationPhotoInputError('asset_unreadable', '照片内容无法读取，请重新选择照片。');
    }
    if (photo.date !== undefined && !isValidCaptureDateHint(photo.date)) {
      throw new GenerationPhotoInputError('invalid_input', '照片拍摄日期格式无效，请重新选择照片。');
    }
    if (photo.buffer.length > maxFileBytes) {
      throw new GenerationPhotoInputError('invalid_input', '单张照片过大，请选择较小的照片。');
    }
    seen.add(photo.photoId);
    totalBytes += photo.buffer.length;
  });

  if (totalBytes > maxTotalBytes) {
    throw new GenerationPhotoInputError('invalid_input', '本次照片总量过大，请减少照片或选择较小的照片。');
  }
}

@Injectable()
export class TemporaryGenerationPhotoStore implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(TemporaryGenerationPhotoStore.name);
  private cleanupTimer?: ReturnType<typeof setInterval>;
  private readonly root = process.env.DIARY_GENERATION_TMP_DIR?.trim()
    || join(tmpdir(), 'orange-glow-generation-photos');

  async onModuleInit() {
    await this.cleanupExpired().catch(() => {
      this.logger.warn('Unable to clean expired temporary generation photos.');
    });
    this.cleanupTimer = setInterval(() => {
      void this.cleanupExpired().catch(() => {
        this.logger.warn('Unable to clean expired temporary generation photos.');
      });
    }, positiveInteger(process.env.DIARY_GENERATION_CLEANUP_INTERVAL_MS, 5 * 60 * 1000));
    this.cleanupTimer.unref?.();
  }

  onModuleDestroy() {
    if (this.cleanupTimer) clearInterval(this.cleanupTimer);
  }

  async stage(
    ownerDeviceId: string,
    draftId: string,
    draftVersion: number,
    selectedPhotoIds: string[],
    uploads: UploadedGenerationPhoto[],
  ) {
    validateUploads(selectedPhotoIds, uploads);
    const directory = this.getDirectory(ownerDeviceId, draftId, draftVersion);
    await mkdir(directory, { recursive: true, mode: 0o700 });
    const entries: StoredGenerationPhoto[] = [];

    for (const [index, photo] of uploads.entries()) {
      const extension = photo.mimeType === 'image/jpeg'
        ? 'jpg'
        : photo.mimeType.slice('image/'.length);
      const filename = `${String(index).padStart(4, '0')}-${safeKey(photo.photoId)}.${extension}`;
      const destination = join(directory, filename);
      await writeFile(destination, photo.buffer, { mode: 0o600 });
      entries.push({
        photoId: photo.photoId,
        mimeType: photo.mimeType,
        filename,
        date: photo.date,
      });
    }

    await writeFile(
      join(directory, 'manifest.json'),
      JSON.stringify({ createdAt: Date.now(), photos: entries }),
      { mode: 0o600 },
    );
  }

  async readForGeneration(
    ownerDeviceId: string,
    draftId: string,
    draftVersion: number,
    selectedPhotoIds: string[],
  ): Promise<GenerationPhotoInput[]> {
    const directory = this.getDirectory(ownerDeviceId, draftId, draftVersion);
    try {
      const manifest = JSON.parse(await readFile(join(directory, 'manifest.json'), 'utf8')) as {
        photos?: StoredGenerationPhoto[];
      };
      if (
        !Array.isArray(manifest.photos)
        || manifest.photos.length !== selectedPhotoIds.length
        || manifest.photos.some((photo, index) => photo.photoId !== selectedPhotoIds[index])
      ) {
        throw new Error('temporary photo manifest does not match the generation input');
      }
      const uploads = await Promise.all(manifest.photos.map(async photo => ({
        photoId: photo.photoId,
        mimeType: photo.mimeType,
        date: photo.date,
        buffer: await readFile(join(directory, photo.filename)),
      })));
      validateUploads(selectedPhotoIds, uploads);
      return uploads.map(photo => ({
        photoId: photo.photoId,
        mimeType: photo.mimeType,
        base64: photo.buffer.toString('base64'),
        date: photo.date,
      }));
    } catch (error) {
      if (error instanceof GenerationPhotoInputError) throw error;
      throw new DiaryGenerationProviderError(
        'provider_failed',
        'generation photo assets are missing or unreadable',
        false,
      );
    }
  }

  async readUploadedPhotos(
    selectedPhotoIds: string[],
    uploads: UploadedGenerationPhoto[],
  ): Promise<GenerationPhotoInput[]> {
    validateUploads(selectedPhotoIds, uploads);
    return uploads.map(photo => ({
      photoId: photo.photoId,
      mimeType: photo.mimeType,
      base64: photo.buffer.toString('base64'),
      date: photo.date,
    }));
  }

  async cleanupGeneration(ownerDeviceId: string, draftId: string, draftVersion: number) {
    const directory = this.getDirectory(ownerDeviceId, draftId, draftVersion);
    await rm(directory, { recursive: true, force: true });
    await this.removeEmptyParents(dirname(directory));
  }

  async cleanupExpired(now = Date.now()) {
    const ttl = positiveInteger(process.env.DIARY_GENERATION_TMP_TTL_MS, 2 * 60 * 60 * 1000);
    const owners = await readdir(this.root, { withFileTypes: true }).catch(() => []);
    for (const owner of owners) {
      if (!owner.isDirectory()) continue;
      const drafts = await readdir(join(this.root, owner.name), { withFileTypes: true }).catch(() => []);
      for (const draft of drafts) {
        if (!draft.isDirectory()) continue;
        const versions = await readdir(join(this.root, owner.name, draft.name), { withFileTypes: true }).catch(() => []);
        for (const version of versions) {
          if (!version.isDirectory()) continue;
          const directory = join(this.root, owner.name, draft.name, version.name);
          const info = await stat(directory).catch(() => undefined);
          if (info && now - info.mtimeMs > ttl) {
            await rm(directory, { recursive: true, force: true });
            await this.removeEmptyParents(dirname(directory));
          }
        }
      }
    }
  }

  private getDirectory(ownerDeviceId: string, draftId: string, draftVersion: number) {
    return join(this.root, safeKey(ownerDeviceId), safeKey(draftId), String(draftVersion));
  }

  private async removeEmptyParents(start: string) {
    let current = start;
    while (current !== this.root && current.startsWith(`${this.root}/`)) {
      const entries = await readdir(current).catch(() => ['not-empty']);
      if (entries.length) return;
      await rmdir(current).catch(() => undefined);
      current = dirname(current);
    }
  }
}
