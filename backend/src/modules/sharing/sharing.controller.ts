import { BadRequestException, Body, Controller, ForbiddenException, Headers, NotFoundException, Post } from '@nestjs/common';
import { resolveDeviceId } from '../../common/device-identity';
import { MemoryStoreService, PermissionDeniedError, SaveDiaryError } from '../../common/memory-store.service';

type ProjectSharingBody = {
  diaryId: string;
  privacy: 'private' | 'anonymous' | 'public-likes' | 'public-comments';
  publicBlockIds?: string[];
};

@Controller('sharing')
export class SharingController {
  constructor(private readonly store: MemoryStoreService) {}

  @Post('project')
  async project(@Body() body: ProjectSharingBody, @Headers('x-device-id') deviceId?: string) {
    try {
      const saved = await this.store.updateDiaryVisibility({
        diaryId: body.diaryId,
        privacy: body.privacy,
        publicBlockIds: body.publicBlockIds,
      }, resolveDeviceId(deviceId));
      return {
        ok: true,
        data: {
          diaryId: saved.id,
          privacy: saved.privacy,
          publicBlockIds: saved.publicBlockIds,
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
        if (error.code === 'not_found') {
          throw new NotFoundException(payload);
        }
        throw new BadRequestException(payload);
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
}
