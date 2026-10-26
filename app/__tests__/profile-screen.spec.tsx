import React from 'react';
import { fireEvent, render, waitFor } from '@testing-library/react-native';
import ProfileScreen from '../(tabs)/profile';
import { createTestStore } from '../../src/test-utils/create-test-store';
import { useAppStore } from '../../src/store/use-app-store';
import type { AppStore } from '../../src/store/use-app-store';
import type { DiaryItem } from '../../src/types/diary';

const mockRouter = {
  push: jest.fn(),
  replace: jest.fn(),
  dismissAll: jest.fn(),
  setParams: jest.fn(),
  canGoBack: jest.fn(),
  back: jest.fn(),
};

jest.mock('expo-router', () => ({
  useRouter: () => mockRouter,
}));

jest.mock('../../src/components/layout/screen', () => ({
  Screen: ({ children, footer }: { children: React.ReactNode; footer?: React.ReactNode }) => {
    const { View } = require('react-native');
    return (
      <View>
        {children}
        {footer}
      </View>
    );
  },
}));

jest.mock('../../src/components/navigation/bottom-tabs', () => ({
  BottomTabs: () => null,
}));

jest.mock('../../src/components/profile/growth-entry-card', () => ({
  GrowthEntryCard: () => null,
}));

jest.mock('expo-linear-gradient', () => ({
  LinearGradient: ({ children }: { children: React.ReactNode }) => {
    const React = require('react');
    return <React.Fragment>{children}</React.Fragment>;
  },
}));

jest.mock('@expo/vector-icons', () => {
  const { Text: MockText } = require('react-native');
  return {
    Ionicons: ({ name }: { name: string }) => <MockText>{name}</MockText>,
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

function buildDiary(overrides: Partial<DiaryItem>): DiaryItem {
  return {
    id: overrides.id ?? 'diary-test',
    type: overrides.type ?? 'travel',
    status: 'ready',
    title: overrides.title ?? '测试回忆',
    subtitle: overrides.subtitle ?? '测试副标题',
    location: overrides.location ?? '厦门',
    date: overrides.date ?? '2026.01.10',
    summary: overrides.summary ?? '测试摘要',
    helperMessage: overrides.helperMessage ?? '测试提示',
    characterId: overrides.characterId ?? 'character-blue',
    companionName: overrides.companionName ?? '自己',
    privacy: overrides.privacy ?? 'private',
    photoIds: overrides.photoIds ?? ['photo-1', 'photo-2', 'photo-3'],
    coverPhotoId: overrides.coverPhotoId ?? 'photo-1',
    blocks: overrides.blocks ?? [
      {
        id: 'block-1',
        type: 'text',
        title: '测试段落',
        content: '测试内容',
        photoIds: ['photo-1'],
      },
    ],
    exportedImage: overrides.exportedImage ?? false,
    exportedPdf: overrides.exportedPdf ?? false,
    shareModes: overrides.shareModes ?? [],
    exportModes: overrides.exportModes ?? [],
    version: overrides.version ?? 1,
    createdInSession: overrides.createdInSession,
    people: overrides.people,
    posterPhotoIds: overrides.posterPhotoIds,
    publicBlockIds: overrides.publicBlockIds,
    anonymous: overrides.anonymous,
  };
}

describe('Profile screen monthly entry', () => {
  beforeEach(() => {
    resetAppStore();
    jest.clearAllMocks();
  });

  test('uses real monthly groups instead of fixed demo month params', async () => {
    useAppStore.setState({
      diaries: [
        buildDiary({ id: 'diary-feb-1', title: '二月回忆', date: '2026.02.03' }),
        buildDiary({ id: 'diary-jan-1', title: '一月回忆', date: '2026.01.10' }),
      ],
    });

    const { getByLabelText } = await render(<ProfileScreen />);

    await waitFor(() => {
      expect(getByLabelText('打开2026年2月月度装订')).toBeTruthy();
      expect(getByLabelText('打开2026年1月月度装订')).toBeTruthy();
    });

    fireEvent.press(getByLabelText('打开2026年2月月度装订'));

    expect(mockRouter.push).toHaveBeenCalledWith({
      pathname: '/profile/monthly',
      params: { month: '2026-02' },
    });
  });

  test('does not fabricate monthly shortcuts when there are no saved diaries', async () => {
    useAppStore.setState({ diaries: [] });

    const { queryByLabelText } = await render(<ProfileScreen />);

    expect(queryByLabelText('打开2026年1月月度装订')).toBeNull();
  });

  test('does not display a seeded account name or membership badge', async () => {
    const { getByText, queryByText } = await render(<ProfileScreen />);

    expect(getByText('个人主页')).toBeTruthy();
    expect(queryByText('橘子的日记本')).toBeNull();
    expect(queryByText('VIP')).toBeNull();
  });
});
