import { BadRequestException, ConflictException, ForbiddenException } from '@nestjs/common';
import { AnchorCorrectionsController } from './anchor-corrections.controller';
import {
  AnchorCorrectionError,
  AnchorCorrectionsService,
} from './anchor-corrections.service';

describe('AnchorCorrectionsController', () => {
  const service = {
    getCorrection: jest.fn(),
    saveCorrection: jest.fn(),
  } as unknown as AnchorCorrectionsService;
  const controller = new AnchorCorrectionsController(service);

  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('returns the versioned empty read envelope for the authenticated account', async () => {
    jest.mocked(service.getCorrection).mockResolvedValue(null);

    await expect(controller.getCorrection('anchor-1', 'diary-1', '3', 'user-1'))
      .resolves.toEqual({
        ok: true,
        version: 'anchor-correction-v1',
        data: null,
      });
    expect(service.getCorrection).toHaveBeenCalledWith({
      diaryId: 'diary-1',
      diaryVersion: 3,
      anchorId: 'anchor-1',
    }, 'user-1');
  });

  test('validates malformed correction input after the auth guard supplies an account', async () => {
    await expect(controller.getCorrection('anchor-1', undefined, ['3', '4'], 'user-1'))
      .rejects.toBeInstanceOf(BadRequestException);
    await expect(controller.saveCorrection('anchor-1', undefined as never, 'user-1'))
      .rejects.toBeInstanceOf(BadRequestException);
    expect(service.getCorrection).not.toHaveBeenCalled();
    expect(service.saveCorrection).not.toHaveBeenCalled();
  });

  test.each(['0x3', '3e0', '3.0', ' 3 '])('rejects non-decimal source versions (%s)', async version => {
    await expect(controller.getCorrection('anchor-1', 'diary-1', version, 'device-1'))
      .rejects.toBeInstanceOf(BadRequestException);
    expect(service.getCorrection).not.toHaveBeenCalled();
  });

  test('rejects repeated or malformed correction read parameters', async () => {
    await expect(controller.getCorrection('anchor-1', ['diary-1', 'diary-2'], '3', 'device-1'))
      .rejects.toBeInstanceOf(BadRequestException);
    await expect(controller.getCorrection(['anchor-1', 'anchor-2'], 'diary-1', '3', 'device-1'))
      .rejects.toBeInstanceOf(BadRequestException);
    await expect(controller.getCorrection('anchor-1', 'diary-1', ['3', '4'], 'device-1'))
      .rejects.toBeInstanceOf(BadRequestException);
    expect(service.getCorrection).not.toHaveBeenCalled();
  });

  test('rejects incomplete write bodies before reaching the service', async () => {
    await expect(controller.saveCorrection('anchor-1', {
      diaryId: 'diary-1',
      correction: 'Meaning',
    }, 'device-1')).rejects.toBeInstanceOf(BadRequestException);
    expect(service.saveCorrection).not.toHaveBeenCalled();
  });

  test('maps permission and optimistic version conflicts to explicit HTTP errors', async () => {
    jest.mocked(service.saveCorrection)
      .mockRejectedValueOnce(new AnchorCorrectionError('permission_denied', 'not owned'))
      .mockRejectedValueOnce(new AnchorCorrectionError('version_conflict', 'stale'));
    const input = {
      diaryId: 'diary-1',
      diaryVersion: 3,
      sourceBlockId: 'block-1',
      correction: 'Meaning',
      expectedVersion: 0,
      idempotencyKey: 'request-1',
    };

    await expect(controller.saveCorrection('anchor-1', input, 'device-1'))
      .rejects.toBeInstanceOf(ForbiddenException);
    await expect(controller.saveCorrection('anchor-1', input, 'device-1'))
      .rejects.toBeInstanceOf(ConflictException);
  });
});
