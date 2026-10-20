import { BadRequestException, ConflictException, ServiceUnavailableException } from '@nestjs/common';
import { AnchorReadModelController } from './anchor-read-model.controller';
import {
  AnchorReadModelError,
  AnchorReadModelService,
} from './anchor-read-model.service';

describe('AnchorReadModelController', () => {
  const service = {
    listByTag: jest.fn(),
    beginExtraction: jest.fn(),
    completeExtraction: jest.fn(),
    failExtraction: jest.fn(),
  } as unknown as AnchorReadModelService;
  const controller = new AnchorReadModelController(service);

  beforeEach(() => {
    jest.clearAllMocks();
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
