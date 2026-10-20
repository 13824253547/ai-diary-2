import { BadGatewayException, BadRequestException, Body, ConflictException, Controller, ForbiddenException, GatewayTimeoutException, Get, Headers, NotFoundException, Param, Post } from '@nestjs/common';
import { DiaryGenerationProviderError, type RewriteInputSnapshot } from '../../common/diary-generation.service';
import { resolveDeviceId } from '../../common/device-identity';
import { GenerationJobError, MemoryStoreService, PermissionDeniedError, RewriteDraftError } from '../../common/memory-store.service';

type CreateGenerationBody = {
  draftId: string;
  draftVersion: number;
  idempotencyKey: string;
};

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
    && (body.photoIds === undefined || isStringIdArray(body.photoIds));
}

@Controller('generation')
export class GenerationController {
  constructor(private readonly store: MemoryStoreService) {}

  @Post('jobs')
  async createJob(@Body() body: unknown, @Headers('x-device-id') deviceId?: string) {
    const ownerDeviceId = resolveDeviceId(deviceId);
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
    try {
      return {
        ok: true,
        data: await this.store.createGenerationJob(body, ownerDeviceId),
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
  async rewriteBlock(@Body() body: unknown, @Headers('x-device-id') deviceId?: string) {
    const ownerDeviceId = resolveDeviceId(deviceId);
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
    try {
      return {
        ok: true,
        data: await this.store.rewriteDraftBlock(body, ownerDeviceId),
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
