import React from 'react';
import { Alert } from 'react-native';
import { fireEvent, render } from '@testing-library/react-native';
import { moduleForPath, BottomTabs } from '../bottom-tabs';
import { createTestStore } from '../../../test-utils/create-test-store';
import { useAppStore } from '../../../store/use-app-store';
import type { AppStore } from '../../../store/use-app-store';

const mockRouter = {
  replace: jest.fn(),
};

let mockPathname = '/(tabs)/home';

jest.mock('expo-router', () => ({
  usePathname: () => mockPathname,
  useRouter: () => mockRouter,
}));

jest.mock('@expo/vector-icons', () => {
  const React = require('react');
  const { Text: MockText } = require('react-native');
  return {
    Ionicons: ({ name }: { name: string }) => React.createElement(MockText, null, name),
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

describe('BottomTabs moduleForPath', () => {
  const alertSpy = jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);

  beforeEach(() => {
    resetAppStore();
    jest.clearAllMocks();
    mockPathname = '/(tabs)/home';
  });

  afterAll(() => {
    alertSpy.mockRestore();
  });

  test('CASE-BAS-004-001 routes一级页面和业务页到正确 tab 模块', () => {
    expect(moduleForPath('/(tabs)/home')).toBe('home');
    expect(moduleForPath('/(tabs)/memories')).toBe('memories');
    expect(moduleForPath('/postcard')).toBe('memories');
    expect(moduleForPath('/share/privacy')).toBe('pet');
    expect(moduleForPath('/create/generating')).toBe('pet');
    expect(moduleForPath('/discover/1')).toBe('discover');
    expect(moduleForPath('/profile/report')).toBe('profile');
  });

  test('NAV-001 leaving an unsaved creation flow can keep editing without discarding the active draft', async () => {
    mockPathname = '/create/generating';
    const draftId = useAppStore.getState().beginCreation();
    useAppStore.getState().setDraftPhotos(draftId, ['photo-1', 'photo-2', 'photo-3']);

    const screen = await render(React.createElement(BottomTabs));
    fireEvent.press(screen.getByLabelText('首页'));

    expect(alertSpy).toHaveBeenCalled();
    const [title, message, buttons] = alertSpy.mock.calls[0] ?? [];
    expect(title).toBe('离开这篇日记？');
    expect(message).toBe('尚未保存的内容将被放弃。');
    expect(buttons?.map(button => button.text ?? '')).toEqual(['继续编辑', '放弃']);

    buttons?.[0]?.onPress?.();

    expect(useAppStore.getState().drafts[draftId]).toBeDefined();
    expect(mockRouter.replace).not.toHaveBeenCalled();
  });

  test('NAV-001 leaving an unsaved creation flow can discard the draft and navigate once confirmed', async () => {
    mockPathname = '/create/generating';
    const draftId = useAppStore.getState().beginCreation();
    useAppStore.getState().setDraftPhotos(draftId, ['photo-1', 'photo-2', 'photo-3']);

    const screen = await render(React.createElement(BottomTabs));
    fireEvent.press(screen.getByLabelText('首页'));

    const buttons = (alertSpy.mock.calls[0]?.[2] ?? []) as Array<{ onPress?: () => void }>;
    buttons[1]?.onPress?.();

    expect(useAppStore.getState().drafts[draftId]).toBeUndefined();
    expect(mockRouter.replace).toHaveBeenCalledWith('/(tabs)/home');
  });
});
