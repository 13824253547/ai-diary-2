import { BadRequestException, Body, ConflictException, Controller, ForbiddenException, Get, Headers, NotFoundException, Param, Post } from '@nestjs/common';
import { resolveDeviceId } from '../../common/device-identity';
import { MemoryStoreService, PermissionDeniedError, SaveDiaryError, type DiaryContentSnapshotRecord } from '../../common/memory-store.service';

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
  privacy: string;
  photoIds: string[];
  publicBlockIds?: string[];
  contentSnapshot: DiaryContentSnapshotRecord;
  version: number;
};

@Controller('diaries')
export class DiariesController {
  constructor(private readonly store: MemoryStoreService) {}

  @Post('save')
  async saveDiary(@Body() body: SaveDiaryBody, @Headers('x-device-id') deviceId?: string) {
    try {
      const saved = await this.store.saveDiaryWithCommand(body, resolveDeviceId(deviceId));
      return {
        ok: true,
        data: {
          diaryId: saved.diaryId,
          draftId: saved.draftId,
          savedVersion: saved.savedVersion,
          id: saved.diaryId,
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
