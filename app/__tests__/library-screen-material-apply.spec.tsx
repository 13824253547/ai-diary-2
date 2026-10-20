import React from 'react';
import { act, fireEvent, render, waitFor } from '@testing-library/react-native';
import LibraryScreen from '../library';
import { createTestStore } from '../../src/test-utils/create-test-store';
import { useAppStore } from '../../src/store/use-app-store';
import type { AppStore } from '../../src/store/use-app-store';
import type { DiaryPhoto } from '../../src/types/diary';

const mockRouter = {
  push: jest.fn(),
  back: jest.fn(),
};

jest.mock('expo-router', () => ({
  useRouter: () => mockRouter,
}));

jest.mock('../../src/components/layout/screen', () => ({
  Screen: ({ children, header }: { children: React.ReactNode; header?: React.ReactNode }) => {
    const { View } = require('react-native');
    return <View>{header}{children}</View>;
  },
}));

jest.mock('../../src/components/common/bottom-sheet', () => ({
  BottomSheet: ({
    visible,
    onClose,
    title,
    children,
  }: {
    visible: boolean;
    onClose: () => void;
    title?: string;
    children: React.ReactNode;
  }) => {
    const { Pressable, Text, View } = require('react-native');
    return visible ? (
      <View>
        <Text>{title}</Text>
        <Pressable accessibilityRole="button" accessibilityLabel="关闭底部面板" onPress={onClose}>
          <Text>关闭</Text>
        </Pressable>
        {children}
      </View>
    ) : null;
  },
}));

jest.mock('@expo/vector-icons', () => {
  const { Text } = require('react-native');
  return {
    Ionicons: ({ name }: { name: string }) => <Text>{name}</Text>,
  };
});

jest.mock('expo-linear-gradient', () => ({
  LinearGradient: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

function resetAppStore() {
  const current = useAppStore.getState() as Record<string, unknown>;
  const fresh = createTestStore().store.getState() as Record<string, unknown>;
  const next = Object.fromEntries(
    Object.keys(current).map(key => [key, typeof current[key] === 'function' ? current[key] : fresh[key]]),
  );
  useAppStore.setState(next as AppStore, true);
}

function buildDevicePhoto(): DiaryPhoto {
  return {
    id: 'device-photo-p4',
    title: '素材照片P4',
    location: '苏州',
    emoji: '📷',
    color: '#EFE3D5',
    date: '2026.10.15',
    uri: 'file:///device/device-photo-p4.jpg',
    localUri: 'file:///device/device-photo-p4.jpg',
    width: 100,
    height: 120,
    source: 'device',
  };
}

async function openPhotoTarget(screen: Awaited<ReturnType<typeof render>>, diaryTitle: string) {
  await act(async () => {
    fireEvent.press(screen.getByLabelText('预览素材照片P4'));
  });
  await waitFor(() => expect(screen.getByLabelText('用于日记')).toBeTruthy());

  await act(async () => {
    fireEvent.press(screen.getByLabelText('用于日记'));
  });
  await waitFor(() => expect(screen.getByText('添加到哪篇日记？')).toBeTruthy());

  await act(async () => {
    fireEvent.press(screen.getByText(diaryTitle));
  });
}

describe('Library screen apply material photo to diary', () => {
  beforeEach(() => {
    resetAppStore();
    jest.clearAllMocks();
    useAppStore.setState({ materialPhotoIds: [] });
    useAppStore.getState().registerPhotos([buildDevicePhoto()]);
    useAppStore.getState().addMaterialPhoto('device-photo-p4');
  });

  test('adds the material URI photo to the target first block and edit draft', async () => {
    const initialDiaries = useAppStore.getState().diaries;
    const target = initialDiaries[0];
    const otherDiary = initialDiaries[1];
    if (!target || !otherDiary) throw new Error('missing diary fixtures');
    const firstTextBlock = target.blocks.find(block => block.type === 'text');
    if (!firstTextBlock || firstTextBlock.type !== 'text') throw new Error('missing target text block');
      const beginEdit = jest.spyOn(useAppStore.getState(), 'beginEdit');
      const setDraftBlockPhotos = jest.spyOn(useAppStore.getState(), 'setDraftBlockPhotos');

    const screen = await render(<LibraryScreen />);
    await openPhotoTarget(screen, target.title);

      expect(beginEdit).toHaveBeenCalledWith(target.id);
      expect(setDraftBlockPhotos).toHaveBeenCalled();
    expect(mockRouter.push).toHaveBeenCalledWith({
      pathname: '/diary/[id]/edit',
      params: { id: target.id, draftId: expect.any(String) },
    });

    const draftId = useAppStore.getState().activeDraftId;
    const draft = draftId ? useAppStore.getState().drafts[draftId] : undefined;
    expect(draft?.sourceDiaryId).toBe(target.id);
    expect(draft?.diary.blocks.find(block => block.id === firstTextBlock.id)).toMatchObject({
      type: 'text',
      photoIds: [...(firstTextBlock.photoIds ?? []), 'device-photo-p4'],
    });
    expect(draft?.selectedPhotoIds).toEqual([...target.photoIds, 'device-photo-p4']);
    expect(draft?.diary.photoIds).toEqual([...target.photoIds, 'device-photo-p4']);
    expect(useAppStore.getState().diaries[0]).toEqual(target);
    expect(useAppStore.getState().diaries[1]).toEqual(otherDiary);
  });

  test('appends to the current draft references without restoring saved content', async () => {
    const target = useAppStore.getState().diaries[0];
    if (!target) throw new Error('missing diary fixture');
    const savedFirstTextBlock = target.blocks.find(block => block.type === 'text');
    if (!savedFirstTextBlock || savedFirstTextBlock.type !== 'text') {
      throw new Error('missing target text block');
    }

    const existingDraftId = useAppStore.getState().beginEdit(target.id);
    if (!existingDraftId) throw new Error('could not begin editing target');
    useAppStore.getState().updateDraft(existingDraftId, {
      title: '未保存标题',
      summary: '未保存摘要',
    });
    useAppStore.getState().updateDraftBlock(existingDraftId, savedFirstTextBlock.id, '未保存正文');
    useAppStore.getState().setDraftBlockPhotos(existingDraftId, savedFirstTextBlock.id, ['photo-3']);
      const draftBeforeApplication = useAppStore.getState().drafts[existingDraftId]?.diary;
      if (!draftBeforeApplication) throw new Error('missing edited draft snapshot');

    const screen = await render(<LibraryScreen />);
    await openPhotoTarget(screen, target.title);

    const draft = useAppStore.getState().drafts[existingDraftId];
    const currentFirstTextBlock = draft.diary.blocks.find(block => block.id === savedFirstTextBlock.id);
    expect(useAppStore.getState().activeDraftId).toBe(existingDraftId);
      expect(draft.diary).toMatchObject({
        title: draftBeforeApplication.title,
        summary: draftBeforeApplication.summary,
      });
    expect(currentFirstTextBlock).toMatchObject({
      type: 'text',
      content: '未保存正文',
      photoIds: ['photo-3', 'device-photo-p4'],
    });
    expect(draft.selectedPhotoIds).toContain('device-photo-p4');
    expect(useAppStore.getState().diaries[0]).toEqual(target);
    expect(mockRouter.push).toHaveBeenCalledWith({
      pathname: '/diary/[id]/edit',
      params: { id: target.id, draftId: existingDraftId },
    });
  });

  test('discarding a material-photo edit draft leaves both saved diaries unchanged', async () => {
    const [target, otherDiary] = useAppStore.getState().diaries;
    if (!target || !otherDiary) throw new Error('missing diary fixtures');
    const initialDiaries = useAppStore.getState().diaries;
    const screen = await render(<LibraryScreen />);
    await openPhotoTarget(screen, target.title);

    const draftId = useAppStore.getState().activeDraftId;
    expect(draftId).toBeTruthy();
    expect(useAppStore.getState().drafts[draftId!]?.selectedPhotoIds).toContain('device-photo-p4');

    await act(async () => {
      useAppStore.getState().discardDraft(draftId!);
    });

    expect(useAppStore.getState().drafts[draftId!]).toBeUndefined();
    expect(useAppStore.getState().diaries).toEqual(initialDiaries);
  });

  test('does not create an edit draft when the target has no text block', async () => {
    const [target, otherDiary] = useAppStore.getState().diaries;
    if (!target || !otherDiary) throw new Error('missing diary fixtures');
    const initialDrafts = useAppStore.getState().drafts;
    const diariesWithoutText = useAppStore.getState().diaries.map(diary =>
      diary.id === target.id
        ? { ...diary, blocks: diary.blocks.filter(block => block.type !== 'text') }
        : diary,
    );
    useAppStore.setState({ diaries: diariesWithoutText });

    const screen = await render(<LibraryScreen />);
    await openPhotoTarget(screen, target.title);

    expect(useAppStore.getState().drafts).toEqual(initialDrafts);
    expect(useAppStore.getState().diaries[0]?.photoIds).toEqual(target.photoIds);
    expect(useAppStore.getState().diaries.find(diary => diary.id === otherDiary.id)).toEqual(otherDiary);
    expect(mockRouter.push).not.toHaveBeenCalled();
  });

  test('does not create an edit draft when the material photo is no longer registered', async () => {
    const [target, otherDiary] = useAppStore.getState().diaries;
    if (!target || !otherDiary) throw new Error('missing diary fixtures');
    const initialDrafts = useAppStore.getState().drafts;
    const initialDiaries = useAppStore.getState().diaries;
    const screen = await render(<LibraryScreen />);

    await act(async () => {
      fireEvent.press(screen.getByLabelText('预览素材照片P4'));
    });
    await waitFor(() => expect(screen.getByLabelText('用于日记')).toBeTruthy());
    await act(async () => {
      fireEvent.press(screen.getByLabelText('用于日记'));
    });
    await waitFor(() => expect(screen.getByText('添加到哪篇日记？')).toBeTruthy());

    await act(async () => {
      useAppStore.setState(state => ({
        photos: state.photos.filter(photo => photo.id !== 'device-photo-p4'),
      }));
    });

    await act(async () => {
      fireEvent.press(screen.getByText(target.title));
    });

    expect(useAppStore.getState().drafts).toEqual(initialDrafts);
    expect(useAppStore.getState().diaries).toEqual(initialDiaries);
    expect(mockRouter.push).not.toHaveBeenCalled();
  });

  test('reapplying the same material photo reuses the edit draft without duplicate references', async () => {
    const target = useAppStore.getState().diaries[0];
    if (!target) throw new Error('missing diary fixture');
    const firstTextBlock = target.blocks.find(block => block.type === 'text');
    if (!firstTextBlock || firstTextBlock.type !== 'text') throw new Error('missing target text block');

    const screen = await render(<LibraryScreen />);
    await openPhotoTarget(screen, target.title);
    const firstDraftId = useAppStore.getState().activeDraftId;

    await openPhotoTarget(screen, target.title);

    const draftId = useAppStore.getState().activeDraftId;
    const draft = draftId ? useAppStore.getState().drafts[draftId] : undefined;
    const textBlock = draft?.diary.blocks.find(block => block.id === firstTextBlock.id);
    expect(draftId).toBe(firstDraftId);
    expect(textBlock && 'photoIds' in textBlock ? textBlock.photoIds?.filter(id => id === 'device-photo-p4') : []).toEqual(['device-photo-p4']);
    expect(draft?.selectedPhotoIds.filter(id => id === 'device-photo-p4')).toHaveLength(1);
    expect(mockRouter.push).toHaveBeenCalledTimes(2);
  });
});
