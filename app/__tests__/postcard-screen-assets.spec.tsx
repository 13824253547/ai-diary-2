import React from 'react';
import { act, fireEvent, render, waitFor } from '@testing-library/react-native';
import PostcardScreen from '../postcard';
import { art } from '../../src/theme/assets';
import { createTestStore } from '../../src/test-utils/create-test-store';
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

  test('reads a registered non-mock photo and returns to postcard choices when switched', async () => {
    const screen = await render(<PostcardScreen />);

    await waitFor(() => {
      expect(screen.getByText('苏州\n2026.10.15')).toBeTruthy();
      expect(screen.getByTestId('postcard-photo').props.source).toEqual({
        uri: 'file:///device/device-p1.jpg',
      });
    });

    await act(async () => {
      fireEvent.press(screen.getByLabelText('选择圣托里尼明信片'));
    });

    await waitFor(() => expect(screen.getByText(/SANTORINI/)).toBeTruthy());
    expect(screen.getByTestId('postcard-photo').props.source).not.toEqual({
      uri: 'file:///device/device-p1.jpg',
    });
  });

  test('renders the routed stable decoration ID on the postcard preview', async () => {
    mockPhotoId = undefined;
    mockDecoration = 'stampKyoto';

    const screen = await render(<PostcardScreen />);

    expect(screen.getByTestId('postcard-decoration').props.source).toBe(art.stampKyoto);
  });
});
