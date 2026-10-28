import React from 'react';
import { fireEvent, render, waitFor } from '@testing-library/react-native';
import PostcardScreen from '../postcard';
import { capturePostcard, discardPostcard, savePostcard, sharePostcard } from '../../src/services/postcard-export';
import { createTestStore } from '../../src/test-utils/create-test-store';
import { cityStampCatalogCities, getVisitedCityStampIds } from '../../src/components/library/city-stamp-catalog';
import { art } from '../../src/theme/assets';
import { useAppStore } from '../../src/store/use-app-store';
import type { AppStore } from '../../src/store/use-app-store';
import type { DiaryPhoto } from '../../src/types/diary';

const mockRouter = {
  push: jest.fn(),
  back: jest.fn(),
};

let mockPhotoId: string | undefined;
let mockDecoration: string | undefined;
let mockStickerId: string | undefined;
let mockCityStampId: string | undefined;

jest.mock('expo-router', () => ({
  useRouter: () => mockRouter,
  useLocalSearchParams: () => ({
    photoId: mockPhotoId,
    decoration: mockDecoration,
    stickerId: mockStickerId,
    cityStampId: mockCityStampId,
  }),
}));

jest.mock('../../src/services/postcard-export', () => ({
  capturePostcard: jest.fn(),
  discardPostcard: jest.fn(),
  savePostcard: jest.fn(),
  sharePostcard: jest.fn(),
}));

jest.mock('../../src/components/layout/screen', () => ({
  Screen: ({ children, header }: { children: React.ReactNode; header?: React.ReactNode }) => {
    const { View: MockView } = require('react-native');
    return <MockView>{header}{children}</MockView>;
  },
}));

jest.mock('../../src/components/common/bottom-sheet', () => ({
  BottomSheet: () => null,
}));

jest.mock('@expo/vector-icons', () => {
  const { Text } = require('react-native');
  return {
    Ionicons: ({ name }: { name: string }) => <Text>{name}</Text>,
  };
});

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

function buildDevicePhoto(): DiaryPhoto {
  return {
    id: 'device-photo-p1',
    title: '河岸傍晚',
    location: '苏州',
    emoji: '📷',
    color: '#EFE3D5',
    date: '2026.10.15',
    uri: 'file:///device/device-p1.jpg',
    localUri: 'file:///device/device-p1.jpg',
    width: 100,
    height: 120,
    source: 'device',
  };
}

describe('Postcard screen material assets', () => {
  beforeEach(() => {
    resetAppStore();
    jest.clearAllMocks();
    mockPhotoId = 'device-photo-p1';
    mockDecoration = undefined;
    mockStickerId = undefined;
    mockCityStampId = undefined;
    useAppStore.getState().registerPhotos([buildDevicePhoto()]);
    jest.mocked(capturePostcard).mockResolvedValue('file:///cache/postcard.png');
    jest.mocked(sharePostcard).mockResolvedValue('opened');
    jest.mocked(savePostcard).mockResolvedValue('saved');
    jest.mocked(discardPostcard).mockResolvedValue();
  });

  test('renders a registered device photo as the postcard image', async () => {
    const screen = await render(<PostcardScreen />);

    await waitFor(() => {
      expect(screen.getByText('苏州\n2026.10.15')).toBeTruthy();
      expect(screen.getByTestId('postcard-photo').props.source).toEqual({
        uri: 'file:///device/device-p1.jpg',
      });
    });
    expect(screen.queryByTestId('postcard-decoration')).toBeNull();
  });

  test('renders the selected city decoration as an SVG stamp', async () => {
    mockDecoration = 'stampKyoto';
    const screen = await render(<PostcardScreen />);

    await waitFor(() => {
      expect(screen.getByTestId('postcard-decoration')).toBeTruthy();
      expect(screen.getByText('京都')).toBeTruthy();
    });
  });

  test('renders a city stamp from the bundled catalog ID', async () => {
    const city = cityStampCatalogCities[0];
    expect(city).toBeDefined();
    if (!city) return;
    mockDecoration = city.id;

    const screen = await render(<PostcardScreen />);

    await waitFor(() => {
      expect(screen.getByTestId('postcard-decoration')).toBeTruthy();
      expect(screen.getByText(city.cityName)).toBeTruthy();
      expect(screen.getByText(`${city.areaNameEn} · ${city.serial}`)).toBeTruthy();
    });
  });

  test('renders photo, sticker and unlocked city stamp together and opens the separate application page', async () => {
    const diary = useAppStore.getState().diaries[0];
    if (!diary) throw new Error('expected a saved diary fixture');
    const visitedDiary = { ...diary, status: 'ready' as const, location: '京都' };
    useAppStore.setState({ diaries: [visitedDiary] });
    const [cityStampId] = getVisitedCityStampIds([visitedDiary]);
    mockStickerId = 'stickerCool';
    mockCityStampId = cityStampId;
    const screen = await render(<PostcardScreen />);

    expect(screen.getByTestId('postcard-photo').props.source).toEqual({
      uri: 'file:///device/device-p1.jpg',
    });
    expect(screen.getByTestId('postcard-sticker').props.source).toBe(art.stickerCool);
    expect(screen.getByTestId('postcard-city-stamp')).toBeTruthy();
    expect(screen.getByText('京都')).toBeTruthy();

    fireEvent.press(screen.getByLabelText('编辑素材'));
    expect(mockRouter.push).toHaveBeenCalledWith({
      pathname: '/postcard/apply',
      params: {
        photoId: 'device-photo-p1',
        stickerId: 'stickerCool',
        cityStampId,
      },
    });

  });

  test('does not render a city stamp that is not unlocked for a new composition', async () => {
    mockCityStampId = 'stampKyoto';
    expect(useAppStore.getState().photos.some(photo => photo.id === mockPhotoId)).toBe(true);
    const screen = await render(<PostcardScreen />);

    expect(screen.getByTestId('postcard-photo')).toBeTruthy();
    expect(screen.queryByTestId('postcard-city-stamp')).toBeNull();
    expect(screen.queryByTestId('postcard-decoration')).toBeNull();
  });

  test('shows an empty state instead of decoration-only content without a selected device photo', async () => {
    mockPhotoId = undefined;
    mockDecoration = 'stampKyoto';

    const screen = await render(<PostcardScreen />);

    expect(screen.getByText('请选择真实照片')).toBeTruthy();
    expect(screen.getByLabelText('应用明信片素材')).toBeTruthy();
    expect(screen.queryByTestId('postcard-photo')).toBeNull();
    expect(screen.queryByTestId('postcard-decoration')).toBeNull();
  });

  test('shares only after the current photo loads and disposes the temporary card', async () => {
    const screen = await render(<PostcardScreen />);
    expect(screen.getByLabelText('分享明信片').props.accessibilityState.disabled).toBe(true);
    fireEvent(screen.getByTestId('postcard-photo'), 'load');
    await waitFor(() => expect(screen.getByLabelText('分享明信片').props.accessibilityState.disabled).toBe(false));
    fireEvent.press(screen.getByLabelText('分享明信片'));
    await waitFor(() => {
      expect(capturePostcard).toHaveBeenCalledTimes(1);
      expect(sharePostcard).toHaveBeenCalledWith('file:///cache/postcard.png');
      expect(discardPostcard).toHaveBeenCalledWith('file:///cache/postcard.png');
    });
    expect(screen.queryByText('分享成功')).toBeNull();
  });

  test('saves the rendered card and reports permission denial without a false success', async () => {
    jest.mocked(savePostcard).mockResolvedValue('permission_denied');
    const screen = await render(<PostcardScreen />);
    fireEvent(screen.getByTestId('postcard-photo'), 'load');
    await waitFor(() => expect(screen.getByLabelText('保存到相册').props.accessibilityState.disabled).toBe(false));
    fireEvent.press(screen.getByLabelText('保存到相册'));
    expect(await screen.findByText('请允许保存图片到系统相册后重试。')).toBeTruthy();
    expect(discardPostcard).toHaveBeenCalledWith('file:///cache/postcard.png');
  });

  test('reads authenticated generated images without inventing a location stamp', async () => {
    const generated = { ...buildDevicePhoto(), id: 'generated-p1', source: 'generated' as const,
      location: '', date: '未知日期', localUri: undefined, uri: 'https://example.com/photo',
      remoteHeaders: { Authorization: 'Bearer test' } };
    useAppStore.getState().registerPhotos([generated]);
    mockPhotoId = generated.id;
    const screen = await render(<PostcardScreen />);
    expect(screen.getByTestId('postcard-photo').props.source).toEqual({
      uri: generated.uri, headers: generated.remoteHeaders,
    });
    expect(screen.queryByText('undefined\n未知日期')).toBeNull();
    expect(screen.getByText('已使用当前选择的真实照片')).toBeTruthy();
  });

  test('does not share a stale capture after the selected photo changes', async () => {
    let finishCapture: (uri: string) => void = () => undefined;
    jest.mocked(capturePostcard).mockImplementation(() => new Promise(resolve => {
      finishCapture = resolve;
    }));
    const screen = await render(<PostcardScreen />);
    fireEvent(screen.getByTestId('postcard-photo'), 'load');
    await waitFor(() => expect(screen.getByLabelText('分享明信片').props.accessibilityState.disabled).toBe(false));
    fireEvent.press(screen.getByLabelText('分享明信片'));
    await waitFor(() => expect(capturePostcard).toHaveBeenCalledTimes(1));

    const next = { ...buildDevicePhoto(), id: 'device-photo-p2', uri: 'file:///device/device-p2.jpg',
      localUri: 'file:///device/device-p2.jpg' };
    useAppStore.getState().registerPhotos([next]);
    mockPhotoId = next.id;
    screen.rerender(<PostcardScreen />);
    await waitFor(() => expect(screen.getByTestId('postcard-photo').props.source).toEqual({
      uri: 'file:///device/device-p2.jpg',
    }));
    finishCapture('file:///cache/postcard.png');
    await waitFor(() => expect(discardPostcard).toHaveBeenCalledWith('file:///cache/postcard.png'));
    expect(sharePostcard).not.toHaveBeenCalled();
  });

  test('does not open system sharing after leaving the postcard page', async () => {
    let finishCapture: (uri: string) => void = () => undefined;
    jest.mocked(capturePostcard).mockImplementation(() => new Promise(resolve => {
      finishCapture = resolve;
    }));
    const screen = await render(<PostcardScreen />);
    fireEvent(screen.getByTestId('postcard-photo'), 'load');
    await waitFor(() => expect(screen.getByLabelText('分享明信片').props.accessibilityState.disabled).toBe(false));
    fireEvent.press(screen.getByLabelText('分享明信片'));
    await waitFor(() => expect(capturePostcard).toHaveBeenCalledTimes(1));
    await screen.unmount();
    finishCapture('file:///cache/postcard.png');
    await waitFor(() => expect(discardPostcard).toHaveBeenCalledWith('file:///cache/postcard.png'));
    expect(sharePostcard).not.toHaveBeenCalled();
  });
});
