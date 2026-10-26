import React from 'react';
import { act, fireEvent, render, waitFor } from '@testing-library/react-native';
import CityStampCatalogScreen from '../library/cities';
import { cityStampCatalogAreas, getCityStampCitiesForArea } from '../../src/components/library/city-stamp-catalog';
import { createTestStore } from '../../src/test-utils/create-test-store';
import { useAppStore } from '../../src/store/use-app-store';
import type { AppStore } from '../../src/store/use-app-store';
import type { DiaryItem } from '../../src/types/diary';

const mockRouter = {
  push: jest.fn(),
  back: jest.fn(),
  replace: jest.fn(),
  canGoBack: jest.fn(() => true),
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
    children,
    title,
  }: {
    visible: boolean;
    children: React.ReactNode;
    title?: string;
  }) => {
    const { Text, View } = require('react-native');
    return visible ? <View><Text>{title}</Text>{children}</View> : null;
  },
}));

jest.mock('@expo/vector-icons', () => {
  const { Text } = require('react-native');
  return { Ionicons: ({ name }: { name: string }) => <Text>{name}</Text> };
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

function resetAppStore(diaries: DiaryItem[] = []) {
  const current = useAppStore.getState() as Record<string, unknown>;
  const fresh = createTestStore({ diaries }).store.getState() as Record<string, unknown>;
  const next = Object.fromEntries(
    Object.keys(current).map(key => [key, typeof current[key] === 'function' ? current[key] : fresh[key]]),
  );
  useAppStore.setState(next as AppStore, true);
}

describe('city stamp country and region catalog', () => {
  const area = cityStampCatalogAreas.find(item => item.id === 'CN-TW');
  const taipei = area
    ? getCityStampCitiesForArea(area.id).find(city => city.latinName === 'Taipei')
    : undefined;

  beforeEach(() => {
    resetAppStore();
    jest.clearAllMocks();
  });

  test('allows browsing and previewing locked cities without applying them', async () => {
    expect(area).toBeDefined();
    expect(taipei).toBeDefined();
    if (!area || !taipei) return;

    const screen = await render(<CityStampCatalogScreen />);
    fireEvent.changeText(screen.getByLabelText('搜索国家或地区'), area.nameZh);
    fireEvent.press(screen.getByLabelText(`浏览${area.nameZh}城市，${area.cityCount}个`));
    fireEvent.changeText(screen.getByLabelText('搜索中文名或英文名'), 'Taipei');
    fireEvent.press(screen.getByLabelText(`预览${taipei.cityName}印章`));

    await waitFor(() => expect(screen.getByTestId('catalog-city-stamp-preview')).toBeTruthy());
    expect(screen.getByLabelText('用于明信片').props.accessibilityState.disabled).toBe(true);
    expect(screen.getByText(/尚未解锁/u)).toBeTruthy();
    fireEvent.press(screen.getByLabelText('用于明信片'));
    expect(mockRouter.push).not.toHaveBeenCalled();
  });

  test('unlocks an exact saved city match and routes the catalog ID to postcards', async () => {
    expect(area).toBeDefined();
    expect(taipei).toBeDefined();
    if (!area || !taipei) return;

    resetAppStore([{
      id: 'saved-taipei',
      status: 'ready',
      location: `${taipei.latinName} · ${area.sourceNameEn}`,
      createdInSession: true,
    } as DiaryItem]);
    const screen = await render(<CityStampCatalogScreen />);
    fireEvent.changeText(screen.getByLabelText('搜索国家或地区'), area.nameZh);
    fireEvent.press(screen.getByLabelText(`浏览${area.nameZh}城市，${area.cityCount}个`));
    fireEvent.changeText(screen.getByLabelText('搜索中文名或英文名'), 'Taipei');
    fireEvent.press(screen.getByLabelText(`预览${taipei.cityName}印章`));

    await waitFor(() => expect(screen.getByText('已解锁，可用于明信片。')).toBeTruthy());
    expect(screen.getByLabelText('用于明信片').props.accessibilityState.disabled).toBe(false);
    await act(async () => {
      fireEvent.press(screen.getByLabelText('用于明信片'));
    });

    expect(mockRouter.push).toHaveBeenCalledWith({
      pathname: '/postcard',
      params: { decoration: taipei.id },
    });
  });
});
