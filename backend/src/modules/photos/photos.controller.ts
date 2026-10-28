import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Headers,
  InternalServerErrorException,
  NotFoundException,
  Param,
  PayloadTooLargeException,
  Post,
  Query,
  StreamableFile,
  UploadedFiles,
  UseInterceptors,
} from '@nestjs/common';
import { FilesInterceptor } from '@nestjs/platform-express';
import { resolveDeviceId } from '../../common/device-identity';
import { BoundedMemoryUploadStorage } from '../generation/bounded-memory-upload-storage';
import { PhotoAssetError, PhotoAssetService, type PhotoAssetUploadMetadata } from './photo-asset.service';

const materialUploadStorage = new BoundedMemoryUploadStorage(48 * 1024 * 1024);

type UploadedPhotoFile = { buffer: Buffer; mimetype: string };

function parseMetadata(value: unknown): PhotoAssetUploadMetadata[] | undefined {
  let parsed = value;
  if (typeof value === 'string') {
    try {
      parsed = JSON.parse(value) as unknown;
    } catch {
      return undefined;
    }
  }
  if (!Array.isArray(parsed)) return undefined;
  return parsed as PhotoAssetUploadMetadata[];
}

function throwPhotoAssetError(error: unknown): never {
  if (error instanceof PhotoAssetError) {
    const payload = {
      ok: false,
      error: { code: error.code, message: error.message, retryable: false },
    };
    if (error.code === 'not_found') throw new NotFoundException(payload);
    if (error.code === 'limit_exceeded') throw new PayloadTooLargeException(payload);
    if (error.code === 'invalid_input' || error.code === 'asset_unreadable') {
      throw new BadRequestException(payload);
    }
    if (error.code === 'storage_failed') throw new InternalServerErrorException(payload);
  }
  throw error;
}

@Controller('photos')
export class PhotosController {
  constructor(private readonly assets: PhotoAssetService) {}

  @Get('capabilities')
  getCapabilities(@Headers('x-device-id') deviceId?: string) {
    resolveDeviceId(deviceId);
    return {
      ok: true,
      data: {
        source: 'device-client',
        permissions: ['full', 'limited', 'denied', 'revoked'],
      },
    };
  }

  @Get('materials')
  async listMaterials(@Headers('x-device-id') deviceId?: string) {
    const ownerDeviceId = resolveDeviceId(deviceId);
    try {
      return { ok: true, data: await this.assets.listMaterials(ownerDeviceId) };
    } catch (error) {
      throwPhotoAssetError(error);
    }
  }

  @Post('materials')
  @UseInterceptors(FilesInterceptor('photos', 12, {
    storage: materialUploadStorage,
    limits: { fileSize: 10 * 1024 * 1024, files: 12 },
  }))
  async uploadMaterials(
    @Headers('x-device-id') deviceId: string | undefined,
    @Body() body: { photoMetadata?: unknown },
    @UploadedFiles() files: UploadedPhotoFile[] = [],
  ) {
    const ownerDeviceId = resolveDeviceId(deviceId);
    const metadata = parseMetadata(body?.photoMetadata);
    try {
      return {
        ok: true,
        data: await this.assets.uploadMaterials(ownerDeviceId, files, metadata ?? []),
      };
    } catch (error) {
      throwPhotoAssetError(error);
    }
  }

  @Delete('materials')
  async deleteMaterials(
    @Headers('x-device-id') deviceId: string | undefined,
    @Body() body: { photoIds?: unknown },
  ) {
    const ownerDeviceId = resolveDeviceId(deviceId);
    try {
      return { ok: true, data: await this.assets.deleteMaterials(ownerDeviceId, body?.photoIds as string[]) };
    } catch (error) {
      throwPhotoAssetError(error);
    }
  }

  @Get('materials/:photoId/content')
  async readMaterial(
    @Headers('x-device-id') deviceId: string | undefined,
    @Param('photoId') photoId: string,
  ) {
    const ownerDeviceId = resolveDeviceId(deviceId);
    try {
      const file = await this.assets.readMaterialPhoto(ownerDeviceId, photoId);
      return new StreamableFile(file.buffer, { type: file.mimeType });
    } catch (error) {
      throwPhotoAssetError(error);
    }
  }

  @Get('discovery/:storyId/photo-content')
  async readDiscoveryPhotoByQuery(
    @Param('storyId') storyId: unknown,
    @Query('photoId') photoId: unknown,
  ) {
    if (typeof storyId !== 'string' || !storyId.trim()
      || typeof photoId !== 'string' || !photoId.trim() || photoId.length > 191) {
      throwPhotoAssetError(new PhotoAssetError('invalid_input', '公开故事照片查询参数无效。'));
    }
    try {
      const file = await this.assets.readDiscoveryPhotoCopy(storyId, photoId);
      return new StreamableFile(file.buffer, { type: file.mimeType });
    } catch (error) {
      throwPhotoAssetError(error);
    }
  }

  @Get('diaries/assets')
  async listDiaryPhotosForDiaries(
    @Query('diaryIds') diaryIds: string | undefined,
    @Headers('x-device-id') deviceId: string | undefined,
  ) {
    const ownerDeviceId = resolveDeviceId(deviceId);
    try {
      if (!diaryIds) throw new PhotoAssetError('invalid_input', '日记照片查询参数无效。');
      return {
        ok: true,
        data: await this.assets.listDiaryPhotoCopiesForDiaries(ownerDeviceId, diaryIds.split(',')),
      };
    } catch (error) {
      throwPhotoAssetError(error);
    }
  }

  @Get('diaries/:diaryId/photos')
  async listDiaryPhotoCopies(
    @Headers('x-device-id') deviceId: string | undefined,
    @Param('diaryId') diaryId: string,
  ) {
    const ownerDeviceId = resolveDeviceId(deviceId);
    try {
      return { ok: true, data: await this.assets.listDiaryPhotoCopies(ownerDeviceId, diaryId) };
    } catch (error) {
      throwPhotoAssetError(error);
    }
  }

  @Get('diary-copies/:photoId/content')
  async readAnyDiaryPhotoCopy(
    @Headers('x-device-id') deviceId: string | undefined,
    @Param('photoId') photoId: string,
  ) {
    const ownerDeviceId = resolveDeviceId(deviceId);
    try {
      const file = await this.assets.readAnyDiaryPhotoCopy(ownerDeviceId, photoId);
      return new StreamableFile(file.buffer, { type: file.mimeType });
    } catch (error) {
      throwPhotoAssetError(error);
    }
  }

  @Get('diaries/:diaryId/photo-content')
  async readDiaryPhotoByQuery(
    @Headers('x-device-id') deviceId: string | undefined,
    @Param('diaryId') diaryId: string,
    @Query('photoId') photoId: unknown,
  ) {
    const ownerDeviceId = resolveDeviceId(deviceId);
    if (typeof photoId !== 'string' || !photoId.trim() || photoId.length > 191) {
      throwPhotoAssetError(new PhotoAssetError('invalid_input', '日记照片查询参数无效。'));
    }
    try {
      const file = await this.assets.readDiaryPhotoCopy(ownerDeviceId, diaryId, photoId);
      return new StreamableFile(file.buffer, { type: file.mimeType });
    } catch (error) {
      throwPhotoAssetError(error);
    }
  }

  @Get('diaries/:diaryId/photos/:photoId/content')
  async readDiaryPhoto(
    @Headers('x-device-id') deviceId: string | undefined,
    @Param('diaryId') diaryId: string,
    @Param('photoId') photoId: string,
  ) {
    const ownerDeviceId = resolveDeviceId(deviceId);
    try {
      const file = await this.assets.readDiaryPhotoCopy(ownerDeviceId, diaryId, photoId);
      return new StreamableFile(file.buffer, { type: file.mimeType });
    } catch (error) {
      throwPhotoAssetError(error);
    }
  }
}
