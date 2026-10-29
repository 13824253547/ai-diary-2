import * as FileSystem from 'expo-file-system/legacy';
import * as ImageManipulator from 'expo-image-manipulator';
import { File } from 'expo-file-system';
import { createDiagnosticRequestId, isDevDiagnosticsEnabled, logDevDiagnostic } from './dev-diagnostics';
import { getMaterialPhotoContentUrl } from './material-photo-api';
import type { DiaryPhoto } from '../types/diary';
import type { GenerationPhotoUpload } from '../repositories/core-diary-repository';

const MAX_IMAGE_EDGE = 2048;

function getSafeErrorCode(error: unknown) {
  if (error && typeof error === 'object' && 'code' in error && typeof error.code === 'string') {
    return error.code.slice(0, 80);
  }
  const message = error instanceof Error ? error.message : '';
  return message.match(/\b(ERR_[A-Z0-9_]+)\b/)?.[1];
}

export type PhotoPreparationFailureStage =
  | 'asset_unavailable'
  | 'material_download'
  | 'material_http_status'
  | 'image_conversion'
  | 'converted_file_unreadable';

export class DiaryPhotoUploadPreparationError extends Error {
  constructor(
    message: string,
    readonly stage: PhotoPreparationFailureStage = 'asset_unavailable',
    readonly causeName?: string,
    readonly causeCode?: string,
    readonly photoId?: string,
    readonly photoIndex?: number,
  ) {
    super(message);
  }
}

function getLocalReadableUri(photo: DiaryPhoto) {
  const uri = photo.localUri ?? photo.uri;
  if (!uri || !/^(file|content):\/\//i.test(uri)) return undefined;
  return uri;
}

async function getReadableUri(
  photo: DiaryPhoto,
  photoIndex: number,
) {
  const localUri = getLocalReadableUri(photo);
  if (localUri) return { uri: localUri };
  if (!photo.uri
    || !photo.sourceAssetId
    || !photo.remoteHeaders?.['x-device-id']
    || !(photo.source === 'device' || (photo.source === 'generated' && photo.generationSource === 'provider'))
    || photo.uri !== getMaterialPhotoContentUrl(photo.id)
    || !FileSystem.cacheDirectory) {
    return undefined;
  }

  const destination = `${FileSystem.cacheDirectory}diary-material-${encodeURIComponent(photo.id)}-${Date.now()}.jpg`;
  const requestId = isDevDiagnosticsEnabled() ? createDiagnosticRequestId() : undefined;
  let downloaded: File;
  if (requestId) {
    logDevDiagnostic('info', 'diary.photo.material_download.started', {
      requestId,
      route: '/photos/materials/:photoId/content',
      method: 'GET',
      photoId: photo.id,
      photoIndex,
    });
  }
  try {
    downloaded = await File.downloadFileAsync(photo.uri, new File(destination), {
      headers: {
        ...photo.remoteHeaders,
        ...(requestId ? { 'x-request-id': requestId } : {}),
      },
      idempotent: true,
    });
  } catch (error) {
    const httpStatus = error instanceof Error
      ? error.message.match(/response has status\s+(\d{3})/i)?.[1]
      : undefined;
    const statusCode = httpStatus ? Number(httpStatus) : undefined;
    logDevDiagnostic('warn', 'diary.photo.material_download.failed', {
      ...(requestId ? { requestId } : {}),
      route: '/photos/materials/:photoId/content',
      method: 'GET',
      photoId: photo.id,
      photoIndex,
      failureStage: 'material_download',
      ...(statusCode ? { status: statusCode } : {}),
      ...(getSafeErrorCode(error) ? { errorCode: getSafeErrorCode(error) } : {}),
      ...(error instanceof Error ? { errorName: error.name } : {}),
    });
    await FileSystem.deleteAsync(destination, { idempotent: true }).catch(() => undefined);
    throw new DiaryPhotoUploadPreparationError(
      '所选照片暂时无法处理，请返回相册重新选择。',
      statusCode ? 'material_http_status' : 'material_download',
      error instanceof Error ? error.name : 'unknown',
      statusCode
        ? `http_${statusCode}`
        : getSafeErrorCode(error),
      photo.id,
      photoIndex,
    );
  }
  const downloadedInfo = await FileSystem.getInfoAsync(downloaded.uri).catch(() => undefined);
  if (!downloadedInfo?.exists || !downloadedInfo.size) {
    await FileSystem.deleteAsync(downloaded.uri, { idempotent: true }).catch(() => undefined);
    throw new DiaryPhotoUploadPreparationError(
      '所选照片暂时无法处理，请返回相册重新选择。',
      'converted_file_unreadable',
      undefined,
      'downloaded_file_empty',
      photo.id,
      photoIndex,
    );
  }
  if (requestId) {
    logDevDiagnostic('info', 'diary.photo.material_download.completed', {
      requestId,
      route: '/photos/materials/:photoId/content',
      method: 'GET',
      status: 200,
      photoId: photo.id,
      photoIndex,
      fileSize: downloadedInfo.size ?? 0,
    });
  }
  return { uri: downloaded.uri, temporaryUri: downloaded.uri };
}

function getCaptureDateHint(value: string | undefined) {
  if (!value || value === '未知日期') return undefined;
  const match = /^(\d{4})\.(\d{2})\.(\d{2})$/.exec(value);
  if (!match) return undefined;
  const [, year, month, day] = match;
  const parsed = new Date(Number(year), Number(month) - 1, Number(day));
  if (
    parsed.getFullYear() !== Number(year)
    || parsed.getMonth() !== Number(month) - 1
    || parsed.getDate() !== Number(day)
  ) return undefined;
  return value;
}

function getImageActions(photo: DiaryPhoto) {
  const width = photo.width ?? 0;
  const height = photo.height ?? 0;
  const longestEdge = Math.max(width, height);
  if (!Number.isFinite(longestEdge) || longestEdge <= MAX_IMAGE_EDGE) return [];
  const scale = MAX_IMAGE_EDGE / longestEdge;
  return [{
    resize: {
      width: Math.max(1, Math.round(width * scale)),
      height: Math.max(1, Math.round(height * scale)),
    },
  }];
}

export async function prepareDiaryPhotoUploads(
  photoIds: string[],
  catalog: DiaryPhoto[],
): Promise<GenerationPhotoUpload[]> {
  const uploads: GenerationPhotoUpload[] = [];
  try {
    for (const [photoIndex, photoId] of photoIds.entries()) {
      const photo = catalog.find(item => item.id === photoId);
      const readable = photo
        ? await getReadableUri(photo, photoIndex)
        : undefined;
      if (!photo || !readable) {
        logDevDiagnostic('warn', 'diary.photo.preparation.failed', {
          photoId,
          photoIndex,
          failureStage: 'asset_unavailable',
          errorCode: 'asset_unavailable',
        });
        throw new DiaryPhotoUploadPreparationError(
          '所选照片无法读取，请返回相册重新选择。',
          'asset_unavailable',
          undefined,
          undefined,
          photoId,
          photoIndex,
        );
      }

      try {
        const result = await ImageManipulator.manipulateAsync(
          readable.uri,
          getImageActions(photo),
          {
            compress: 0.84,
            format: ImageManipulator.SaveFormat.JPEG,
          },
        );
        uploads.push({
          photoId,
          uri: result.uri,
          mimeType: 'image/jpeg',
          date: getCaptureDateHint(photo.date),
          cleanupUri: result.uri,
        });
        logDevDiagnostic('info', 'diary.photo.preparation.completed', {
          photoId,
          photoIndex,
          preparedCount: uploads.length,
        });
      } catch (error) {
        logDevDiagnostic('warn', 'diary.photo.preparation.failed', {
          photoId,
          photoIndex,
          failureStage: 'image_conversion',
          ...(getSafeErrorCode(error) ? { errorCode: getSafeErrorCode(error) } : {}),
          ...(error instanceof Error ? { errorName: error.name } : {}),
        });
        throw new DiaryPhotoUploadPreparationError(
          '所选照片暂时无法处理，请返回相册重新选择。',
          'image_conversion',
          error instanceof Error ? error.name : 'unknown',
          getSafeErrorCode(error),
          photo.id,
          photoIndex,
        );
      } finally {
        if (readable.temporaryUri) {
          await FileSystem.deleteAsync(readable.temporaryUri, { idempotent: true }).catch(() => undefined);
        }
      }
    }
    return uploads;
  } catch (error) {
    await cleanupDiaryPhotoUploads(uploads);
    if (error instanceof DiaryPhotoUploadPreparationError) throw error;
    throw new DiaryPhotoUploadPreparationError(
      '所选照片暂时无法处理，请返回相册重新选择。',
      'converted_file_unreadable',
      error instanceof Error ? error.name : 'unknown',
      getSafeErrorCode(error),
      undefined,
      undefined,
    );
  }
}

export async function cleanupDiaryPhotoUploads(uploads: GenerationPhotoUpload[]) {
  await Promise.all(uploads
    .map(photo => photo.cleanupUri)
    .filter((uri): uri is string => Boolean(uri))
    .map(uri => FileSystem.deleteAsync(uri, { idempotent: true }).catch(() => undefined)));
}
