export function resolveDeviceId(deviceId?: string) {
  const value = deviceId?.trim();
  return value && value.length > 0 ? value : 'device-anonymous';
}
