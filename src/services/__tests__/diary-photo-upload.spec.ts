import { cleanupDiaryPhotoUploads, prepareDiaryPhotoUploads } from '../diary-photo-upload';
import type { DiaryPhoto } from '../../types/diary';

const mockManipulateAsync = jest.fn();
const mockDeleteAsync = jest.fn();

jest.mock('expo-image-manipulator', () => ({
  SaveFormat: { JPEG: 'jpeg' },
  manipulateAsync: (...args: unknown[]) => mockManipulateAsync(...args),
}));

jest.mock('expo-file-system/legacy', () => ({
  deleteAsync: (...args: unknown[]) => mockDeleteAsync(...args),
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
