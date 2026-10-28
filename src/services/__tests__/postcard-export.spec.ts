import * as FileSystem from 'expo-file-system/legacy';
import * as MediaLibrary from 'expo-media-library/legacy';
import * as Sharing from 'expo-sharing';
import { PermissionStatus } from 'expo-modules-core';
import { Image, type View } from 'react-native';
import { captureRef } from 'react-native-view-shot';
import { capturePostcard, discardPostcard, savePostcard, sharePostcard } from '../postcard-export';

jest.mock('expo-file-system/legacy', () => ({ getInfoAsync: jest.fn(), deleteAsync: jest.fn() }));
jest.mock('expo-media-library/legacy', () => ({
  getPermissionsAsync: jest.fn(), requestPermissionsAsync: jest.fn(), saveToLibraryAsync: jest.fn(),
}));
jest.mock('expo-sharing', () => ({ isAvailableAsync: jest.fn(), shareAsync: jest.fn() }));
jest.mock('react-native-view-shot', () => ({ captureRef: jest.fn() }));

const uri = 'file:///cache/postcard.png';
const ref = { current: {} as View };

describe('postcard export', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.mocked(captureRef).mockResolvedValue(uri);
    jest.mocked(FileSystem.getInfoAsync).mockResolvedValue({ exists: true, uri, size: 1024, isDirectory: false, modificationTime: 0 });
    jest.mocked(FileSystem.deleteAsync).mockResolvedValue();
    jest.spyOn(Image, 'getSize').mockImplementation((_source, success) => success(900, 1200));
    jest.mocked(Sharing.isAvailableAsync).mockResolvedValue(true);
    jest.mocked(Sharing.shareAsync).mockResolvedValue();
    jest.mocked(MediaLibrary.saveToLibraryAsync).mockResolvedValue();
  });

  afterEach(() => jest.restoreAllMocks());

  test('captures a nonempty, decodable PNG and opens the system share sheet', async () => {
    const result = await capturePostcard(ref);
    expect(captureRef).toHaveBeenCalledWith(ref, { format: 'png', result: 'tmpfile' });
    expect(Image.getSize).toHaveBeenCalledWith(uri, expect.any(Function), expect.any(Function));
    expect(await sharePostcard(result)).toBe('opened');
    expect(Sharing.shareAsync).toHaveBeenCalledWith(uri, { mimeType: 'image/png', UTI: 'public.png' });
    await discardPostcard(uri);
    expect(FileSystem.deleteAsync).toHaveBeenCalledWith(uri, { idempotent: true });
  });

  test('discards an empty capture without sharing it', async () => {
    jest.mocked(FileSystem.getInfoAsync).mockResolvedValue({ exists: true, uri, size: 0, isDirectory: false, modificationTime: 0 });
    await expect(capturePostcard(ref)).rejects.toThrow('empty postcard');
    expect(FileSystem.deleteAsync).toHaveBeenCalledWith(uri, { idempotent: true });
    expect(Sharing.shareAsync).not.toHaveBeenCalled();
  });

  test('discards a captured file that cannot be decoded', async () => {
    jest.spyOn(Image, 'getSize').mockImplementation((_source, _success, failure) => {
      failure?.(new Error('invalid image'));
    });
    await expect(capturePostcard(ref)).rejects.toThrow('invalid image');
    expect(FileSystem.deleteAsync).toHaveBeenCalledWith(uri, { idempotent: true });
    expect(Sharing.shareAsync).not.toHaveBeenCalled();
  });

  test('reports unavailable system sharing without invoking a destination', async () => {
    jest.mocked(Sharing.isAvailableAsync).mockResolvedValue(false);
    await expect(sharePostcard(uri)).resolves.toBe('unavailable');
    expect(Sharing.shareAsync).not.toHaveBeenCalled();
  });

  test('uses write permission and never claims a denied save succeeded', async () => {
    jest.mocked(MediaLibrary.getPermissionsAsync).mockResolvedValue({
      granted: false, canAskAgain: true, status: PermissionStatus.DENIED, expires: 'never',
    });
    jest.mocked(MediaLibrary.requestPermissionsAsync).mockResolvedValue({
      granted: false, canAskAgain: false, status: PermissionStatus.DENIED, expires: 'never',
    });
    await expect(savePostcard(uri)).resolves.toBe('permission_denied');
    expect(MediaLibrary.requestPermissionsAsync).toHaveBeenCalledWith(true, ['photo']);
    expect(MediaLibrary.saveToLibraryAsync).not.toHaveBeenCalled();
  });

  test('saves the captured PNG to the system library when write permission is granted', async () => {
    jest.mocked(MediaLibrary.getPermissionsAsync).mockResolvedValue({
      granted: true, canAskAgain: true, status: PermissionStatus.GRANTED,
      expires: 'never', accessPrivileges: 'all',
    });
    await expect(savePostcard(uri)).resolves.toBe('saved');
    expect(MediaLibrary.saveToLibraryAsync).toHaveBeenCalledWith(uri);
    expect(MediaLibrary.requestPermissionsAsync).not.toHaveBeenCalled();
  });
});
