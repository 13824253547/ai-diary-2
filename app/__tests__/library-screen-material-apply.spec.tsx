import React from 'react';
import { act, fireEvent, render, waitFor } from '@testing-library/react-native';
import LibraryScreen from '../library';
import { createTestStore } from '../../src/test-utils/create-test-store';
import { useAppStore } from '../../src/store/use-app-store';
import type { AppStore } from '../../src/store/use-app-store';
import type { DiaryPhoto } from '../../src/types/diary';
import * as photoLibrary from '../../src/services/photo-library';
import * as photoPermission from '../../src/services/photo-permission';

const mockRouter = {
  push: jest.fn(),
  back: jest.fn(),
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
  }: {
    visible: boolean;
    onClose: () => void;
    title?: string;
    children: React.ReactNode;
  }) => {
    const { Pressable, Text, View } = require('react-native');
    return visible ? (
      <View>
        <Text>{title}</Text>
        <Pressable accessibilityRole="button" accessibilityLabel="关闭底部面板" onPress={onClose}>
          <Text>关闭</Text>
        </Pressable>
        {children}
      </View>
    ) : null;
  },
}));

jest.mock('@expo/vector-icons', () => {
  const { Text } = require('react-native');
  return {
    Ionicons: ({ name }: { name: string }) => <Text>{name}</Text>,
  };
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

function buildDevicePhoto(): DiaryPhoto {
  return {
    id: 'device-photo-p4',
    title: '素材照片P4',
    location: '苏州',
    emoji: '📷',
    color: '#EFE3D5',
    date: '2026.10.15',
    uri: 'file:///device/device-photo-p4.jpg',
    localUri: 'file:///device/device-photo-p4.jpg',
    width: 100,
    height: 120,
    source: 'device',
  };
}

async function usePhotoForDiary(screen: Awaited<ReturnType<typeof render>>) {
  await act(async () => {
    fireEvent.press(screen.getByLabelText('预览素材照片P4'));
  });
  await waitFor(() => expect(screen.getByLabelText('用于日记')).toBeTruthy());

  await act(async () => {
    fireEvent.press(screen.getByLabelText('用于日记'));
  });
}

describe('Library screen apply material photo to diary', () => {
  beforeEach(() => {
    resetAppStore();
    jest.clearAllMocks();
    useAppStore.setState({ materialPhotoIds: [] });
    useAppStore.getState().registerPhotos([buildDevicePhoto()]);
    useAppStore.getState().addMaterialPhoto('device-photo-p4');
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  test('loads real device photos from the add-photo shortcut', async () => {
    const permission = jest.spyOn(photoPermission, 'getPhotoPermissionStatus').mockResolvedValue({
      status: 'full',
      granted: true,
      canAskAgain: true,
    });
    const listPhotos = jest.spyOn(photoLibrary, 'listDevicePhotos').mockResolvedValue({
      album: { id: '__all__', title: '全部照片', assetCount: 1 },
      photos: [buildDevicePhoto()],
      hasNextPage: false,
    });
    const screen = await render(<LibraryScreen />);

    await act(async () => {
      fireEvent.press(screen.getByLabelText('添加照片'));
    });

    await waitFor(() => expect(screen.getByLabelText('添加素材照片P4')).toBeTruthy());
    expect(permission).toHaveBeenCalledTimes(1);
    expect(listPhotos).toHaveBeenCalledWith({ first: 36 });
  });

  test('opens a new diary with this material photo preselected from the material library', async () => {
    const initialDiaries = useAppStore.getState().diaries;
    const screen = await render(<LibraryScreen />);

    await usePhotoForDiary(screen);

    expect(screen.queryByText('添加到哪篇日记？')).toBeNull();
    expect(mockRouter.push).toHaveBeenCalledWith({
      pathname: '/album/select',
      params: { draftId: expect.any(String), source: 'materials' },
    });
    const route = mockRouter.push.mock.calls.at(-1)?.[0] as {
      params: { draftId: string; source: string };
    };
    const draft = useAppStore.getState().drafts[route.params.draftId];
    expect(route.params.source).toBe('materials');
    expect(draft?.sourceDiaryId).toBeUndefined();
    expect(draft?.selectedPhotoIds).toEqual(['device-photo-p4']);
    expect(draft?.diary.photoIds).toEqual(['device-photo-p4']);
    expect(useAppStore.getState().currentStep).toBe('album');
    expect(useAppStore.getState().diaries).toEqual(initialDiaries);
  });

  test('starts a new draft without changing an existing diary edit draft', async () => {
    const target = useAppStore.getState().diaries[0];
    if (!target) throw new Error('missing diary fixture');
    const existingDraftId = useAppStore.getState().beginEdit(target.id);
    if (!existingDraftId) throw new Error('could not begin editing target');
    useAppStore.getState().updateDraft(existingDraftId, { title: '未保存标题' });
    const draftBeforeApplication = useAppStore.getState().drafts[existingDraftId];

    const screen = await render(<LibraryScreen />);
    await usePhotoForDiary(screen);

    const newDraftId = useAppStore.getState().activeDraftId;
    expect(newDraftId).toBeTruthy();
    expect(newDraftId).not.toBe(existingDraftId);
    expect(useAppStore.getState().drafts[existingDraftId]?.diary).toEqual(draftBeforeApplication?.diary);
    expect(useAppStore.getState().drafts[newDraftId!]?.selectedPhotoIds).toEqual(['device-photo-p4']);
    expect(mockRouter.push).toHaveBeenCalledWith({
      pathname: '/album/select',
      params: { draftId: newDraftId, source: 'materials' },
    });
  });

  test('discarding the new photo-based draft leaves saved diaries unchanged', async () => {
    const initialDiaries = useAppStore.getState().diaries;
    const screen = await render(<LibraryScreen />);
    await usePhotoForDiary(screen);

    const draftId = useAppStore.getState().activeDraftId;
    expect(draftId).toBeTruthy();
    expect(useAppStore.getState().drafts[draftId!]?.selectedPhotoIds).toContain('device-photo-p4');

    await act(async () => {
      useAppStore.getState().discardDraft(draftId!);
    });

    expect(useAppStore.getState().drafts[draftId!]).toBeUndefined();
    expect(useAppStore.getState().diaries).toEqual(initialDiaries);
  });

  test('starts a new diary even when saved diaries have no text blocks', async () => {
    const target = useAppStore.getState().diaries[0];
    if (!target) throw new Error('missing diary fixture');
    const diariesWithoutText = useAppStore.getState().diaries.map(diary =>
      diary.id === target.id
        ? { ...diary, blocks: diary.blocks.filter(block => block.type !== 'text') }
        : diary,
    );
    useAppStore.setState({ diaries: diariesWithoutText });

    const screen = await render(<LibraryScreen />);
    await usePhotoForDiary(screen);

    const draftId = useAppStore.getState().activeDraftId;
    expect(draftId).toBeTruthy();
    expect(useAppStore.getState().drafts[draftId!]?.selectedPhotoIds).toEqual(['device-photo-p4']);
    expect(mockRouter.push).toHaveBeenCalledWith({
      pathname: '/album/select',
      params: { draftId, source: 'materials' },
    });
  });

  test('does not create a draft when the material photo is no longer registered', async () => {
    const initialDrafts = useAppStore.getState().drafts;
    const initialDraftId = useAppStore.getState().activeDraftId;
    const screen = await render(<LibraryScreen />);

    await act(async () => {
      fireEvent.press(screen.getByLabelText('预览素材照片P4'));
    });
    await waitFor(() => expect(screen.getByLabelText('用于日记')).toBeTruthy());

    await act(async () => {
      useAppStore.setState(state => ({
        photos: state.photos.filter(photo => photo.id !== 'device-photo-p4'),
      }));
    });

    await act(async () => {
      fireEvent.press(screen.getByLabelText('用于日记'));
    });

    expect(useAppStore.getState().drafts).toEqual(initialDrafts);
    expect(useAppStore.getState().activeDraftId).toBe(initialDraftId);
    expect(mockRouter.push).not.toHaveBeenCalled();
  });

  test('reusing the action starts a fresh diary draft each time', async () => {
    const screen = await render(<LibraryScreen />);
    await usePhotoForDiary(screen);
    const firstDraftId = useAppStore.getState().activeDraftId;

    await usePhotoForDiary(screen);

    const secondDraftId = useAppStore.getState().activeDraftId;
    expect(secondDraftId).not.toBe(firstDraftId);
    expect(useAppStore.getState().drafts[firstDraftId!]?.selectedPhotoIds).toEqual(['device-photo-p4']);
    expect(useAppStore.getState().drafts[secondDraftId!]?.selectedPhotoIds).toEqual(['device-photo-p4']);
    expect(mockRouter.push).toHaveBeenCalledTimes(2);
  });
});
