import React from 'react';
import { act, cleanup, fireEvent, render, waitFor } from '@testing-library/react-native';
import ShareResultScreen from '../share/result';
import { createTestStore } from '../../src/test-utils/create-test-store';
import { useAppStore } from '../../src/store/use-app-store';
import type { AppStore } from '../../src/store/use-app-store';

const mockRouter = {
  back: jest.fn(),
  push: jest.fn(),
};

const mockParams: { diaryId?: string } = {};

jest.mock('expo-router', () => ({
  useRouter: () => mockRouter,
  useLocalSearchParams: () => mockParams,
}));

jest.mock('@expo/vector-icons', () => {
  const { Text } = require('react-native');
  return {
    Ionicons: ({ name }: { name: string }) => <Text>{name}</Text>,
  };
});

jest.mock('../../src/components/common/button', () => ({
  Button: ({ label, onPress, disabled }: { label: string; onPress?: () => void; disabled?: boolean }) => {
    const { Pressable, Text } = require('react-native');
    return (
      <Pressable accessibilityRole="button" accessibilityLabel={label} accessibilityState={{ disabled }} disabled={disabled} onPress={onPress}>
        <Text>{label}</Text>
      </Pressable>
    );
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
  TopBar: ({ title, onBackPress, trailing }: { title?: string; onBackPress?: () => void; trailing?: React.ReactNode }) => {
    const { Pressable, Text, View } = require('react-native');
    return (
      <View>
        <Text>{title}</Text>
        <Pressable accessibilityRole="button" accessibilityLabel="返回" onPress={onBackPress}>
          <Text>返回</Text>
        </Pressable>
        {trailing}
      </View>
    );
  },
}));

jest.mock('../../src/components/diary/photo', () => ({
  Photo: ({ id, anonymous }: { id?: string; anonymous?: boolean }) => {
    const { Text } = require('react-native');
    return <Text>{anonymous ? `anonymous:${id ?? 'no-photo'}` : id ?? 'no-photo'}</Text>;
  },
}));

jest.mock('../../src/components/common/design-ui', () => ({
  Empty: ({ title, detail }: { title?: string; detail?: string }) => {
    const { Text, View } = require('react-native');
    return (
      <View>
        <Text>{title ?? '空'}</Text>
        <Text>{detail ?? ''}</Text>
      </View>
    );
  },
  Sheet: ({ visible, title, children }: { visible?: boolean; title?: string; children?: React.ReactNode }) => {
    const { Text, View } = require('react-native');
    if (!visible) {
      return null;
    }
    return (
      <View>
        <Text>{title}</Text>
        {children}
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

function updateDiary(id: string, updater: (diary: NonNullable<ReturnType<typeof useAppStore.getState>['diaries'][number]>) => NonNullable<ReturnType<typeof useAppStore.getState>['diaries'][number]>) {
  useAppStore.setState({
    diaries: useAppStore.getState().diaries.map(diary => (diary.id === id ? updater(diary) : diary)),
  });
}

describe('Share result screen projection', () => {
  beforeEach(() => {
    resetAppStore();
    jest.clearAllMocks();
    mockParams.diaryId = 'diary-1';
  });

  afterEach(() => {
    cleanup();
  });

  test('shows the selected paragraph projection in both poster and full preview', async () => {
    updateDiary('diary-1', diary => ({
      ...diary,
      privacy: 'public-comments',
      publicBlockIds: ['block-1'],
    }));

    const screen = await render(<ShareResultScreen />);
    await waitFor(() => {
      expect(screen.getAllByText(/赤崁楼/).length).toBeGreaterThan(0);
    });

    expect(screen.queryByText(/安平/)).toBeNull();
    expect(screen.getByText('photo-1')).toBeTruthy();
    expect(screen.getByText('photo-11')).toBeTruthy();
    expect(screen.queryByText('photo-2')).toBeNull();
    expect(screen.queryByText('photo-3')).toBeNull();

    fireEvent.press(screen.getByText('预览'));

    await waitFor(() => {
      expect(screen.getByText('分享预览')).toBeTruthy();
    });
    expect(screen.getByText('在古城里，把时间放慢')).toBeTruthy();
    expect(screen.getAllByText(/赤崁楼/).length).toBeGreaterThan(0);
    expect(screen.queryByText(/安平/)).toBeNull();
    expect(screen.queryByText(/旅行不是走了多远/)).toBeNull();
  });

  test('refreshes to the latest saved projection instead of keeping the previous share result version', async () => {
    updateDiary('diary-1', diary => ({
      ...diary,
      privacy: 'public-comments',
      publicBlockIds: ['block-1'],
    }));

    const screen = await render(<ShareResultScreen />);
    await waitFor(() => {
      expect(screen.getAllByText(/赤崁楼/).length).toBeGreaterThan(0);
    });
    expect(screen.queryByText(/安平/)).toBeNull();
    expect(screen.getByText('photo-1')).toBeTruthy();
    expect(screen.queryByText('photo-3')).toBeNull();

    await act(async () => {
      updateDiary('diary-1', diary => ({
        ...diary,
        privacy: 'public-comments',
        publicBlockIds: ['block-5'],
      }));
    });

    await waitFor(() => {
      expect(screen.getAllByText(/安平/).length).toBeGreaterThan(0);
    });

    expect(screen.queryByText(/赤崁楼/)).toBeNull();
    expect(screen.getByText('photo-3')).toBeTruthy();
    expect(screen.queryByText('photo-1')).toBeNull();
  });

  test('keeps quote-only projection text without falling back to original photos', async () => {
    updateDiary('diary-1', diary => ({
      ...diary,
      privacy: 'public-comments',
      publicBlockIds: ['block-6'],
    }));

    const screen = await render(<ShareResultScreen />);
    await waitFor(() => {
      expect(screen.getAllByText(/旅行不是走了多远/).length).toBeGreaterThan(0);
    });

    expect(screen.queryByText('photo-1')).toBeNull();
    expect(screen.queryByText('photo-2')).toBeNull();
    expect(screen.queryByText('photo-3')).toBeNull();

    fireEvent.press(screen.getByText('预览'));
    await waitFor(() => {
      expect(screen.getByText('分享预览')).toBeTruthy();
    });
    expect(screen.getAllByText(/旅行不是走了多远/).length).toBeGreaterThan(0);
    expect(screen.queryByText('photo-1')).toBeNull();
    expect(screen.queryByText('photo-2')).toBeNull();
    expect(screen.queryByText('photo-3')).toBeNull();
  });

  test('keeps private preview on the full diary even when saved public blocks exist', async () => {
    updateDiary('diary-1', diary => ({
      ...diary,
      privacy: 'private',
      publicBlockIds: ['block-5'],
    }));

    const screen = await render(<ShareResultScreen />);
    await waitFor(() => {
      expect(screen.getByText('私密日记仅供本地预览与保存')).toBeTruthy();
    });

    fireEvent.press(screen.getByText('预览'));
    await waitFor(() => {
      expect(screen.getByText('分享预览')).toBeTruthy();
    });

    expect(screen.getByText('在古城里，把时间放慢')).toBeTruthy();
    expect(screen.getByText('日落之前，再走一小段')).toBeTruthy();
    expect(screen.getAllByText(/赤崁楼/).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/安平/).length).toBeGreaterThan(0);
  });

  test('combines anonymous sharing with selected block projection on poster and preview', async () => {
    updateDiary('diary-1', diary => ({
      ...diary,
      privacy: 'anonymous',
      title: '和小林在台南散步',
      subtitle: '小可的老城记录',
      summary: '小林说今天的风很轻。',
      location: '和小林一起走过的台南',
      companionName: '小林',
      publicBlockIds: ['block-1'],
      people: [
        { id: 'person-self', name: '我', avatarPhotoId: 'photo-1', photoIds: ['photo-1'] },
        { id: 'person-friend', name: '小林', aliases: ['小可'], avatarPhotoId: 'photo-11', photoIds: ['photo-11'] },
      ],
      blocks: diary.blocks.map(block => {
        if (block.id === 'block-1' && block.type === 'text') {
          return {
            ...block,
            title: '和小林在赤崁楼慢慢走',
            content: '小可说今天的树影很好看。',
            photoIds: ['photo-1', 'photo-11'],
          };
        }
        if (block.id === 'block-2' && block.type === 'photo') {
          return {
            ...block,
            caption: '和小林一起拍下的老城角落。',
          };
        }
        if (block.id === 'block-5' && block.type === 'text') {
          return {
            ...block,
            title: '小林和海风',
            content: '这段不该出现在选段分享里。',
          };
        }
        return block;
      }),
    }));

    const screen = await render(<ShareResultScreen />);
    await waitFor(() => {
      expect(screen.getAllByText(/同行人/).length).toBeGreaterThan(0);
    });

    expect(screen.queryByText(/小林/)).toBeNull();
    expect(screen.queryByText(/小可/)).toBeNull();
    expect(screen.getByText('anonymous:photo-1')).toBeTruthy();
    expect(screen.getByText('anonymous:photo-11')).toBeTruthy();
    expect(screen.queryByText('anonymous:photo-2')).toBeNull();
    expect(screen.queryByText(/这段不该出现在选段分享里/)).toBeNull();

    fireEvent.press(screen.getByText('预览'));
    await waitFor(() => {
      expect(screen.getByText('分享预览')).toBeTruthy();
    });

    expect(screen.getAllByText(/同行人/).length).toBeGreaterThan(0);
    expect(screen.queryByText(/小林/)).toBeNull();
    expect(screen.queryByText(/小可/)).toBeNull();
    expect(screen.queryByText(/这段不该出现在选段分享里/)).toBeNull();
    expect(screen.queryByText('anonymous:photo-2')).toBeNull();
  });
});
