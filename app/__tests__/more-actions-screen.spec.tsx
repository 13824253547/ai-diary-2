import React from 'react';
import { fireEvent, render } from '@testing-library/react-native';
import MoreActionsScreen from '../modal/more-actions';
import { createTestStore } from '../../src/test-utils/create-test-store';
import { useAppStore } from '../../src/store/use-app-store';
import type { AppStore } from '../../src/store/use-app-store';

const mockRouter = {
  back: jest.fn(),
  replace: jest.fn(),
};

const mockParams: { diaryId?: string } = {};

jest.mock('expo-router', () => ({
  useRouter: () => mockRouter,
  useLocalSearchParams: () => mockParams,
}));

jest.mock('../../src/components/common/button', () => ({
  Button: ({ label, onPress }: { label: string; onPress?: () => void }) => {
    const { Pressable, Text } = require('react-native');
    return (
      <Pressable accessibilityRole="button" accessibilityLabel={label} onPress={onPress}>
        <Text>{label}</Text>
      </Pressable>
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

describe('More actions modal', () => {
  beforeEach(() => {
    resetAppStore();
    jest.clearAllMocks();
    mockParams.diaryId = undefined;
  });

  test('shows the empty state when the target diary does not exist', async () => {
    mockParams.diaryId = 'missing-diary';

    const screen = await render(<MoreActionsScreen />);

    expect(screen.getByText('这篇日记不存在')).toBeTruthy();
    fireEvent.press(screen.getByLabelText('关闭'));
    expect(mockRouter.back).toHaveBeenCalledTimes(1);
  });

  test('continues editing with the same existing draft instead of creating a duplicate draft', async () => {
    const existingDraftId = useAppStore.getState().beginEdit('diary-1')!;
    mockParams.diaryId = 'diary-1';

    const screen = await render(<MoreActionsScreen />);
    fireEvent.press(screen.getByLabelText('继续编辑'));

    const editDrafts = Object.values(useAppStore.getState().drafts).filter(draft => draft.sourceDiaryId === 'diary-1' && !draft.savedDiaryId);

    expect(editDrafts).toHaveLength(1);
    expect(useAppStore.getState().activeDraftId).toBe(existingDraftId);
    expect(mockRouter.replace).toHaveBeenCalledWith({
      pathname: '/diary/[id]/edit',
      params: { id: 'diary-1', draftId: existingDraftId },
    });
  });

  test('routes privacy and share actions with the current diary id', async () => {
    mockParams.diaryId = 'diary-2';

    const screen = await render(<MoreActionsScreen />);

    fireEvent.press(screen.getByLabelText('设置公开范围'));
    expect(mockRouter.replace).toHaveBeenCalledWith('/share/privacy?diaryId=diary-2');

    fireEvent.press(screen.getByLabelText('分享这篇日记'));
    expect(mockRouter.replace).toHaveBeenCalledWith('/share/result?diaryId=diary-2');
  });
});
