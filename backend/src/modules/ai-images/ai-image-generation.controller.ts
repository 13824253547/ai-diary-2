import {
  BadRequestException,
  Controller,
  Headers,
  HttpException,
  Post,
  Req,
  Res,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { resolveDeviceId } from '../../common/device-identity';
import { PhotoAssetError } from '../photos/photo-asset.service';
import { AIImageProviderError } from './ark-seedream-image-provider';
import {
  AI_IMAGE_GENERATION_CONTRACT_VERSION,
  AIImageGenerationService,
  type AIImageGenerationRequest,
} from './ai-image-generation.service';

function isRequest(value: unknown): value is AIImageGenerationRequest {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const request = value as Record<string, unknown>;
  return request.version === AI_IMAGE_GENERATION_CONTRACT_VERSION
    && typeof request.requestId === 'string'
    && request.requestId.trim().length > 0
    && request.requestId.length <= 191
    && Number.isSafeInteger(request.attempt)
    && Number(request.attempt) > 0
    && typeof request.description === 'string'
    && request.description.trim().length > 0
    && request.description.length <= 100_000
    && typeof request.generatedAt === 'string'
    && Number.isFinite(Date.parse(request.generatedAt));
}

@Controller('photos/materials/ai')
export class AIImageGenerationController {
  constructor(private readonly generation: AIImageGenerationService) {}

  @Post()
  async generate(
    @Headers('x-device-id') deviceId: string | undefined,
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ) {
    const ownerDeviceId = resolveDeviceId(deviceId);
    if (!isRequest(request.body)) {
      throw new BadRequestException({
        ok: false,
        error: { code: 'invalid_input', message: '配图描述无效，请检查后重试。', retryable: false },
      });
    }
    const abortController = new AbortController();
    const abortOnDisconnect = () => {
      if (!response.writableEnded) abortController.abort();
    };
    request.once('aborted', abortOnDisconnect);
    response.once('close', abortOnDisconnect);
    try {
      const asset = await this.generation.generate(ownerDeviceId, request.body, abortController.signal);
      return {
        ok: true,
        data: {
          version: AI_IMAGE_GENERATION_CONTRACT_VERSION,
          requestId: request.body.requestId,
          source: 'provider',
          photo: {
            ...asset,
            generationRequestId: request.body.requestId,
            generationPrompt: request.body.description,
            generationSource: 'provider',
          },
        },
      };
    } catch (error) {
      if (error instanceof HttpException) throw error;
      if (error instanceof AIImageProviderError) {
        const status = error.code === 'unconfigured' ? 503 : 502;
        throw new HttpException({
          ok: false,
          error: {
            code: error.code === 'timeout' ? 'provider_timeout' : 'provider_failed',
            message: error.code === 'unconfigured'
              ? '配图服务尚未配置，请稍后重试。'
              : '配图暂时无法生成，请稍后重试。',
            retryable: error.code !== 'unconfigured',
          },
        }, status);
      }
      if (error instanceof PhotoAssetError) {
        throw new HttpException({
          ok: false,
          error: { code: error.code, message: error.message, retryable: error.code === 'storage_failed' },
        }, error.code === 'limit_exceeded' ? 409 : 500);
      }
      throw new HttpException({
        ok: false,
        error: { code: 'provider_failed', message: '配图暂时无法生成，请稍后重试。', retryable: true },
      }, 500);
    } finally {
      request.removeListener('aborted', abortOnDisconnect);
      response.removeListener('close', abortOnDisconnect);
    }
  }
}
