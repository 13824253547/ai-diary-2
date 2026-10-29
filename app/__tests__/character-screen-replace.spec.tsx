import React from 'react';
import { cleanup, fireEvent, render, waitFor } from '@testing-library/react-native';
import CharacterScreen from '../create/character';
import { mockCharacters } from '../../src/mocks/characters';
import { createTestStore } from '../../src/test-utils/create-test-store';
import { useAppStore } from '../../src/store/use-app-store';
import type { AppStore } from '../../src/store/use-app-store';
import { canSelectCharacterId } from '../../src/types/character-capabilities';
import { requestAIConsent } from '../../src/services/ai-consent';

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
let originalRestartAction: AppStore['restartGenerationWithCharacter'];
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

describe('Character screen replace mode', () => {
  beforeEach(() => {
    resetAppStore();
    cleanup();
    jest.clearAllMocks();
    originalRestartAction = useAppStore.getState().restartGenerationWithCharacter;
    mockDraftId = undefined;
    mockRouter.canGoBack.mockReturnValue(true);
    mockListAvailableCharacters.mockResolvedValue(mockCharacters.filter(character => canSelectCharacterId(character.id)));
  });

  afterEach(() => {
    cleanup();
    useAppStore.setState({ restartGenerationWithCharacter: originalRestartAction });
  });

  test('does not restart generation when diary consent is declined', async () => {
    seedReplaceDraft('diary-1');
    jest.mocked(requestAIConsent).mockResolvedValueOnce(false);
    const restart = jest.fn();
    useAppStore.setState({ restartGenerationWithCharacter: restart });
    const screen = await render(<CharacterScreen />);
    const draft = useAppStore.getState().drafts[mockDraftId!];
    const target = mockCharacters.find(character => canSelectCharacterId(character.id) && character.id !== draft.diary.characterId)!;
    await waitFor(() => expect(screen.getByLabelText(`选择${target.name}`)).toBeTruthy());
    fireEvent.press(screen.getByLabelText(`选择${target.name}`));
    await waitFor(() => expect(requestAIConsent).toHaveBeenCalledWith('diary', expect.anything()));
    expect(restart).not.toHaveBeenCalled();
    expect(mockRouter.replace).not.toHaveBeenCalled();
  });

  test('picks a new character, syncs it, and replaces the editor with the generating screen', async () => {
    const draftId = seedReplaceDraft('diary-1');
    const before = useAppStore.getState().drafts[draftId];
    if (!before) {
      throw new Error('expected replace draft to exist');
    }
    const restart = jest.fn(async (id: string, characterId: string) => {
      useAppStore.setState(state => ({
        drafts: {
          ...state.drafts,
          [id]: {
            ...state.drafts[id],
            diary: { ...state.drafts[id].diary, characterId, status: 'draft' },
            generation: {
              ...state.drafts[id].generation,
              progress: 0,
              status: 'idle',
              remoteJobId: undefined,
              remoteStage: undefined,
            },
          },
        },
      }));
      return true;
    });
    useAppStore.setState({ restartGenerationWithCharacter: restart });

    const screen = await render(<CharacterScreen />);

    await waitFor(() => {
      expect(screen.getByLabelText('选择路易')).toBeTruthy();
    });

    fireEvent.press(screen.getByLabelText('选择路易'));

    await waitFor(() => {
      expect(restart).toHaveBeenCalledWith(draftId, 'character-green');
      expect(mockRouter.replace).toHaveBeenCalledWith({
        pathname: '/create/generating',
        params: { draftId },
      });
    });

    const after = useAppStore.getState().drafts[draftId];
    expect(after?.sourceDiaryId).toBe('diary-1');
    expect(after?.diary.characterId).toBe('character-green');
    expect(after?.diary.title).toBe(before.diary.title);
    expect(after?.diary.summary).toBe(before.diary.summary);
    expect(after?.diary.blocks).toEqual(before.diary.blocks);
    expect(after?.diary.photoIds).toEqual(before.diary.photoIds);
    expect(after?.generation.status).toBe('idle');
    expect(mockRouter.back).not.toHaveBeenCalled();
    expect(mockRouter.push).not.toHaveBeenCalled();
    screen.unmount();
  });

  test('keeps the current character and stays on the picker when draft sync fails', async () => {
    const draftId = seedReplaceDraft('diary-1');
    const before = useAppStore.getState().drafts[draftId];
    const restart = jest.fn(async () => false);
    useAppStore.setState({ restartGenerationWithCharacter: restart });

    const screen = await render(<CharacterScreen />);
    await waitFor(() => {
      expect(screen.getByLabelText('选择路易')).toBeTruthy();
    });

    fireEvent.press(screen.getByLabelText('选择路易'));
    await waitFor(() => expect(restart).toHaveBeenCalledTimes(1));

    expect(useAppStore.getState().drafts[draftId].diary.characterId).toBe(before?.diary.characterId);
    expect(mockRouter.replace).not.toHaveBeenCalled();

    fireEvent.press(screen.getByLabelText('选择路易'));
    await waitFor(() => expect(restart).toHaveBeenCalledTimes(2));
    expect(mockRouter.replace).not.toHaveBeenCalled();
    screen.unmount();
  });
});
