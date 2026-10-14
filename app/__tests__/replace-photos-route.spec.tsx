import React from 'react';
import { render, waitFor } from '@testing-library/react-native';
import ReplacePhotosRoute from '../diary/[id]/replace-photos';
import { createTestStore } from '../../src/test-utils/create-test-store';
import { useAppStore } from '../../src/store/use-app-store';
import type { AppStore } from '../../src/store/use-app-store';

const mockRouter = {
  replace: jest.fn(),
};

const mockParams: { id?: string; draftId?: string } = {};

jest.mock('expo-router', () => ({
  useRouter: () => mockRouter,
  useLocalSearchParams: () => mockParams,
}));

jest.mock('../../src/components/layout/screen', () => ({
  Screen: ({ children }: { children: React.ReactNode }) => {
    const { View } = require('react-native');
    return <View>{children}</View>;
  },
}));

jest.mock('../../src/components/common/design-ui', () => ({
  Empty: ({ title }: { title?: string }) => {
    const { Text } = require('react-native');
    return <Text>{title ?? '空'}</Text>;
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

describe('Replace photos route', () => {
  beforeEach(() => {
    resetAppStore();
    jest.clearAllMocks();
    mockParams.id = undefined;
    mockParams.draftId = undefined;
  });

  test('reuses the explicit draft id and opens the photo replacement panel for the same diary', async () => {
    const draftId = useAppStore.getState().beginEdit('diary-1')!;
    mockParams.id = 'diary-1';
    mockParams.draftId = draftId;

    const screen = await render(<ReplacePhotosRoute />);

    expect(screen.getByText('正在打开日记')).toBeTruthy();
    await waitFor(() => {
      expect(mockRouter.replace).toHaveBeenCalledWith({
        pathname: '/diary/[id]/edit',
        params: { id: 'diary-1', draftId, openPhotos: '1' },
      });
    });
  });

  test('reuses the existing edit draft when the same diary is opened repeatedly without an explicit draft id', async () => {
    const existingDraftId = useAppStore.getState().beginEdit('diary-1')!;
    mockParams.id = 'diary-1';

    await render(<ReplacePhotosRoute />);

    await waitFor(() => {
      expect(mockRouter.replace).toHaveBeenCalledWith({
        pathname: '/diary/[id]/edit',
        params: { id: 'diary-1', draftId: existingDraftId, openPhotos: '1' },
      });
    });

    const editDrafts = Object.values(useAppStore.getState().drafts).filter(draft => draft.sourceDiaryId === 'diary-1' && !draft.savedDiaryId);
    expect(editDrafts).toHaveLength(1);
  });

  test('does not route to another diary when the target id is invalid', async () => {
    mockParams.id = 'missing-diary';

    const screen = await render(<ReplacePhotosRoute />);

    expect(screen.getByText('正在打开日记')).toBeTruthy();
    await waitFor(() => {
      expect(mockRouter.replace).not.toHaveBeenCalled();
    });
    expect(useAppStore.getState().activeDraftId).toBeUndefined();
  });
});
