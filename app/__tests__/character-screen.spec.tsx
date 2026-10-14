import React from 'react';
import { fireEvent, render, waitFor } from '@testing-library/react-native';
import CharacterScreen from '../create/character';
import { mockCharacters } from '../../src/mocks/characters';
import { createTestStore } from '../../src/test-utils/create-test-store';
import { useAppStore } from '../../src/store/use-app-store';
import type { AppStore } from '../../src/store/use-app-store';
import { canSelectCharacterId } from '../../src/types/character-capabilities';

const mockRouter = {
  push: jest.fn(),
  replace: jest.fn(),
  dismissAll: jest.fn(),
  setParams: jest.fn(),
  canGoBack: jest.fn(() => false),
  back: jest.fn(),
};

const mockParams: { mode?: string } = {};
let mockDraftId: string | undefined;
const mockListAvailableCharacters = jest.fn();

jest.mock('../../src/services/character-catalog', () => ({
  listAvailableCharacters: () => mockListAvailableCharacters(),
}));

jest.mock('../../src/hooks/use-diary-flow', () => ({
  useDraftRoute: () => {
    const { useAppStore } = require('../../src/store/use-app-store');
    return {
      draft: mockDraftId ? useAppStore.getState().drafts[mockDraftId] : undefined,
      params: mockParams,
      router: mockRouter,
    };
  },
}));

jest.mock('../../src/components/layout/screen', () => ({
  Screen: ({ children, header }: { children: React.ReactNode; header?: React.ReactNode }) => {
    const { View } = require('react-native');
    return (
      <View>
        {header}
        {children}
      </View>
    );
  },
}));

jest.mock('../../src/components/layout/top-bar', () => ({
  TopBar: ({ onBackPress, title, subtitle }: { onBackPress?: () => void; title?: string; subtitle?: string }) => {
    const { Pressable, Text, View } = require('react-native');
    return (
      <View>
        <Pressable accessibilityLabel="返回" onPress={onBackPress}>
          <Text>返回</Text>
        </Pressable>
        {title ? <Text>{title}</Text> : null}
        {subtitle ? <Text>{subtitle}</Text> : null}
      </View>
    );
  },
}));

function resetAppStore() {
  const current = useAppStore.getState() as Record<string, unknown>;
  const fresh = createTestStore().store.getState() as Record<string, unknown>;
  const next = Object.fromEntries(
    Object.keys(current).map(key => [key, typeof current[key] === 'function' ? current[key] : fresh[key]]),
  );
  useAppStore.setState(next as AppStore, true);
}

describe('Character screen', () => {
  beforeEach(() => {
    resetAppStore();
    jest.clearAllMocks();
    mockParams.mode = 'browse';
    mockDraftId = undefined;
    mockRouter.canGoBack.mockReturnValue(false);
    mockListAvailableCharacters.mockResolvedValue(mockCharacters.filter(character => canSelectCharacterId(character.id)));
  });

  test('catalog load failure is visible and retry restores the character list', async () => {
    mockListAvailableCharacters.mockImplementation(() => {
      throw new Error('这次没把排版师目录读出来，请重新加载后再试。');
    });

    const screen = await render(<CharacterScreen />);

    await waitFor(() => {
      expect(screen.getByText('排版师目录暂时不可用')).toBeTruthy();
    });
    expect(screen.getByText('这次没把排版师目录读出来，请重新加载后再试。')).toBeTruthy();

    mockListAvailableCharacters.mockReset();
    mockListAvailableCharacters.mockResolvedValue(mockCharacters.filter(character => canSelectCharacterId(character.id)));

    fireEvent.press(screen.getByLabelText('重新加载'));

    await waitFor(() => {
      expect(mockListAvailableCharacters).toHaveBeenCalled();
    });
    await waitFor(() => {
      expect(screen.getByText('tsuki')).toBeTruthy();
    });
    expect(screen.queryByText('排版师目录暂时不可用')).toBeNull();
    screen.unmount();
  });

  test('renders only the three available characters from the capability contract', async () => {
    const screen = await render(<CharacterScreen />);

    await waitFor(() => {
      expect(screen.getByText('tsuki')).toBeTruthy();
    });
    expect(screen.getByText('路易')).toBeTruthy();
    expect(screen.getByText('拉尔夫')).toBeTruthy();
    expect(screen.queryByText('亮亮')).toBeNull();
    expect(screen.queryByText('老师傅')).toBeNull();
    screen.unmount();
  });

  test('browse mode creates only one draft and keeps the picked character on repeated taps', async () => {
    const screen = await render(<CharacterScreen />);

    await waitFor(() => {
      expect(screen.getByLabelText('选择路易')).toBeTruthy();
    });
    const chooseLuyi = screen.getByLabelText('选择路易');
    fireEvent.press(chooseLuyi);
    fireEvent.press(chooseLuyi);

    const drafts = Object.values(useAppStore.getState().drafts);
    expect(drafts).toHaveLength(1);
    expect(drafts[0]?.diary.characterId).toBe('character-green');
    expect(mockRouter.push).toHaveBeenCalledTimes(1);
    expect(mockRouter.push).toHaveBeenCalledWith({
      pathname: '/permission/photos',
      params: { draftId: drafts[0]?.id },
    });
    screen.unmount();
  });

});
