import { createAppStore, createDefaultAppStoreDeps } from '../create-app-store';
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
});
