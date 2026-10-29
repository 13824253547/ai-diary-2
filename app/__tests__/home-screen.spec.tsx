import React from 'react';
import { cleanup, fireEvent, render, waitFor } from '@testing-library/react-native';
import HomeScreen from '../(tabs)/home';
import { createTestStore } from '../../src/test-utils/create-test-store';
import { useAppStore } from '../../src/store/use-app-store';
import type { AppStore } from '../../src/store/use-app-store';
import type { DiaryItem, DiaryPhoto } from '../../src/types/diary';
import * as materialPhotoApi from '../../src/services/material-photo-api';
import { mockDiaries } from '../../src/mocks/diaries';

const mockRouter = { push: jest.fn() };

jest.mock('expo-router', () => ({ useRouter: () => mockRouter }));
jest.mock('expo-linear-gradient', () => ({
  LinearGradient: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));
jest.mock('@expo/vector-icons', () => ({
  Ionicons: ({ name }: { name: string }) => {
    const { Text } = require('react-native');
    return <Text>{name}</Text>;
  },
}));
jest.mock('../../src/components/layout/screen', () => ({
  Screen: ({ children, footer }: { children: React.ReactNode; footer?: React.ReactNode }) => {
    const { View } = require('react-native');
    return <View>{children}{footer}</View>;
  },
}));
jest.mock('../../src/components/common/design-ui', () => ({
  Section: ({ title, action, onPress }: { title: string; action?: string; onPress?: () => void }) => {
    const { Pressable, Text, View } = require('react-native');
    return <View><Text>{title}</Text>{action ? <Pressable onPress={onPress}><Text>{action}</Text></Pressable> : null}</View>;
  },
}));
jest.mock('../../src/components/diary/photo', () => ({
  Photo: ({ id, style }: { id: string; style?: object }) => {
    const { View } = require('react-native');
    return <View testID={`photo-${id}`} style={style} />;
  },
}));
jest.mock('../../src/components/navigation/bottom-tabs', () => ({
  BottomTabs: () => null,
}));

function resetAppStore() {
  const current = useAppStore.getState() as Record<string, unknown>;
  const fresh = createTestStore().store.getState() as Record<string, unknown>;
  const next = Object.fromEntries(
    Object.keys(current).map(key => [key, typeof current[key] === 'function' ? current[key] : fresh[key]]),
  );
  useAppStore.setState({
    ...next,
    photos: [],
    diaries: [],
    memoriesSourceItems: [],
    materialPhotoIds: [],
    hydratedMemories: true,
    memoriesStatus: 'ready',
    memoriesError: undefined,
  } as unknown as AppStore, true);
}

function buildMaterialPhoto(id: string): DiaryPhoto {
  return {
    id,
    title: `真实素材 ${id}`,
    location: '',
    emoji: '🖼',
    color: '#EFE3D5',
    date: '2026.10.27',
    filename: `${id}.jpg`,
    uri: `https://api.example.test/photos/materials/${id}/content`,
    remoteHeaders: { 'x-device-id': 'device-1' },
    source: 'device',
  };
}

function diary(id: string, title: string, status: DiaryItem['status']): DiaryItem {
  return {
    ...mockDiaries[0],
    id,
    title,
    status,
    date: id === 'latest' ? '2026.10.27' : '2026.10.01',
    coverPhotoId: 'diary-cover',
    photoIds: ['diary-cover'],
  };
}

describe('Home screen real content', () => {
  beforeEach(() => {
    resetAppStore();
    jest.clearAllMocks();
  });

  afterEach(() => {
    cleanup();
    jest.restoreAllMocks();
  });

  test('shows only synchronized material-library photos, not unrelated photo cache entries', async () => {
    const cachedDiaryPhoto = { ...buildMaterialPhoto('diary-cache'), source: 'mock' as const, image: 1 };
    const materialPhoto = buildMaterialPhoto('material-real');
    useAppStore.setState({ photos: [cachedDiaryPhoto], materialPhotoIds: [] });
    jest.spyOn(materialPhotoApi, 'listMaterialPhotosFromBackend').mockResolvedValue({
      ok: true,
      photos: [materialPhoto],
    });

    const screen = await render(<HomeScreen />);

    expect(screen.queryByText('notifications-outline')).toBeNull();
    await waitFor(() => expect(screen.getByTestId('photo-material-real')).toBeTruthy());
    expect(screen.queryByTestId('photo-diary-cache')).toBeNull();
    expect(screen.getByTestId('home-material-photo-row')).toBeTruthy();
  });

  test('shows the newest saved diary and excludes drafts or generating items', async () => {
    useAppStore.setState({
      memoriesSourceItems: [
        diary('draft', '尚未保存的草稿', 'draft'),
        diary('latest', '最近保存的真实日记', 'ready'),
        diary('older', '更早的日记', 'ready'),
      ],
      diaries: [
        diary('draft', '尚未保存的草稿', 'draft'),
        diary('latest', '最近保存的真实日记', 'ready'),
        diary('older', '更早的日记', 'ready'),
      ],
      hydratedMemories: true,
      memoriesStatus: 'ready',
    });
    jest.spyOn(materialPhotoApi, 'listMaterialPhotosFromBackend').mockResolvedValue({ ok: true, photos: [] });

    const screen = await render(<HomeScreen />);

    expect(screen.getByText('最近保存的真实日记')).toBeTruthy();
    expect(screen.queryByText('尚未保存的草稿')).toBeNull();
    expect(screen.queryByText('更早的日记')).toBeNull();
    fireEvent.press(screen.getByTestId('home-recent-diary'));
    expect(mockRouter.push).toHaveBeenCalledWith('/diary/latest');
  });

  test('distinguishes an empty material library from a failed load', async () => {
    jest.spyOn(materialPhotoApi, 'listMaterialPhotosFromBackend').mockResolvedValue({
      ok: false,
      message: 'network unavailable',
    });
    const screen = await render(<HomeScreen />);

    await waitFor(() => expect(screen.getByText('素材暂时无法加载，请前往素材库重试。')).toBeTruthy());
    expect(screen.queryByText('还没有照片素材，去素材库添加吧。')).toBeNull();
  });

  test('shows an actual empty state after the material library loads successfully with no photos', async () => {
    jest.spyOn(materialPhotoApi, 'listMaterialPhotosFromBackend').mockResolvedValue({ ok: true, photos: [] });
    const screen = await render(<HomeScreen />);

    await waitFor(() => expect(screen.getByText('还没有照片素材，去素材库添加吧。')).toBeTruthy());
    expect(screen.queryByTestId(/^photo-/)).toBeNull();
    expect(screen.getByLabelText('添加素材')).toBeTruthy();
  });

  test('allows retrying diary synchronization after a load failure', async () => {
    const retryMemories = jest.fn().mockResolvedValue(undefined);
    useAppStore.setState({
      hydratedMemories: false,
      memoriesStatus: 'error',
      hydrateMemories: retryMemories,
    });
    jest.spyOn(materialPhotoApi, 'listMaterialPhotosFromBackend').mockResolvedValue({ ok: true, photos: [] });
    const screen = await render(<HomeScreen />);

    fireEvent.press(screen.getByText('日记暂时无法加载，请稍后重试。'));
    expect(retryMemories).toHaveBeenCalledTimes(1);
  });
});
