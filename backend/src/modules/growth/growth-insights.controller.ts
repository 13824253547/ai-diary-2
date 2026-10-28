import {
  BadRequestException,
  ConflictException,
  Controller,
  ForbiddenException,
  Get,
  Headers,
  Post,
  ServiceUnavailableException,
} from '@nestjs/common';
import { resolveDeviceId } from '../../common/device-identity';
import { GrowthInsightServiceError, GrowthInsightsService } from './growth-insights.service';

@Controller('growth')
export class GrowthInsightsController {
  constructor(private readonly growth: GrowthInsightsService) {}

  @Get('state')
  async getState(@Headers('x-device-id') deviceId?: string) {
    const ownerDeviceId = resolveDeviceId(deviceId);
    return {
      ok: true,
      version: 'growth-insight-v1',
      data: await this.growth.getState(ownerDeviceId),
    };
  }

  @Post('flowers/initialize')
  async initializeFlowers(@Headers('x-device-id') deviceId?: string) {
    const ownerDeviceId = resolveDeviceId(deviceId);
    return {
      ok: true,
      version: 'growth-insight-v1',
      data: await this.growth.initializeFlowers(ownerDeviceId),
    };
  }

  @Post('flowers/retry')
  async retryFlowers(@Headers('x-device-id') deviceId?: string) {
    const ownerDeviceId = resolveDeviceId(deviceId);
    return {
      ok: true,
      version: 'growth-insight-v1',
      data: await this.growth.retryFlowerAnalysis(ownerDeviceId),
    };
  }

  @Post('reports/ensure-current')
  async ensureCurrentReport(@Headers('x-device-id') deviceId?: string) {
    const ownerDeviceId = resolveDeviceId(deviceId);
    try {
      return {
        ok: true,
        version: 'growth-insight-v1',
        data: await this.growth.ensureCurrentReport(ownerDeviceId),
      };
    } catch (error) {
      this.handleError(error);
    }
  }

  @Post('reports/retry')
  async retryReport(@Headers('x-device-id') deviceId?: string) {
    const ownerDeviceId = resolveDeviceId(deviceId);
    try {
      return {
        ok: true,
        version: 'growth-insight-v1',
        data: await this.growth.retryCurrentReport(ownerDeviceId),
      };
    } catch (error) {
      this.handleError(error);
    }
  }

  @Get('reports/current')
  async getCurrentReport(@Headers('x-device-id') deviceId?: string) {
    const ownerDeviceId = resolveDeviceId(deviceId);
    return {
      ok: true,
      version: 'growth-insight-v1',
      data: await this.growth.getState(ownerDeviceId),
    };
  }

  private handleError(error: unknown): never {
    if (error instanceof GrowthInsightServiceError) {
      const message = error.code === 'not_unlocked'
        ? '专属洞察报告尚未解锁。'
        : error.code === 'no_sources'
          ? '目前还没有可用于整理报告的日记。'
          : '日记来源已更新，请重新读取成长记录。';
      const payload = {
        ok: false,
        error: { code: error.code, message, retryable: false },
      };
      if (error.code === 'not_unlocked') throw new ForbiddenException(payload);
      if (error.code === 'source_changed') throw new ConflictException(payload);
      if (error.code === 'no_sources') throw new BadRequestException(payload);
      throw new ServiceUnavailableException(payload);
    }
    throw error;
  }
}
