import { BadRequestException } from '@nestjs/common';

export function resolveDeviceId(deviceId?: string) {
  const value = deviceId?.trim();
  if (!value) {
    throw new BadRequestException({
      ok: false,
      error: {
        code: 'device_identity_required',
        message: 'x-device-id header is required',
        retryable: false,
      },
    });
  }
  return value;
}
