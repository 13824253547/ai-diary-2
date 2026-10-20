import {
  BadRequestException,
  Body,
  ConflictException,
  Controller,
  ForbiddenException,
  Get,
  Headers,
  NotFoundException,
  Post,
  Query,
  ServiceUnavailableException,
} from '@nestjs/common';
import { resolveDeviceId } from '../../common/device-identity';
import {
  ANCHOR_PAGE_SIZES,
  AnchorReadModelError,
  AnchorReadModelService,
} from './anchor-read-model.service';

type BeginExtractionBody = {
  diaryId?: unknown;
  diaryVersion?: unknown;
  requestId?: unknown;
  attempt?: unknown;
};

type CompleteExtractionBody = {
  attempt?: unknown;
  result?: unknown;
};

type FailExtractionBody = {
  diaryId?: unknown;
  diaryVersion?: unknown;
  requestId?: unknown;
  attempt?: unknown;
  failureCode?: unknown;
};

function parseDecimalIntegerParam(value: unknown, defaultValue: number): number | null {
  if (value === undefined) return defaultValue;
  if (typeof value !== 'string' || !/^[0-9]+$/.test(value)) return null;
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) ? parsed : null;
}

@Controller('anchors')
export class AnchorReadModelController {
  constructor(private readonly service: AnchorReadModelService) {}

  @Get()
  async listByTag(
    @Query('tagId') tagId: unknown,
    @Query('page') pageParam: unknown,
    @Query('pageSize') pageSizeParam: unknown,
    @Headers('x-device-id') deviceId?: string,
  ) {
    const ownerDeviceId = resolveDeviceId(deviceId);
    const page = parseDecimalIntegerParam(pageParam, 1);
    const pageSize = parseDecimalIntegerParam(pageSizeParam, 20);
    if (typeof tagId !== 'string' || !tagId.trim()) throw this.invalidInput('请明确提供标签标识。');
    if (page === null || page < 1 || pageSize === null
      || !ANCHOR_PAGE_SIZES.includes(pageSize as typeof ANCHOR_PAGE_SIZES[number])) {
      throw this.invalidInput('锚点分页条件无效。');
    }
    try {
      return {
        ok: true,
        version: 'anchor-extraction-v1',
        data: await this.service.listByTag({ tagId, page, pageSize }, ownerDeviceId),
      };
    } catch (error) {
      this.handleError(error);
    }
  }

  @Post('extractions/begin')
  async beginExtraction(
    @Body() body: BeginExtractionBody,
    @Headers('x-device-id') deviceId?: string,
  ) {
    const ownerDeviceId = resolveDeviceId(deviceId);
    if (typeof body?.diaryId !== 'string'
      || typeof body.diaryVersion !== 'number'
      || typeof body.requestId !== 'string'
      || typeof body.attempt !== 'number') {
      throw this.invalidInput('锚点提取请求信息不完整。');
    }
    try {
      return {
        ok: true,
        version: 'anchor-extraction-v1',
        data: await this.service.beginExtraction({
          diaryId: body.diaryId,
          diaryVersion: body.diaryVersion,
          requestId: body.requestId,
          attempt: body.attempt,
        }, ownerDeviceId),
      };
    } catch (error) {
      this.handleError(error);
    }
  }

  @Post('extractions/complete')
  async completeExtraction(
    @Body() body: CompleteExtractionBody,
    @Headers('x-device-id') deviceId?: string,
  ) {
    const ownerDeviceId = resolveDeviceId(deviceId);
    if (typeof body?.attempt !== 'number' || body.result === undefined) {
      throw this.invalidInput('锚点提取结果信息不完整。');
    }
    try {
      return {
        ok: true,
        version: 'anchor-extraction-v1',
        data: await this.service.completeExtraction({
          attempt: body.attempt,
          result: body.result,
        }, ownerDeviceId),
      };
    } catch (error) {
      this.handleError(error);
    }
  }

  @Post('extractions/failure')
  async failExtraction(
    @Body() body: FailExtractionBody,
    @Headers('x-device-id') deviceId?: string,
  ) {
    const ownerDeviceId = resolveDeviceId(deviceId);
    if (typeof body?.diaryId !== 'string'
      || typeof body.diaryVersion !== 'number'
      || typeof body.requestId !== 'string'
      || typeof body.attempt !== 'number'
      || (body.failureCode !== 'timeout'
        && body.failureCode !== 'cancelled'
        && body.failureCode !== 'provider_failed')) {
      throw this.invalidInput('锚点提取失败信息无效。');
    }
    try {
      return {
        ok: true,
        version: 'anchor-extraction-v1',
        data: await this.service.failExtraction({
          diaryId: body.diaryId,
          diaryVersion: body.diaryVersion,
          requestId: body.requestId,
          attempt: body.attempt,
          failureCode: body.failureCode,
        }, ownerDeviceId),
      };
    } catch (error) {
      this.handleError(error);
    }
  }

  private invalidInput(message: string) {
    return new BadRequestException({
      ok: false,
      error: { code: 'invalid_input', message, retryable: false },
    });
  }

  private handleError(error: unknown): never {
    if (error instanceof AnchorReadModelError) {
      const payload = {
        ok: false,
        error: { code: error.code, message: error.message, retryable: false },
      };
      if (error.code === 'not_found') throw new NotFoundException(payload);
      if (error.code === 'permission_denied') throw new ForbiddenException(payload);
      if (error.code === 'version_conflict') throw new ConflictException(payload);
      if (error.code === 'provider_failed') throw new ServiceUnavailableException(payload);
      throw new BadRequestException(payload);
    }
    throw error;
  }
}
