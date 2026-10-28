import { BadRequestException, Body, ConflictException, Controller, ForbiddenException, Get, Headers, InternalServerErrorException, NotFoundException, Param, Post, UploadedFiles, UseInterceptors } from '@nestjs/common';
import { FilesInterceptor } from '@nestjs/platform-express';
import { resolveDeviceId } from '../../common/device-identity';
import { MemoryStoreService, PermissionDeniedError, SaveDiaryError, type DiaryContentSnapshotRecord } from '../../common/memory-store.service';
import { DiaryAnchorGenerationService } from '../anchors/diary-anchor-generation.service';
import { PhotoAssetError, PhotoAssetService, type DiaryPhotoUpload } from '../photos/photo-asset.service';
import { BoundedMemoryUploadStorage } from '../generation/bounded-memory-upload-storage';
import { GrowthInsightsService } from '../growth/growth-insights.service';

const diaryPhotoUploadStorage = new BoundedMemoryUploadStorage(48 * 1024 * 1024);

type SaveDiaryBody = {
  id?: string;
  draftId: string;
  sourceDiaryId?: string;
  sourceDiaryVersion?: number;
  idempotencyKey: string;
  title: string;
  summary: string;
  location: string;
  date: string;
  publishedLocalDate?: string;
  privacy: string;
  photoIds: string[];
  publicBlockIds?: string[];
  contentSnapshot: DiaryContentSnapshotRecord;
  version: number;
};

type DiaryPhotoMetadata = Pick<DiaryPhotoUpload, 'photoId' | 'date'>;
type UploadedPhotoFile = { buffer: Buffer; mimetype: string };

function parseJsonField(value: unknown) {
  if (typeof value !== 'string') return value;
  try {
    return JSON.parse(value) as unknown;
  } catch {
    return undefined;
  }
}

function parseIntegerField(value: unknown) {
  if (typeof value !== 'string' || !/^\d+$/.test(value)) return value;
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) ? parsed : value;
}

function parseSaveDiaryBody(value: unknown): SaveDiaryBody | undefined {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined;
  const body = value as Record<string, unknown>;
  return {
    ...body,
    sourceDiaryVersion: parseIntegerField(body.sourceDiaryVersion),
    version: parseIntegerField(body.version),
    photoIds: parseJsonField(body.photoIds),
    publicBlockIds: parseJsonField(body.publicBlockIds),
    contentSnapshot: parseJsonField(body.contentSnapshot),
  } as SaveDiaryBody;
}

function readPhotoMetadata(value: unknown): DiaryPhotoMetadata[] | undefined {
  const parsed = parseJsonField(value);
  if (!Array.isArray(parsed) || parsed.some(photo =>
    !photo
    || typeof photo !== 'object'
    || Array.isArray(photo)
    || typeof (photo as Record<string, unknown>).photoId !== 'string'
    || !(photo as Record<string, unknown>).photoId?.toString().trim()
    || ((photo as Record<string, unknown>).date !== undefined
      && typeof (photo as Record<string, unknown>).date !== 'string'))) {
    return undefined;
  }
  return parsed as DiaryPhotoMetadata[];
}

function pairDiaryPhotoUploads(
  body: SaveDiaryBody,
  files: UploadedPhotoFile[],
  metadataValue: unknown,
): DiaryPhotoUpload[] | undefined {
  if (!files.length) return metadataValue === undefined ? [] : (readPhotoMetadata(metadataValue)?.length === 0 ? [] : undefined);
  const metadata = readPhotoMetadata(metadataValue);
  if (!metadata
    || metadata.length !== files.length
    || !Array.isArray(body.photoIds)
    || new Set(metadata.map(item => item.photoId)).size !== metadata.length
    || metadata.some(item => !body.photoIds.includes(item.photoId))) {
    return undefined;
  }
  return files.map((file, index) => ({
    photoId: metadata[index].photoId,
    mimeType: file.mimetype,
    buffer: file.buffer,
    date: metadata[index].date,
  }));
}

@Controller('diaries')
export class DiariesController {
  constructor(
    private readonly store: MemoryStoreService,
    private readonly photoAssets: PhotoAssetService,
    private readonly diaryAnchors: DiaryAnchorGenerationService,
    private readonly growthInsights: GrowthInsightsService,
  ) {}

  @Post('save')
  @UseInterceptors(FilesInterceptor('photos', 128, {
    storage: diaryPhotoUploadStorage,
    limits: { fileSize: 10 * 1024 * 1024, files: 128 },
  }))
  async saveDiary(
    @Body() rawBody: unknown,
    @Headers('x-device-id') deviceId?: string,
    @UploadedFiles() files: UploadedPhotoFile[] = [],
  ) {
    try {
      const ownerDeviceId = resolveDeviceId(deviceId);
      const body = parseSaveDiaryBody(rawBody);
      if (!body) {
        throw new BadRequestException({
          ok: false,
          error: { code: 'invalid_input', message: 'diary save request is invalid', retryable: false },
        });
      }
      const uploads = pairDiaryPhotoUploads(body, files, (rawBody as Record<string, unknown>).photoMetadata);
      if (!uploads) {
        throw new BadRequestException({
          ok: false,
          error: { code: 'asset_unreadable', message: '日记照片没有全部上传，请重试。', retryable: false },
        });
      }
      const photoIds = Array.isArray(body.photoIds) ? body.photoIds : [];
      const assetHook = this.photoAssets.createDiaryPhotoSaveHook(ownerDeviceId, photoIds, uploads);
      const saved = await this.store.saveDiaryWithCommand(body, ownerDeviceId, assetHook);
      await this.photoAssets.ensureDiaryPhotoCopies(ownerDeviceId, saved.diaryId, photoIds);
      this.diaryAnchors.enqueue(ownerDeviceId, saved.diaryId, saved.savedVersion);
      this.growthInsights.enqueueAfterDiarySaved(ownerDeviceId, saved.diaryId, saved.savedVersion);
      return {
        ok: true,
        data: {
          diaryId: saved.diaryId,
          draftId: saved.draftId,
          savedVersion: saved.savedVersion,
          id: saved.diaryId,
          date: saved.date,
        },
      };
    } catch (error) {
      if (error instanceof SaveDiaryError) {
        const payload = {
          ok: false,
          error: {
            code: error.code,
            message: error.message,
            retryable: false,
          },
        };
        if (error.code === 'not_found') throw new NotFoundException(payload);
        if (error.code === 'invalid_input') throw new BadRequestException(payload);
        throw new ConflictException(payload);
      }
      if (error instanceof PermissionDeniedError) {
        throw new ForbiddenException({
          ok: false,
          error: {
            code: 'permission_denied',
            message: error.message,
            retryable: false,
          },
        });
      }
      if (error instanceof PhotoAssetError) {
        const payload = {
          ok: false,
          error: { code: error.code, message: error.message, retryable: false },
        };
        if (error.code === 'invalid_input' || error.code === 'asset_unreadable') {
          throw new BadRequestException(payload);
        }
        if (error.code === 'not_found') throw new NotFoundException(payload);
        throw new InternalServerErrorException(payload);
      }
      throw error;
    }
  }

  @Get('save-results/:idempotencyKey')
  async getSaveResult(@Param('idempotencyKey') idempotencyKey: string, @Headers('x-device-id') deviceId?: string) {
    try {
      const result = await this.store.getSaveResult(idempotencyKey, resolveDeviceId(deviceId));
      if (!result) throw new NotFoundException('save result not found');
      return {
        ok: true,
        data: result,
      };
    } catch (error) {
      if (error instanceof PermissionDeniedError) {
        throw new ForbiddenException({
          ok: false,
          error: {
            code: 'permission_denied',
            message: error.message,
            retryable: false,
          },
        });
      }
      throw error;
    }
  }

  @Get(':id')
  async getDiary(@Param('id') id: string, @Headers('x-device-id') deviceId?: string) {
    try {
      const diary = await this.store.getDiary(id, resolveDeviceId(deviceId));
      if (!diary) throw new NotFoundException('diary not found');
      return {
        ok: true,
        data: diary,
      };
    } catch (error) {
      if (error instanceof PermissionDeniedError) {
        throw new ForbiddenException({
          ok: false,
          error: {
            code: 'permission_denied',
            message: error.message,
            retryable: false,
          },
        });
      }
      throw error;
    }
  }
}
