import React from 'react';
import { cleanup, fireEvent, render, waitFor } from '@testing-library/react-native';
import CharacterScreen from '../create/character';
import { mockCharacters } from '../../src/mocks/characters';
import { createTestStore } from '../../src/test-utils/create-test-store';
import { useAppStore } from '../../src/store/use-app-store';
import type { AppStore } from '../../src/store/use-app-store';
import { canSelectCharacterId } from '../../src/types/character-capabilities';

jest.mock('../../src/services/ai-consent', () => ({
  requestAIConsent: jest.fn(async () => true),
}));

const mockRouter = {
  push: jest.fn(),
  replace: jest.fn(),
  dismissAll: jest.fn(),
  setParams: jest.fn(),
  canGoBack: jest.fn(() => true),
  back: jest.fn(),
};

const mockParams: { mode?: string } = { mode: 'replace' };
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

function seedReplaceDraft(diaryId: string) {
  const diary = useAppStore.getState().diaries.find(item => item.id === diaryId);
  if (!diary) {
    throw new Error(`expected ${diaryId} to exist`);
  }
  const draftId = `draft-replace-${diaryId}`;
  const people = (diary.people ?? []).map(person => ({
    ...person,
    photoIds: [...person.photoIds],
    aliases: person.aliases ? [...person.aliases] : undefined,
  }));

  useAppStore.setState(state => ({
    activeDraftId: draftId,
    currentDiaryId: diaryId,
    currentStep: 'edit',
    selectedCharacterId: diary.characterId,
    selectedPhotoIds: [...diary.photoIds],
    drafts: {
      ...state.drafts,
      [draftId]: {
        id: draftId,
        sourceDiaryId: diaryId,
        diary: {
          ...diary,
          photoIds: [...diary.photoIds],
          blocks: diary.blocks.map(block => ('photoIds' in block && block.photoIds
            ? { ...block, photoIds: [...block.photoIds] }
            : { ...block })),
          people,
        },
        selectedPhotoIds: [...diary.photoIds],
        people,
        generation: { round: 3, progress: 100, status: 'complete' },
        dirty: false,
      },
    },
  }));

  mockDraftId = draftId;
  return draftId;
}

describe('Character screen replace mode back behavior', () => {
  beforeEach(() => {
    resetAppStore();
    cleanup();
    jest.clearAllMocks();
    mockDraftId = undefined;
    mockRouter.canGoBack.mockReturnValue(true);
    mockListAvailableCharacters.mockResolvedValue(mockCharacters.filter(character => canSelectCharacterId(character.id)));
  });

  afterEach(() => {
    cleanup();
  });

  test('back leaves the existing draft unchanged in replace mode', async () => {
    const draftId = seedReplaceDraft('diary-1');
    const before = useAppStore.getState().drafts[draftId];
    if (!before) {
      throw new Error('expected replace draft to exist');
    }

    const screen = await render(<CharacterScreen />);

    await waitFor(() => {
      expect(screen.getByLabelText('返回')).toBeTruthy();
    });

    fireEvent.press(screen.getByLabelText('返回'));

    const after = useAppStore.getState().drafts[draftId];
    expect(after).toEqual(before);
    expect(mockRouter.back).toHaveBeenCalledTimes(1);
    expect(mockRouter.push).not.toHaveBeenCalled();
    expect(mockRouter.replace).not.toHaveBeenCalled();
    screen.unmount();
  });
});
