import * as MediaLibrary from 'expo-media-library/legacy';
import { Image } from 'react-native';
import type { DiaryPhoto } from '../types/diary';
import { getPhotoPermissionStatus, type PhotoPermissionResult } from './photo-permission';

export type DevicePhotoAlbum = {
  id: string;
  title: string;
  assetCount: number;
};

export type DevicePhotoPage = {
  album: DevicePhotoAlbum;
  photos: DiaryPhoto[];
  hasNextPage: boolean;
  endCursor?: string;
};

export type ReadableDevicePhotoValidation = {
  validIds: string[];
  invalidIds: string[];
};

export type DevicePhotoAssetImportResult =
  | { ok: true; photos: DiaryPhoto[] }
  | {
      ok: false;
      reason: 'invalid_input' | 'permission_unavailable' | 'permission_denied' | 'asset_unreadable';
      message: string;
    };

export type DevicePhotoAssetImporter = (photoIds: string[]) => Promise<DevicePhotoAssetImportResult>;

const ALL_PHOTOS_ALBUM_ID = '__all__';
const DEFAULT_PHOTO_COLOR = '#EFE3D5';
const PAGE_SIZE = 36;

function formatDate(timestamp: number | undefined) {
  if (!timestamp) return '未知日期';
  const date = new Date(timestamp);
  const year = date.getFullYear();
  const month = `${date.getMonth() + 1}`.padStart(2, '0');
  const day = `${date.getDate()}`.padStart(2, '0');
  return `${year}.${month}.${day}`;
}

function buildTitle(asset: MediaLibrary.Asset) {
  const filename = asset.filename?.trim();
  if (filename) return filename.replace(/\.[^.]+$/, '');
  return formatDate(asset.creationTime);
}

function readImageDimensions(uri: string): Promise<{ width: number; height: number } | undefined> {
  return new Promise(resolve => {
    try {
      Image.getSize(
        uri,
        (width, height) => resolve(
          Number.isFinite(width) && width > 0 && Number.isFinite(height) && height > 0
            ? { width, height }
            : undefined,
        ),
        () => resolve(undefined),
      );
    } catch {
      resolve(undefined);
    }
  });
}

async function getAlbumById(id?: string) {
  if (!id || id === ALL_PHOTOS_ALBUM_ID) return undefined;
  const albums = await MediaLibrary.getAlbumsAsync({ includeSmartAlbums: true });
  return albums.find(album => album.id === id);
}

async function toDiaryPhoto(asset: MediaLibrary.Asset, album?: DevicePhotoAlbum): Promise<DiaryPhoto | undefined> {
  const info = await MediaLibrary.getAssetInfoAsync(asset);
  const localUri = info.localUri ?? asset.uri;
  if (!localUri) return undefined;
  return {
    id: asset.id,
    title: buildTitle(asset),
    location: album?.title ?? '设备相册',
    emoji: '🖼',
    color: DEFAULT_PHOTO_COLOR,
    date: formatDate(asset.creationTime),
    uri: asset.uri,
    localUri,
    albumId: album?.id,
    albumTitle: album?.title,
    width: asset.width,
    height: asset.height,
    filename: asset.filename ?? undefined,
    source: 'device',
  };
}

export async function listDevicePhotoAlbums(): Promise<DevicePhotoAlbum[]> {
  const albums = await MediaLibrary.getAlbumsAsync({ includeSmartAlbums: true });
  const normalized = albums
    .filter(album => (album.assetCount ?? 0) > 0)
    .map(album => ({
      id: album.id,
      title: album.title,
      assetCount: album.assetCount ?? 0,
    }))
    .sort((left, right) => right.assetCount - left.assetCount);
  const total = normalized.reduce((sum, album) => sum + album.assetCount, 0);
  return [{ id: ALL_PHOTOS_ALBUM_ID, title: '全部照片', assetCount: total }, ...normalized];
}

export async function listDevicePhotos(input?: {
  albumId?: string;
  after?: string;
  first?: number;
}): Promise<DevicePhotoPage> {
  const selectedAlbum = await getAlbumById(input?.albumId);
  const album: DevicePhotoAlbum = selectedAlbum
    ? { id: selectedAlbum.id, title: selectedAlbum.title, assetCount: selectedAlbum.assetCount ?? 0 }
    : { id: ALL_PHOTOS_ALBUM_ID, title: '全部照片', assetCount: 0 };
  const page = await MediaLibrary.getAssetsAsync({
    first: input?.first ?? PAGE_SIZE,
    after: input?.after,
    album: selectedAlbum,
    mediaType: [MediaLibrary.MediaType.photo],
    sortBy: [MediaLibrary.SortBy.creationTime],
  });
  const photos = (await Promise.all(page.assets.map(asset => toDiaryPhoto(asset, album)))).filter((photo): photo is DiaryPhoto => Boolean(photo));
  return {
    album,
    photos,
    hasNextPage: page.hasNextPage,
    endCursor: page.endCursor ?? undefined,
  };
}

export async function validateReadableDevicePhotoIds(photoIds: string[]): Promise<ReadableDevicePhotoValidation> {
  const validIds: string[] = [];
  const invalidIds: string[] = [];
  for (const photoId of photoIds) {
    try {
      const info = await MediaLibrary.getAssetInfoAsync(photoId, { shouldDownloadFromNetwork: false });
      if (info.localUri ?? info.uri) {
        validIds.push(photoId);
        continue;
      }
    } catch {}
    invalidIds.push(photoId);
  }
  return { validIds, invalidIds };
}

export const importDevicePhotoAssets: DevicePhotoAssetImporter = async photoIds => {
  if (!Array.isArray(photoIds) || photoIds.length === 0
    || photoIds.some(id => typeof id !== 'string' || !id.trim())) {
    return { ok: false, reason: 'invalid_input', message: '请选择有效的照片。' };
  }
  const requestedIds = [...new Set(photoIds.map(id => id.trim()))];
  let permission: PhotoPermissionResult;
  try {
    permission = await getPhotoPermissionStatus();
  } catch {
    return { ok: false, reason: 'permission_unavailable', message: '暂时无法确认相册权限，请稍后重试。' };
  }
  if (!permission.granted) {
    return { ok: false, reason: 'permission_denied', message: '当前没有读取所选照片的权限。' };
  }

  try {
    const photos: DiaryPhoto[] = [];
    for (const id of requestedIds) {
      const info = await MediaLibrary.getAssetInfoAsync(id, { shouldDownloadFromNetwork: false });
      const localUri = info.localUri ?? info.uri;
      if (info.id !== id
        || info.mediaType !== MediaLibrary.MediaType.photo
        || info.isNetworkAsset
        || !localUri) {
        throw new Error('selected asset is not locally readable');
      }
      const dimensions = await readImageDimensions(localUri);
      if (!dimensions) throw new Error('selected image cannot be decoded');
      photos.push({
        id: info.id,
        title: buildTitle(info),
        location: '',
        emoji: '🖼',
        color: DEFAULT_PHOTO_COLOR,
        date: formatDate(info.creationTime),
        uri: info.uri,
        localUri,
        width: info.width > 0 ? info.width : dimensions.width,
        height: info.height > 0 ? info.height : dimensions.height,
        filename: info.filename || undefined,
        source: 'device' as const,
      });
    }
    if (new Set(photos.map(photo => photo.id)).size !== requestedIds.length) {
      return { ok: false, reason: 'asset_unreadable', message: '无法确认所选照片，请重新选择后再试。' };
    }
    return { ok: true, photos };
  } catch {
    return { ok: false, reason: 'asset_unreadable', message: '部分所选照片当前不可读取，请重新选择后再试。' };
  }
};

export { ALL_PHOTOS_ALBUM_ID, PAGE_SIZE as DEVICE_PHOTO_PAGE_SIZE };
