import { BadRequestException, Body, Controller, ForbiddenException, Get, Headers, NotFoundException, Param, Post } from '@nestjs/common';
import { resolveDeviceId } from '../../common/device-identity';
import { DraftInputError, MemoryStoreService, PermissionDeniedError } from '../../common/memory-store.service';

type CreateDraftBody = {
  id?: string;
  sourceDiaryId?: string;
  type: string;
  characterId: string;
  selectedPhotoIds: string[];
  privacy: string;
  version: number;
};

@Controller('drafts')
export class DraftsController {
  constructor(private readonly store: MemoryStoreService) {}

  @Post()
  async createDraft(@Body() body: CreateDraftBody, @Headers('x-device-id') deviceId?: string) {
    try {
      return {
        ok: true,
        data: await this.store.createDraft(body, resolveDeviceId(deviceId)),
      };
    } catch (error) {
      if (error instanceof DraftInputError) {
        throw new BadRequestException({
          ok: false,
          error: {
            code: error.code,
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

  @Get()
  async listDrafts(@Headers('x-device-id') deviceId?: string) {
    return {
      ok: true,
      data: await this.store.listDrafts(resolveDeviceId(deviceId)),
    };
  }

  @Get(':id')
  async getDraft(@Param('id') id: string, @Headers('x-device-id') deviceId?: string) {
    try {
      const draft = await this.store.getDraft(id, resolveDeviceId(deviceId));
      if (!draft) throw new NotFoundException('draft not found');
      return {
        ok: true,
        data: draft,
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
