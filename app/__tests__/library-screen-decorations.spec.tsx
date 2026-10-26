import React from 'react';
import { act, fireEvent, render, waitFor } from '@testing-library/react-native';
import LibraryScreen from '../library';
import { art } from '../../src/theme/assets';
import { createTestStore } from '../../src/test-utils/create-test-store';
import { useAppStore } from '../../src/store/use-app-store';
import type { AppStore } from '../../src/store/use-app-store';

const mockRouter = {
  push: jest.fn(),
  back: jest.fn(),
};

const decorations = [
  { title: '开心的小橘', label: '预览开心的小橘', artKey: 'stickerHappy' },
  { title: '一起记录', label: '预览一起记录', artKey: 'mascotCamera' },
  { title: '酷酷的小橘', label: '预览酷酷的小橘', artKey: 'stickerCool' },
  { title: '抱抱小橘', label: '预览抱抱小橘', artKey: 'stickerCry' },
  { title: '喜欢你', label: '预览喜欢你', artKey: 'stickerLove' },
] as const;
const cityStamps = [
  { title: '京都', label: '预览京都印章', id: 'stampKyoto' },
  { title: '镰仓', label: '预览镰仓印章', id: 'stampKamakura' },
  { title: '台南', label: '预览台南印章', id: 'stamp' },
] as const;

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

describe('Library screen decoration previews', () => {
  beforeEach(() => {
    resetAppStore();
    jest.clearAllMocks();
  });

  test.each(decorations)('previews the selected decoration and closes without mutating diary state: $title', async item => {
    const state = useAppStore.getState();
    const before = {
      diaries: state.diaries,
      drafts: state.drafts,
      materialPhotoIds: state.materialPhotoIds,
      selectedPhotoIds: state.selectedPhotoIds,
    };
    const screen = await render(<LibraryScreen />);

    await act(async () => {
      fireEvent.press(screen.getByLabelText(item.label));
    });

    await waitFor(() => {
      expect(screen.getByText(item.title)).toBeTruthy();
      expect(screen.getByTestId('material-photo-preview').props.source).toBe(art[item.artKey]);
    });

    await act(async () => {
      fireEvent.press(screen.getByLabelText('关闭底部面板'));
    });

    await waitFor(() => expect(screen.queryByText(item.title)).toBeNull());
    expect(screen.getByLabelText(item.label)).toBeTruthy();
    expect({
      diaries: useAppStore.getState().diaries,
      drafts: useAppStore.getState().drafts,
      materialPhotoIds: useAppStore.getState().materialPhotoIds,
      selectedPhotoIds: useAppStore.getState().selectedPhotoIds,
    }).toEqual(before);
    expect(mockRouter.push).not.toHaveBeenCalled();
  });

  test.each(cityStamps)('previews the SVG city stamp with configurable city text: $title', async item => {
    const screen = await render(<LibraryScreen />);
    await act(async () => {
      fireEvent.press(screen.getByLabelText(item.label));
    });

    await waitFor(() => {
      expect(screen.getAllByText(item.title).length).toBeGreaterThan(1);
      expect(screen.getByTestId('city-stamp-preview')).toBeTruthy();
      expect(screen.queryByTestId('material-photo-preview')).toBeNull();
    });
  });

  test('passes the selected stable decoration ID to the postcard route', async () => {
    useAppStore.setState(state => ({
      diaries: state.diaries.map(diary => (
        diary.id === 'diary-1' ? { ...diary, location: '京都', status: 'ready' as const } : diary
      )),
    }));
    const screen = await render(<LibraryScreen />);
    await act(async () => {
      fireEvent.press(screen.getByLabelText('预览京都印章'));
    });

    await waitFor(() => expect(screen.getByTestId('city-stamp-preview')).toBeTruthy());
    fireEvent.press(screen.getByLabelText('用于明信片'));

    expect(mockRouter.push).toHaveBeenCalledWith({
      pathname: '/postcard',
      params: { decoration: 'stampKyoto' },
    });
  });

  test('allows locked stamps to be previewed but prevents applying them', async () => {
    const screen = await render(<LibraryScreen />);
    await act(async () => {
      fireEvent.press(screen.getByLabelText('预览京都印章'));
    });

    const applyButton = screen.getByLabelText('用于明信片');
    expect(applyButton.props.accessibilityState.disabled).toBe(true);
    expect(screen.getByText('记录地点与城市名称精确匹配的已保存日记后解锁应用。')).toBeTruthy();
    fireEvent.press(applyButton);
    expect(mockRouter.push).not.toHaveBeenCalled();
  });
});
