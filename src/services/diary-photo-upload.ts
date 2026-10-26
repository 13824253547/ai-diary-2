import * as FileSystem from 'expo-file-system/legacy';
import * as ImageManipulator from 'expo-image-manipulator';
import type { DiaryPhoto } from '../types/diary';
import type { GenerationPhotoUpload } from '../repositories/core-diary-repository';

const MAX_IMAGE_EDGE = 2048;

export class DiaryPhotoUploadPreparationError extends Error {
  constructor(message: string) {
    super(message);
  }
}

function getReadableUri(photo: DiaryPhoto) {
  const uri = photo.localUri ?? photo.uri;
  if (!uri || !/^(file|content):\/\//i.test(uri)) return undefined;
  return uri;
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
    for (const photoId of photoIds) {
      const photo = catalog.find(item => item.id === photoId);
      const uri = photo && getReadableUri(photo);
      if (!photo || !uri) {
        throw new DiaryPhotoUploadPreparationError('所选照片无法读取，请返回相册重新选择。');
      }

      const result = await ImageManipulator.manipulateAsync(
        uri,
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
    }
    return uploads;
  } catch (error) {
    await cleanupDiaryPhotoUploads(uploads);
    if (error instanceof DiaryPhotoUploadPreparationError) throw error;
    throw new DiaryPhotoUploadPreparationError('所选照片暂时无法处理，请返回相册重新选择。');
  }
}

export async function cleanupDiaryPhotoUploads(uploads: GenerationPhotoUpload[]) {
  await Promise.all(uploads
    .map(photo => photo.cleanupUri)
    .filter((uri): uri is string => Boolean(uri))
    .map(uri => FileSystem.deleteAsync(uri, { idempotent: true }).catch(() => undefined)));
}
