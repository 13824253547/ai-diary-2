import * as FileSystem from 'expo-file-system/legacy';
import * as MediaLibrary from 'expo-media-library/legacy';
import type { DiaryPhoto } from '../types/diary';

export type SaveGeneratedImageResult =
  | { ok: true }
  | { ok: false; reason: 'invalid_asset' | 'permission_denied' | 'save_failed'; message: string };

function extensionFor(photo: DiaryPhoto) {
  const value = `${photo.filename ?? ''} ${photo.uri ?? ''}`.toLowerCase();
  if (value.includes('.png')) return 'png';
  if (value.includes('.webp')) return 'webp';
  return 'jpg';
}

export async function saveGeneratedImageToLibrary(photo: DiaryPhoto): Promise<SaveGeneratedImageResult> {
  if (!photo.uri || !photo.remoteHeaders || photo.source !== 'generated') {
    return { ok: false, reason: 'invalid_asset', message: '这张配图当前无法保存，请重新打开后再试。' };
  }

  let localUri: string | undefined;
  try {
    const permission = await MediaLibrary.getPermissionsAsync(true, ['photo']);
    const granted = permission.granted
      ? permission
      : await MediaLibrary.requestPermissionsAsync(true, ['photo']);
    if (!granted.granted) {
      return { ok: false, reason: 'permission_denied', message: '请允许保存照片到系统相册后重试。' };
    }

    if (!FileSystem.cacheDirectory) throw new Error('cache directory unavailable');
    const safeId = photo.id.replace(/[^A-Za-z0-9_-]/g, '_');
    localUri = `${FileSystem.cacheDirectory}generated-${safeId}.${extensionFor(photo)}`;
    const downloaded = await FileSystem.downloadAsync(photo.uri, localUri, {
      headers: photo.remoteHeaders,
    });
    if (downloaded.status < 200 || downloaded.status >= 300) {
      throw new Error('generated image download failed');
    }
    await MediaLibrary.saveToLibraryAsync(downloaded.uri);
    return { ok: true };
  } catch {
    return { ok: false, reason: 'save_failed', message: '暂时无法保存到系统相册，请稍后重试。' };
  } finally {
    if (localUri) {
      await FileSystem.deleteAsync(localUri, { idempotent: true }).catch(() => undefined);
    }
  }
}
