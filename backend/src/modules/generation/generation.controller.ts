import { BadGatewayException, BadRequestException, Body, CanActivate, ConflictException, Controller, ExecutionContext, ForbiddenException, GatewayTimeoutException, Get, Headers, Injectable, NotFoundException, Param, Post, UploadedFiles, UseGuards, UseInterceptors } from '@nestjs/common';
import { FilesInterceptor } from '@nestjs/platform-express';
import { DiaryGenerationProviderError, type RewriteContextBlock, type RewriteInputSnapshot } from '../../common/diary-generation.service';
import { resolveDeviceId } from '../../common/device-identity';
import { GenerationJobError, MemoryStoreService, PermissionDeniedError, RewriteDraftError } from '../../common/memory-store.service';
import { GenerationPhotoInputError, type UploadedGenerationPhoto } from '../../common/temporary-generation-photo-store';
import { BoundedMemoryUploadStorage } from './bounded-memory-upload-storage';

function positiveLimit(value: string | undefined, fallback: number) {
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : fallback;
}

const photoUploadFileLimit = positiveLimit(process.env.DIARY_GENERATION_MAX_FILE_BYTES, 10 * 1024 * 1024);
const photoUploadTotalLimit = positiveLimit(process.env.DIARY_GENERATION_MAX_TOTAL_BYTES, 48 * 1024 * 1024);
const photoUploadStorage = new BoundedMemoryUploadStorage(photoUploadTotalLimit);

type CreateGenerationBody = {
  draftId: string;
  draftVersion: number;
  idempotencyKey: string;
};

type UploadedFile = {
  buffer: Buffer;
  mimetype: string;
};

type PhotoMetadata = {
  photoId: string;
  date?: string;
};

@Injectable()
export class GenerationIdentityGuard implements CanActivate {
  canActivate(context: ExecutionContext) {
    const request = context.switchToHttp().getRequest<{ headers: Record<string, string | string[] | undefined> }>();
    const header = request.headers['x-device-id'];
    resolveDeviceId(typeof header === 'string' ? header : undefined);
    return true;
  }
}

function isCreateGenerationBody(value: unknown): value is CreateGenerationBody {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false;
  const body = value as Record<string, unknown>;
  return typeof body.draftId === 'string'
    && body.draftId.trim().length > 0
    && Number.isSafeInteger(body.draftVersion)
    && (body.draftVersion as number) > 0
    && typeof body.idempotencyKey === 'string'
    && body.idempotencyKey.trim().length > 0;
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

function isStringIdArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every(isNonEmptyString);
}

function parseJsonField(value: unknown) {
  if (typeof value !== 'string') return value;
  try {
    return JSON.parse(value) as unknown;
  } catch {
    return undefined;
  }
}

function parseGenerationBody(value: unknown): unknown {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return value;
  const body = value as Record<string, unknown>;
  return {
    draftId: body.draftId,
    draftVersion: typeof body.draftVersion === 'string' && /^\d+$/.test(body.draftVersion)
      ? Number(body.draftVersion)
      : body.draftVersion,
    idempotencyKey: body.idempotencyKey,
  };
}

function parseRewriteBody(value: unknown): unknown {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return value;
  const body = value as Record<string, unknown>;
  const {
    photoMetadata: _photoMetadata,
    ...rewriteFields
  } = body;
  return {
    ...rewriteFields,
    draftVersion: typeof body.draftVersion === 'string' && /^\d+$/.test(body.draftVersion)
      ? Number(body.draftVersion)
      : body.draftVersion,
    photoIds: parseJsonField(body.photoIds),
    selectedPhotoIds: parseJsonField(body.selectedPhotoIds),
    contextBlocks: parseJsonField(body.contextBlocks),
  };
}

function readPhotoMetadata(value: unknown): PhotoMetadata[] | undefined {
  const parsed = parseJsonField(value);
  if (!Array.isArray(parsed)) return undefined;
  if (parsed.some(photo =>
    !photo
    || typeof photo !== 'object'
    || Array.isArray(photo)
    || !isNonEmptyString((photo as Record<string, unknown>).photoId)
    || ((photo as Record<string, unknown>).date !== undefined
      && typeof (photo as Record<string, unknown>).date !== 'string'))) {
    return undefined;
  }
  return parsed as PhotoMetadata[];
}

function pairUploadedFiles(
  files: UploadedFile[] | undefined,
  metadata: PhotoMetadata[] | undefined,
): UploadedGenerationPhoto[] | undefined {
  if (!files || !metadata || files.length !== metadata.length) return undefined;
  return files.map((file, index) => ({
    photoId: metadata[index].photoId,
    mimeType: file.mimetype,
    buffer: file.buffer,
    date: metadata[index].date,
  }));
}

function isRewriteBody(value: unknown): value is RewriteInputSnapshot {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false;
  const body = value as Record<string, unknown>;
  return isNonEmptyString(body.draftId)
    && isNonEmptyString(body.blockId)
    && Number.isSafeInteger(body.draftVersion)
    && (body.draftVersion as number) > 0
    && isNonEmptyString(body.characterId)
    && (body.blockType === 'text' || body.blockType === 'quote')
    && isNonEmptyString(body.content)
    && isStringIdArray(body.selectedPhotoIds)
    && (body.photoIds === undefined || isStringIdArray(body.photoIds))
    && (body.contextBlocks === undefined || (
      Array.isArray(body.contextBlocks)
      && body.contextBlocks.every((block): block is RewriteContextBlock =>
        !!block
        && typeof block === 'object'
        && !Array.isArray(block)
        && isNonEmptyString((block as Record<string, unknown>).id)
        && ((block as Record<string, unknown>).type === 'text' || (block as Record<string, unknown>).type === 'quote')
        && isNonEmptyString((block as Record<string, unknown>).content))
    ));
}

@Controller('generation')
@UseGuards(GenerationIdentityGuard)
export class GenerationController {
  constructor(private readonly store: MemoryStoreService) {}

  @Post('jobs')
  @UseInterceptors(FilesInterceptor('photos', 128, {
    storage: photoUploadStorage,
    limits: { fileSize: photoUploadFileLimit, files: 128 },
  }))
  async createJob(
    @Body() rawBody: unknown,
    @Headers('x-device-id') deviceId?: string,
    @UploadedFiles() files: UploadedFile[] = [],
  ) {
    const ownerDeviceId = resolveDeviceId(deviceId);
    const body = parseGenerationBody(rawBody);
    if (!isCreateGenerationBody(body)) {
      throw new BadRequestException({
        ok: false,
        error: {
          code: 'invalid_input',
          message: '生成任务请求参数无效。',
          retryable: false,
        },
      });
    }
    const metadata = readPhotoMetadata(
      rawBody && typeof rawBody === 'object' && !Array.isArray(rawBody)
        ? (rawBody as Record<string, unknown>).photoMetadata
        : undefined,
    );
    const uploads = pairUploadedFiles(files, metadata);
    if (!uploads) {
      throw new BadRequestException({
        ok: false,
        error: {
          code: 'asset_unreadable',
          message: '所选照片没有全部上传，请返回后重新选择。',
          retryable: false,
        },
      });
    }
    try {
      return {
        ok: true,
        data: await this.store.createGenerationJob(body, ownerDeviceId, uploads),
      };
    } catch (error) {
      if (error instanceof GenerationJobError && error.code === 'not_found') {
        throw new NotFoundException({
          ok: false,
          error: {
            code: 'not_found',
            message: error.message,
            retryable: false,
          },
        });
      }
      if (error instanceof GenerationJobError && error.code === 'version_conflict') {
        throw new ConflictException({
          ok: false,
          error: {
            code: 'version_conflict',
            message: error.message,
            retryable: false,
          },
        });
      }
      if (error instanceof GenerationJobError && error.code === 'invalid_input') {
        throw new BadRequestException({
          ok: false,
          error: { code: 'invalid_input', message: error.message, retryable: false },
        });
      }
      if (error instanceof GenerationJobError && error.code === 'asset_unreadable') {
        throw new BadRequestException({
          ok: false,
          error: { code: 'asset_unreadable', message: error.message, retryable: false },
        });
      }
      if (error instanceof GenerationPhotoInputError) {
        throw new BadRequestException({
          ok: false,
          error: { code: error.code, message: error.message, retryable: false },
        });
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
      throw error;
    }
  }

  @Post('rewrite')
  @UseInterceptors(FilesInterceptor('photos', 1, {
    storage: photoUploadStorage,
    limits: { fileSize: photoUploadFileLimit, files: 1 },
  }))
  async rewriteBlock(
    @Body() rawBody: unknown,
    @Headers('x-device-id') deviceId?: string,
    @UploadedFiles() files: UploadedFile[] = [],
  ) {
    const ownerDeviceId = resolveDeviceId(deviceId);
    const body = parseRewriteBody(rawBody);
    if (!isRewriteBody(body)) {
      throw new BadRequestException({
        ok: false,
        error: {
          code: 'invalid_input',
          message: '重写请求参数无效。',
          retryable: false,
        },
      });
    }
    const metadata = readPhotoMetadata(
      rawBody && typeof rawBody === 'object' && !Array.isArray(rawBody)
        ? (rawBody as Record<string, unknown>).photoMetadata
        : undefined,
    );
    const uploads = pairUploadedFiles(files, metadata);
    if (!uploads) {
      throw new BadRequestException({
        ok: false,
        error: {
          code: 'asset_unreadable',
          message: '目标段落引用图片无法读取，请重新选择。',
          retryable: false,
        },
      });
    }
    try {
      return {
        ok: true,
        data: await this.store.rewriteDraftBlock(body, ownerDeviceId, uploads),
      };
    } catch (error) {
      if (error instanceof RewriteDraftError && error.code === 'not_found') {
        throw new NotFoundException({
          ok: false,
          error: {
            code: 'not_found',
            message: error.message,
            retryable: false,
          },
        });
      }
      if (error instanceof RewriteDraftError && error.code === 'version_conflict') {
        throw new ConflictException({
          ok: false,
          error: {
            code: 'version_conflict',
            message: error.message,
            retryable: false,
          },
        });
      }
      if (error instanceof RewriteDraftError) {
        throw new BadRequestException({
          ok: false,
          error: {
            code: error.code,
            message: error.message,
            retryable: false,
          },
        });
      }
      if (error instanceof GenerationPhotoInputError) {
        throw new BadRequestException({
          ok: false,
          error: { code: error.code, message: error.message, retryable: false },
        });
      }
      if (error instanceof DiaryGenerationProviderError) {
        const payload = {
          ok: false,
          error: {
            code: error.code,
            message: error.message,
            retryable: error.retryable,
          },
        };
        if (error.code === 'timeout') {
          throw new GatewayTimeoutException(payload);
        }
        throw new BadGatewayException(payload);
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
      throw error;
    }
  }

  @Get('jobs/:jobId')
  async getJob(@Param('jobId') jobId: string, @Headers('x-device-id') deviceId?: string) {
    try {
      const job = await this.store.getGenerationJob(jobId, resolveDeviceId(deviceId));
      if (!job) {
        throw new NotFoundException({
          ok: false,
          error: {
            code: 'not_found',
            message: 'generation job not found',
            retryable: false,
          },
        });
      }
      return {
        ok: true,
        data: job,
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

  @Post('jobs/:jobId/cancel')
  async cancelJob(@Param('jobId') jobId: string, @Headers('x-device-id') deviceId?: string) {
    try {
      const job = await this.store.cancelGenerationJob(jobId, resolveDeviceId(deviceId));
      if (!job) {
        throw new NotFoundException({
          ok: false,
          error: {
            code: 'not_found',
            message: 'generation job not found',
            retryable: false,
          },
        });
      }
      return {
        ok: true,
        data: job,
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
