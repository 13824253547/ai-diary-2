import * as MediaLibrary from 'expo-media-library/legacy';
import { createAsyncFaultPlan } from '../../test-utils/fakes/create-async-fault-plan';
import { validateReadableDevicePhotoIds } from '../photo-library';

jest.mock('expo-media-library/legacy', () => ({
  getAssetInfoAsync: jest.fn(),
}));

describe('validateReadableDevicePhotoIds', () => {
  beforeEach(() => {
    jest.clearAllMocks();
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
});
