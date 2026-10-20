import { Image } from 'react-native';
import * as FileSystem from 'expo-file-system/legacy';
import type { DiaryItem, DiaryPhoto, FaceRect, ShareMode } from '../types/diary';

type ShareAssetPreparationReason =
  | 'missing_photo'
  | 'missing_source'
  | 'missing_face_rects'
  | 'invalid_face_rects'
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
  isPreparedAssetReadable?: (uri: string) => Promise<boolean>;
};

type PrepareDiaryShareAssetsInput = {
  diary: DiaryItem;
  target: ShareMode;
  getPhotoById: (photoId: string) => DiaryPhoto | undefined;
};

const MASK_DIRECTORY = 'anonymous-share-assets';
const MASK_COLOR = { red: 192, green: 182, blue: 170, alpha: 255 };

function buildRectToken(photo: DiaryPhoto) {
  return (photo.faceRects ?? [])
    .map(rect => `${rect.x},${rect.y},${rect.width},${rect.height}`)
    .join('|');
}

function isValidFaceRect(value: unknown): value is FaceRect {
  if (typeof value !== 'object' || value === null) return false;
  const rect = value as Partial<FaceRect>;
  return Number.isFinite(rect.x)
    && Number.isFinite(rect.y)
    && Number.isFinite(rect.width)
    && Number.isFinite(rect.height)
    && (rect.width ?? 0) > 0
    && (rect.height ?? 0) > 0
    && (rect.x ?? 1) < 1
    && (rect.y ?? 1) < 1
    && (rect.x ?? 0) + (rect.width ?? 0) > 0
    && (rect.y ?? 0) + (rect.height ?? 0) > 0;
}

function hasValidFaceRects(photo: DiaryPhoto) {
  return Array.isArray(photo.faceRects) && photo.faceRects.length > 0 && photo.faceRects.every(isValidFaceRect);
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

function normalizeReadableUri(uri: string) {
  if (uri.startsWith('file://') || uri.startsWith('data:')) {
    return uri;
  }
  if (uri.startsWith('/')) {
    return `file://${uri}`;
  }
  return uri;
}

async function writeBase64File(uri: string, base64: string) {
  if (uri.startsWith('file://')) {
    try {
      const fs = require('fs');
      const path = require('path');
      const { Buffer } = require('buffer');
      const filePath = uri.replace(/^file:\/\//, '');
      fs.mkdirSync(path.dirname(filePath), { recursive: true });
      fs.writeFileSync(filePath, Buffer.from(base64, 'base64'));
      return;
    } catch {}
  }
  await FileSystem.writeAsStringAsync(uri, base64, {
    encoding: FileSystem.EncodingType.Base64,
  });
}

async function readBase64File(uri: string) {
  if (uri.startsWith('file://')) {
    try {
      const fs = require('fs');
      const filePath = uri.replace(/^file:\/\//, '');
      return fs.readFileSync(filePath).toString('base64');
    } catch {}
  }
  return FileSystem.readAsStringAsync(uri, {
    encoding: FileSystem.EncodingType.Base64,
  });
}

async function doesFileExist(uri: string) {
  if (uri.startsWith('file://')) {
    try {
      const fs = require('fs');
      return fs.existsSync(uri.replace(/^file:\/\//, ''));
    } catch {}
  }
  try {
    const info = await FileSystem.getInfoAsync(uri);
    return info.exists;
  } catch {
    return false;
  }
}

async function isReadablePngFile(uri: string) {
  if (!uri.startsWith('file://') && !uri.startsWith('/')) return false;
  try {
    const { Buffer } = require('buffer');
    const base64 = await readBase64File(normalizeReadableUri(uri));
    const bytes = Buffer.from(base64, 'base64');
    const signature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    return bytes.length >= 24
      && bytes.subarray(0, 8).equals(signature)
      && bytes.toString('ascii', 12, 16) === 'IHDR'
      && bytes.readUInt32BE(16) > 0
      && bytes.readUInt32BE(20) > 0;
  } catch {
    return false;
  }
}

async function renderAnonymousAssetToPng(input: AssetRendererInput, getCacheDirectory: () => string | undefined) {
  const cacheDirectory = getCacheDirectory();
  if (!cacheDirectory) {
    throw new Error('cache directory unavailable');
  }
  const baseDir = `${cacheDirectory}${MASK_DIRECTORY}/`;
  const uri = `${baseDir}${encodeURIComponent(input.cacheKey)}.png`;
  await FileSystem.makeDirectoryAsync(baseDir, { intermediates: true });
  if (!(await doesFileExist(uri))) {
    const Jimp = require('jimp-compact');
    const { Buffer } = require('buffer');
    const readableUri = normalizeReadableUri(input.sourceUri);
    const sourceBase64 = readableUri.startsWith('data:')
      ? readableUri.replace(/^data:[^;]+;base64,/, '')
      : await readBase64File(readableUri);
    const image = await Jimp.read(Buffer.from(sourceBase64, 'base64'));
    const maskColor = Jimp.rgbaToInt(MASK_COLOR.red, MASK_COLOR.green, MASK_COLOR.blue, MASK_COLOR.alpha);
    for (const rect of input.photo.faceRects ?? []) {
      const left = Math.floor(Math.max(0, rect.x) * image.bitmap.width);
      const top = Math.floor(Math.max(0, rect.y) * image.bitmap.height);
      const right = Math.ceil(Math.min(1, rect.x + rect.width) * image.bitmap.width);
      const bottom = Math.ceil(Math.min(1, rect.y + rect.height) * image.bitmap.height);
      const width = Math.max(1, Math.min(image.bitmap.width - left, right - left));
      const height = Math.max(1, Math.min(image.bitmap.height - top, bottom - top));
      image.scan(left, top, width, height, (_x: number, _y: number, idx: number) => {
        image.bitmap.data[idx] = MASK_COLOR.red;
        image.bitmap.data[idx + 1] = MASK_COLOR.green;
        image.bitmap.data[idx + 2] = MASK_COLOR.blue;
        image.bitmap.data[idx + 3] = MASK_COLOR.alpha;
      });
      image.setPixelColor(maskColor, left, top);
    }
    const encoded = await image.getBufferAsync(Jimp.MIME_PNG);
    await writeBase64File(uri, encoded.toString('base64'));
  }
  return uri;
}

export function createShareAssetPreparationService(deps: ShareAssetPreparationDeps = {}) {
  const getCacheDirectory = deps.getCacheDirectory ?? (() => FileSystem.cacheDirectory ?? FileSystem.documentDirectory ?? undefined);
  const getPhotoSourceUri = deps.getPhotoSourceUri ?? getFallbackSourceUri;
  const renderAnonymousAsset = deps.renderAnonymousAsset ?? (input => renderAnonymousAssetToPng(input, getCacheDirectory));
  const isPreparedAssetReadable = deps.isPreparedAssetReadable ?? isReadablePngFile;
  const assetCache = new Map<string, Promise<string>>();

  async function getAnonymousAsset(photo: DiaryPhoto, diary: DiaryItem, target: ShareMode): Promise<PreparedShareAsset> {
    const sourceUri = getPhotoSourceUri(photo);
    if (!sourceUri) {
      throw new Error('missing_source');
    }
    if (!photo.faceRects?.length) {
      throw new Error('missing_face_rects');
    }
    if (!hasValidFaceRects(photo)) {
      throw new Error('invalid_face_rects');
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
    if (!(await isPreparedAssetReadable(uri))) {
      assetCache.delete(cacheKey);
      throw new Error('render_failed');
    }
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
        if (photo.faceRects?.length && !hasValidFaceRects(photo)) {
          return {
            ok: false,
            reason: 'invalid_face_rects',
            message: '当前有照片包含无效的人脸遮挡区域，暂时不能匿名分享。',
          };
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
