import { Image } from 'react-native';
import * as FileSystem from 'expo-file-system/legacy';
import type { DiaryItem, DiaryPhoto, ShareMode } from '../types/diary';

type ShareAssetPreparationReason =
  | 'missing_photo'
  | 'missing_source'
  | 'missing_face_rects'
  | 'render_failed';

export type PreparedShareAsset = {
  photoId: string;
  uri: string;
  cacheKey?: string;
  anonymous: boolean;
};

export type ShareAssetPreparationResult =
  | { ok: true; assets: PreparedShareAsset[] }
  | { ok: false; reason: ShareAssetPreparationReason; message: string };

type AssetRendererInput = {
  photo: DiaryPhoto;
  sourceUri: string;
  cacheKey: string;
};

type ShareAssetPreparationDeps = {
  getCacheDirectory?: () => string | undefined;
  getPhotoSourceUri?: (photo: DiaryPhoto) => string | undefined;
  renderAnonymousAsset?: (input: AssetRendererInput) => Promise<string>;
};

type PrepareDiaryShareAssetsInput = {
  diary: DiaryItem;
  target: ShareMode;
  getPhotoById: (photoId: string) => DiaryPhoto | undefined;
};

const SVG_NAMESPACE = 'http://www.w3.org/2000/svg';
const MASK_DIRECTORY = 'anonymous-share-assets';

function escapeXml(value: string) {
  return value
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function buildRectToken(photo: DiaryPhoto) {
  return (photo.faceRects ?? [])
    .map(rect => `${rect.x},${rect.y},${rect.width},${rect.height}`)
    .join('|');
}

function getFallbackSourceUri(photo: DiaryPhoto) {
  if (photo.localUri || photo.uri) {
    return photo.localUri ?? photo.uri;
  }
  if (photo.image) {
    return Image.resolveAssetSource(photo.image).uri;
  }
  return undefined;
}

function buildAnonymousSvg(photo: DiaryPhoto, sourceUri: string) {
  const resolved = photo.image ? Image.resolveAssetSource(photo.image) : undefined;
  const width = photo.width ?? resolved?.width ?? 1200;
  const height = photo.height ?? resolved?.height ?? 1200;
  const masks = (photo.faceRects ?? [])
    .map(rect => `<rect x="${rect.x * width}" y="${rect.y * height}" width="${rect.width * width}" height="${rect.height * height}" rx="12" ry="12" fill="#C0B6AA" />`)
    .join('');
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="${SVG_NAMESPACE}" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
  <image href="${escapeXml(sourceUri)}" x="0" y="0" width="${width}" height="${height}" preserveAspectRatio="none" />
  ${masks}
</svg>`;
}

async function renderAnonymousAssetToSvg(input: AssetRendererInput, getCacheDirectory: () => string | undefined) {
  const cacheDirectory = getCacheDirectory();
  if (!cacheDirectory) {
    throw new Error('cache directory unavailable');
  }
  const baseDir = `${cacheDirectory}${MASK_DIRECTORY}/`;
  const uri = `${baseDir}${encodeURIComponent(input.cacheKey)}.svg`;
  await FileSystem.makeDirectoryAsync(baseDir, { intermediates: true });
  const info = await FileSystem.getInfoAsync(uri);
  if (!info.exists) {
    await FileSystem.writeAsStringAsync(uri, buildAnonymousSvg(input.photo, input.sourceUri), {
      encoding: FileSystem.EncodingType.UTF8,
    });
  }
  return uri;
}

export function createShareAssetPreparationService(deps: ShareAssetPreparationDeps = {}) {
  const getCacheDirectory = deps.getCacheDirectory ?? (() => FileSystem.cacheDirectory ?? FileSystem.documentDirectory ?? undefined);
  const getPhotoSourceUri = deps.getPhotoSourceUri ?? getFallbackSourceUri;
  const renderAnonymousAsset = deps.renderAnonymousAsset ?? (input => renderAnonymousAssetToSvg(input, getCacheDirectory));
  const assetCache = new Map<string, Promise<string>>();

  async function getAnonymousAsset(photo: DiaryPhoto, diary: DiaryItem, target: ShareMode): Promise<PreparedShareAsset> {
    const sourceUri = getPhotoSourceUri(photo);
    if (!sourceUri) {
      throw new Error('missing_source');
    }
    if (!photo.faceRects?.length) {
      throw new Error('missing_face_rects');
    }
    const cacheKey = [
      diary.id,
      diary.version ?? 0,
      target,
      photo.id,
      buildRectToken(photo),
      sourceUri,
    ].join('::');
    let task = assetCache.get(cacheKey);
    if (!task) {
      task = renderAnonymousAsset({
        photo,
        sourceUri,
        cacheKey,
      }).catch(error => {
        assetCache.delete(cacheKey);
        throw error;
      });
      assetCache.set(cacheKey, task);
    }
    const uri = await task;
    return {
      photoId: photo.id,
      uri,
      cacheKey,
      anonymous: true,
    };
  }

  return {
    async prepareDiaryShareAssets(input: PrepareDiaryShareAssetsInput): Promise<ShareAssetPreparationResult> {
      const assets: PreparedShareAsset[] = [];
      for (const photoId of input.diary.photoIds) {
        const photo = input.getPhotoById(photoId);
        if (!photo) {
          return {
            ok: false,
            reason: 'missing_photo',
            message: '当前分享内容里有找不到的照片，暂时不能继续分享。',
          };
        }
        const sourceUri = getPhotoSourceUri(photo);
        if (!input.diary.anonymous) {
          if (!sourceUri) {
            return {
              ok: false,
              reason: 'missing_source',
              message: '当前分享内容里有不可用的照片，暂时不能继续分享。',
            };
          }
          assets.push({
            photoId,
            uri: sourceUri,
            anonymous: false,
          });
          continue;
        }
        if (!photo.faceRects?.length && (photo.personIds?.length ?? 0) > 0) {
          return {
            ok: false,
            reason: 'missing_face_rects',
            message: '当前有照片缺少可用的人脸遮挡区域，暂时不能匿名分享。',
          };
        }
        if (!photo.faceRects?.length) {
          if (!sourceUri) {
            return {
              ok: false,
              reason: 'missing_source',
              message: '当前分享内容里有不可用的照片，暂时不能继续分享。',
            };
          }
          assets.push({
            photoId,
            uri: sourceUri,
            anonymous: false,
          });
          continue;
        }
        try {
          assets.push(await getAnonymousAsset(photo, input.diary, input.target));
        } catch (error) {
          const message = error instanceof Error ? error.message : 'render_failed';
          if (message === 'missing_face_rects') {
            return {
              ok: false,
              reason: 'missing_face_rects',
              message: '当前有照片缺少可用的人脸遮挡区域，暂时不能匿名分享。',
            };
          }
          if (message === 'missing_source') {
            return {
              ok: false,
              reason: 'missing_source',
              message: '当前分享内容里有不可用的照片，暂时不能继续分享。',
            };
          }
          return {
            ok: false,
            reason: 'render_failed',
            message: '匿名资源准备失败，请稍后重试。',
          };
        }
      }
      return { ok: true, assets };
    },
  };
}

const defaultService = createShareAssetPreparationService();

export async function prepareShareAssetsForDiary(input: PrepareDiaryShareAssetsInput) {
  return defaultService.prepareDiaryShareAssets(input);
}
