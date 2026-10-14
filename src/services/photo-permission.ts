import * as MediaLibrary from 'expo-media-library/legacy';
import { PermissionStatus } from 'expo-modules-core';

export type PhotoPermissionStatus = 'unknown' | 'full' | 'limited' | 'denied' | 'revoked';

export type PhotoPermissionResult = {
  status: PhotoPermissionStatus;
  granted: boolean;
  canAskAgain: boolean;
};

function normalizePermissionStatus(response: MediaLibrary.PermissionResponse): PhotoPermissionStatus {
  if (response.status === PermissionStatus.GRANTED) {
    return response.accessPrivileges === 'limited' ? 'limited' : 'full';
  }
  if (response.status === PermissionStatus.UNDETERMINED) {
    return 'unknown';
  }
  return response.canAskAgain ? 'denied' : 'revoked';
}

function toPermissionResult(response: MediaLibrary.PermissionResponse): PhotoPermissionResult {
  const status = normalizePermissionStatus(response);
  return {
    status,
    granted: status === 'full' || status === 'limited',
    canAskAgain: response.canAskAgain,
  };
}

export async function getPhotoPermissionStatus(): Promise<PhotoPermissionResult> {
  return toPermissionResult(await MediaLibrary.getPermissionsAsync(false, ['photo']));
}

export async function requestPhotoPermission(): Promise<PhotoPermissionResult> {
  return toPermissionResult(await MediaLibrary.requestPermissionsAsync(false, ['photo']));
}
