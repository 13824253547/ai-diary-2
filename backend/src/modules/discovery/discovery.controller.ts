import { BadRequestException, Body, ConflictException, Controller, Get, Headers, NotFoundException, Param, Put, Query } from '@nestjs/common';
import { resolveDeviceId } from '../../common/device-identity';
import { DISCOVERY_PAGE_SIZES, DiscoveryService, DiscoveryStoryError } from './discovery.service';

type SetLikeBody = {
  liked?: unknown;
};

function isDecimalIntegerParam(value: unknown): value is string {
  return typeof value === 'string' && /^\d+$/.test(value);
}

@Controller('discovery')
export class DiscoveryController {
  constructor(private readonly service: DiscoveryService) {}

  @Get('stories')
  async listStories(
    @Query('keyword') keyword: unknown,
    @Query('page') pageParam: unknown,
    @Query('pageSize') pageSizeParam: unknown,
    @Query('category') categoryParam: unknown,
    @Query('city') cityParam: unknown,
    @Headers('x-device-id') deviceId?: string,
  ) {
    const ownerDeviceId = resolveDeviceId(deviceId);
    if (pageParam !== undefined && !isDecimalIntegerParam(pageParam)) {
      throw new BadRequestException({
        ok: false,
        error: { code: 'invalid_input', message: 'page must be a positive decimal integer', retryable: false },
      });
    }
    if (pageSizeParam !== undefined && !isDecimalIntegerParam(pageSizeParam)) {
      throw new BadRequestException({
        ok: false,
        error: { code: 'invalid_input', message: 'pageSize must be a decimal integer', retryable: false },
      });
    }
    if (keyword !== undefined && typeof keyword !== 'string') {
      throw new BadRequestException({
        ok: false,
        error: { code: 'invalid_input', message: 'keyword must be a string', retryable: false },
      });
    }
    const page = Number(pageParam ?? '1');
    const pageSize = Number(pageSizeParam ?? '20');
    if (!Number.isSafeInteger(page) || page < 1) {
      throw new BadRequestException({
        ok: false,
        error: { code: 'invalid_input', message: 'page must be a positive integer', retryable: false },
      });
    }
    if (!DISCOVERY_PAGE_SIZES.includes(pageSize as typeof DISCOVERY_PAGE_SIZES[number])) {
      throw new BadRequestException({
        ok: false,
        error: { code: 'invalid_input', message: 'unsupported discovery page size', retryable: false },
      });
    }
    if (categoryParam !== 'latest' && categoryParam !== 'same-city') {
      throw new BadRequestException({
        ok: false,
        error: { code: 'invalid_input', message: 'discovery category is not available', retryable: false },
      });
    }
    if (categoryParam === 'same-city'
      && (typeof cityParam !== 'string' || !cityParam.trim() || cityParam.length > 191)) {
      throw new BadRequestException({
        ok: false,
        error: { code: 'invalid_input', message: 'a valid city is required for same-city stories', retryable: false },
      });
    }

    try {
      return {
        ok: true,
        data: await this.service.listStories({
          keyword,
          page,
          pageSize,
          category: categoryParam,
          ...(typeof cityParam === 'string' ? { city: cityParam } : {}),
        }, ownerDeviceId),
      };
    } catch (error) {
      this.handleError(error);
    }
  }

  @Get('stories/:storyId')
  async getStory(
    @Param('storyId') storyId: unknown,
    @Headers('x-device-id') deviceId?: string,
  ) {
    const ownerDeviceId = resolveDeviceId(deviceId);
    if (typeof storyId !== 'string' || !storyId.trim()) {
      throw new BadRequestException({
        ok: false,
        error: { code: 'invalid_input', message: 'story ID is invalid', retryable: false },
      });
    }
    try {
      return {
        ok: true,
        data: await this.service.getStory(storyId, ownerDeviceId),
      };
    } catch (error) {
      this.handleError(error);
    }
  }

  @Put('stories/:storyId/like')
  async setLike(
    @Param('storyId') storyId: unknown,
    @Body() body: SetLikeBody,
    @Headers('x-device-id') deviceId?: string,
  ) {
    const ownerDeviceId = resolveDeviceId(deviceId);
    if (typeof storyId !== 'string' || !storyId.trim()) {
      throw new BadRequestException({
        ok: false,
        error: { code: 'invalid_input', message: 'story ID is invalid', retryable: false },
      });
    }
    if (typeof body?.liked !== 'boolean') {
      throw new BadRequestException({
        ok: false,
        error: { code: 'invalid_input', message: 'liked must be a boolean', retryable: false },
      });
    }
    try {
      return {
        ok: true,
        data: await this.service.setLike(storyId, ownerDeviceId, body.liked),
      };
    } catch (error) {
      this.handleError(error);
    }
  }

  private handleError(error: unknown): never {
    if (error instanceof DiscoveryStoryError && error.code === 'not_found') {
      throw new NotFoundException({
        ok: false,
        error: { code: 'not_found', message: error.message, retryable: false },
      });
    }
    if (error instanceof DiscoveryStoryError && error.code === 'interaction_not_available') {
      throw new ConflictException({
        ok: false,
        error: { code: 'interaction_not_available', message: error.message, retryable: false },
      });
    }
    if (error instanceof DiscoveryStoryError) {
      throw new BadRequestException({
        ok: false,
        error: { code: 'invalid_input', message: error.message, retryable: false },
      });
    }
    throw error;
  }
}
