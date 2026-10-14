import React from 'react';
import { StyleSheet } from 'react-native';
import { render } from '@testing-library/react-native';
import { DiaryPaper } from '../diary-paper';
import { appSelectors, useAppStore } from '../../../store/use-app-store';
import type { AppStore } from '../../../store/use-app-store';
import { createTestStore } from '../../../test-utils/create-test-store';
import type { DiaryItem } from '../../../types/diary';

function resetAppStore() {
  const current = useAppStore.getState() as Record<string, unknown>;
  const fresh = createTestStore().store.getState() as Record<string, unknown>;
  const next = Object.fromEntries(
    Object.keys(current).map(key => [key, typeof current[key] === 'function' ? current[key] : fresh[key]]),
  );
  useAppStore.setState(next as AppStore, true);
}

function registerPhoto(id: string) {
  const seed = appSelectors.getPhotoById('photo-1');
  if (!seed) throw new Error('missing seed photo');
  useAppStore.getState().registerPhotos([
    {
      ...seed,
      id,
      localUri: `file://${id}.jpg`,
      uri: `file://${id}.jpg`,
      width: seed.width ?? 120,
      height: seed.height ?? 120,
    },
  ]);
}

function buildDiary(characterId: DiaryItem['characterId'], id: string): DiaryItem {
  const seedDiary = useAppStore.getState().diaries[0];
  return {
    ...seedDiary,
    id,
    characterId,
    title: '同一篇内容的布局验证',
    location: '杭州',
    date: '2026.10.14',
    summary: '三种角色都应该读到同一批已保存内容。',
    coverPhotoId: 'photo-layout-cover',
    photoIds: ['photo-layout-cover', 'photo-layout-inline'],
    blocks: [
      {
        id: `${id}-body`,
        type: 'text',
        title: '正文',
        content: '角色只影响布局，不应该改写这篇日记的正文内容。',
        photoIds: ['photo-layout-inline'],
      },
      {
        id: `${id}-quote`,
        type: 'quote',
        content: '同一篇作品的引用句也必须保持一致。',
        relatedBlockId: `${id}-body`,
      },
    ],
  };
}

describe('Diary paper layout', () => {
  beforeEach(() => {
    resetAppStore();
    registerPhoto('photo-layout-cover');
    registerPhoto('photo-layout-inline');
  });

  test('switches layout styles by character while keeping the saved content unchanged', async () => {
    const blueDiary = buildDiary('character-blue', 'diary-paper-blue');
    const greenDiary = buildDiary('character-green', 'diary-paper-green');
    const brownDiary = buildDiary('character-brown', 'diary-paper-brown');

    const blueScreen = await render(<DiaryPaper diary={blueDiary} />);
    const greenScreen = await render(<DiaryPaper diary={greenDiary} />);
    const brownScreen = await render(<DiaryPaper diary={brownDiary} />);

    for (const [screen, diary] of [
      [blueScreen, blueDiary],
      [greenScreen, greenDiary],
      [brownScreen, brownDiary],
    ] as const) {
      expect(screen.getByText(/同一篇内容的布局验证/)).toBeTruthy();
      expect(screen.getByText(/角色只影响布局，不应该改写这篇日记的正文内容/)).toBeTruthy();
      expect(screen.getByText(/同一篇作品的引用句也必须保持一致/)).toBeTruthy();
      expect(screen.getByTestId(`diary-photo-${diary.coverPhotoId}`)).toBeTruthy();
      expect(screen.getByTestId('diary-photo-photo-layout-inline')).toBeTruthy();
    }

    expect(StyleSheet.flatten(blueScreen.getByTestId('diary-paper-diary-paper-blue').props.style)).toMatchObject({
      padding: 6,
      gap: 16,
    });
    expect(StyleSheet.flatten(blueScreen.getByTestId('diary-row-diary-paper-blue-body').props.style)).toMatchObject({
      flexDirection: 'row',
      gap: 18,
    });

    expect(StyleSheet.flatten(greenScreen.getByTestId('diary-paper-diary-paper-green').props.style)).toMatchObject({
      borderWidth: 1,
      backgroundColor: '#FFF9ED',
      padding: 16,
    });
    expect(StyleSheet.flatten(greenScreen.getByTestId('diary-row-diary-paper-green-body').props.style)).toMatchObject({
      flexDirection: 'column',
      gap: 14,
    });

    expect(StyleSheet.flatten(brownScreen.getByTestId('diary-paper-diary-paper-brown').props.style)).toMatchObject({
      backgroundColor: '#F3F3ED',
      padding: 14,
    });
    expect(StyleSheet.flatten(brownScreen.getByTestId('diary-title-diary-paper-brown').props.style)).toMatchObject({
      fontSize: 28,
      fontWeight: '400',
    });
    expect(
      StyleSheet.flatten(brownScreen.getByTestId('diary-hero-frame-diary-paper-brown').props.style).transform,
    ).toEqual([{ rotate: '0deg' }]);
  });
});
