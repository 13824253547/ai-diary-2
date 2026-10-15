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
    useAppStore.setState({
      materialPhotoIds: [],
      diaries: [],
    });
    const photos = [
      buildDevicePhoto('device-p1', '河岸傍晚', '苏州'),
      buildDevicePhoto('device-p2', '山中晨光', '杭州'),
      buildDevicePhoto('device-p3', '雨后街角', '苏州'),
    ];
    useAppStore.getState().registerPhotos(photos);
    photos.forEach(photo => useAppStore.getState().addMaterialPhoto(photo.id));
  });

  test('searches titles and locations, shows no-match state, and restores materials when cleared', async () => {
    const screen = await render(<LibraryScreen />);
    expect(screen.getByTestId('material-photo-device-p1').props.source).toEqual({
      uri: 'file:///device/device-p1.jpg',
    });

    fireEvent.press(screen.getByLabelText('搜索素材'));
    await waitFor(() => expect(screen.getByLabelText('搜索照片与地点')).toBeTruthy());
    const searchInput = screen.getByLabelText('搜索照片与地点');

    await act(async () => {
      fireEvent.changeText(searchInput, '傍晚');
    });
    expect(screen.getByLabelText('预览河岸傍晚')).toBeTruthy();
    expect(screen.queryByLabelText('预览山中晨光')).toBeNull();
    expect(screen.queryByLabelText('预览雨后街角')).toBeNull();

    await act(async () => {
      fireEvent.changeText(searchInput, '苏州');
    });
    expect(screen.getByLabelText('预览河岸傍晚')).toBeTruthy();
    expect(screen.queryByLabelText('预览山中晨光')).toBeNull();
    expect(screen.getByLabelText('预览雨后街角')).toBeTruthy();

    await act(async () => {
      fireEvent.changeText(searchInput, '没有匹配的素材');
    });
    expect(screen.getByText('没有找到这张照片')).toBeTruthy();
    expect(screen.queryByLabelText('预览河岸傍晚')).toBeNull();

    await act(async () => {
      fireEvent.press(screen.getByLabelText('清除搜索'));
    });
    expect(screen.getByLabelText('搜索照片与地点').props.value).toBe('');
    expect(screen.getByLabelText('预览河岸傍晚')).toBeTruthy();
    expect(screen.getByLabelText('预览山中晨光')).toBeTruthy();
    expect(screen.getByLabelText('预览雨后街角')).toBeTruthy();
  });

  test('previews a registered URI, closes back to the list, and marks only saved references as used', async () => {
    const savedDiary = createTestStore().store.getState().diaries[0];
    if (!savedDiary) throw new Error('missing saved diary fixture');
    useAppStore.setState({
      diaries: [{
        ...savedDiary,
        id: 'saved-diary-material-001',
        photoIds: ['device-p1', 'device-p2', 'device-p3'],
      }],
    });

    const photo = buildDevicePhoto('device-p4', '江边夜色', '苏州');
    useAppStore.getState().registerPhotos([photo]);
    useAppStore.getState().addMaterialPhoto(photo.id);

    const screen = await render(<LibraryScreen />);
    expect(within(screen.getByLabelText('预览河岸傍晚')).queryByText('未生成日记')).toBeNull();
    expect(within(screen.getByLabelText('预览江边夜色')).getByText('未生成日记')).toBeTruthy();

    await act(async () => {
      fireEvent.press(screen.getByLabelText('预览江边夜色'));
    });

    await waitFor(() => {
      expect(screen.getByText('江边夜色')).toBeTruthy();
      expect(screen.getByTestId('material-photo-preview').props.source).toEqual({
        uri: 'file:///device/device-p4.jpg',
      });
    });

    await act(async () => {
      fireEvent.press(screen.getByLabelText('关闭底部面板'));
    });

    expect(screen.queryByText('江边夜色')).toBeNull();
    expect(screen.getByLabelText('预览江边夜色')).toBeTruthy();
    expect(within(screen.getByLabelText('预览江边夜色')).getByText('未生成日记')).toBeTruthy();

    await act(async () => {
      useAppStore.setState({
        diaries: [{
          ...savedDiary,
          id: 'saved-diary-material-001',
          photoIds: ['device-p1', 'device-p2', 'device-p3', 'device-p4'],
        }],
      });
    });
    expect(within(screen.getByLabelText('预览江边夜色')).queryByText('未生成日记')).toBeNull();
  });
});
