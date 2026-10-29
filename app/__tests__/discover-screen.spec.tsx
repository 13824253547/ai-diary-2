import React from 'react';
import { cleanup, fireEvent, render, waitFor } from '@testing-library/react-native';
import DiscoverScreen from '../(tabs)/discover';
import { DeviceCityError, getCurrentDeviceCity } from '../../src/services/device-city';

const mockRouter = { push: jest.fn() };
const mockListStories = jest.fn();
const mockSetLike = jest.fn();

jest.mock('expo-router', () => ({
  useRouter: () => mockRouter,
}));

jest.mock('../../src/store/adapters/backend-discovery-adapter', () => ({
  createBackendDiscoveryRepository: () => ({ listStories: mockListStories, setLike: mockSetLike }),
}));

jest.mock('../../src/services/device-identity', () => ({
  getDeviceIdentityHeaders: jest.fn(async () => ({
    'x-device-id': 'device-discovery-test',
    Authorization: 'Bearer discovery-test-token',
  })),
}));

jest.mock('../../src/services/device-city', () => {
  const actual = jest.requireActual('../../src/services/device-city');
  return {
    ...actual,
    getCurrentDeviceCity: jest.fn(),
  };
});

jest.mock('../../src/components/layout/screen', () => ({
  Screen: ({ children, footer }: { children: React.ReactNode; footer?: React.ReactNode }) => {
    const { View } = require('react-native');
    return <View>{children}{footer}</View>;
  },
}));

jest.mock('../../src/components/navigation/bottom-tabs', () => ({
  BottomTabs: () => null,
}));

jest.mock('../../src/components/common/support-ui', () => {
  const { Pressable, Text, TextInput, View } = require('react-native');
  return {
    EmptyResult: ({ title, children }: { title: string; children?: React.ReactNode }) => (
      <View><Text>{title}</Text>{children}</View>
    ),
    IconAction: ({ label, onPress }: { label: string; onPress: () => void }) => (
      <Pressable accessibilityRole="button" accessibilityLabel={label} onPress={onPress}><Text>{label}</Text></Pressable>
    ),
    SearchField: ({ value, onChangeText, placeholder }: { value: string; onChangeText: (value: string) => void; placeholder: string }) => (
      <TextInput accessibilityLabel={placeholder} value={value} onChangeText={onChangeText} />
    ),
    supportStyles: { row: {}, title: {}, body: {}, muted: {} },
  };
});

jest.mock('../../src/components/common/button', () => ({
  Button: ({ label, onPress }: { label: string; onPress: () => void }) => {
    const { Pressable, Text } = require('react-native');
    return <Pressable accessibilityRole="button" onPress={onPress}><Text>{label}</Text></Pressable>;
  },
}));

describe('Discover screen categories', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockListStories.mockResolvedValue({ items: [], page: 1, pageSize: 20, total: 0 });
    jest.mocked(getCurrentDeviceCity).mockResolvedValue('台南市');
  });

  afterEach(cleanup);

  test('shows latest and same-city tabs and hides recommendations', async () => {
    const screen = await render(<DiscoverScreen />);

    await waitFor(() => {
      expect(mockListStories).toHaveBeenCalledWith({
        category: 'latest',
        keyword: undefined,
        page: 1,
        pageSize: 20,
      });
    });
    expect(screen.getByRole('tab', { name: '最新' }).props.accessibilityState.selected).toBe(true);
    expect(screen.getByRole('tab', { name: '同城' }).props.accessibilityState.selected).toBe(false);
    expect(screen.queryByText('推荐')).toBeNull();
  });

  test('requests foreground city only when opening same-city and uses it for the query', async () => {
    const screen = await render(<DiscoverScreen />);
    await waitFor(() => expect(mockListStories).toHaveBeenCalledTimes(1));

    fireEvent.press(screen.getByRole('tab', { name: '同城' }));

    await waitFor(() => {
      expect(getCurrentDeviceCity).toHaveBeenCalledTimes(1);
      expect(mockListStories).toHaveBeenLastCalledWith({
        category: 'same-city',
        city: '台南市',
        keyword: undefined,
        page: 1,
        pageSize: 20,
      });
    });
  });

  test('shows a location-specific empty state when city permission is denied', async () => {
    jest.mocked(getCurrentDeviceCity).mockRejectedValueOnce(
      new DeviceCityError('permission_denied', '需要定位权限才能筛选同城内容。'),
    );
    const screen = await render(<DiscoverScreen />);
    await waitFor(() => expect(mockListStories).toHaveBeenCalledTimes(1));

    fireEvent.press(screen.getByRole('tab', { name: '同城' }));

    await waitFor(() => {
      expect(screen.getByText('允许定位后才能筛选同城故事')).toBeTruthy();
    });
    expect(mockListStories).toHaveBeenCalledTimes(1);
  });

  test('loads discovery card images with current device credentials', async () => {
    mockListStories.mockResolvedValue({
      items: [{
        id: 'story-image-1',
        characterId: 'character-blue',
        title: '公开故事图片测试',
        author: '日记作者',
        coverUri: '/photos/discovery/story-image-1/photo-content?photoId=photo-1',
        date: '2026-10-29T00:00:00.000Z',
        location: '',
        body: '公开故事正文',
        likesEnabled: false,
        likeCount: 0,
        liked: false,
        blocks: [],
      }],
      page: 1,
      pageSize: 20,
      total: 1,
    });

    const screen = await render(<DiscoverScreen />);
    await waitFor(() => {
      expect(screen.getByLabelText('公开故事图片测试封面').props.source).toMatchObject({
        uri: expect.stringContaining('/photos/discovery/story-image-1/photo-content?photoId=photo-1'),
        headers: expect.objectContaining({
          'x-device-id': 'device-discovery-test',
          Authorization: 'Bearer discovery-test-token',
        }),
      });
    });
  });
});
