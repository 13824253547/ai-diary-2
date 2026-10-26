import * as FileSystem from 'expo-file-system/legacy';
import * as MediaLibrary from 'expo-media-library/legacy';
import { PermissionStatus } from 'expo-modules-core';
import { saveGeneratedImageToLibrary } from '../save-generated-image';
import type { DiaryPhoto } from '../../types/diary';

jest.mock('expo-file-system/legacy', () => ({
  cacheDirectory: 'file:///cache/',
  downloadAsync: jest.fn(),
  deleteAsync: jest.fn(),
}));

jest.mock('expo-media-library/legacy', () => ({
  getPermissionsAsync: jest.fn(),
  requestPermissionsAsync: jest.fn(),
  saveToLibraryAsync: jest.fn(),
}));

const generatedPhoto: DiaryPhoto = {
  id: 'material-generated-1',
  title: '雨后的老街',
  location: '',
  emoji: '🖼',
  color: '#EFE3D5',
  date: '2026.10.23',
  filename: 'generated-1.jpg',
  uri: 'https://api.example.test/photos/materials/material-1/content',
  remoteHeaders: { 'x-device-id': 'device-1', Authorization: 'Bearer test-token' },
  source: 'generated',
};

describe('saveGeneratedImageToLibrary', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.mocked(MediaLibrary.getPermissionsAsync).mockResolvedValue({
      status: PermissionStatus.GRANTED,
      granted: true,
      canAskAgain: true,
      expires: 'never',
      accessPrivileges: 'all',
    });
    jest.mocked(FileSystem.downloadAsync).mockResolvedValue({
      uri: 'file:///cache/generated-material-generated-1.jpg',
      status: 200,
      headers: {},
      mimeType: 'image/jpeg',
    });
    jest.mocked(MediaLibrary.saveToLibraryAsync).mockResolvedValue();
    jest.mocked(FileSystem.deleteAsync).mockResolvedValue();
  });

  test('downloads with device credentials and saves the local file to the photo library', async () => {
    await expect(saveGeneratedImageToLibrary(generatedPhoto)).resolves.toEqual({ ok: true });

    expect(MediaLibrary.getPermissionsAsync).toHaveBeenCalledWith(true, ['photo']);
    expect(FileSystem.downloadAsync).toHaveBeenCalledWith(
      generatedPhoto.uri,
      'file:///cache/generated-material-generated-1.jpg',
      { headers: generatedPhoto.remoteHeaders },
    );
    expect(MediaLibrary.saveToLibraryAsync).toHaveBeenCalledWith(
      'file:///cache/generated-material-generated-1.jpg',
    );
    expect(FileSystem.deleteAsync).toHaveBeenCalledWith(
      'file:///cache/generated-material-generated-1.jpg',
      { idempotent: true },
    );
  });

  test('asks only for write permission and does not save when it is denied', async () => {
    jest.mocked(MediaLibrary.getPermissionsAsync).mockResolvedValue({
      status: PermissionStatus.DENIED,
      granted: false,
      canAskAgain: false,
      expires: 'never',
    });
    jest.mocked(MediaLibrary.requestPermissionsAsync).mockResolvedValue({
      status: PermissionStatus.DENIED,
      granted: false,
      canAskAgain: false,
      expires: 'never',
    });

    await expect(saveGeneratedImageToLibrary(generatedPhoto)).resolves.toMatchObject({
      ok: false,
      reason: 'permission_denied',
    });
    expect(MediaLibrary.requestPermissionsAsync).toHaveBeenCalledWith(true, ['photo']);
    expect(FileSystem.downloadAsync).not.toHaveBeenCalled();
    expect(MediaLibrary.saveToLibraryAsync).not.toHaveBeenCalled();
  });
});
