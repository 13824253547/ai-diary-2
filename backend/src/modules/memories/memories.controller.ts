import { BadRequestException, Controller, Get, Headers, Query } from '@nestjs/common';
import { resolveDeviceId } from '../../common/device-identity';
import { MemoryStoreService } from '../../common/memory-store.service';

const SUPPORTED_PAGE_SIZES = [10, 20, 50, 100];

function isDecimalIntegerParam(value: unknown): value is string {
  return typeof value === 'string' && /^\d+$/.test(value);
}

function isValidMonth(value: unknown): value is string {
  if (typeof value !== 'string') return false;
  const match = /^(\d{4})-(\d{2})$/.exec(value);
  if (!match) return false;
  const year = Number(match[1]);
  const month = Number(match[2]);
  return year > 0 && month >= 1 && month <= 12;
}

function isValidDay(value: unknown): value is string {
  if (typeof value !== 'string') return false;
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return false;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (year < 1 || month < 1 || month > 12 || day < 1) return false;
  const isLeapYear = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  const daysPerMonth = [31, isLeapYear ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  return day <= daysPerMonth[month - 1];
}

@Controller('memories')
export class MemoriesController {
  constructor(private readonly store: MemoryStoreService) {}

  @Get()
  async listMemories(
    @Query('month') month?: unknown,
    @Query('day') day?: unknown,
    @Query('keyword') keyword?: unknown,
    @Query('page') pageParam?: unknown,
    @Query('pageSize') pageSizeParam?: unknown,
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
    const page = Number(pageParam ?? '1');
    const pageSize = Number(pageSizeParam ?? '20');
    if (!Number.isSafeInteger(page) || page < 1) {
      throw new BadRequestException({
        ok: false,
        error: { code: 'invalid_input', message: 'page must be a positive integer', retryable: false },
      });
    }
    if (!SUPPORTED_PAGE_SIZES.includes(pageSize)) {
      throw new BadRequestException({
        ok: false,
        error: { code: 'invalid_input', message: 'unsupported memories page size', retryable: false },
      });
    }
    if (month !== undefined && !isValidMonth(month)) {
      throw new BadRequestException({
        ok: false,
        error: { code: 'invalid_input', message: 'month must use YYYY-MM with a valid month', retryable: false },
      });
    }
    if (day !== undefined && !isValidDay(day)) {
      throw new BadRequestException({
        ok: false,
        error: { code: 'invalid_input', message: 'day must use YYYY-MM-DD with a valid calendar date', retryable: false },
      });
    }
    if (keyword !== undefined && typeof keyword !== 'string') {
      throw new BadRequestException({
        ok: false,
        error: { code: 'invalid_input', message: 'keyword must be a string', retryable: false },
      });
    }
    const normalizedMonth = month?.replaceAll('-', '.');
    const normalizedDay = day?.replaceAll('-', '.');
    const normalizedKeyword = keyword?.trim();
    const filtered = (await this.store.listDiaries(ownerDeviceId)).filter(item => {
      const matchesMonth = !normalizedMonth || item.date.startsWith(normalizedMonth);
      const matchesDay = !normalizedDay || item.date === normalizedDay;
      const matchesKeyword = !normalizedKeyword
        || item.title.includes(normalizedKeyword)
        || item.summary.includes(normalizedKeyword)
        || item.location.includes(normalizedKeyword);
      return matchesMonth && matchesDay && matchesKeyword;
    });
    const start = (page - 1) * pageSize;
    const items = filtered.slice(start, start + pageSize);

    return {
      ok: true,
      data: {
        items,
        page,
        pageSize,
        total: filtered.length,
      },
    };
  }
}
