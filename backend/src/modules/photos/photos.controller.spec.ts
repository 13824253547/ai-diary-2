import { BadRequestException } from '@nestjs/common';
import { PhotosController } from './photos.controller';

describe('PhotosController', () => {
  const controller = new PhotosController();

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
});
