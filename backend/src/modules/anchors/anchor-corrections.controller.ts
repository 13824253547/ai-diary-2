import {
  BadRequestException,
  Body,
  ConflictException,
  Controller,
  ForbiddenException,
  Get,
  Headers,
  NotFoundException,
  Param,
  Put,
  Query,
} from '@nestjs/common';
import { resolveDeviceId } from '../../common/device-identity';
import {
  AnchorCorrectionError,
  AnchorCorrectionsService,
  type SaveAnchorCorrectionInput,
} from './anchor-corrections.service';

type SaveCorrectionBody = Partial<Record<keyof SaveAnchorCorrectionInput, unknown>>;

function parseDecimalIntegerParam(value: unknown): number | null {
  if (typeof value !== 'string' || !/^[0-9]+$/.test(value)) return null;
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) ? parsed : null;
}

@Controller('anchors')
export class AnchorCorrectionsController {
  constructor(private readonly service: AnchorCorrectionsService) {}

  @Get(':anchorId/correction')
  async getCorrection(
    @Param('anchorId') anchorId: unknown,
    @Query('diaryId') diaryId: unknown,
    @Query('diaryVersion') versionParam: unknown,
    @Headers('x-device-id') deviceId?: string,
  ) {
    const ownerDeviceId = resolveDeviceId(deviceId);
    const diaryVersion = parseDecimalIntegerParam(versionParam);
    if (typeof anchorId !== 'string' || !anchorId.trim()
      || typeof diaryId !== 'string' || !diaryId.trim()
      || diaryVersion === null || diaryVersion < 1) {
      throw this.invalidInput('请提供日记标识和有效的来源版本。');
    }
    try {
      return {
        ok: true,
        version: 'anchor-correction-v1',
        data: await this.service.getCorrection({
          diaryId,
          diaryVersion,
          anchorId,
        }, ownerDeviceId),
      };
    } catch (error) {
      this.handleError(error);
    }
  }

  @Put(':anchorId/correction')
  async saveCorrection(
    @Param('anchorId') anchorId: unknown,
    @Body() body: SaveCorrectionBody,
    @Headers('x-device-id') deviceId?: string,
  ) {
    const ownerDeviceId = resolveDeviceId(deviceId);
    if (typeof anchorId !== 'string' || !anchorId.trim()
      || typeof body?.diaryId !== 'string'
      || typeof body.diaryVersion !== 'number'
      || typeof body.sourceBlockId !== 'string'
      || typeof body.correction !== 'string'
      || typeof body.expectedVersion !== 'number'
      || typeof body.idempotencyKey !== 'string') {
      throw this.invalidInput('纠正请求信息不完整。');
    }
    try {
      return {
        ok: true,
        version: 'anchor-correction-v1',
        data: await this.service.saveCorrection({
          diaryId: body.diaryId,
          diaryVersion: body.diaryVersion,
          anchorId,
          sourceBlockId: body.sourceBlockId,
          correction: body.correction,
          expectedVersion: body.expectedVersion,
          idempotencyKey: body.idempotencyKey,
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
    if (error instanceof AnchorCorrectionError) {
      const payload = {
        ok: false,
        error: { code: error.code, message: error.message, retryable: false },
      };
      if (error.code === 'not_found') throw new NotFoundException(payload);
      if (error.code === 'permission_denied') throw new ForbiddenException(payload);
      if (error.code === 'version_conflict') throw new ConflictException(payload);
      throw new BadRequestException(payload);
    }
    throw error;
  }
}
