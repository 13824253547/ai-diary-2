import React from 'react';
import { act, fireEvent, render, waitFor } from '@testing-library/react-native';
import { Alert, ScrollView } from 'react-native';
import LibraryScreen from '../library';
import { createTestStore } from '../../src/test-utils/create-test-store';
import { useAppStore } from '../../src/store/use-app-store';
import type { AppStore } from '../../src/store/use-app-store';
import type { DiaryPhoto } from '../../src/types/diary';
import * as photoLibrary from '../../src/services/photo-library';
import * as photoPermission from '../../src/services/photo-permission';
import * as materialPhotoApi from '../../src/services/material-photo-api';

const mockRouter = {
  push: jest.fn(),
  back: jest.fn(),
  canGoBack: jest.fn(() => false),
  replace: jest.fn(),
};

jest.mock('expo-router', () => ({
  useRouter: () => mockRouter,
}));

jest.mock('../../src/components/layout/screen', () => ({
  Screen: ({ children, header }: { children: React.ReactNode; header?: React.ReactNode }) => {
    const { View } = require('react-native');
    return <View>{header}{children}</View>;
  },
}));

jest.mock('../../src/components/common/bottom-sheet', () => ({
  BottomSheet: ({
    visible,
    onClose,
    title,
    children,
    footer,
    footerContainerStyle,
    onScroll,
    scrollEventThrottle,
  }: {
    visible: boolean;
    onClose: () => void;
    title?: string;
    children: React.ReactNode;
    footer?: React.ReactNode;
    footerContainerStyle?: object;
    onScroll?: (event: unknown) => void;
    scrollEventThrottle?: number;
  }) => {
    const { Pressable, ScrollView, Text, View } = require('react-native');
    return visible ? (
      <View>
        <Text>{title}</Text>
        <Pressable accessibilityRole="button" accessibilityLabel="关闭底部面板" onPress={onClose}>
          <Text>关闭</Text>
        </Pressable>
        <ScrollView testID="upload-sheet-scroll" onScroll={onScroll} scrollEventThrottle={scrollEventThrottle}>{children}</ScrollView>
        {footer ? <View style={footerContainerStyle}>{footer}</View> : null}
      </View>
    ) : null;
  },
}));

jest.mock('@expo/vector-icons', () => {
  const { Text } = require('react-native');
  return { Ionicons: ({ name }: { name: string }) => <Text>{name}</Text> };
});

jest.mock('expo-linear-gradient', () => ({
  LinearGradient: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

function resetAppStore() {
  const current = useAppStore.getState() as Record<string, unknown>;
  const fresh = createTestStore().store.getState() as Record<string, unknown>;
  const next = Object.fromEntries(
    Object.keys(current).map(key => [key, typeof current[key] === 'function' ? current[key] : fresh[key]]),
  );
  useAppStore.setState(next as AppStore, true);
}

function buildPhoto(id: string): DiaryPhoto {
  return {
    id,
    title: `相册照片${id}`,
    location: '',
    emoji: '🖼',
    color: '#EFE3D5',
    date: '未知日期',
    uri: `file:///device/${id}.jpg`,
    localUri: `file:///device/${id}.jpg`,
    filename: `${id}.jpg`,
    width: 100,
    height: 120,
    source: 'device',
  };
}

function makePage(photos: DiaryPhoto[]) {
  return {
    album: { id: '__all__', title: '全部照片', assetCount: photos.length },
    photos,
    hasNextPage: false,
  };
}

describe('Library screen material management', () => {
  beforeEach(() => {
    resetAppStore();
    jest.clearAllMocks();
    jest.spyOn(photoPermission, 'getPhotoPermissionStatus').mockResolvedValue({
      status: 'full',
      granted: true,
      canAskAgain: true,
    });
    jest.spyOn(photoLibrary, 'listDevicePhotos').mockResolvedValue(makePage([]));
    jest.spyOn(photoLibrary, 'listDevicePhotoAlbums').mockResolvedValue([
      { id: '__all__', title: '全部照片', assetCount: 0 },
    ]);
    jest.spyOn(materialPhotoApi, 'listMaterialPhotosFromBackend').mockResolvedValue({ ok: true, photos: [] });
    jest.spyOn(materialPhotoApi, 'listSavedDiaryPhotoAssets').mockResolvedValue([]);
    jest.spyOn(useAppStore.getState(), 'importDevicePhotosToMaterials').mockImplementation(async photoIds => ({
      ok: true,
      photoIds,
    }));
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  test('multi-selects and uploads at most twelve photos to the remote material library', async () => {
    const photos = Array.from({ length: 13 }, (_, index) => buildPhoto(`device-${index + 1}`));
    jest.spyOn(photoLibrary, 'listDevicePhotos').mockResolvedValue(makePage(photos));
    const upload = jest.spyOn(materialPhotoApi, 'uploadMaterialPhotosToBackend').mockImplementation(async selected =>
      ({
        ok: true,
        photos: selected.map(photo => ({
          ...photo,
          id: `cloud-${photo.id}`,
          sourceAssetId: photo.id,
          uri: `https://api.example.test/photos/materials/cloud-${photo.id}/content`,
          localUri: undefined,
          remoteHeaders: { 'x-device-id': 'test-device' },
        })),
      }),
    );
    const screen = await render(<LibraryScreen />);

    await act(async () => {
      fireEvent.press(screen.getByLabelText('添加照片'));
    });
    await screen.findByLabelText('添加相册照片device-1');
    for (let index = 1; index <= 13; index += 1) {
      await act(async () => {
        fireEvent.press(screen.getByLabelText(`添加相册照片device-${index}`));
      });
    }

    expect(screen.getByText('已选 12 张 · 素材库 0/100')).toBeTruthy();
    let ancestor = screen.getByLabelText('上传所选照片（12）').parent;
    let uploadButtonIsInsideScrollView = false;
    while (ancestor) {
      if ((ancestor.type as unknown) === ScrollView) {
        uploadButtonIsInsideScrollView = true;
        break;
      }
      ancestor = ancestor.parent;
    }
    expect(uploadButtonIsInsideScrollView).toBe(false);
    await act(async () => {
      fireEvent.press(screen.getByLabelText('上传所选照片（12）'));
    });
    await waitFor(() => expect(upload).toHaveBeenCalledTimes(1));
    expect(upload.mock.calls[0]?.[0]).toHaveLength(12);
    expect(useAppStore.getState().materialPhotoIds).toHaveLength(12);
    expect(useAppStore.getState().materialPhotoIds[0]).toBe('cloud-device-1');
    expect(useAppStore.getState().photos.find(photo => photo.id === 'cloud-device-1')).toMatchObject({
      uri: 'https://api.example.test/photos/materials/cloud-device-1/content',
      localUri: undefined,
    });
  });

  test('allows uploading the same device photo again as a separate material', async () => {
    const devicePhoto = buildPhoto('device-repeat-1');
    const previousUpload: DiaryPhoto = {
      ...devicePhoto,
      id: 'cloud-previous-upload',
      sourceAssetId: devicePhoto.id,
      uri: 'https://api.example.test/photos/materials/cloud-previous-upload/content',
      localUri: undefined,
      remoteHeaders: { 'x-device-id': 'test-device' },
    };
    jest.spyOn(materialPhotoApi, 'listMaterialPhotosFromBackend')
      .mockResolvedValue({ ok: true, photos: [previousUpload] });
    jest.spyOn(photoLibrary, 'listDevicePhotos').mockResolvedValue(makePage([devicePhoto]));
    useAppStore.getState().registerPhotos([previousUpload]);
    useAppStore.setState({ materialPhotoIds: [previousUpload.id] });
    let uploadIndex = 0;
    const upload = jest.spyOn(materialPhotoApi, 'uploadMaterialPhotosToBackend').mockImplementation(async selected => {
      uploadIndex += 1;
      const id = `cloud-repeat-upload-${uploadIndex}`;
      return {
        ok: true,
        photos: selected.map(photo => ({
          ...photo,
          id,
          sourceAssetId: photo.id,
          uri: `https://api.example.test/photos/materials/${id}/content`,
          localUri: undefined,
          remoteHeaders: { 'x-device-id': 'test-device' },
        })),
      };
    });
    const screen = await render(<LibraryScreen />);

    const openPicker = async () => {
      await act(async () => {
        fireEvent.press(screen.getByLabelText('添加照片'));
      });
      await screen.findByLabelText('添加相册照片device-repeat-1');
    };
    const selectAndUpload = async () => {
      await act(async () => {
        fireEvent.press(screen.getByLabelText('添加相册照片device-repeat-1'));
      });
      expect(screen.getByText('checkmark')).toBeTruthy();
      await act(async () => {
        fireEvent.press(screen.getByLabelText('上传所选照片（1）'));
      });
      await waitFor(() => expect(upload).toHaveBeenCalledTimes(uploadIndex));
    };

    await openPicker();
    expect(screen.getByLabelText('添加相册照片device-repeat-1').props.accessibilityState?.disabled).toBe(false);
    expect(screen.queryByText('checkmark')).toBeNull();
    await selectAndUpload();

    await openPicker();
    expect(screen.getByLabelText('添加相册照片device-repeat-1').props.accessibilityState?.disabled).toBe(false);
    expect(screen.queryByText('checkmark')).toBeNull();
    await selectAndUpload();

    expect(upload).toHaveBeenCalledTimes(2);
    expect(useAppStore.getState().materialPhotoIds).toEqual([
      'cloud-previous-upload',
      'cloud-repeat-upload-1',
      'cloud-repeat-upload-2',
    ]);
  });

  test('uses local albums, shared photo rendering, and pagination like diary selection', async () => {
    const firstAllPhoto = buildPhoto('device-all-1');
    const firstTripPhoto = buildPhoto('device-trip-1');
    const secondTripPhoto = buildPhoto('device-trip-2');
    const albumList = jest.spyOn(photoLibrary, 'listDevicePhotoAlbums').mockResolvedValue([
      { id: '__all__', title: '全部照片', assetCount: 2 },
      { id: 'album-trip', title: '旅行', assetCount: 2 },
    ]);
    const listPage = jest.spyOn(photoLibrary, 'listDevicePhotos').mockImplementation(async ({ albumId, after } = {}) => {
      if (albumId === 'album-trip' && after === 'trip-cursor') {
        return {
          album: { id: 'album-trip', title: '旅行', assetCount: 2 },
          photos: [secondTripPhoto],
          hasNextPage: false,
        };
      }
      if (albumId === 'album-trip') {
        return {
          album: { id: 'album-trip', title: '旅行', assetCount: 2 },
          photos: [firstTripPhoto],
          hasNextPage: true,
          endCursor: 'trip-cursor',
        };
      }
      return makePage([firstAllPhoto]);
    });
    const screen = await render(<LibraryScreen />);

    await act(async () => {
      fireEvent.press(screen.getByLabelText('添加照片'));
    });
    await waitFor(() => expect(screen.getByLabelText('选择相册')).toBeTruthy());
    expect(albumList).toHaveBeenCalledTimes(1);
    expect(listPage).toHaveBeenCalledWith({ albumId: '__all__', first: 36 });

    await act(async () => {
      fireEvent.press(screen.getByLabelText('选择相册'));
    });
    await act(async () => {
      fireEvent.press(screen.getByLabelText('选择相册旅行'));
    });
    await waitFor(() => expect(screen.getByTestId('diary-photo-device-trip-1')).toBeTruthy());
    expect(listPage).toHaveBeenLastCalledWith({ albumId: 'album-trip', first: 36 });
    expect(useAppStore.getState().photos.find(photo => photo.id === firstTripPhoto.id)?.localUri)
      .toBe(firstTripPhoto.localUri);

    await act(async () => {
      fireEvent.scroll(screen.getByTestId('upload-sheet-scroll'), {
        nativeEvent: {
          contentOffset: { y: 600 },
          contentSize: { height: 900 },
          layoutMeasurement: { height: 300 },
        },
      });
    });

    await waitFor(() => expect(screen.getByTestId('diary-photo-device-trip-2')).toBeTruthy());
    expect(listPage).toHaveBeenLastCalledWith({
      albumId: 'album-trip',
      first: 36,
      after: 'trip-cursor',
    });
  });

  test('does not let a late initial refresh overwrite a completed upload', async () => {
    const photo = buildPhoto('device-race-1');
    jest.spyOn(photoLibrary, 'listDevicePhotos').mockResolvedValue(makePage([photo]));
    let finishInitialRefresh!: (value: { ok: true; photos: DiaryPhoto[] }) => void;
    const initialRefresh = new Promise<{ ok: true; photos: DiaryPhoto[] }>(resolve => {
      finishInitialRefresh = resolve;
    });
    jest.spyOn(materialPhotoApi, 'listMaterialPhotosFromBackend').mockReturnValue(initialRefresh);
    jest.spyOn(materialPhotoApi, 'uploadMaterialPhotosToBackend').mockResolvedValue({
      ok: true,
      photos: [{
        ...photo,
        id: 'cloud-race-1',
        uri: 'https://api.example.test/photos/materials/cloud-race-1/content',
        localUri: undefined,
      }],
    });
    const workerId = process.env.JEST_WORKER_ID;
    delete process.env.JEST_WORKER_ID;
    try {
      const screen = await render(<LibraryScreen />);

      await act(async () => {
        fireEvent.press(screen.getByLabelText('添加照片'));
      });
      await screen.findByLabelText('添加相册照片device-race-1');
      await act(async () => {
        fireEvent.press(screen.getByLabelText('添加相册照片device-race-1'));
      });
      await act(async () => {
        fireEvent.press(screen.getByLabelText('上传所选照片（1）'));
      });
      await waitFor(() => expect(useAppStore.getState().materialPhotoIds).toEqual(['cloud-race-1']));

      await act(async () => {
        finishInitialRefresh({ ok: true, photos: [] });
        await initialRefresh;
      });

      expect(useAppStore.getState().materialPhotoIds).toEqual(['cloud-race-1']);
    } finally {
      if (workerId === undefined) delete process.env.JEST_WORKER_ID;
      else process.env.JEST_WORKER_ID = workerId;
    }
  });

  test('allows uploads above twelve total and stops selection at one hundred', async () => {
    const existing = Array.from({ length: 99 }, (_, index) => buildPhoto(`cloud-existing-${index + 1}`));
    const incoming = [buildPhoto('device-new-1'), buildPhoto('device-new-2')];
    const uploaded: DiaryPhoto[] = [{
      ...incoming[0]!,
      id: 'cloud-device-new-1',
      sourceAssetId: incoming[0]!.id,
      uri: 'https://api.example.test/photos/materials/cloud-device-new-1/content',
      localUri: undefined,
    }];
    jest.spyOn(materialPhotoApi, 'listMaterialPhotosFromBackend').mockResolvedValue({ ok: true, photos: existing });
    jest.spyOn(photoLibrary, 'listDevicePhotos').mockResolvedValue(makePage(incoming));
    jest.spyOn(materialPhotoApi, 'uploadMaterialPhotosToBackend').mockResolvedValue({ ok: true, photos: uploaded });
    useAppStore.getState().registerPhotos(existing);
    useAppStore.setState({ materialPhotoIds: existing.map(photo => photo.id) });
    const upload = jest.spyOn(materialPhotoApi, 'uploadMaterialPhotosToBackend');
    const screen = await render(<LibraryScreen />);

    await act(async () => {
      fireEvent.press(screen.getByLabelText('添加照片'));
    });

    await screen.findByLabelText('添加相册照片device-new-1');
    await waitFor(() => expect(screen.getByText('已选 0 张 · 素材库 99/100')).toBeTruthy());
    await act(async () => {
      fireEvent.press(screen.getByLabelText('添加相册照片device-new-1'));
    });
    await act(async () => {
      fireEvent.press(screen.getByLabelText('添加相册照片device-new-2'));
    });
    expect(screen.getByText('已选 1 张 · 素材库 99/100')).toBeTruthy();
    await act(async () => {
      fireEvent.press(screen.getByLabelText('上传所选照片（1）'));
    });
    await waitFor(() => expect(upload).toHaveBeenCalledTimes(1));
    expect(upload.mock.calls[0]?.[0]).toHaveLength(1);
    expect(useAppStore.getState().materialPhotoIds).toHaveLength(100);
  });

  test('blocks upload when the material library already contains one hundred photos', async () => {
    const photos = Array.from({ length: 100 }, (_, index) => buildPhoto(`device-${index + 1}`));
    jest.spyOn(materialPhotoApi, 'listMaterialPhotosFromBackend').mockResolvedValue({ ok: true, photos });
    jest.spyOn(photoLibrary, 'listDevicePhotos').mockResolvedValue(makePage([buildPhoto('device-extra')]));
    useAppStore.getState().registerPhotos(photos);
    useAppStore.setState({ materialPhotoIds: photos.map(photo => photo.id) });
    const upload = jest.spyOn(materialPhotoApi, 'uploadMaterialPhotosToBackend');
    const screen = await render(<LibraryScreen />);

    await act(async () => {
      fireEvent.press(screen.getByLabelText('添加照片'));
    });

    await screen.findByLabelText('添加相册照片device-extra');
    await waitFor(() => expect(screen.getByText('已选 0 张 · 素材库 100/100')).toBeTruthy());
    expect(screen.getByText('素材库已满，请先删除部分照片。')).toBeTruthy();
    expect(screen.getByLabelText('上传所选照片（0）').props.accessibilityState?.disabled).toBe(true);
    expect(upload).not.toHaveBeenCalled();
  });

  test('adds a delete action and removes selected material after backend confirmation', async () => {
    const photo = buildPhoto('cloud-photo-1');
    useAppStore.getState().registerPhotos([photo]);
    useAppStore.setState({ materialPhotoIds: [photo.id], diaries: [] });
    const remove = jest.spyOn(materialPhotoApi, 'deleteMaterialPhotosFromBackend').mockResolvedValue({ ok: true });
    jest.spyOn(Alert, 'alert').mockImplementation((_title, _message, buttons) => {
      buttons?.find(button => button.style === 'destructive')?.onPress?.();
    });
    const screen = await render(<LibraryScreen />);

    await act(async () => {
      fireEvent.press(screen.getByLabelText('删除素材'));
    });
    await act(async () => {
      fireEvent.press(screen.getByLabelText('选择删除相册照片cloud-photo-1'));
    });
    await act(async () => {
      fireEvent.press(screen.getByLabelText('删除所选（1）'));
    });

    await waitFor(() => expect(remove).toHaveBeenCalledWith(['cloud-photo-1']));
    expect(useAppStore.getState().materialPhotoIds).toEqual([]);
  });

  test('returns to home when no navigation history remains after leaving delete mode', async () => {
    const photo = buildPhoto('cloud-photo-back');
    useAppStore.getState().registerPhotos([photo]);
    useAppStore.setState({ materialPhotoIds: [photo.id], diaries: [] });
    const screen = await render(<LibraryScreen />);

    await act(async () => {
      fireEvent.press(screen.getByLabelText('删除素材'));
    });
    await act(async () => {
      fireEvent.press(screen.getByLabelText('选择删除相册照片cloud-photo-back'));
    });
    await act(async () => {
      fireEvent.press(screen.getByLabelText('取消删除'));
    });
    await act(async () => {
      fireEvent.press(screen.getByLabelText('返回'));
    });

    expect(mockRouter.back).not.toHaveBeenCalled();
    expect(mockRouter.replace).toHaveBeenCalledWith('/(tabs)/home');
  });

  test('keeps material when a different diary has the only matching photo copy', async () => {
    const photo = buildPhoto('cloud-photo-1');
    useAppStore.getState().registerPhotos([photo]);
    useAppStore.setState({
      materialPhotoIds: [photo.id],
      diaries: [
        { id: 'diary-1', photoIds: [photo.id] },
        { id: 'diary-2', photoIds: [photo.id] },
      ] as AppStore['diaries'],
    });
    jest.spyOn(materialPhotoApi, 'listSavedDiaryPhotoAssets').mockResolvedValue([
      { ...photo, diaryId: 'diary-1' },
    ]);
    const remove = jest.spyOn(materialPhotoApi, 'deleteMaterialPhotosFromBackend');
    jest.spyOn(Alert, 'alert').mockImplementation((_title, _message, buttons) => {
      buttons?.find(button => button.style === 'destructive')?.onPress?.();
    });
    const screen = await render(<LibraryScreen />);

    await act(async () => {
      fireEvent.press(screen.getByLabelText('删除素材'));
    });
    await act(async () => {
      fireEvent.press(screen.getByLabelText('选择删除相册照片cloud-photo-1'));
    });
    await act(async () => {
      fireEvent.press(screen.getByLabelText('删除所选（1）'));
    });

    await waitFor(() => expect(Alert.alert).toHaveBeenCalledWith(
      '暂时无法删除',
      '部分日记还没有可读取的独立照片副本，素材暂时保留。',
    ));
    expect(remove).not.toHaveBeenCalled();
    expect(useAppStore.getState().materialPhotoIds).toEqual([photo.id]);
  });
});
