import React from 'react';
import { Alert } from 'react-native';
import { cleanup, fireEvent, render, waitFor } from '@testing-library/react-native';
import NamingScreen from '../companion/naming';
import { createTestStore } from '../../src/test-utils/create-test-store';
import { useAppStore } from '../../src/store/use-app-store';
import type { AppStore } from '../../src/store/use-app-store';

const mockRouter = {
  push: jest.fn(),
  replace: jest.fn(),
  dismissAll: jest.fn(),
  setParams: jest.fn(),
  canGoBack: jest.fn(),
  back: jest.fn(),
};

const initialAppStoreState = useAppStore.getState() as Record<string, unknown>;

jest.mock('../../src/hooks/use-diary-flow', () => ({
  useDraftRoute: () => {
    const { useAppStore } = require('../../src/store/use-app-store');
    return {
      draft: useAppStore((state: AppStore) => (state.activeDraftId ? state.drafts[state.activeDraftId] : undefined)),
      router: mockRouter,
    };
  },
  leaveDraft: (_draftId: string, done: () => void) => done(),
}));

jest.mock('../../src/components/layout/screen', () => ({
  Screen: ({ children, header }: { children: React.ReactNode; header?: React.ReactNode }) => {
    const { View } = require('react-native');
    return <View>{header}{children}</View>;
  },
}));

jest.mock('../../src/components/layout/top-bar', () => ({
  TopBar: ({ onBackPress }: { onBackPress?: () => void }) => {
    const { Pressable, Text } = require('react-native');
    return <Pressable accessibilityLabel="返回" onPress={onBackPress}><Text>返回</Text></Pressable>;
  },
}));

function resetAppStore() {
  const fresh = createTestStore().store.getState() as Record<string, unknown>;
  const next = Object.fromEntries(
    Object.keys(initialAppStoreState).map(key => [
      key,
      typeof initialAppStoreState[key] === 'function' ? initialAppStoreState[key] : fresh[key],
    ]),
  );
  useAppStore.setState(next as AppStore, true);
}

async function settle() {
  await Promise.resolve();
  await Promise.resolve();
  await new Promise(resolve => setTimeout(resolve, 0));
}

async function seedDraft() {
  resetAppStore();
  jest.clearAllMocks();
  const draftId = useAppStore.getState().beginCreation();
  useAppStore.getState().setDraftPhotos(draftId, ['photo-11', 'photo-12', 'photo-1']);
  await settle();
  return draftId;
}

describe('Naming screen failure flow', () => {
  const alertSpy = jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);

  afterEach(async () => {
    cleanup();
    await settle();
  });

  afterAll(() => {
    alertSpy.mockRestore();
  });

  test('keeps typed names and stays on the page when saving fails', async () => {
    const draftId = await seedDraft();
    const finalizeDraftPeopleNaming = jest.fn().mockResolvedValue({
      ok: false as const,
      message: '名字还没保存成功，请稍后重试。',
    });
    useAppStore.setState({ finalizeDraftPeopleNaming });

    const screen = await render(<NamingScreen />);
    const friendInput = await screen.findByLabelText('同行人的名字');
    const saveButton = await screen.findByLabelText('保存名字');

    fireEvent.changeText(friendInput, '阿云');
    fireEvent.press(saveButton);

    await waitFor(() => {
      expect(finalizeDraftPeopleNaming).toHaveBeenCalledTimes(1);
      expect(alertSpy).toHaveBeenCalledWith('保存失败', '名字还没保存成功，请稍后重试。');
    });

    expect(mockRouter.replace).not.toHaveBeenCalled();
    expect(useAppStore.getState().drafts[draftId].people.find(person => person.id === 'person-friend')?.name).toBe('阿云');
  });
});
