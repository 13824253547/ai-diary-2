import React from 'react';
import { fireEvent, render } from '@testing-library/react-native';
import TemplateScreen from '../create/template';
import { createTestStore } from '../../src/test-utils/create-test-store';
import { useAppStore } from '../../src/store/use-app-store';
import type { AppStore } from '../../src/store/use-app-store';

const mockRouter = {
  push: jest.fn(),
  replace: jest.fn(),
  dismissAll: jest.fn(),
  setParams: jest.fn(),
  canGoBack: jest.fn(() => false),
  back: jest.fn(),
};

let currentDraftId: string | undefined;

jest.mock('../../src/hooks/use-diary-flow', () => ({
  useDraftRoute: () => {
    const { useAppStore } = require('../../src/store/use-app-store');
    return {
      draft: mockDraftId ? useAppStore.getState().drafts[mockDraftId] : undefined,
      router: mockRouter,
    };
  },
}));

jest.mock('@expo/vector-icons', () => {
  const { Text: MockText } = require('react-native');
  return {
    Ionicons: ({ name }: { name: string }) => <MockText>{name}</MockText>,
  };
});

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
  TopBar: ({ onBackPress }: { onBackPress?: () => void }) => {
    const { Pressable, Text } = require('react-native');
    return (
      <Pressable accessibilityLabel="返回" onPress={onBackPress}>
        <Text>返回</Text>
      </Pressable>
    );
  },
}));

jest.mock('../../src/components/common/design-ui', () => ({
  Empty: ({ title }: { title?: string }) => {
    const { Text } = require('react-native');
    return <Text>{title ?? '空'}</Text>;
  },
  Hint: ({ children }: { children: React.ReactNode }) => {
    const { Text } = require('react-native');
    return <Text>{children}</Text>;
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

let mockDraftId: string | undefined;

describe('Template screen', () => {
  beforeEach(() => {
    resetAppStore();
    jest.clearAllMocks();
    mockDraftId = useAppStore.getState().beginCreation();
  });

  test('travel selection explicitly writes the draft type before entering character step', async () => {
    if (!mockDraftId) throw new Error('draft should exist');
    useAppStore.getState().updateDraft(mockDraftId, { type: 'emotion' });

    const screen = await render(<TemplateScreen />);
    fireEvent.press(screen.getByLabelText('旅行游记'));

    expect(useAppStore.getState().drafts[mockDraftId].diary.type).toBe('travel');
    expect(mockRouter.push).toHaveBeenCalledWith({
      pathname: '/create/character',
      params: { draftId: mockDraftId },
    });
  });

  test('unavailable diary types stay disabled and do not change the working draft', async () => {
    if (!mockDraftId) throw new Error('draft should exist');

    const screen = await render(<TemplateScreen />);
    const workCard = screen.getByLabelText('工作反思');
    const emotionCard = screen.getByLabelText('情绪记录');

    expect(workCard.props.accessibilityState.disabled).toBe(true);
    expect(emotionCard.props.accessibilityState.disabled).toBe(true);

    fireEvent.press(workCard);
    fireEvent.press(emotionCard);

    expect(useAppStore.getState().drafts[mockDraftId].diary.type).toBe('travel');
    expect(mockRouter.push).not.toHaveBeenCalled();
  });
});
