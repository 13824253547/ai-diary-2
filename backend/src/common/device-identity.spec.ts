import { BadRequestException } from '@nestjs/common';
import { resolveDeviceId } from './device-identity';

describe('resolveDeviceId', () => {
  it('trims a supplied device identity', () => {
    expect(resolveDeviceId('  device-a  ')).toBe('device-a');
  });

  it.each([undefined, '', '   '])('rejects a missing or blank identity (%s)', deviceId => {
    try {
      resolveDeviceId(deviceId);
      throw new Error('expected device identity resolution to fail');
    } catch (error) {
      expect(error).toBeInstanceOf(BadRequestException);
      expect((error as BadRequestException).getResponse()).toEqual({
        ok: false,
        error: {
          code: 'device_identity_required',
          message: 'x-device-id header is required',
          retryable: false,
        },
      });
    }
  });
});
