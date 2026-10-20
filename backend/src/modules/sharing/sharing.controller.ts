import { BadRequestException, Body, Controller, ForbiddenException, Headers, NotFoundException, Post } from '@nestjs/common';
import { resolveDeviceId } from '../../common/device-identity';
import { MemoryStoreService, PermissionDeniedError, SaveDiaryError } from '../../common/memory-store.service';

type ProjectSharingBody = {
  diaryId: string;
  privacy: 'private' | 'anonymous' | 'public-likes' | 'public-comments';
  publicBlockIds?: string[];
};

const privacySettings = ['private', 'anonymous', 'public-likes', 'public-comments'] as const;

function isProjectSharingBody(value: unknown): value is ProjectSharingBody {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false;
  const body = value as Record<string, unknown>;
  return typeof body.diaryId === 'string'
    && body.diaryId.trim().length > 0
    && typeof body.privacy === 'string'
    && privacySettings.includes(body.privacy as typeof privacySettings[number])
    && (body.publicBlockIds === undefined
      || (Array.isArray(body.publicBlockIds)
        && body.publicBlockIds.every(item => typeof item === 'string' && item.trim().length > 0)));
}

@Controller('sharing')
export class SharingController {
  constructor(private readonly store: MemoryStoreService) {}

  @Post('project')
  async project(@Body() body: unknown, @Headers('x-device-id') deviceId?: string) {
    const ownerDeviceId = resolveDeviceId(deviceId);
    if (!isProjectSharingBody(body)) {
      throw new BadRequestException({
        ok: false,
        error: {
          code: 'invalid_input',
          message: '公开范围请求参数无效。',
          retryable: false,
        },
      });
    }
    try {
      const saved = await this.store.updateDiaryVisibility({
        diaryId: body.diaryId,
        privacy: body.privacy,
        publicBlockIds: body.publicBlockIds,
      }, ownerDeviceId);
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
