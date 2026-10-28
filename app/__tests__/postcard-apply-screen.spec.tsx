import React from 'react';
import { act, fireEvent, render, waitFor } from '@testing-library/react-native';
import PostcardApplyScreen from '../postcard/apply';
import { createTestStore } from '../../src/test-utils/create-test-store';
import { getCityStampConfig, getVisitedCityStampIds } from '../../src/components/library/city-stamp-catalog';
import { useAppStore } from '../../src/store/use-app-store';
import type { AppStore } from '../../src/store/use-app-store';
import type { DiaryPhoto } from '../../src/types/diary';

const mockRouter = { push: jest.fn(), back: jest.fn() };
let mockParams: { photoId?: string; stickerId?: string; cityStampId?: string } = {};

jest.mock('expo-router', () => ({
  useRouter: () => mockRouter,
  useLocalSearchParams: () => mockParams,
}));

jest.mock('../../src/components/layout/screen', () => ({
  Screen: ({ children, header, footer }: {
    children: React.ReactNode;
    header?: React.ReactNode;
    footer?: React.ReactNode;
  }) => {
    const { View } = require('react-native');
    return <View>{header}{children}{footer}</View>;
  },
}));

jest.mock('../../src/components/common/button', () => ({
  Button: ({ label, onPress, disabled = false }: { label: string; onPress?: () => void; disabled?: boolean }) => {
    const { Pressable, Text } = require('react-native');
    return <Pressable accessibilityRole="button" accessibilityLabel={label} accessibilityState={{ disabled }} disabled={disabled} onPress={onPress}><Text>{label}</Text></Pressable>;
  },
}));

jest.mock('@expo/vector-icons', () => ({
  Ionicons: ({ name }: { name: string }) => {
    const { Text } = require('react-native');
    return <Text>{name}</Text>;
  },
}));

jest.mock('react-native-svg', () => {
  const React = require('react');
  const { Text, View } = require('react-native');
  return {
    __esModule: true,
    default: ({ children, ...props }: { children: React.ReactNode }) => React.createElement(View, props, children),
    Circle: () => null,
    Defs: () => null,
    Path: () => null,
    TextPath: ({ children }: { children: React.ReactNode }) => children,
    Text: ({ children }: { children: React.ReactNode }) => React.createElement(Text, null, children),
  };
});

function resetAppStore() {
  const current = useAppStore.getState() as Record<string, unknown>;
  const fresh = createTestStore().store.getState() as Record<string, unknown>;
  const next = Object.fromEntries(
    Object.keys(current).map(key => [key, typeof current[key] === 'function' ? current[key] : fresh[key]]),
  );
  useAppStore.setState(next as AppStore, true);
}

function buildMaterialPhoto(id: string, source: 'device' | 'generated' = 'device'): DiaryPhoto {
  return {
    id,
    title: id,
    location: '京都',
    emoji: '📷',
    color: '#EFE3D5',
    date: '2026.10.15',
    localUri: `file:///${id}.jpg`,
    uri: `file:///${id}.jpg`,
    width: 100,
    height: 120,
    source,
  };
}

describe('Postcard material application page', () => {
  beforeEach(() => {
    resetAppStore();
    jest.clearAllMocks();
    mockParams = {};
    useAppStore.getState().registerPhotos([buildMaterialPhoto('photo-1'), buildMaterialPhoto('photo-2', 'generated')]);
    useAppStore.setState({ materialPhotoIds: ['photo-1', 'photo-2'] });
  });

  test('composes one photo with a replaceable sticker and unlocked city stamp on its own page', async () => {
    const diary = useAppStore.getState().diaries[0];
    if (!diary) throw new Error('expected a saved diary fixture');
    const visitedDiary = { ...diary, status: 'ready' as const, location: '京都' };
    useAppStore.setState({ diaries: [visitedDiary] });
    const [cityStampId] = [...getVisitedCityStampIds([visitedDiary])];
    const city = getCityStampConfig(cityStampId);
    if (!city) throw new Error('expected the Kyoto stamp fixture');
    mockParams = { photoId: 'photo-1' };
    const screen = await render(<PostcardApplyScreen />);

    expect(screen.getByText(/照片：photo-1/)).toBeTruthy();
    await act(async () => {
      fireEvent.press(screen.getByLabelText('选择贴纸：开心的小橘'));
      fireEvent.press(screen.getByLabelText(`选择城市印章：${city.cityName}`));
    });
    expect(screen.getByText(/贴纸：开心的小橘/)).toBeTruthy();
    expect(screen.getByText(new RegExp(`印章：${city.cityName}`))).toBeTruthy();

    await act(async () => {
      fireEvent.press(screen.getByLabelText('选择贴纸：喜欢你'));
    });
    expect(screen.getByText(/贴纸：喜欢你/)).toBeTruthy();
    expect(screen.queryByText(/贴纸：开心的小橘/)).toBeNull();

    await act(async () => {
      fireEvent.press(screen.getByLabelText('预览明信片'));
    });
    expect(mockRouter.push).toHaveBeenCalledWith({
      pathname: '/postcard',
      params: { photoId: 'photo-1', stickerId: 'stickerLove', cityStampId },
    });
  });

  test('requires a photo while allowing optional decorations to be removed', async () => {
    const screen = await render(<PostcardApplyScreen />);

    await act(async () => {
      fireEvent.press(screen.getByLabelText('选择贴纸：酷酷的小橘'));
    });
    expect(screen.getByText('先选择一张照片，再预览明信片。')).toBeTruthy();
    expect(screen.getByLabelText('预览明信片').props.accessibilityState.disabled).toBe(true);
    await act(async () => {
      fireEvent.press(screen.getByLabelText('预览明信片'));
    });
    expect(mockRouter.push).not.toHaveBeenCalled();

    await act(async () => {
      fireEvent.press(screen.getByLabelText('选择明信片照片：photo-1'));
      fireEvent.press(screen.getByLabelText('选择贴纸：酷酷的小橘'));
    });
    await waitFor(() => expect(screen.getByText(/照片：photo-1/)).toBeTruthy());
    expect(screen.getByText(/贴纸：未选择/)).toBeTruthy();
  });

  test('shows no invented city stamps when the device has no unlocked cities', async () => {
    useAppStore.setState({ diaries: [] });
    const screen = await render(<PostcardApplyScreen />);

    expect(screen.getByText('暂无已解锁的城市印章。')).toBeTruthy();
    expect(screen.queryByLabelText(/选择城市印章：/)).toBeNull();
  });
});
