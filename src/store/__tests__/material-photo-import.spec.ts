import { createAppStore, createDefaultAppStoreDeps } from '../create-app-store';
import * as materialPhotoApi from '../../services/material-photo-api';
import type { DiaryPhoto } from '../../types/diary';

const devicePhoto: DiaryPhoto = {
  id: 'device-photo-1',
  title: '真实照片',
  location: '',
  emoji: '🖼',
  color: '#EFE3D5',
  date: '2026.10.16',
  uri: 'ph://device-photo-1',
  localUri: 'file:///device-photo-1.jpg',
  width: 1200,
  height: 1600,
  source: 'device',
};

describe('Store device photo import', () => {
  test('restores uploaded and server-generated photos together without accepting mock assets', () => {
    const generated: DiaryPhoto = {
      ...devicePhoto,
      id: 'generated-remote-1',
      sourceAssetId: 'image-request-1',
      source: 'generated',
      generationRequestId: 'image-request-1',
      generationPrompt: '雨后的老街',
      generationSource: 'provider',
      uri: 'https://api.example.test/photos/materials/generated-remote-1/content',
      localUri: undefined,
      remoteHeaders: { 'x-device-id': 'device-1' },
    };
    const uploaded: DiaryPhoto = {
      ...devicePhoto,
      id: 'uploaded-remote-1',
      uri: 'https://api.example.test/photos/materials/uploaded-remote-1/content',
      localUri: undefined,
      remoteHeaders: { 'x-device-id': 'device-1' },
    };
    const store = createAppStore(createDefaultAppStoreDeps({ photos: [], diaries: [] }));

    expect(store.getState().syncMaterialPhotos([generated, uploaded])).toBe(true);
    expect(store.getState().materialPhotoIds).toEqual([generated.id, uploaded.id]);
    expect(store.getState().photos.find(photo => photo.id === generated.id))
      .toMatchObject({ source: 'generated', generationPrompt: '雨后的老街' });
    const previousPhotos = store.getState().photos;
    const previousIds = store.getState().materialPhotoIds;
    expect(store.getState().syncMaterialPhotos([
      generated,
      { ...uploaded, source: 'generated', generationSource: 'mock' },
    ])).toBe(false);
    expect(store.getState().photos).toBe(previousPhotos);
    expect(store.getState().materialPhotoIds).toBe(previousIds);

    const restarted = createAppStore(createDefaultAppStoreDeps({ photos: [], diaries: [] }));
    expect(restarted.getState().syncMaterialPhotos([generated, uploaded])).toBe(true);
    expect(restarted.getState().materialPhotoIds).toEqual([generated.id, uploaded.id]);
  });

  test('registers readable device assets and deduplicates concurrent results', async () => {
    const importer = jest.fn(async () => ({ ok: true as const, photos: [devicePhoto] }));
    const store = createAppStore(createDefaultAppStoreDeps({
      photos: [],
      diaries: [],
      devicePhotoImporter: importer,
    }));

    const [first, duplicate] = await Promise.all([
      store.getState().importDevicePhotosToMaterials(['device-photo-1']),
      store.getState().importDevicePhotosToMaterials(['device-photo-1']),
    ]);

    expect(first).toEqual({ ok: true, photoIds: ['device-photo-1'] });
    expect(duplicate).toEqual({ ok: true, photoIds: ['device-photo-1'] });
    expect(importer).toHaveBeenCalledTimes(2);
    expect(store.getState().photos.filter(photo => photo.id === 'device-photo-1')).toHaveLength(1);
    expect(store.getState().materialPhotoIds).toEqual(['device-photo-1']);
    expect(store.getState().photoCatalogVersion).toBe(1);
  });

  test('refreshes the current URI for an already registered device asset', async () => {
    const refreshedPhoto = { ...devicePhoto, localUri: 'file:///device-photo-1-refreshed.jpg' };
    const store = createAppStore(createDefaultAppStoreDeps({
      photos: [devicePhoto],
      diaries: [],
      devicePhotoImporter: async () => ({ ok: true, photos: [refreshedPhoto] }),
    }));

    await expect(store.getState().importDevicePhotosToMaterials(['device-photo-1']))
      .resolves.toEqual({ ok: true, photoIds: ['device-photo-1'] });

    expect(store.getState().photos).toHaveLength(1);
    expect(store.getState().photos[0].localUri).toBe('file:///device-photo-1-refreshed.jpg');
    expect(store.getState().materialPhotoIds).toEqual(['device-photo-1']);
  });

  test('enforces twelve photos per import and a one-hundred-photo material capacity', async () => {
    const photos: DiaryPhoto[] = Array.from({ length: 101 }, (_, index) => ({
      ...devicePhoto,
      id: `device-photo-${index + 1}`,
      title: `照片${index + 1}`,
      uri: `ph://device-photo-${index + 1}`,
      localUri: `file:///device-photo-${index + 1}.jpg`,
    }));
    const importer = jest.fn(async (ids: string[]) => ({
      ok: true as const,
      photos: ids.map(id => photos.find(photo => photo.id === id)!),
    }));
    const store = createAppStore(createDefaultAppStoreDeps({
      photos,
      diaries: [],
      devicePhotoImporter: importer,
    }));
    store.setState({ materialPhotoIds: photos.slice(0, 88).map(photo => photo.id) });

    await expect(store.getState().importDevicePhotosToMaterials(
      photos.slice(88, 100).map(photo => photo.id),
    )).resolves.toEqual({
      ok: true,
      photoIds: photos.slice(88, 100).map(photo => photo.id),
    });
    expect(store.getState().materialPhotoIds).toHaveLength(100);

    await expect(store.getState().importDevicePhotosToMaterials([photos[100]!.id]))
      .resolves.toMatchObject({ ok: false, reason: 'invalid_input' });
    expect(importer).toHaveBeenCalledTimes(1);

    const duplicateImporter = jest.fn(async () => ({ ok: true as const, photos: [devicePhoto] }));
    const duplicateAtCapacityStore = createAppStore(createDefaultAppStoreDeps({
      photos: [devicePhoto],
      diaries: [],
      devicePhotoImporter: duplicateImporter,
    }));
    duplicateAtCapacityStore.setState({
      materialPhotoIds: Array.from({ length: 100 }, (_, index) => `cloud-material-${index + 1}`),
    });
    await expect(duplicateAtCapacityStore.getState().importDevicePhotosToMaterials(['device-photo-1']))
      .resolves.toMatchObject({ ok: false, reason: 'invalid_input' });
    expect(duplicateImporter).not.toHaveBeenCalled();

    const emptyStore = createAppStore(createDefaultAppStoreDeps({
      photos: [],
      diaries: [],
      devicePhotoImporter: importer,
    }));
    await expect(emptyStore.getState().importDevicePhotosToMaterials(
      Array.from({ length: 13 }, (_, index) => `upload-${index}`),
    )).resolves.toMatchObject({ ok: false, reason: 'invalid_input' });
    expect(importer).toHaveBeenCalledTimes(1);
  });

  test('keeps the photo catalog and membership unchanged when import fails or IDs collide', async () => {
    const failedImporter = jest.fn(async () => ({
      ok: false as const,
      reason: 'asset_unreadable' as const,
      message: '所选照片不可读取。',
    }));
    const failedStore = createAppStore(createDefaultAppStoreDeps({
      photos: [],
      diaries: [],
      devicePhotoImporter: failedImporter,
    }));

    await expect(failedStore.getState().importDevicePhotosToMaterials(['device-photo-1']))
      .resolves.toMatchObject({ ok: false, reason: 'asset_unreadable' });
    expect(failedStore.getState().photos).toEqual([]);
    expect(failedStore.getState().materialPhotoIds).toEqual([]);

    const partialStore = createAppStore(createDefaultAppStoreDeps({
      photos: [],
      diaries: [],
      devicePhotoImporter: async () => ({ ok: true, photos: [devicePhoto] }),
    }));
    await expect(partialStore.getState().importDevicePhotosToMaterials([
      'device-photo-1',
      'device-photo-2',
    ])).resolves.toMatchObject({ ok: false, reason: 'asset_unreadable' });
    expect(partialStore.getState().photos).toEqual([]);
    expect(partialStore.getState().materialPhotoIds).toEqual([]);

    const conflictingStore = createAppStore(createDefaultAppStoreDeps({
      photos: [{ ...devicePhoto, source: 'mock', image: 1 }],
      diaries: [],
      devicePhotoImporter: async () => ({ ok: true, photos: [devicePhoto] }),
    }));
      const originalPhotos = conflictingStore.getState().photos.map(photo => ({ ...photo }));
      const originalMaterialPhotoIds = [...conflictingStore.getState().materialPhotoIds];

    await expect(conflictingStore.getState().importDevicePhotosToMaterials(['device-photo-1']))
      .resolves.toMatchObject({ ok: false, reason: 'identity_conflict' });
    expect(conflictingStore.getState().photos[0]).toMatchObject({ source: 'mock', image: 1 });
      expect(conflictingStore.getState().photos).toEqual(originalPhotos);
      expect(conflictingStore.getState().materialPhotoIds).toEqual(originalMaterialPhotoIds);
  });

  test('prefers saved diary photo copies over material URLs during memory hydration', async () => {
    const materialPhoto: DiaryPhoto = {
      ...devicePhoto,
      id: 'material-photo-1',
      sourceAssetId: 'device-photo-1',
      uri: 'https://api.example.test/photos/materials/material-photo-1/content',
      localUri: undefined,
      remoteHeaders: { 'x-device-id': 'device-1' },
    };
      const diaryCopy = {
      ...materialPhoto,
        diaryId: 'diary-1',
        uri: 'https://api.example.test/photos/diaries/diary-1/photo-content?photoId=material-photo-1',
      } as DiaryPhoto & { diaryId: string };
    const listDiaryPhotos = jest.spyOn(materialPhotoApi, 'listSavedDiaryPhotoAssets').mockResolvedValue([diaryCopy]);
    const repository = {
      listMemories: async () => ({
        ok: true as const,
        version: 1 as const,
        data: {
          items: [{
            id: 'diary-1',
            title: '一段真实回忆',
            summary: '',
            location: '',
            date: '2026.10.23',
            privacy: 'private' as const,
            photoIds: ['material-photo-1'],
            version: 1,
          }],
          page: 1,
          pageSize: 100,
          total: 1,
        },
      }),
    };
    const store = createAppStore(createDefaultAppStoreDeps({
      photos: [materialPhoto],
      diaries: [],
      adapters: { memoriesRepository: repository as never },
    }));
    store.setState({ materialPhotoIds: ['material-photo-1'] });

    await store.getState().hydrateMemories();

    expect(listDiaryPhotos).toHaveBeenCalledWith(['diary-1']);
    expect(store.getState().photos.find(photo => photo.id === materialPhoto.id)?.uri).toBe(diaryCopy.uri);
    expect(store.getState().materialPhotoIds).toEqual(['material-photo-1']);
    expect(store.getState().hydratedMemories).toBe(true);
  });

  test('loads the requested diary photo copies when opening a diary directly', async () => {
    const diary = {
      id: 'diary-read',
      type: 'travel' as const,
      status: 'ready' as const,
      title: '一段真实回忆',
      subtitle: '',
      location: '',
      date: '2026.10.23',
      summary: '',
      helperMessage: '',
      characterId: 'character-blue',
      companionName: '自己',
      privacy: 'private' as const,
      photoIds: ['photo-read'],
      coverPhotoId: 'photo-read',
      blocks: [],
      exportedImage: false,
      exportedPdf: false,
      shareModes: [],
    };
    const copy: DiaryPhoto & { diaryId: string } = {
      ...devicePhoto,
      id: 'photo-read',
      localUri: undefined,
      uri: 'https://api.example.test/photos/diaries/diary-read/photo-content?photoId=photo-read',
      remoteHeaders: { 'x-device-id': 'device-1' },
      diaryId: diary.id,
    };
    const listDiaryPhotos = jest.spyOn(materialPhotoApi, 'listSavedDiaryPhotoAssets').mockResolvedValue([copy]);
    const store = createAppStore(createDefaultAppStoreDeps({
      photos: [],
      diaries: [],
      adapters: {
        diaryRepository: {
          getDiary: async () => ({ ok: true as const, version: 1 as const, data: diary }),
        } as never,
      },
    }));

    await expect(store.getState().readDiaryById(diary.id)).resolves.toMatchObject({ ok: true });

    expect(listDiaryPhotos).toHaveBeenCalledWith([diary.id]);
    expect(store.getState().photos.find(photo => photo.id === 'photo-read')).toMatchObject({
      uri: copy.uri,
      remoteHeaders: copy.remoteHeaders,
    });
  });
});
