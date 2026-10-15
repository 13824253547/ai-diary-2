import React from 'react';
import { act, render } from '@testing-library/react-native';
import { DiaryPaper } from '../diary-paper';
import { Photo } from '../photo';
import { appSelectors, useAppStore } from '../../../store/use-app-store';
import type { AppStore } from '../../../store/use-app-store';
import { createTestStore } from '../../../test-utils/create-test-store';

function resetAppStore() {
  const current = useAppStore.getState() as Record<string, unknown>;
  const fresh = createTestStore().store.getState() as Record<string, unknown>;
  const next = Object.fromEntries(
    Object.keys(current).map(key => [key, typeof current[key] === 'function' ? current[key] : fresh[key]]),
  );
  useAppStore.setState(next as AppStore, true);
}

function registerPhoto(id: string, patch: Partial<NonNullable<ReturnType<typeof appSelectors.getPhotoById>>> = {}) {
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
      ...patch,
    },
  ]);
}

describe('Diary photo', () => {
  beforeEach(() => {
    resetAppStore();
  });

  test('shows a readable fallback when the image fails to load', async () => {
    registerPhoto('photo-broken');

    const screen = await render(<Photo id="photo-broken" style={{ width: 120, height: 90 }} />);

    await act(async () => {
      screen.getByTestId('diary-photo-photo-broken').props.onError?.({
        nativeEvent: { error: 'load failed' },
      });
    });

    expect(screen.getByText('图片暂时不可用')).toBeTruthy();
    expect(screen.getByLabelText('图片暂时不可用')).toBeTruthy();
  });

  test('reads a registered non-mock device photo through the shared photo catalog', async () => {
    useAppStore.getState().registerPhotos([
      {
        id: 'device-photo-p1',
        title: '河岸傍晚',
        location: '苏州',
        emoji: '📷',
        color: '#EFE3D5',
        date: '2026.10.15',
        uri: 'file:///device/device-p1.jpg',
        localUri: 'file:///device/device-p1.jpg',
        width: 100,
        height: 120,
        source: 'device',
      },
    ]);

    const screen = await render(<Photo id="device-photo-p1" style={{ width: 120, height: 90 }} />);

    expect(screen.getByTestId('diary-photo-device-photo-p1').props.source).toEqual({
      uri: 'file:///device/device-p1.jpg',
    });
  });

  test('keeps diary text visible when an inline photo becomes unreadable', async () => {
    registerPhoto('photo-inline-broken');
    const seedDiary = useAppStore.getState().diaries[0];
    const diary = {
      ...seedDiary,
      id: 'diary-inline-photo-test',
      title: '图片失效时正文仍然保留',
      summary: '坏图不应该把整篇内容变成空白。',
      coverPhotoId: 'photo-2',
      photoIds: ['photo-2', 'photo-inline-broken'],
      blocks: [
        {
          id: 'body-1',
          type: 'text' as const,
          title: '正文还在',
          content: '即使配图失效，正文也应该继续显示。',
          photoIds: ['photo-inline-broken'],
        },
        {
          id: 'quote-1',
          type: 'quote' as const,
          content: '图片坏了，内容也不能丢。',
          relatedBlockId: 'body-1',
        },
      ],
    };

    const screen = await render(<DiaryPaper diary={diary} />);

    await act(async () => {
      screen.getByTestId('diary-photo-photo-inline-broken').props.onError?.({
        nativeEvent: { error: 'load failed' },
      });
    });

    expect(screen.getByText('即使配图失效，正文也应该继续显示。')).toBeTruthy();
    expect(screen.getByText(/图片坏了，内容也不能丢/)).toBeTruthy();
    expect(screen.getByText('图片暂时不可用')).toBeTruthy();
  });

  test('aligns anonymous face masks for a wide cropped photo', async () => {
    registerPhoto('photo-anonymous-wide', {
      image: undefined,
      width: 100,
      height: 100,
      faceRects: [{ x: 0.1, y: 0.2, width: 0.3, height: 0.4 }],
    });

    const screen = await render(<Photo id="photo-anonymous-wide" anonymous style={{ width: 200, height: 100 }} />);

    await act(async () => {
      screen.getByTestId('diary-photo-photo-anonymous-wide').parent?.props.onLayout?.({
        nativeEvent: { layout: { width: 200, height: 100 } },
      });
    });

    const mask = screen.getByLabelText('人物已匿名遮挡');
    expect(mask.props.style).toMatchObject({
      left: 20,
      top: -10,
      width: 60,
      height: 80,
    });
  });

  test('realigns anonymous face masks when the crop size changes', async () => {
    registerPhoto('photo-anonymous-tall', {
      image: undefined,
      width: 100,
      height: 100,
      faceRects: [{ x: 0.25, y: 0.1, width: 0.2, height: 0.3 }],
    });

    const screen = await render(<Photo id="photo-anonymous-tall" anonymous style={{ width: 100, height: 200 }} />);

    await act(async () => {
      screen.getByTestId('diary-photo-photo-anonymous-tall').parent?.props.onLayout?.({
        nativeEvent: { layout: { width: 100, height: 200 } },
      });
    });

    const mask = screen.getByLabelText('人物已匿名遮挡');
    expect(mask.props.style).toMatchObject({
      left: 0,
      top: 20,
      width: 40,
      height: 60,
    });
  });
});
