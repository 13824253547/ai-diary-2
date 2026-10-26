import React from 'react';
import { act, fireEvent, render } from '@testing-library/react-native';
import CityStampCatalogScreen from '../library/cities';

const mockRouter = {
  push: jest.fn(),
  back: jest.fn(),
  replace: jest.fn(),
  canGoBack: jest.fn(() => true),
};

jest.mock('expo-router', () => ({
  useRouter: () => mockRouter,
}));

jest.mock('../../src/components/layout/screen', () => {
  const { View } = require('react-native');
  return {
    Screen: ({ children, header }: { children: React.ReactNode; header?: React.ReactNode }) => (
      <View>{header}{children}</View>
    ),
  };
});

jest.mock('../../src/components/common/bottom-sheet', () => {
  const { Text, View } = require('react-native');
  return {
    BottomSheet: ({
      visible,
      title,
      children,
    }: {
      visible: boolean;
      title?: string;
      children: React.ReactNode;
    }) => visible ? <View><Text>{title}</Text>{children}</View> : null,
  };
});

jest.mock('../../src/components/common/support-ui', () => {
  const { Text, View } = require('react-native');
  return {
    EmptyResult: () => <View />,
    SearchField: () => <View />,
    supportStyles: {
      body: {},
      muted: {},
    },
  };
});

jest.mock('../../src/components/library/city-stamp-catalog', () => ({
  cityStampCatalogAreas: [],
  cityStampCatalogSources: [
    {
      name: 'OpenStreetMap city names',
      url: 'https://www.openstreetmap.org/copyright',
      license: 'ODbL-1.0',
      citation: '© OpenStreetMap contributors.',
    },
    {
      name: 'GeoNames alternate names',
      url: 'https://www.geonames.org/export/',
      license: 'CC BY 4.0',
      citation: 'GeoNames.org.',
    },
  ],
  getCityStampCitiesForArea: () => [],
  getCityStampConfig: () => undefined,
  getVisitedCityStampIds: () => new Set(),
  isCityStampUnlocked: () => false,
}));

jest.mock('../../src/store/use-app-store', () => ({
  useAppStore: (selector: (state: { diaries: never[] }) => unknown) => selector({ diaries: [] }),
}));

jest.mock('@expo/vector-icons', () => {
  const { Text } = require('react-native');
  return { Ionicons: ({ name }: { name: string }) => <Text>{name}</Text> };
});

describe('city catalog source attribution', () => {
  beforeEach(() => jest.clearAllMocks());

  test('shows OpenStreetMap attribution and lists source licenses and citations', async () => {
    const screen = await render(<CityStampCatalogScreen />);

    expect(screen.getByText('© OpenStreetMap contributors · ODbL-1.0')).toBeTruthy();
    await act(async () => {
      fireEvent.press(screen.getByLabelText('查看城市目录数据来源与许可'));
    });

    expect(screen.getAllByText('数据来源与许可')).toHaveLength(2);
    expect(screen.getByText('OpenStreetMap city names')).toBeTruthy();
    expect(screen.getByText('许可：ODbL-1.0')).toBeTruthy();
    expect(screen.getByText('GeoNames alternate names')).toBeTruthy();
    expect(screen.getByText('许可：CC BY 4.0')).toBeTruthy();
    expect(screen.getByLabelText('打开GeoNames alternate names来源链接')).toBeTruthy();
  });
});
