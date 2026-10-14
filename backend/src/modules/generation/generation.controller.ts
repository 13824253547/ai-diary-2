import { BadGatewayException, BadRequestException, Body, ConflictException, Controller, ForbiddenException, GatewayTimeoutException, Get, Headers, NotFoundException, Param, Post } from '@nestjs/common';
import { DiaryGenerationProviderError, type RewriteInputSnapshot } from '../../common/diary-generation.service';
import { resolveDeviceId } from '../../common/device-identity';
import { GenerationJobError, MemoryStoreService, PermissionDeniedError, RewriteDraftError } from '../../common/memory-store.service';

type CreateGenerationBody = {
  draftId: string;
  draftVersion: number;
  idempotencyKey: string;
};

@Controller('generation')
export class GenerationController {
  constructor(private readonly store: MemoryStoreService) {}

  @Post('jobs')
  async createJob(@Body() body: CreateGenerationBody, @Headers('x-device-id') deviceId?: string) {
    try {
      return {
        ok: true,
        data: await this.store.createGenerationJob(body, resolveDeviceId(deviceId)),
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
  async rewriteBlock(@Body() body: RewriteInputSnapshot, @Headers('x-device-id') deviceId?: string) {
    try {
      return {
        ok: true,
        data: await this.store.rewriteDraftBlock(body, resolveDeviceId(deviceId)),
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
