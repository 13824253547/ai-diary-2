import { BadRequestException, ConflictException } from '@nestjs/common';
import { DiscoveryController } from './discovery.controller';
import { DiscoveryService, DiscoveryStoryError } from './discovery.service';

describe('DiscoveryController', () => {
  const service = {
    listStories: jest.fn(),
    getStory: jest.fn(),
    setLike: jest.fn(),
  } as unknown as DiscoveryService;
  const controller = new DiscoveryController(service);

  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('requires a device identity and forwards an explicit latest category', async () => {
    jest.mocked(service.listStories).mockResolvedValue({
      items: [],
      page: 1,
      pageSize: 20,
      total: 0,
    });

    const response = await controller.listStories('  old town  ', undefined, undefined, 'latest', undefined, 'device-1');

    expect(response).toMatchObject({ ok: true, data: { items: [], page: 1, pageSize: 20 } });
    expect(service.listStories).toHaveBeenCalledWith({
      keyword: '  old town  ',
      page: 1,
      pageSize: 20,
      category: 'latest',
    }, 'device-1');
    await expect(controller.listStories(undefined, undefined, undefined, 'latest', undefined, '  '))
      .rejects.toBeInstanceOf(BadRequestException);
  });

  test('requires device identity before validating query, story, or like input', async () => {
    const requests = [
      controller.listStories(undefined, '0', '15', undefined, undefined),
      controller.getStory('', undefined),
      controller.setLike('story-1', { liked: 'yes' }),
    ];

    for (const request of requests) {
      await expect(request).rejects.toMatchObject({
        response: {
          error: { code: 'device_identity_required' },
        },
      });
    }
    expect(service.listStories).not.toHaveBeenCalled();
    expect(service.getStory).not.toHaveBeenCalled();
    expect(service.setLike).not.toHaveBeenCalled();
  });

  test('rejects an empty story ID after resolving device identity', async () => {
    await expect(controller.getStory('', 'device-1'))
      .rejects.toBeInstanceOf(BadRequestException);
    expect(service.getStory).not.toHaveBeenCalled();
  });

  test.each([undefined, 'recommended', 'local'])('rejects unresolved category %s', async category => {
    await expect(
      controller.listStories(undefined, undefined, undefined, category, undefined, 'device-1'),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(service.listStories).not.toHaveBeenCalled();
  });

  test('requires a city value for same-city stories and forwards the city filter', async () => {
    jest.mocked(service.listStories).mockResolvedValue({
      items: [],
      page: 1,
      pageSize: 20,
      total: 0,
    });

    await expect(
      controller.listStories(undefined, undefined, undefined, 'same-city', undefined, 'device-1'),
    ).rejects.toBeInstanceOf(BadRequestException);
    await expect(
      controller.listStories(undefined, undefined, undefined, 'same-city', '台南市', 'device-1'),
    ).resolves.toMatchObject({ ok: true });
    expect(service.listStories).toHaveBeenCalledWith({
      keyword: undefined,
      page: 1,
      pageSize: 20,
      category: 'same-city',
      city: '台南市',
    }, 'device-1');
  });

  test.each(['0', '-1', '1.5', '9007199254740992'])('rejects invalid page %s before querying', async page => {
    await expect(
      controller.listStories(undefined, page, '20', 'latest', undefined, 'device-1'),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(service.listStories).not.toHaveBeenCalled();
  });

  test.each(['0x10', '1e1', '1.0', ' 1 '])('rejects non-decimal page values %s', async page => {
    await expect(
      controller.listStories(undefined, page, '20', 'latest', undefined, 'device-1'),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(service.listStories).not.toHaveBeenCalled();
  });

  test.each(['0x14', '20.0', ' 20 '])('rejects non-decimal pageSize values %s', async pageSize => {
    await expect(
      controller.listStories(undefined, '1', pageSize, 'latest', undefined, 'device-1'),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(service.listStories).not.toHaveBeenCalled();
  });

  test('rejects repeated keyword and pagination query parameters', async () => {
    await expect(
      controller.listStories(['first', 'second'], '1', '20', 'latest', undefined, 'device-1'),
    ).rejects.toBeInstanceOf(BadRequestException);
    await expect(
      controller.listStories(undefined, ['1', '2'], '20', 'latest', undefined, 'device-1'),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(service.listStories).not.toHaveBeenCalled();
  });

  test.each(['15', '200'])('rejects unsupported page size %s before querying', async pageSize => {
    await expect(
      controller.listStories(undefined, '1', pageSize, 'latest', undefined, 'device-1'),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(service.listStories).not.toHaveBeenCalled();
  });

  test('requires an explicit target like state', async () => {
    await expect(
      controller.setLike('story-1', { liked: 'yes' }, 'device-1'),
    ).rejects.toBeInstanceOf(BadRequestException);
    await expect(
      controller.setLike('   ', { liked: true }, 'device-1'),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(service.setLike).not.toHaveBeenCalled();
  });

  test('preserves the unavailable-interaction domain error for disabled likes', async () => {
    jest.mocked(service.setLike).mockRejectedValue(
      new DiscoveryStoryError('interaction_not_available', 'likes are not enabled for this story'),
    );

    try {
      await controller.setLike('story-1', { liked: true }, 'device-1');
      fail('expected interaction error');
    } catch (error) {
      expect(error).toBeInstanceOf(ConflictException);
      expect((error as ConflictException).getStatus()).toBe(409);
      expect((error as ConflictException).getResponse()).toEqual({
        ok: false,
        error: {
          code: 'interaction_not_available',
          message: 'likes are not enabled for this story',
          retryable: false,
        },
      });
    }
  });
});
