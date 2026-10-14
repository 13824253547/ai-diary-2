import { Controller, Get, Headers, Query } from '@nestjs/common';
import { resolveDeviceId } from '../../common/device-identity';
import { MemoryStoreService } from '../../common/memory-store.service';

@Controller('memories')
export class MemoriesController {
  constructor(private readonly store: MemoryStoreService) {}

  @Get()
  async listMemories(
    @Query('month') month?: string,
    @Query('day') day?: string,
    @Query('keyword') keyword?: string,
    @Query('page') pageParam?: string,
    @Query('pageSize') pageSizeParam?: string,
    @Headers('x-device-id') deviceId?: string,
  ) {
    const page = Math.max(Number(pageParam ?? '1') || 1, 1);
    const pageSize = Math.max(Number(pageSizeParam ?? '20') || 20, 1);
    const normalizedMonth = month?.replaceAll('-', '.');
    const normalizedDay = day?.replaceAll('-', '.');
    const normalizedKeyword = keyword?.trim();
    const filtered = (await this.store.listDiaries(resolveDeviceId(deviceId))).filter(item => {
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
