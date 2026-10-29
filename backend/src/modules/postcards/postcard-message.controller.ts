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
import { PostcardMessageProviderError } from './ark-postcard-message-provider';
import {
  POSTCARD_MESSAGE_CONTRACT_VERSION,
  PostcardMessageService,
  type PostcardMessageRequest,
} from './postcard-message.service';

function isRequest(value: unknown): value is PostcardMessageRequest {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const request = value as Record<string, unknown>;
  return request.version === POSTCARD_MESSAGE_CONTRACT_VERSION
    && typeof request.photoId === 'string'
    && request.photoId.trim().length > 0
    && request.photoId.length <= 191
    && typeof request.location === 'string'
    && request.location.length <= 80;
}

@Controller('postcards/message')
export class PostcardMessageController {
  constructor(private readonly messages: PostcardMessageService) {}

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
        error: { code: 'invalid_input', message: '明信片素材信息无效。', retryable: false },
      });
    }

    const abortController = new AbortController();
    const abortOnDisconnect = () => {
      if (!response.writableEnded) abortController.abort();
    };
    request.once('aborted', abortOnDisconnect);
    response.once('close', abortOnDisconnect);
    try {
      const data = await this.messages.generate(ownerDeviceId, request.body, abortController.signal);
      return {
        ok: true,
        version: POSTCARD_MESSAGE_CONTRACT_VERSION,
        data,
      };
    } catch (error) {
      if (error instanceof HttpException) throw error;
      if (error instanceof PostcardMessageProviderError) {
        const unavailable = error.code === 'unconfigured';
        const timedOut = error.code === 'timeout';
        const invalidResponse = error.code === 'invalid_response';
        const status = unavailable ? 503 : timedOut ? 504 : 502;
        throw new HttpException({
          ok: false,
          error: {
            code: unavailable
              ? 'provider_unavailable'
              : timedOut
                ? 'provider_timeout'
                : invalidResponse
                  ? 'invalid_response'
                  : 'provider_failed',
            message: unavailable ? '寄语服务暂不可用，请稍后重试。' : '寄语暂时无法生成，请稍后重试。',
            retryable: !unavailable && !invalidResponse,
          },
        }, status);
      }
      if (error instanceof PhotoAssetError) {
        const notFound = error.code === 'not_found';
        throw new HttpException({
          ok: false,
          error: {
            code: error.code,
            message: notFound ? '所选照片素材已不可用，请重新选择。' : '所选照片暂时无法读取。',
            retryable: !notFound,
          },
        }, notFound ? 404 : 500);
      }
      throw new HttpException({
        ok: false,
        error: {
          code: 'provider_failed',
          message: '寄语暂时无法生成，请稍后重试。',
          retryable: true,
        },
      }, 500);
    } finally {
      request.removeListener('aborted', abortOnDisconnect);
      response.removeListener('close', abortOnDisconnect);
    }
  }
}
