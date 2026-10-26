import React from 'react';
import { render, waitFor } from '@testing-library/react-native';
import PostcardScreen from '../postcard';
import { createTestStore } from '../../src/test-utils/create-test-store';
import { cityStampCatalogCities } from '../../src/components/library/city-stamp-catalog';
import { useAppStore } from '../../src/store/use-app-store';
import type { AppStore } from '../../src/store/use-app-store';
import type { DiaryPhoto } from '../../src/types/diary';

const mockRouter = {
  push: jest.fn(),
  back: jest.fn(),
};

let mockPhotoId: string | undefined;
let mockDecoration: string | undefined;

jest.mock('expo-router', () => ({
  useRouter: () => mockRouter,
  useLocalSearchParams: () => ({ photoId: mockPhotoId, decoration: mockDecoration }),
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
    useAppStore.getState().registerPhotos([buildDevicePhoto()]);
  });

  test('renders a registered device photo as the postcard image', async () => {
    const screen = await render(<PostcardScreen />);

    await waitFor(() => {
      expect(screen.getByText('苏州\n2026.10.15')).toBeTruthy();
      expect(screen.getByTestId('postcard-photo').props.source).toEqual({
        uri: 'file:///device/device-p1.jpg',
      });
    });
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

  test('shows an empty state instead of decoration-only content without a selected device photo', async () => {
    mockPhotoId = undefined;
    mockDecoration = 'stampKyoto';

    const screen = await render(<PostcardScreen />);

    expect(screen.getByText('请选择真实照片')).toBeTruthy();
    expect(screen.getByLabelText('前往素材库')).toBeTruthy();
    expect(screen.queryByTestId('postcard-photo')).toBeNull();
    expect(screen.queryByTestId('postcard-decoration')).toBeNull();
  });
});
