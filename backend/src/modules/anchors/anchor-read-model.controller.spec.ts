import { BadRequestException, ConflictException, ServiceUnavailableException } from '@nestjs/common';
import { AnchorReadModelController } from './anchor-read-model.controller';
import {
  AnchorReadModelError,
  AnchorReadModelService,
} from './anchor-read-model.service';

describe('AnchorReadModelController', () => {
  const service = {
    listByTag: jest.fn(),
    listFeed: jest.fn(),
    countFeed: jest.fn(),
    getChatHistory: jest.fn(),
    beginExtraction: jest.fn(),
    completeExtraction: jest.fn(),
    failExtraction: jest.fn(),
  } as unknown as AnchorReadModelService;
  const controller = new AnchorReadModelController(service);

  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('checks history identity first and forwards batch-scoped pagination', async () => {
    await expect(controller.getChatHistory(undefined, 'bad', '15', undefined))
      .rejects.toMatchObject({ response: { error: { code: 'device_identity_required' } } });
    expect(service.getChatHistory).not.toHaveBeenCalled();
    await expect(controller.getChatHistory('batch-1', '1e1', '100', 'device-1'))
      .rejects.toBeInstanceOf(BadRequestException);
    jest.mocked(service.getChatHistory).mockResolvedValue({ batchId: 'batch-1' } as never);
    await expect(controller.getChatHistory('batch-1', undefined, undefined, 'device-1'))
      .resolves.toMatchObject({ version: 'memory-anchor-v1', data: { batchId: 'batch-1' } });
    expect(service.getChatHistory).toHaveBeenCalledWith('batch-1', { page: 1, pageSize: 100 }, 'device-1');
  });

  test('requires an explicit tag and device identity for read queries', async () => {
    jest.mocked(service.listByTag).mockResolvedValue({
      items: [],
      tagId: 'tag-stable',
      page: 1,
      pageSize: 20,
      total: 0,
    });

    await expect(controller.listByTag(undefined, undefined, undefined, 'device-1'))
      .rejects.toBeInstanceOf(BadRequestException);
    await expect(controller.listByTag('tag-stable', undefined, undefined, undefined))
      .rejects.toBeInstanceOf(BadRequestException);
    await expect(controller.listByTag('tag-stable', undefined, undefined, 'device-1'))
      .resolves.toMatchObject({
        ok: true,
        version: 'anchor-extraction-v1',
        data: { tagId: 'tag-stable', items: [] },
      });
    expect(service.listByTag).toHaveBeenCalledWith({
      tagId: 'tag-stable',
      page: 1,
      pageSize: 20,
    }, 'device-1');
  });

  test('returns the mixed feed for an optional tag and protects the real count', async () => {
    jest.mocked(service.listFeed).mockResolvedValue({
      items: [],
      tagId: null,
      page: 1,
      pageSize: 20,
      total: 3,
    });
    jest.mocked(service.countFeed).mockResolvedValue(3);

    await expect(controller.listFeed(undefined, undefined, undefined, undefined))
      .rejects.toMatchObject({ response: { error: { code: 'device_identity_required' } } });
    await expect(controller.listFeed(undefined, undefined, undefined, 'device-1'))
      .resolves.toMatchObject({
        ok: true,
        version: 'memory-anchor-v1',
        data: { tagId: null, total: 3 },
      });
    expect(service.listFeed).toHaveBeenCalledWith({ page: 1, pageSize: 20 }, 'device-1');
    await expect(controller.getSummary('device-1')).resolves.toEqual({
      ok: true,
      version: 'memory-anchor-v1',
      data: { total: 3 },
    });
    expect(service.countFeed).toHaveBeenCalledWith('device-1');
  });

  test('requires device identity before validating malformed queries and extraction bodies', async () => {
    await expect(controller.listByTag(undefined, '0', '15', undefined))
      .rejects.toMatchObject({
        response: { error: { code: 'device_identity_required' } },
      });
    await expect(controller.beginExtraction(undefined as never, undefined))
      .rejects.toMatchObject({
        response: { error: { code: 'device_identity_required' } },
      });
    expect(service.listByTag).not.toHaveBeenCalled();
    expect(service.beginExtraction).not.toHaveBeenCalled();
  });

  test.each([
    ['tag-stable', '0x10', undefined],
    ['tag-stable', '1e1', undefined],
    ['tag-stable', '1.0', undefined],
    ['tag-stable', ' 1 ', undefined],
    [['tag-a', 'tag-b'], undefined, undefined],
    ['tag-stable', ['1', '2'], undefined],
    ['tag-stable', undefined, ['10', '20']],
  ])('rejects malformed or repeated read query parameters', async (tagId, page, pageSize) => {
    await expect(controller.listByTag(tagId, page, pageSize, 'device-1'))
      .rejects.toBeInstanceOf(BadRequestException);
    expect(service.listByTag).not.toHaveBeenCalled();
  });

  test('rejects incomplete extraction commands before service calls', async () => {
    await expect(controller.beginExtraction({
      diaryId: 'diary-1',
      diaryVersion: 2,
      requestId: 'request-1',
    }, 'device-1')).rejects.toBeInstanceOf(BadRequestException);
    expect(service.beginExtraction).not.toHaveBeenCalled();
  });

  test('passes source validation to the service instead of accepting mock persistence', async () => {
    jest.mocked(service.completeExtraction)
      .mockRejectedValueOnce(new AnchorReadModelError('invalid_input', 'mock result'));
    await expect(controller.completeExtraction({
      attempt: 1,
      result: { source: 'mock' },
    }, 'device-1')).rejects.toBeInstanceOf(BadRequestException);
    expect(service.completeExtraction).toHaveBeenCalledWith({
      attempt: 1,
      result: { source: 'mock' },
    }, 'device-1');
  });

  test('maps stale versions and missing provider configuration to explicit HTTP errors', async () => {
    jest.mocked(service.beginExtraction)
      .mockRejectedValueOnce(new AnchorReadModelError('version_conflict', 'stale'))
      .mockRejectedValueOnce(new AnchorReadModelError('provider_failed', 'unconfigured'));
    const body = {
      diaryId: 'diary-1',
      diaryVersion: 2,
      requestId: 'request-1',
      attempt: 1,
    };

    await expect(controller.beginExtraction(body, 'device-1'))
      .rejects.toBeInstanceOf(ConflictException);
    await expect(controller.beginExtraction(body, 'device-1'))
      .rejects.toBeInstanceOf(ServiceUnavailableException);
  });
});
