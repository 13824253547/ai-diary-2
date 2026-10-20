import * as MediaLibrary from 'expo-media-library/legacy';
import { PermissionStatus } from 'expo-modules-core';
import { Image } from 'react-native';
import { createAsyncFaultPlan } from '../../test-utils/fakes/create-async-fault-plan';
import { importDevicePhotoAssets, validateReadableDevicePhotoIds } from '../photo-library';

jest.mock('expo-media-library/legacy', () => ({
  getAssetInfoAsync: jest.fn(),
  getPermissionsAsync: jest.fn(),
  MediaType: { photo: 'photo' },
}));

describe('photo library asset access', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.mocked(MediaLibrary.getPermissionsAsync).mockResolvedValue({
      status: PermissionStatus.GRANTED,
      granted: true,
      canAskAgain: true,
      expires: 'never',
      accessPrivileges: 'all',
    });
    jest.spyOn(Image, 'getSize').mockImplementation((_uri, success) => success(1200, 1600));
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  test('maps permission revocation during validation to invalid photo IDs', async () => {
    type AssetInfo = Awaited<ReturnType<typeof MediaLibrary.getAssetInfoAsync>>;
    const permissionRevocation = new Error('E_NO_PERMISSIONS');
    const faultPlan = createAsyncFaultPlan<AssetInfo>([
      { type: 'resolve', value: { localUri: 'file:///p1.jpg' } as AssetInfo },
      { type: 'reject', reason: permissionRevocation },
      { type: 'reject', reason: permissionRevocation },
    ]);
    jest.mocked(MediaLibrary.getAssetInfoAsync).mockImplementation(() => faultPlan.next());

    await expect(validateReadableDevicePhotoIds(['p1', 'p2', 'p3'])).resolves.toEqual({
      validIds: ['p1'],
      invalidIds: ['p2', 'p3'],
    });
    expect(MediaLibrary.getAssetInfoAsync).toHaveBeenNthCalledWith(
      1,
      'p1',
      { shouldDownloadFromNetwork: false },
    );
    expect(MediaLibrary.getAssetInfoAsync).toHaveBeenNthCalledWith(
      2,
      'p2',
      { shouldDownloadFromNetwork: false },
    );
    expect(MediaLibrary.getAssetInfoAsync).toHaveBeenNthCalledWith(
      3,
      'p3',
      { shouldDownloadFromNetwork: false },
    );
    expect(faultPlan.callCount).toBe(3);
    expect(faultPlan.remainingCount).toBe(0);
  });

  test('imports selected readable photos once by stable system ID', async () => {
    jest.mocked(MediaLibrary.getAssetInfoAsync).mockResolvedValue({
      id: 'device-photo-1',
      mediaType: MediaLibrary.MediaType.photo,
      uri: 'ph://device-photo-1',
      localUri: 'file:///device-photo-1.jpg',
      filename: 'trip.jpg',
      creationTime: 1_760_000_000_000,
      width: 1200,
      height: 1600,
    } as Awaited<ReturnType<typeof MediaLibrary.getAssetInfoAsync>>);

    await expect(importDevicePhotoAssets(['device-photo-1', 'device-photo-1'])).resolves.toMatchObject({
      ok: true,
      photos: [{
        id: 'device-photo-1',
        source: 'device',
        localUri: 'file:///device-photo-1.jpg',
        width: 1200,
        height: 1600,
      }],
    });
    expect(MediaLibrary.getAssetInfoAsync).toHaveBeenCalledTimes(1);
    expect(MediaLibrary.getAssetInfoAsync).toHaveBeenCalledWith(
      'device-photo-1',
      { shouldDownloadFromNetwork: false },
    );
    expect(Image.getSize).toHaveBeenCalledWith(
      'file:///device-photo-1.jpg',
      expect.any(Function),
      expect.any(Function),
    );
  });

  test('does not import a denied or network-only asset', async () => {
    jest.mocked(MediaLibrary.getPermissionsAsync).mockResolvedValue({
      status: PermissionStatus.DENIED,
      granted: false,
      canAskAgain: false,
      expires: 'never',
      accessPrivileges: 'none',
    });
    await expect(importDevicePhotoAssets(['device-photo-1'])).resolves.toMatchObject({
      ok: false,
      reason: 'permission_denied',
    });
    expect(MediaLibrary.getAssetInfoAsync).not.toHaveBeenCalled();

    jest.mocked(MediaLibrary.getPermissionsAsync).mockResolvedValue({
      status: PermissionStatus.GRANTED,
      granted: true,
      canAskAgain: true,
      expires: 'never',
      accessPrivileges: 'all',
    });
    jest.mocked(MediaLibrary.getAssetInfoAsync).mockResolvedValue({
      id: 'device-photo-1',
      mediaType: MediaLibrary.MediaType.photo,
      uri: 'ph://device-photo-1',
      isNetworkAsset: true,
      filename: 'trip.jpg',
      creationTime: 1_760_000_000_000,
      width: 1200,
      height: 1600,
    } as Awaited<ReturnType<typeof MediaLibrary.getAssetInfoAsync>>);

    await expect(importDevicePhotoAssets(['device-photo-1'])).resolves.toMatchObject({
      ok: false,
      reason: 'asset_unreadable',
    });
  });

  test('rejects a selected image URI that cannot be decoded', async () => {
    jest.mocked(MediaLibrary.getAssetInfoAsync).mockResolvedValue({
      id: 'device-photo-1',
      mediaType: MediaLibrary.MediaType.photo,
      uri: 'ph://device-photo-1',
      localUri: 'file:///device-photo-1.jpg',
      filename: 'trip.jpg',
      creationTime: 1_760_000_000_000,
      width: 1200,
      height: 1600,
    } as Awaited<ReturnType<typeof MediaLibrary.getAssetInfoAsync>>);
    jest.mocked(Image.getSize).mockImplementation((_uri, _success, failure) => failure?.(new Error('decode failed')));

    await expect(importDevicePhotoAssets(['device-photo-1'])).resolves.toMatchObject({
      ok: false,
      reason: 'asset_unreadable',
    });
  });
});
