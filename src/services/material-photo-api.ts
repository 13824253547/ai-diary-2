import { appConfig } from '../config/app-config';
import {
  MAX_MATERIAL_LIBRARY_PHOTOS,
  MAX_MATERIAL_PHOTOS_PER_UPLOAD,
} from '../contracts/material-photo-contract';
import type { DiaryPhoto } from '../types/diary';
import { ApiClient } from './api-client';
import { getDeviceIdentityHeaders } from './device-identity';

type PhotoAssetContract = {
  id: string;
  sourceAssetId: string;
  title: string;
  date: string;
  filename: string;
  mimeType: string;
  size: number;
  width?: number;
  height?: number;
  diaryId?: string;
  generationRequestId?: string;
  generationPrompt?: string;
  generationSource?: string;
};

export type DiaryPhotoCopy = DiaryPhoto & { diaryId: string };

type Envelope<T> = { ok: true; data: T } | { ok: false; error?: { message?: string } };

const client = new ApiClient({
  baseUrl: appConfig.backendBaseUrl,
  getHeaders: getDeviceIdentityHeaders,
});

function isPhotoAsset(value: unknown): value is PhotoAssetContract {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const asset = value as Record<string, unknown>;
  return typeof asset.id === 'string'
    && typeof asset.sourceAssetId === 'string'
    && typeof asset.title === 'string'
    && typeof asset.date === 'string'
    && typeof asset.filename === 'string'
    && typeof asset.mimeType === 'string'
    && typeof asset.size === 'number'
    && (asset.width === undefined || typeof asset.width === 'number')
    && (asset.height === undefined || typeof asset.height === 'number')
    && (asset.generationRequestId === undefined || typeof asset.generationRequestId === 'string')
    && (asset.generationPrompt === undefined || typeof asset.generationPrompt === 'string')
    && (asset.generationSource === undefined || typeof asset.generationSource === 'string')
    && (asset.diaryId === undefined || typeof asset.diaryId === 'string');
}

function readEnvelope<T>(value: unknown): Envelope<T> | undefined {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined;
  const envelope = value as Record<string, unknown>;
  if (envelope.ok === true && 'data' in envelope) return envelope as Envelope<T>;
  if (envelope.ok === false) return envelope as Envelope<T>;
  return undefined;
}

function mimeTypeForPhoto(photo: DiaryPhoto) {
  const filename = `${photo.filename ?? ''} ${photo.localUri ?? photo.uri ?? ''}`.toLowerCase();
  if (filename.includes('.png')) return 'image/png';
  if (filename.includes('.webp')) return 'image/webp';
  if (filename.includes('.heic') || filename.includes('.heif')) return 'image/heic';
  if (filename.includes('.gif')) return 'image/gif';
  return 'image/jpeg';
}

function contentPath(kind: 'materials' | 'diaries' | 'diary-copies', id: string, photoId?: string) {
  if (kind === 'materials') {
    return `/photos/materials/${encodeURIComponent(id)}/content`;
  }
  if (kind === 'diary-copies') {
    return `/photos/diary-copies/${encodeURIComponent(id)}/content`;
  }
  return `/photos/diaries/${encodeURIComponent(id)}/photo-content?photoId=${encodeURIComponent(photoId ?? '')}`;
}

function toDiaryPhoto(asset: PhotoAssetContract, headers: Record<string, string>, uri: string): DiaryPhoto {
  return {
    id: asset.id,
    sourceAssetId: asset.sourceAssetId,
    title: asset.title,
    location: '',
    emoji: '🖼',
    color: '#EFE3D5',
    date: asset.date || '未知日期',
    filename: asset.filename,
    width: asset.width,
    height: asset.height,
    uri,
    remoteHeaders: headers,
    source: asset.generationRequestId ? 'generated' : 'device',
    generationRequestId: asset.generationRequestId,
    generationPrompt: asset.generationPrompt,
    ...(asset.generationRequestId ? { generationSource: 'provider' as const } : {}),
  };
}

export async function listMaterialPhotosFromBackend(): Promise<
  | { ok: true; photos: DiaryPhoto[] }
  | { ok: false; message: string }
> {
  if (process.env.JEST_WORKER_ID) return { ok: false, message: '测试环境不请求素材服务。' };
  try {
    const response = await client.get<unknown>('/photos/materials');
    const envelope = readEnvelope<unknown>(response);
    if (!envelope || envelope.ok !== true || !Array.isArray(envelope.data)
      || envelope.data.some(item => !isPhotoAsset(item))) {
      return { ok: false, message: '素材库返回的数据无法读取。' };
    }
    const headers = await getDeviceIdentityHeaders();
    const photos = (envelope.data as PhotoAssetContract[]).map(asset =>
      toDiaryPhoto(asset, headers, client.buildUrl(contentPath('materials', asset.id))),
    );
    return { ok: true, photos };
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : '素材库暂时无法读取。' };
  }
}

export async function uploadMaterialPhotosToBackend(photos: DiaryPhoto[]): Promise<
  | { ok: true; photos: DiaryPhoto[] }
  | { ok: false; message: string }
> {
  if (process.env.JEST_WORKER_ID) return { ok: false, message: '测试环境不请求素材服务。' };
  if (photos.length < 1 || photos.length > MAX_MATERIAL_PHOTOS_PER_UPLOAD) {
    return { ok: false, message: `每次最多上传 ${MAX_MATERIAL_PHOTOS_PER_UPLOAD} 张照片。` };
  }
  const form = new FormData();
  form.append('photoMetadata', JSON.stringify(photos.map(photo => ({
    sourceAssetId: photo.id,
    title: photo.title,
    date: photo.date,
    filename: photo.filename,
    width: photo.width,
    height: photo.height,
  }))));
  for (const [index, photo] of photos.entries()) {
    const uri = photo.localUri ?? photo.uri;
    if (!uri) return { ok: false, message: '部分照片当前无法读取，请重新选择。' };
    const mimeType = mimeTypeForPhoto(photo);
    const extension = mimeType.slice('image/'.length);
    form.append('photos', {
      uri,
      name: photo.filename || `material-${index + 1}.${extension}`,
      type: mimeType,
    } as unknown as Blob);
  }

  try {
    const response = await client.request<unknown>('/photos/materials', {
      method: 'POST',
      body: form,
    }, { transport: 'xhr', timeoutMs: 120_000 });
    const envelope = readEnvelope<unknown>(response.data);
    if (!response.ok || !envelope || envelope.ok !== true || !Array.isArray(envelope.data)
      || envelope.data.some(item => !isPhotoAsset(item))) {
      const failure = envelope?.ok === false ? envelope.error?.message : undefined;
      return { ok: false, message: failure || '照片没有成功上传到素材库。' };
    }
    const headers = await getDeviceIdentityHeaders();
    const originals = new Map(photos.map(photo => [photo.id, photo]));
    const uploaded = (envelope.data as PhotoAssetContract[]).map(asset => {
      const original = originals.get(asset.sourceAssetId);
      const sourcePhoto = original ? { ...original, localUri: undefined } : {};
      return {
        ...sourcePhoto,
        ...toDiaryPhoto(asset, headers, client.buildUrl(contentPath('materials', asset.id))),
      } as DiaryPhoto;
    });
    if (uploaded.length !== photos.length || uploaded.some(photo => !photo.id)) {
      return { ok: false, message: '照片上传结果不完整，素材库没有更新。' };
    }
    return { ok: true, photos: uploaded };
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : '网络请求失败，照片没有上传。' };
  }
}

export async function deleteMaterialPhotosFromBackend(photoIds: string[]): Promise<
  | { ok: true }
  | { ok: false; message: string }
> {
  if (process.env.JEST_WORKER_ID) return { ok: false, message: '测试环境不请求素材服务。' };
  if (photoIds.length < 1 || photoIds.length > MAX_MATERIAL_LIBRARY_PHOTOS) {
    return { ok: false, message: '请选择要删除的素材。' };
  }
  try {
    const response = await client.request<unknown>('/photos/materials', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ photoIds }),
    });
    const envelope = readEnvelope<unknown>(response.data);
    if (!response.ok || !envelope || envelope.ok !== true) {
      const failure = envelope?.ok === false ? envelope.error?.message : undefined;
      return { ok: false, message: failure || '素材删除失败。' };
    }
    return { ok: true };
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : '素材删除失败。' };
  }
}

export async function listSavedDiaryPhotoAssets(diaryIds: string[]): Promise<DiaryPhotoCopy[]> {
  if (!diaryIds.length || process.env.JEST_WORKER_ID) return [];
  const headers = await getDeviceIdentityHeaders();
  const photos: DiaryPhotoCopy[] = [];
  for (let offset = 0; offset < diaryIds.length; offset += 100) {
    const batch = diaryIds.slice(offset, offset + 100);
    const path = `/photos/diaries/assets?diaryIds=${encodeURIComponent(batch.join(','))}`;
    const response = await client.get<unknown>(path);
    const envelope = readEnvelope<unknown>(response);
    if (!envelope || envelope.ok !== true || !Array.isArray(envelope.data)
      || envelope.data.some(item => !isPhotoAsset(item) || !item.diaryId)) {
      throw new Error('日记照片副本返回的数据无法读取。');
    }
    photos.push(...(envelope.data as PhotoAssetContract[]).map(asset => ({
      ...toDiaryPhoto(
        { ...asset, id: asset.sourceAssetId },
        headers,
        client.buildUrl(contentPath('diaries', asset.diaryId!, asset.sourceAssetId)),
      ),
      diaryId: asset.diaryId!,
    })));
  }
  return photos;
}

export function getDiaryPhotoContentUrl(diaryId: string, photoId: string) {
  return client.buildUrl(contentPath('diaries', diaryId, photoId));
}
