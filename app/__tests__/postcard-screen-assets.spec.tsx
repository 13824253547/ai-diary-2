import React from 'react';
import { act, fireEvent, render, waitFor } from '@testing-library/react-native';
import PostcardScreen from '../postcard';
import { capturePostcard, discardPostcard, savePostcard, sharePostcard } from '../../src/services/postcard-export';
import { createTestStore } from '../../src/test-utils/create-test-store';
import { cityStampCatalogCities, getVisitedCityStampIds } from '../../src/components/library/city-stamp-catalog';
import { art } from '../../src/theme/assets';
import { useAppStore } from '../../src/store/use-app-store';
import type { AppStore } from '../../src/store/use-app-store';
import type { DiaryPhoto } from '../../src/types/diary';
import { getPostcardStampPosition, postcardStampPlacements } from '../../src/services/postcard-composition';
import { createPostcardMessageHandoff } from '../../src/services/postcard-message-handoff';
import { StyleSheet } from 'react-native';

const mockRouter = {
  push: jest.fn(),
  back: jest.fn(),
};
const mockRequestAIConsent = jest.fn();
const mockGeneratePostcardMessage = jest.fn();

let mockPhotoId: string | undefined;
let mockDecoration: string | undefined;
let mockStickerId: string | undefined;
let mockCityStampId: string | undefined;
let mockStampPlacement: string | undefined;
let mockMessageToken: string | undefined;

jest.mock('expo-router', () => ({
  useRouter: () => mockRouter,
  useLocalSearchParams: () => ({
    photoId: mockPhotoId,
    decoration: mockDecoration,
    stickerId: mockStickerId,
    cityStampId: mockCityStampId,
    stampPlacement: mockStampPlacement,
    messageToken: mockMessageToken,
  }),
}));

jest.mock('../../src/services/postcard-export', () => ({
  capturePostcard: jest.fn(),
  discardPostcard: jest.fn(),
  savePostcard: jest.fn(),
  sharePostcard: jest.fn(),
}));

jest.mock('../../src/services/ai-consent', () => ({
  requestAIConsent: (...args: unknown[]) => mockRequestAIConsent(...args),
}));

jest.mock('../../src/services/postcard-message-api', () => ({
  generatePostcardMessage: (...args: unknown[]) => mockGeneratePostcardMessage(...args),
}));

jest.mock('../../src/components/layout/screen', () => ({
  Screen: ({ children, header }: { children: React.ReactNode; header?: React.ReactNode }) => {
    const { View: MockView } = require('react-native');
    return <MockView>{header}{children}</MockView>;
  },
}));

jest.mock('../../src/components/common/bottom-sheet', () => ({
  BottomSheet: () => null,
}));

jest.mock('@expo/vector-icons', () => {
  const { Text } = require('react-native');
  return {
    Ionicons: ({ name }: { name: string }) => <Text>{name}</Text>,
  };
});

jest.mock('react-native-svg', () => {
  const React = require('react');
  const { Text, View } = require('react-native');
  return {
    __esModule: true,
    default: ({ children, ...props }: { children: React.ReactNode }) => React.createElement(View, props, children),
    Circle: () => null,
    Defs: () => null,
    Path: () => null,
    TextPath: ({ children }: { children: React.ReactNode }) => children,
    Text: ({ children }: { children: React.ReactNode }) => React.createElement(Text, null, children),
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

function buildDevicePhoto(): DiaryPhoto {
  return {
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
  };
}

describe('Postcard screen material assets', () => {
  beforeEach(() => {
    resetAppStore();
    jest.clearAllMocks();
    mockRequestAIConsent.mockResolvedValue(true);
    mockGeneratePostcardMessage.mockResolvedValue('海风轻吻落日');
    mockPhotoId = 'device-photo-p1';
    mockDecoration = undefined;
    mockStickerId = undefined;
    mockCityStampId = undefined;
    mockStampPlacement = undefined;
    mockMessageToken = undefined;
    useAppStore.getState().registerPhotos([buildDevicePhoto()]);
    jest.mocked(capturePostcard).mockResolvedValue('file:///cache/postcard.png');
    jest.mocked(sharePostcard).mockResolvedValue('opened');
    jest.mocked(savePostcard).mockResolvedValue('saved');
    jest.mocked(discardPostcard).mockResolvedValue();
  });

  test('renders a registered device photo as the postcard image', async () => {
    const screen = await render(<PostcardScreen />);

    await waitFor(() => {
      expect(screen.getByText('苏州')).toBeTruthy();
      expect(screen.getByTestId('postcard-message').props.children).toBe('海风轻吻落日');
      expect(screen.queryByText('2026.10.15')).toBeNull();
      expect(screen.getByTestId('postcard-photo').props.source).toEqual({
        uri: 'file:///device/device-p1.jpg',
      });
    });
    expect(screen.queryByTestId('postcard-decoration')).toBeNull();
  });

  test('generates the greeting from the selected material and place, and uses the full width without a sticker', async () => {
    const screen = await render(<PostcardScreen />);

    await waitFor(() => expect(mockGeneratePostcardMessage).toHaveBeenCalledWith(
      'device-photo-p1',
      '苏州',
      expect.any(AbortSignal),
    ));
    expect(mockRequestAIConsent).toHaveBeenCalledWith('postcard', expect.any(AbortSignal));
    expect(screen.getByTestId('postcard-message').props.children).toBe('海风轻吻落日');
    expect(StyleSheet.flatten(screen.getByTestId('postcard-message-container').props.style).marginRight).toBe(0);
    expect(screen.queryByText('把这段真实回忆，')).toBeNull();
  });

  test('uses the selection-page greeting handoff without prompting or generating again', async () => {
    mockMessageToken = createPostcardMessageHandoff('device-photo-p1', '苏州', '苏州晚风正好');
    const screen = await render(<PostcardScreen />);

    await waitFor(() => {
      expect(screen.getByTestId('postcard-message').props.children).toBe('苏州晚风正好');
    });
    expect(mockRequestAIConsent).not.toHaveBeenCalled();
    expect(mockGeneratePostcardMessage).not.toHaveBeenCalled();
  });

  test('reserves the sticker area and blocks export until the greeting authorization is granted', async () => {
    mockStickerId = 'stickerCool';
    const screenWithSticker = await render(<PostcardScreen />);
    expect(StyleSheet.flatten(screenWithSticker.getByTestId('postcard-message-container').props.style).marginRight).toBe(66);
    await screenWithSticker.unmount();

    resetAppStore();
    useAppStore.getState().registerPhotos([buildDevicePhoto()]);
    mockGeneratePostcardMessage.mockClear();
    mockRequestAIConsent.mockResolvedValue(false);
    const refused = await render(<PostcardScreen />);
    await waitFor(() => expect(refused.getByText('请先授权生成寄语')).toBeTruthy());
    expect(mockGeneratePostcardMessage).not.toHaveBeenCalled();
    expect(refused.getByLabelText('分享明信片').props.accessibilityState.disabled).toBe(true);
    expect(refused.getByLabelText('保存到相册').props.accessibilityState.disabled).toBe(true);
  });

  test('does not let a late greeting for the previous photo replace the current greeting', async () => {
    const completions = new Map<string, (value: string) => void>();
    mockGeneratePostcardMessage.mockImplementation((photoId: string) => new Promise(resolve => {
      completions.set(photoId, resolve);
    }));
    const screen = await render(<PostcardScreen />);
    await waitFor(() => expect(completions.has('device-photo-p1')).toBe(true));

    const next = {
      ...buildDevicePhoto(),
      id: 'device-photo-p2',
      location: '杭州',
      uri: 'file:///device/device-p2.jpg',
      localUri: 'file:///device/device-p2.jpg',
    };
    useAppStore.getState().registerPhotos([next]);
    mockPhotoId = next.id;
    screen.rerender(<PostcardScreen />);
    await waitFor(() => expect(completions.has('device-photo-p2')).toBe(true));

    await act(async () => { completions.get('device-photo-p2')?.('西湖晚风'); });
    await waitFor(() => expect(screen.getByTestId('postcard-message').props.children).toBe('西湖晚风'));
    await act(async () => { completions.get('device-photo-p1')?.('旧照片寄语'); });
    expect(screen.getByTestId('postcard-message').props.children).toBe('西湖晚风');
    expect(screen.getByLabelText('分享明信片').props.accessibilityState.disabled).toBe(true);
  });

  test('shows generation failure without using a fixed greeting or allowing export', async () => {
    mockGeneratePostcardMessage.mockRejectedValue(new Error('provider unavailable'));
    const screen = await render(<PostcardScreen />);

    await waitFor(() => expect(screen.getByTestId('postcard-message').props.children).toBe('寄语生成失败'));
    expect(screen.getByText('寄语暂时无法生成，请重新进入明信片后重试。')).toBeTruthy();
    expect(screen.queryByText('把这段真实回忆，')).toBeNull();
    expect(screen.getByLabelText('分享明信片').props.accessibilityState.disabled).toBe(true);
    expect(screen.getByLabelText('保存到相册').props.accessibilityState.disabled).toBe(true);
  });

  test('renders the selected city decoration as an SVG stamp', async () => {
    mockDecoration = 'stampKyoto';
    const screen = await render(<PostcardScreen />);

    await waitFor(() => {
      expect(screen.getByTestId('postcard-decoration')).toBeTruthy();
      expect(screen.getByText('京都')).toBeTruthy();
    });
  });

  test('renders a city stamp from the bundled catalog ID', async () => {
    const city = cityStampCatalogCities[0];
    expect(city).toBeDefined();
    if (!city) return;
    mockDecoration = city.id;

    const screen = await render(<PostcardScreen />);

    await waitFor(() => {
      expect(screen.getByTestId('postcard-decoration')).toBeTruthy();
      expect(screen.getByText(city.cityName)).toBeTruthy();
      expect(screen.getByText(`${city.areaNameEn} · ${city.serial}`)).toBeTruthy();
    });
  });

  test('renders photo, sticker and unlocked city stamp together and opens the separate application page', async () => {
    const diary = useAppStore.getState().diaries[0];
    if (!diary) throw new Error('expected a saved diary fixture');
    const visitedDiary = { ...diary, status: 'ready' as const, location: '京都' };
    useAppStore.setState({ diaries: [visitedDiary] });
    const [cityStampId] = getVisitedCityStampIds([visitedDiary]);
    mockStickerId = 'stickerCool';
    mockCityStampId = cityStampId;
    const screen = await render(<PostcardScreen />);

    expect(screen.getByTestId('postcard-photo').props.source).toEqual({
      uri: 'file:///device/device-p1.jpg',
    });
    expect(screen.getByTestId('postcard-sticker').props.source).toBe(art.stickerCool);
    expect(screen.getByTestId('postcard-city-stamp')).toBeTruthy();
    expect(screen.getByText('京都')).toBeTruthy();

    fireEvent.press(screen.getByLabelText('编辑素材'));
    expect(mockRouter.push).toHaveBeenCalledWith({
      pathname: '/postcard/apply',
      params: {
        photoId: 'device-photo-p1',
        stickerId: 'stickerCool',
        cityStampId,
        stampPlacement: expect.stringMatching(/^v2:/),
      },
    });

  });

  test('holds the stamp placement stable on rerender and allows different safe placements', async () => {
    mockDecoration = 'stampKyoto';
    mockStampPlacement = '1';
    const screen = await render(<PostcardScreen />);
    const initial = StyleSheet.flatten(screen.getByTestId('postcard-decoration').props.style);
    expect(initial.top).toBe(postcardStampPlacements[1].top);
    expect(initial.right).toBe(postcardStampPlacements[1].right);
    await screen.rerender(<PostcardScreen />);
    expect(StyleSheet.flatten(screen.getByTestId('postcard-decoration').props.style)).toEqual(initial);
    mockStampPlacement = '3';
    await screen.rerender(<PostcardScreen />);
    expect(StyleSheet.flatten(screen.getByTestId('postcard-decoration').props.style).top).toBe(postcardStampPlacements[3].top);
  });

  test('does not render a city stamp that is not unlocked for a new composition', async () => {
    mockCityStampId = 'stampKyoto';
    expect(useAppStore.getState().photos.some(photo => photo.id === mockPhotoId)).toBe(true);
    const screen = await render(<PostcardScreen />);

    expect(screen.getByTestId('postcard-photo')).toBeTruthy();
    expect(screen.queryByTestId('postcard-city-stamp')).toBeNull();
    expect(screen.queryByTestId('postcard-decoration')).toBeNull();
  });

  test('uses measured width and keeps a continuous placement unchanged during sharing and saving', async () => {
    mockDecoration = 'stampKyoto';
    mockStampPlacement = 'v2:430:640:-13';
    const screen = await render(<PostcardScreen />);
    await act(async () => { fireEvent(screen.getByTestId('postcard-photo'), 'load'); });
    expect(screen.getByLabelText('分享明信片').props.accessibilityState.disabled).toBe(true);
    await act(async () => { fireEvent.press(screen.getByLabelText('分享明信片')); });
    expect(capturePostcard).not.toHaveBeenCalled();
    await act(async () => { fireEvent(screen.getByTestId('postcard-photo'), 'layout', {
      nativeEvent: { layout: { width: 320, height: 280, x: 0, y: 0 } },
    }); });
    const position = () => StyleSheet.flatten(screen.getByTestId('postcard-decoration').props.style);
    const initial = position();
    expect(initial).toMatchObject(getPostcardStampPosition(mockStampPlacement, 320, true));
    expect(screen.getByLabelText('分享明信片').props.accessibilityState.disabled).toBe(false);
    await act(async () => { fireEvent.press(screen.getByLabelText('分享明信片')); });
    await waitFor(() => expect(sharePostcard).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(screen.getByLabelText('保存到相册').props.accessibilityState.disabled).toBe(false));
    expect(position()).toEqual(initial);
    await act(async () => { fireEvent.press(screen.getByLabelText('保存到相册')); });
    await waitFor(() => expect(savePostcard).toHaveBeenCalledTimes(1));
    expect(position()).toEqual(initial);
    await screen.rerender(<PostcardScreen />);
    expect(position()).toEqual(initial);
    await act(async () => { fireEvent.press(screen.getByLabelText('编辑素材')); });
    expect(mockRouter.push).toHaveBeenLastCalledWith({
      pathname: '/postcard/apply',
      params: { photoId: mockPhotoId, cityStampId: 'stampKyoto', stampPlacement: mockStampPlacement },
    });
  });

  test('discards an in-flight capture when the photo layout changes', async () => {
    mockDecoration = 'stampKyoto';
    mockStampPlacement = 'v2:430:640:-13';
    let finishCapture: (uri: string) => void = () => undefined;
    jest.mocked(capturePostcard).mockImplementation(() => new Promise(resolve => { finishCapture = resolve; }));
    const screen = await render(<PostcardScreen />);
    await act(async () => { fireEvent(screen.getByTestId('postcard-photo'), 'layout', {
      nativeEvent: { layout: { width: 320, height: 280, x: 0, y: 0 } },
    }); });
    await act(async () => { fireEvent(screen.getByTestId('postcard-photo'), 'load'); });
    await act(async () => { fireEvent.press(screen.getByLabelText('分享明信片')); });
    await waitFor(() => expect(capturePostcard).toHaveBeenCalledTimes(1));
    await act(async () => { fireEvent(screen.getByTestId('postcard-photo'), 'layout', {
      nativeEvent: { layout: { width: 280, height: 280, x: 0, y: 0 } },
    }); });
    await act(async () => { finishCapture('file:///cache/postcard.png'); });
    await waitFor(() => expect(discardPostcard).toHaveBeenCalledWith('file:///cache/postcard.png'));
    expect(sharePostcard).not.toHaveBeenCalled();
  });

  test('shows an empty state instead of decoration-only content without a selected device photo', async () => {
    mockPhotoId = undefined;
    mockDecoration = 'stampKyoto';

    const screen = await render(<PostcardScreen />);

    expect(screen.getByText('请选择真实照片')).toBeTruthy();
    expect(screen.getByLabelText('应用明信片素材')).toBeTruthy();
    expect(screen.queryByTestId('postcard-photo')).toBeNull();
    expect(screen.queryByTestId('postcard-decoration')).toBeNull();
  });

  test('shares only after the current photo loads and disposes the temporary card', async () => {
    const screen = await render(<PostcardScreen />);
    expect(screen.getByLabelText('分享明信片').props.accessibilityState.disabled).toBe(true);
    fireEvent(screen.getByTestId('postcard-photo'), 'load');
    await waitFor(() => expect(screen.getByLabelText('分享明信片').props.accessibilityState.disabled).toBe(false));
    fireEvent.press(screen.getByLabelText('分享明信片'));
    await waitFor(() => {
      expect(capturePostcard).toHaveBeenCalledTimes(1);
      expect(sharePostcard).toHaveBeenCalledWith('file:///cache/postcard.png');
      expect(discardPostcard).toHaveBeenCalledWith('file:///cache/postcard.png');
    });
    expect(screen.queryByText('分享成功')).toBeNull();
  });

  test('saves the rendered card and reports permission denial without a false success', async () => {
    jest.mocked(savePostcard).mockResolvedValue('permission_denied');
    const screen = await render(<PostcardScreen />);
    fireEvent(screen.getByTestId('postcard-photo'), 'load');
    await waitFor(() => expect(screen.getByLabelText('保存到相册').props.accessibilityState.disabled).toBe(false));
    fireEvent.press(screen.getByLabelText('保存到相册'));
    expect(await screen.findByText('请允许保存图片到系统相册后重试。')).toBeTruthy();
    expect(discardPostcard).toHaveBeenCalledWith('file:///cache/postcard.png');
  });

  test('reads authenticated generated images without inventing a location stamp', async () => {
    const generated = { ...buildDevicePhoto(), id: 'generated-p1', source: 'generated' as const,
      location: '', date: '未知日期', localUri: undefined, uri: 'https://example.com/photo',
      remoteHeaders: { Authorization: 'Bearer test' } };
    useAppStore.getState().registerPhotos([generated]);
    mockPhotoId = generated.id;
    const screen = await render(<PostcardScreen />);
    expect(screen.getByTestId('postcard-photo').props.source).toEqual({
      uri: generated.uri, headers: generated.remoteHeaders,
    });
    expect(screen.queryByText('未知日期')).toBeNull();
    expect(screen.getByTestId('postcard-ai-label')).toBeTruthy();
    expect(screen.getByText('已使用AI生成配图，导出图片保留标识')).toBeTruthy();
    expect(screen.queryByText('已使用当前选择的真实照片')).toBeNull();
    fireEvent(screen.getByTestId('postcard-photo'), 'load');
    await waitFor(() => expect(screen.getByLabelText('分享明信片').props.accessibilityState.disabled).toBe(false));
    await act(async () => { fireEvent.press(screen.getByLabelText('分享明信片')); });
    await waitFor(() => expect(capturePostcard).toHaveBeenCalledWith(
      expect.anything(), expect.stringMatching(/^postcard/),
    ));
    expect(sharePostcard).toHaveBeenCalledWith('file:///cache/postcard.png');
    await waitFor(() => expect(screen.getByLabelText('分享明信片').props.accessibilityState.disabled).toBe(false));
  });

  test('does not share a stale capture after the selected photo changes', async () => {
    let finishCapture: (uri: string) => void = () => undefined;
    jest.mocked(capturePostcard).mockImplementation(() => new Promise(resolve => {
      finishCapture = resolve;
    }));
    const screen = await render(<PostcardScreen />);
    fireEvent(screen.getByTestId('postcard-photo'), 'load');
    await waitFor(() => expect(screen.getByLabelText('分享明信片').props.accessibilityState.disabled).toBe(false));
    fireEvent.press(screen.getByLabelText('分享明信片'));
    await waitFor(() => expect(capturePostcard).toHaveBeenCalledTimes(1));

    const next = { ...buildDevicePhoto(), id: 'device-photo-p2', uri: 'file:///device/device-p2.jpg',
      localUri: 'file:///device/device-p2.jpg' };
    useAppStore.getState().registerPhotos([next]);
    mockPhotoId = next.id;
    screen.rerender(<PostcardScreen />);
    await waitFor(() => expect(screen.getByTestId('postcard-photo').props.source).toEqual({
      uri: 'file:///device/device-p2.jpg',
    }));
    finishCapture('file:///cache/postcard.png');
    await waitFor(() => expect(discardPostcard).toHaveBeenCalledWith('file:///cache/postcard.png'));
    expect(sharePostcard).not.toHaveBeenCalled();
  });

  test('does not open system sharing after leaving the postcard page', async () => {
    let finishCapture: (uri: string) => void = () => undefined;
    jest.mocked(capturePostcard).mockImplementation(() => new Promise(resolve => {
      finishCapture = resolve;
    }));
    const screen = await render(<PostcardScreen />);
    fireEvent(screen.getByTestId('postcard-photo'), 'load');
    await waitFor(() => expect(screen.getByLabelText('分享明信片').props.accessibilityState.disabled).toBe(false));
    fireEvent.press(screen.getByLabelText('分享明信片'));
    await waitFor(() => expect(capturePostcard).toHaveBeenCalledTimes(1));
    await screen.unmount();
    finishCapture('file:///cache/postcard.png');
    await waitFor(() => expect(discardPostcard).toHaveBeenCalledWith('file:///cache/postcard.png'));
    expect(sharePostcard).not.toHaveBeenCalled();
  });
});
