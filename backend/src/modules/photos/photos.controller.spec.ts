import { BadRequestException } from '@nestjs/common';
import { PhotosController } from './photos.controller';

describe('PhotosController', () => {
  const controller = new PhotosController({} as never);

  test('requires a valid device identity before returning photo capabilities', () => {
    for (const deviceId of [undefined, '', '   ']) {
      expect(() => controller.getCapabilities(deviceId)).toThrow(BadRequestException);
    }
    try {
      controller.getCapabilities(undefined);
      fail('expected missing device identity to be rejected');
    } catch (error) {
      expect(error).toBeInstanceOf(BadRequestException);
      expect((error as BadRequestException).getResponse()).toMatchObject({
        error: { code: 'device_identity_required' },
      });
    }
  });

  test('returns capabilities for a device-scoped request', () => {
    expect(controller.getCapabilities('device-1')).toEqual({
      ok: true,
      data: {
        source: 'device-client',
        permissions: ['full', 'limited', 'denied', 'revoked'],
      },
    });
  });

  test('reads slash-containing photo IDs from a query parameter', async () => {
    const assets = {
      readDiaryPhotoCopy: jest.fn().mockResolvedValue({
        buffer: Buffer.from([0xff, 0xd8, 0xff]),
        mimeType: 'image/jpeg',
      }),
    };
    const scopedController = new PhotosController(assets as never);

    await scopedController.readDiaryPhotoByQuery('device-1', 'diary-1', 'asset/L0/001');

    expect(assets.readDiaryPhotoCopy).toHaveBeenCalledWith(
      'device-1',
      'diary-1',
      'asset/L0/001',
    );
  });

  test('reads a public discovery photo only through its published story reference', async () => {
    const assets = {
      readDiscoveryPhotoCopy: jest.fn().mockResolvedValue({
        buffer: Buffer.from([0xff, 0xd8, 0xff]),
        mimeType: 'image/jpeg',
      }),
    };
    const scopedController = new PhotosController(assets as never);

    await scopedController.readDiscoveryPhotoByQuery('story-1', 'asset/L0/001');

    expect(assets.readDiscoveryPhotoCopy).toHaveBeenCalledWith('story-1', 'asset/L0/001');
  });

  test('validates device identity before the photo query parameter', async () => {
    await expect(controller.readDiaryPhotoByQuery(undefined, 'diary-1', undefined))
      .rejects.toMatchObject({
        response: { error: { code: 'device_identity_required' } },
      });
  });
});
