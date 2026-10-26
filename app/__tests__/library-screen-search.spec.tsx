import React from 'react';
import { act, fireEvent, render, waitFor, within } from '@testing-library/react-native';
import LibraryScreen from '../library';
import { createTestStore } from '../../src/test-utils/create-test-store';
import { useAppStore } from '../../src/store/use-app-store';
import type { AppStore } from '../../src/store/use-app-store';
import type { DiaryPhoto } from '../../src/types/diary';

const mockRouter = {
  push: jest.fn(),
  back: jest.fn(),
  canGoBack: jest.fn(() => true),
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

function buildDevicePhoto(id: string, title: string, location: string): DiaryPhoto {
  return {
    id,
    title,
    location,
    emoji: '📷',
    color: '#EFE3D5',
    date: '2026.10.15',
    uri: `file:///device/${id}.jpg`,
    localUri: `file:///device/${id}.jpg`,
    width: 100,
    height: 120,
    source: 'device',
  };
}

describe('Library screen search', () => {
  beforeEach(() => {
    resetAppStore();
    jest.clearAllMocks();
    const photos = [
      buildDevicePhoto('device-p1', '素材照片一', '素材地点一'),
      buildDevicePhoto('device-p2', '素材照片二', '素材地点二'),
      buildDevicePhoto('device-p3', '素材照片三', '素材地点三'),
    ];
    useAppStore.setState({ materialPhotoIds: [], diaries: [] });
    useAppStore.getState().registerPhotos(photos);
    photos.forEach(photo => useAppStore.getState().addMaterialPhoto(photo.id));

    const savedDiary = createTestStore().store.getState().diaries[0];
    if (!savedDiary) throw new Error('missing saved diary fixture');
    useAppStore.setState({
      diaries: [
        {
          ...savedDiary,
          id: 'saved-diary-suzhou',
          title: '苏州周末',
          location: '苏州',
          summary: '河边散步',
          photoIds: ['device-p1', 'device-p3'],
          coverPhotoId: 'device-p1',
          blocks: [
            { id: 'body-suzhou', type: 'text', content: '傍晚沿着河岸慢慢走。' },
            { id: 'photo-suzhou', type: 'photo', photoId: 'device-p3', caption: '灯光倒映在水面' },
          ],
        },
        {
          ...savedDiary,
          id: 'saved-diary-hangzhou',
          title: '杭州山行',
          location: '杭州',
          summary: '清晨登山',
          photoIds: ['device-p2'],
          coverPhotoId: 'device-p2',
          blocks: [
            { id: 'body-hangzhou', type: 'text', content: '清晨走进山间。' },
          ],
        },
      ],
    });
  });

  test('matches diary metadata and body, then shows only photos referenced by matching diaries', async () => {
    const screen = await render(<LibraryScreen />);
    expect(screen.getByTestId('material-photo-device-p1').props.source).toEqual({
      uri: 'file:///device/device-p1.jpg',
    });

    fireEvent.press(screen.getByLabelText('搜索素材'));
    await waitFor(() => expect(screen.getByLabelText('搜索日记标题、地点或正文')).toBeTruthy());
    const searchInput = screen.getByLabelText('搜索日记标题、地点或正文');

    await act(async () => {
      fireEvent.changeText(searchInput, '傍晚');
    });
    expect(screen.getByLabelText('预览素材照片一')).toBeTruthy();
    expect(screen.getByLabelText('预览素材照片三')).toBeTruthy();
    expect(screen.queryByLabelText('预览素材照片二')).toBeNull();

    await act(async () => {
      fireEvent.changeText(searchInput, '苏州');
    });
    expect(screen.getByLabelText('预览素材照片一')).toBeTruthy();
    expect(screen.queryByLabelText('预览素材照片二')).toBeNull();
    expect(screen.getByLabelText('预览素材照片三')).toBeTruthy();

    await act(async () => {
      fireEvent.changeText(searchInput, '素材地点二');
    });
    expect(screen.getByText('没有找到匹配日记的照片')).toBeTruthy();
    expect(screen.queryByLabelText('预览素材照片二')).toBeNull();

    await act(async () => {
      fireEvent.press(screen.getByLabelText('清除搜索'));
    });
    expect(screen.getByLabelText('搜索日记标题、地点或正文').props.value).toBe('');
    expect(screen.getByLabelText('预览素材照片一')).toBeTruthy();
    expect(screen.getByLabelText('预览素材照片二')).toBeTruthy();
    expect(screen.getByLabelText('预览素材照片三')).toBeTruthy();
  });

  test('previews a registered URI, closes back to the list, and marks only saved references as used', async () => {
    const savedDiary = createTestStore().store.getState().diaries[0];
    if (!savedDiary) throw new Error('missing saved diary fixture');
    useAppStore.setState({
      diaries: [{
        ...savedDiary,
        id: 'saved-diary-material-001',
        photoIds: ['device-p1', 'device-p2', 'device-p3'],
        blocks: [{ id: 'body', type: 'text', content: '今天很开心。' }],
      }],
    });

    const photo = buildDevicePhoto('device-p4', '素材照片四', '素材地点四');
    useAppStore.getState().registerPhotos([photo]);
    useAppStore.getState().addMaterialPhoto(photo.id);

    const screen = await render(<LibraryScreen />);
    expect(within(screen.getByLabelText('预览素材照片一')).queryByText('未生成日记')).toBeNull();
    expect(within(screen.getByLabelText('预览素材照片四')).getByText('未生成日记')).toBeTruthy();

    await act(async () => {
      fireEvent.press(screen.getByLabelText('预览素材照片四'));
    });

    await waitFor(() => {
      expect(screen.getByText('素材照片四')).toBeTruthy();
      expect(screen.getByTestId('material-photo-preview').props.source).toEqual({
        uri: 'file:///device/device-p4.jpg',
      });
    });

    await act(async () => {
      fireEvent.press(screen.getByLabelText('关闭底部面板'));
    });

    expect(screen.queryByText('素材照片四')).toBeNull();
    expect(screen.getByLabelText('预览素材照片四')).toBeTruthy();
    expect(within(screen.getByLabelText('预览素材照片四')).getByText('未生成日记')).toBeTruthy();

    await act(async () => {
      useAppStore.setState({
        diaries: [{
          ...savedDiary,
          id: 'saved-diary-material-001',
          photoIds: ['device-p1', 'device-p2', 'device-p3', 'device-p4'],
        }],
      });
    });
    expect(within(screen.getByLabelText('预览素材照片四')).queryByText('未生成日记')).toBeNull();
  });

  test('limits the main view to nine photos and opens the wall with the current diary search', async () => {
    const baseDiary = createTestStore().store.getState().diaries[0];
    if (!baseDiary) throw new Error('missing saved diary fixture');
    const photos = Array.from({ length: 12 }, (_, index) =>
      buildDevicePhoto(`wall-photo-${index + 1}`, `素材照片${index + 1}`, `素材地点${index + 1}`));
    useAppStore.getState().registerPhotos(photos);
    useAppStore.setState({ materialPhotoIds: photos.map(photo => photo.id) });
    useAppStore.setState({
      diaries: [{
        ...baseDiary,
        id: 'saved-diary-wall',
        title: '海边日记',
        location: '海边',
        photoIds: photos.map(photo => photo.id),
        coverPhotoId: photos[0]!.id,
        blocks: [{ id: 'wall-body', type: 'text', content: '海风很轻。' }],
      }],
    });

    const screen = await render(<LibraryScreen />);
    expect(screen.getByLabelText('预览素材照片1')).toBeTruthy();
    expect(screen.getByLabelText('预览素材照片9')).toBeTruthy();
    expect(screen.queryByLabelText('预览素材照片10')).toBeNull();
    await act(async () => {
      fireEvent.press(screen.getByLabelText('搜索素材'));
    });
    const searchInput = await screen.findByLabelText('搜索日记标题、地点或正文');
    await act(async () => {
      fireEvent.changeText(searchInput, '海边');
    });
    fireEvent.press(screen.getByLabelText('展开照片墙'));

    expect(mockRouter.push).toHaveBeenCalledWith({
      pathname: '/library/wall',
      params: { search: '海边' },
    });
  });
});
