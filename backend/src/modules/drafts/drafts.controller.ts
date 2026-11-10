import { CurrentUserId } from "../auth/auth-request";
import { BadRequestException, Body, Controller, ForbiddenException, Get, Headers, NotFoundException, Param, Post } from '@nestjs/common';
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
  async createDraft(@Body() body: CreateDraftBody, @CurrentUserId() ownerUserId: string) {
    try {
      return {
        ok: true,
        data: await this.store.createDraft(body, ownerUserId),
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
  async listDrafts(@CurrentUserId() ownerUserId: string) {
    return {
      ok: true,
      data: await this.store.listDrafts(ownerUserId),
    };
  }

  @Get(':id')
  async getDraft(@Param('id') id: string, @CurrentUserId() ownerUserId: string) {
    try {
      const draft = await this.store.getDraft(id, ownerUserId);
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
