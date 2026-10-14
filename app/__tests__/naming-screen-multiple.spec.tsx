import React from 'react';
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

async function seedDraftWithMultipleCompanions() {
  resetAppStore();
  jest.clearAllMocks();
  const draftId = useAppStore.getState().beginCreation();
  useAppStore.getState().setDraftPhotos(draftId, ['photo-11', 'photo-12', 'photo-1']);
  useAppStore.setState(state => ({
    drafts: {
      ...state.drafts,
      [draftId]: {
        ...state.drafts[draftId],
        people: [
          { id: 'person-self', name: '', avatarPhotoId: 'photo-11', photoIds: ['photo-11'] },
          { id: 'person-friend-1', name: '', avatarPhotoId: 'photo-12', photoIds: ['photo-12'] },
          { id: 'person-friend-2', name: '', avatarPhotoId: 'photo-1', photoIds: ['photo-1'] },
        ],
        diary: {
          ...state.drafts[draftId].diary,
          people: [
            { id: 'person-self', name: '', avatarPhotoId: 'photo-11', photoIds: ['photo-11'] },
            { id: 'person-friend-1', name: '', avatarPhotoId: 'photo-12', photoIds: ['photo-12'] },
            { id: 'person-friend-2', name: '', avatarPhotoId: 'photo-1', photoIds: ['photo-1'] },
          ],
        },
      },
    },
  }));
  await settle();
  return draftId;
}

describe('Naming screen multiple companions flow', () => {
  afterEach(async () => {
    cleanup();
    await settle();
  });

  test('multiple companions use unique labels and keep their typed names separate', async () => {
    const draftId = await seedDraftWithMultipleCompanions();
    const finalizeDraftPeopleNaming = jest.fn().mockResolvedValue({ ok: true as const });
    useAppStore.setState({ finalizeDraftPeopleNaming });

    const screen = await render(<NamingScreen />);
    const firstCompanionInput = await screen.findByLabelText('第1位同行人的名字');
    const secondCompanionInput = await screen.findByLabelText('第2位同行人的名字');
    const saveButton = await screen.findByLabelText('保存名字');

    fireEvent.changeText(firstCompanionInput, '阿云');
    fireEvent.changeText(secondCompanionInput, '小北');
    fireEvent.press(saveButton);

    await waitFor(() => {
      expect(finalizeDraftPeopleNaming).toHaveBeenCalledWith(draftId);
      expect(mockRouter.replace).toHaveBeenCalledWith({
        pathname: '/diary/[id]/edit',
        params: { id: 'new', draftId },
      });
    });

    const people = useAppStore.getState().drafts[draftId].people;
    expect(people.find(person => person.id === 'person-friend-1')?.name).toBe('阿云');
    expect(people.find(person => person.id === 'person-friend-2')?.name).toBe('小北');
    screen.unmount();
  });
});
