import React from 'react';
import { act, fireEvent, render, waitFor } from '@testing-library/react-native';
import MaterialPhotoWallScreen from '../library/wall';
import { createTestStore } from '../../src/test-utils/create-test-store';
import { useAppStore } from '../../src/store/use-app-store';
import type { AppStore } from '../../src/store/use-app-store';
import type { DiaryPhoto } from '../../src/types/diary';

const mockRouter = {
  back: jest.fn(),
  canGoBack: jest.fn(() => true),
  replace: jest.fn(),
};

jest.mock('expo-router', () => ({
  useRouter: () => mockRouter,
  useLocalSearchParams: () => ({ search: '清晨' }),
}));

jest.mock('../../src/components/layout/screen', () => ({
  Screen: ({ children, header }: { children: React.ReactNode; header?: React.ReactNode }) => {
    const { View } = require('react-native');
    return <View>{header}{children}</View>;
  },
}));

jest.mock('../../src/components/common/bottom-sheet', () => ({
  BottomSheet: () => null,
}));

function resetAppStore() {
  const current = useAppStore.getState() as Record<string, unknown>;
  const fresh = createTestStore().store.getState() as Record<string, unknown>;
  const next = Object.fromEntries(
    Object.keys(current).map(key => [key, typeof current[key] === 'function' ? current[key] : fresh[key]]),
  );
  useAppStore.setState(next as AppStore, true);
}

function buildPhoto(id: string): DiaryPhoto {
  return {
    id,
    title: id,
    location: '',
    emoji: '🖼',
    color: '#EFE3D5',
    date: '未知日期',
    uri: `file:///device/${id}.jpg`,
    localUri: `file:///device/${id}.jpg`,
    width: 100,
    height: 120,
    source: 'device',
  };
}

describe('Material photo wall', () => {
  beforeEach(() => {
    resetAppStore();
    jest.clearAllMocks();
    const photos = Array.from({ length: 12 }, (_, index) => buildPhoto(`wall-${index + 1}`));
    useAppStore.getState().registerPhotos(photos);
    useAppStore.setState({
      materialPhotoIds: photos.map(photo => photo.id),
      diaries: [{
        ...createTestStore().store.getState().diaries[0]!,
        id: 'diary-wall',
        title: '一次清晨散步',
        location: '苏州',
        photoIds: photos.map(photo => photo.id),
        coverPhotoId: photos[0]!.id,
        blocks: [{ id: 'body-wall', type: 'text', content: '清晨的河岸很安静。' }],
      }],
    });
  });

  test('shows all matching material photos in the wall and filters from the diary search', async () => {
    const screen = await render(<MaterialPhotoWallScreen />);

    expect(screen.getByLabelText('搜索日记标题、地点或正文').props.value).toBe('清晨');
    expect(screen.getAllByTestId(/^diary-photo-wall-/)).toHaveLength(12);

    await act(async () => {
      fireEvent.changeText(screen.getByLabelText('搜索日记标题、地点或正文'), '没有匹配');
    });

    await waitFor(() => expect(screen.getByText('没有找到匹配日记的照片')).toBeTruthy());
    expect(screen.queryByTestId('diary-photo-wall-1')).toBeNull();
  });

  test('uses the material page as a fallback when there is no navigation history', async () => {
    mockRouter.canGoBack.mockReturnValue(false);
    const screen = await render(<MaterialPhotoWallScreen />);

    fireEvent.press(screen.getByLabelText('返回'));

    expect(mockRouter.back).not.toHaveBeenCalled();
    expect(mockRouter.replace).toHaveBeenCalledWith('/library');
  });
});
