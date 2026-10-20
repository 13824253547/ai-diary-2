import { BadRequestException } from '@nestjs/common';
import { MemoryStoreService } from '../../common/memory-store.service';
import { MemoriesController } from './memories.controller';

describe('MemoriesController', () => {
  const store = {
    listDiaries: jest.fn().mockResolvedValue([]),
  } as unknown as MemoryStoreService;
  const controller = new MemoriesController(store);

  beforeEach(() => {
    jest.clearAllMocks();
  });

  test.each([10, 20, 50, 100])('accepts page size %s', async pageSize => {
    const result = await controller.listMemories(undefined, undefined, undefined, '1', String(pageSize), 'device-test');

    expect(result.data.pageSize).toBe(pageSize);
    expect(store.listDiaries).toHaveBeenCalledWith('device-test');
  });

  test('rejects unsupported page sizes before reading diary data', async () => {
    await expect(
      controller.listMemories(undefined, undefined, undefined, '1', '15', 'device-test'),
    ).rejects.toBeInstanceOf(BadRequestException);

    expect(store.listDiaries).not.toHaveBeenCalled();
  });

  test('rejects invalid page numbers before reading diary data', async () => {
    await expect(
      controller.listMemories(undefined, undefined, undefined, '1.5', '20', 'device-test'),
    ).rejects.toBeInstanceOf(BadRequestException);

    expect(store.listDiaries).not.toHaveBeenCalled();
  });

  test.each(['1e0', '0x10', '1.0', ' 1 '])('rejects non-decimal page values %s', async page => {
    await expect(
      controller.listMemories(undefined, undefined, undefined, page, '20', 'device-test'),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(store.listDiaries).not.toHaveBeenCalled();
  });

  test.each(['20.0', '0x14', ' 20 '])('rejects non-decimal pageSize values %s', async pageSize => {
    await expect(
      controller.listMemories(undefined, undefined, undefined, '1', pageSize, 'device-test'),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(store.listDiaries).not.toHaveBeenCalled();
  });

  test('rejects repeated keyword and pagination query parameters', async () => {
    await expect(
      controller.listMemories(undefined, undefined, ['first', 'second'], '1', '20', 'device-test'),
    ).rejects.toBeInstanceOf(BadRequestException);
    await expect(
      controller.listMemories(undefined, undefined, undefined, ['1', '2'], '20', 'device-test'),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(store.listDiaries).not.toHaveBeenCalled();
  });

  test('requires device identity before reporting malformed query values', async () => {
    await expect(
      controller.listMemories(undefined, undefined, ['first', 'second'], '1', '20'),
    ).rejects.toMatchObject({
      response: { error: { code: 'device_identity_required' } },
    });
    expect(store.listDiaries).not.toHaveBeenCalled();
  });

  test.each(['2026-13', '2026/02', '0000-01'])('rejects invalid month %s before reading diary data', async month => {
    await expect(
      controller.listMemories(month, undefined, undefined, '1', '20', 'device-test'),
    ).rejects.toBeInstanceOf(BadRequestException);

    expect(store.listDiaries).not.toHaveBeenCalled();
  });

  test.each(['2026-02-29', '2024-02-30', '2024/02/29'])('rejects invalid day %s before reading diary data', async day => {
    await expect(
      controller.listMemories(undefined, day, undefined, '1', '20', 'device-test'),
    ).rejects.toBeInstanceOf(BadRequestException);

    expect(store.listDiaries).not.toHaveBeenCalled();
  });

  test('accepts leap days that exist in the calendar', async () => {
    await expect(
      controller.listMemories('2024-02', '2024-02-29', undefined, '1', '20', 'device-test'),
    ).resolves.toMatchObject({ data: { total: 0 } });
    expect(store.listDiaries).toHaveBeenCalledWith('device-test');
  });
});
