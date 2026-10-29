import { cleanupDiaryPhotoUploads, prepareDiaryPhotoUploads } from '../diary-photo-upload';
import type { DiaryPhoto } from '../../types/diary';

const mockManipulateAsync = jest.fn();
const mockDeleteAsync = jest.fn();
const mockDownloadFileAsync = jest.fn();
const mockGetInfoAsync = jest.fn();

jest.mock('expo-image-manipulator', () => ({
  SaveFormat: { JPEG: 'jpeg' },
  manipulateAsync: (...args: unknown[]) => mockManipulateAsync(...args),
}));

jest.mock('expo-file-system/legacy', () => ({
  cacheDirectory: 'file:///cache/',
  deleteAsync: (...args: unknown[]) => mockDeleteAsync(...args),
  getInfoAsync: (...args: unknown[]) => mockGetInfoAsync(...args),
}));

jest.mock('expo-file-system', () => ({
  File: class MockFile {
    uri: string;

    constructor(uri: string) {
      this.uri = uri;
    }

    static downloadFileAsync(...args: unknown[]) {
      return mockDownloadFileAsync(...args);
    }
  },
}));

jest.mock('../material-photo-api', () => ({
  getMaterialPhotoContentUrl: (id: string) => `https://api.example.test/photos/materials/${id}/content`,
}));

function photo(id: string, overrides: Partial<DiaryPhoto> = {}): DiaryPhoto {
  return {
    id,
    title: `标题 ${id}`,
    location: '台南',
    date: '2026.10.20',
    emoji: '',
    color: '#fff',
    source: 'device',
    localUri: `file:///photos/${id}.heic`,
    width: 3000,
    height: 2000,
    ...overrides,
  };
}

describe('diary photo upload preparation', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockDeleteAsync.mockResolvedValue(undefined);
    mockGetInfoAsync.mockResolvedValue({ exists: true, size: 1_024 });
    mockDownloadFileAsync.mockImplementation(async (_uri: string, destination: { uri: string }) => destination);
    mockManipulateAsync.mockImplementation(async (uri: string) => ({
      uri: `${uri}.upload.jpg`,
      width: 2048,
      height: 1365,
    }));
  });

  test('normalizes images to JPEG, bounds long edges, and preserves selected order', async () => {
    const result = await prepareDiaryPhotoUploads(
      ['photo-2', 'photo-1'],
      [
        photo('photo-1'),
        photo('photo-2', { width: 800, height: 1000 }),
      ],
    );

    expect(result.map(item => item.photoId)).toEqual(['photo-2', 'photo-1']);
    expect(result.every(item => item.mimeType === 'image/jpeg')).toBe(true);
    expect(result.map(item => item.uri)).toEqual([
      'file:///photos/photo-2.heic.upload.jpg',
      'file:///photos/photo-1.heic.upload.jpg',
    ]);
    expect(result.map(({ photoId, date }) => ({ photoId, date }))).toEqual([
      { photoId: 'photo-2', date: '2026.10.20' },
      { photoId: 'photo-1', date: '2026.10.20' },
    ]);
    expect(result[0]).not.toHaveProperty('title');
    expect(result[0]).not.toHaveProperty('location');
    expect(mockManipulateAsync).toHaveBeenNthCalledWith(1, 'file:///photos/photo-2.heic', [], {
      compress: 0.84,
      format: 'jpeg',
    });
    expect(mockManipulateAsync).toHaveBeenNthCalledWith(2, 'file:///photos/photo-1.heic', [{
      resize: { width: 2048, height: 1365 },
    }], {
      compress: 0.84,
      format: 'jpeg',
    });
  });

  test('cleans prepared cache files after their upload completes', async () => {
    const uploads = await prepareDiaryPhotoUploads(['photo-1'], [photo('photo-1')]);
    await cleanupDiaryPhotoUploads(uploads);
    expect(mockDeleteAsync).toHaveBeenCalledWith('file:///photos/photo-1.heic.upload.jpg', { idempotent: true });
  });

  test('downloads an authenticated saved material photo before preparing its generation upload', async () => {
    const material = photo('material-1', {
      source: 'generated',
      sourceAssetId: 'image-request-1',
      generationRequestId: 'image-request-1',
      generationPrompt: '雨后的老街',
      generationSource: 'provider',
      localUri: undefined,
      uri: 'https://api.example.test/photos/materials/material-1/content',
      remoteHeaders: {
        'x-device-id': 'device-1',
        Authorization: 'Bearer test-token',
      },
    });

    const result = await prepareDiaryPhotoUploads(['material-1'], [material]);

    expect(mockDownloadFileAsync).toHaveBeenCalledWith(
      material.uri,
      expect.objectContaining({
        uri: expect.stringMatching(/^file:\/\/\/cache\/diary-material-material-1-/),
      }),
      { headers: material.remoteHeaders, idempotent: true },
    );
    expect(mockManipulateAsync).toHaveBeenCalledWith(
      expect.stringMatching(/^file:\/\/\/cache\/diary-material-material-1-/),
      [{ resize: { width: 2048, height: 1365 } }],
      { compress: 0.84, format: 'jpeg' },
    );
    expect(mockDeleteAsync).toHaveBeenCalledWith(
      expect.stringMatching(/^file:\/\/\/cache\/diary-material-material-1-/),
      { idempotent: true },
    );
    expect(result[0]).toMatchObject({ photoId: 'material-1', mimeType: 'image/jpeg' });
  });

  test('preserves the native download error stage and asset ID without exposing the raw error', async () => {
    const material = photo('material-failed', {
      source: 'generated',
      sourceAssetId: 'image-request-failed',
      generationRequestId: 'image-request-failed',
      generationSource: 'provider',
      localUri: undefined,
      uri: 'https://api.example.test/photos/materials/material-failed/content',
      remoteHeaders: { 'x-device-id': 'device-1' },
    });
    mockDownloadFileAsync.mockRejectedValueOnce(
      new Error('ERR_FILESYSTEM_CANNOT_DOWNLOAD: background daemon unavailable'),
    );

    let thrown: unknown;
    try {
      await prepareDiaryPhotoUploads(['material-failed'], [material]);
    } catch (error) {
      thrown = error;
    }

    expect(thrown).toMatchObject({
      stage: 'material_download',
      causeCode: 'ERR_FILESYSTEM_CANNOT_DOWNLOAD',
      photoId: 'material-failed',
      photoIndex: 0,
      message: '所选照片暂时无法处理，请返回相册重新选择。',
    });
    expect(mockDeleteAsync).toHaveBeenCalledWith(
      expect.stringMatching(/^file:\/\/\/cache\/diary-material-material-failed-/),
      { idempotent: true },
    );
  });

  test('rejects an unauthenticated or unrelated remote image URL', async () => {
    const unrelated = photo('remote-1', {
      localUri: undefined,
      uri: 'https://images.example.test/remote-1.jpg',
      remoteHeaders: { 'x-device-id': 'device-1' },
    });

    await expect(prepareDiaryPhotoUploads(['remote-1'], [unrelated])).rejects.toThrow(
      '所选照片无法读取，请返回相册重新选择。',
    );
    expect(mockDownloadFileAsync).not.toHaveBeenCalled();
  });

  test('fails closed and cleans partial output when a selected image is unavailable', async () => {
    await expect(prepareDiaryPhotoUploads(['photo-1', 'missing'], [photo('photo-1')])).rejects.toThrow(
      '所选照片无法读取，请返回相册重新选择。',
    );
    expect(mockDeleteAsync).toHaveBeenCalledWith('file:///photos/photo-1.heic.upload.jpg', { idempotent: true });
  });

  test('omits unknown or invalid capture dates from upload metadata', async () => {
    const result = await prepareDiaryPhotoUploads(
      ['unknown', 'invalid'],
      [
        photo('unknown', { date: '未知日期' }),
        photo('invalid', { date: '2026.02.30' }),
      ],
    );

    expect(result.map(item => item.date)).toEqual([undefined, undefined]);
    expect(result.every(item => !('title' in item) && !('location' in item))).toBe(true);
  });
});
