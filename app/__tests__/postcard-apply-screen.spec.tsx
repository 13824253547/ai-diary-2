import React from 'react';
import { act, fireEvent, render, waitFor } from '@testing-library/react-native';
import PostcardApplyScreen from '../postcard/apply';
import { createTestStore } from '../../src/test-utils/create-test-store';
import { cityStampCatalogCities, getCityStampConfig, getVisitedCityStampIds } from '../../src/components/library/city-stamp-catalog';
import { useAppStore } from '../../src/store/use-app-store';
import type { AppStore } from '../../src/store/use-app-store';
import type { DiaryPhoto } from '../../src/types/diary';
import { consumePostcardMessageHandoff } from '../../src/services/postcard-message-handoff';

const mockRouter = { push: jest.fn(), back: jest.fn() };
const mockRequestAIConsent = jest.fn();
const mockGeneratePostcardMessage = jest.fn();
let mockParams: { photoId?: string; stickerId?: string; cityStampId?: string; step?: 'photo' | 'sticker' | 'stamp'; stampPlacement?: string; selectionToken?: string } = {};

jest.mock('expo-router', () => ({
  useRouter: () => mockRouter,
  useLocalSearchParams: () => mockParams,
}));

jest.mock('../../src/services/ai-consent', () => ({
  requestAIConsent: (...args: unknown[]) => mockRequestAIConsent(...args),
}));

jest.mock('../../src/services/postcard-message-api', () => ({
  generatePostcardMessage: (...args: unknown[]) => mockGeneratePostcardMessage(...args),
}));

jest.mock('../../src/components/layout/screen', () => ({
  Screen: ({ children, header, footer }: {
    children: React.ReactNode;
    header?: React.ReactNode;
    footer?: React.ReactNode;
  }) => {
    const { View } = require('react-native');
    return <View><View testID="application-header">{header}</View>{children}<View testID="application-footer">{footer}</View></View>;
  },
}));

jest.mock('../../src/components/common/button', () => ({
  Button: ({ label, onPress, disabled = false, loading = false, loadingLabel }: {
    label: string;
    onPress?: () => void;
    disabled?: boolean;
    loading?: boolean;
    loadingLabel?: string;
  }) => {
    const { ActivityIndicator, Pressable, Text, View } = require('react-native');
    return <Pressable accessibilityRole="button" accessibilityLabel={label} accessibilityState={{ disabled, busy: loading }} disabled={disabled} onPress={onPress}>
      <View>{loading ? <ActivityIndicator accessibilityRole="progressbar" accessibilityLabel={loadingLabel} /> : null}<Text>{label}</Text></View>
    </Pressable>;
  },
}));

jest.mock('@expo/vector-icons', () => ({
  Ionicons: ({ name }: { name: string }) => {
    const { Text } = require('react-native');
    return <Text>{name}</Text>;
  },
}));

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

function buildMaterialPhoto(id: string, source: 'device' | 'generated' = 'device'): DiaryPhoto {
  return {
    id,
    title: id,
    location: '京都',
    emoji: '📷',
    color: '#EFE3D5',
    date: '2026.10.15',
    localUri: `file:///${id}.jpg`,
    uri: `file:///${id}.jpg`,
    width: 100,
    height: 120,
    source,
  };
}

describe('Postcard material application page', () => {
  afterEach(() => jest.restoreAllMocks());

  beforeEach(() => {
    resetAppStore();
    jest.clearAllMocks();
    mockParams = {};
    mockRequestAIConsent.mockResolvedValue(true);
    mockGeneratePostcardMessage.mockResolvedValue('京都午后微风');
    useAppStore.getState().registerPhotos([buildMaterialPhoto('photo-1'), buildMaterialPhoto('photo-2', 'generated')]);
    useAppStore.setState({ materialPhotoIds: ['photo-1', 'photo-2'] });
  });

  test('composes one photo with a replaceable sticker and unlocked city stamp on its own page', async () => {
    const diary = useAppStore.getState().diaries[0];
    if (!diary) throw new Error('expected a saved diary fixture');
    const visitedDiary = { ...diary, status: 'ready' as const, location: '京都' };
    useAppStore.setState({ diaries: [visitedDiary] });
    const [cityStampId] = [...getVisitedCityStampIds([visitedDiary])];
    const city = getCityStampConfig(cityStampId);
    if (!city) throw new Error('expected the Kyoto stamp fixture');
    mockParams = { photoId: 'photo-1' };
    const screen = await render(<PostcardApplyScreen />);

    expect(screen.getByText(/照片：photo-1/)).toBeTruthy();
    expect(screen.queryByText('选择照片后，可再添加一张贴纸和一个已解锁的城市印章。')).toBeNull();
    await act(async () => { fireEvent.press(screen.getByLabelText('下一步')); });
    await act(async () => {
      fireEvent.press(screen.getByLabelText('选择贴纸：开心的小橘'));
    });
    expect(screen.getByText(/贴纸：开心的小橘/)).toBeTruthy();

    await act(async () => {
      fireEvent.press(screen.getByLabelText('选择贴纸：比心小橘'));
    });
    expect(screen.getByText(/贴纸：比心小橘/)).toBeTruthy();
    expect(screen.queryByText(/贴纸：开心的小橘/)).toBeNull();
    await act(async () => { fireEvent.press(screen.getByLabelText('下一步')); });
    await act(async () => { fireEvent.press(screen.getByLabelText(`选择城市印章：${city.cityName}`)); });
    expect(screen.getByText(new RegExp(`印章：${city.cityName}`))).toBeTruthy();

    await act(async () => {
      fireEvent.press(screen.getByLabelText('预览明信片'));
    });
    await waitFor(() => expect(mockRouter.push).toHaveBeenCalled());
    expect(mockRouter.push).toHaveBeenCalledWith({
      pathname: '/postcard',
      params: { photoId: 'photo-1', stickerId: 'stickerLove', cityStampId, stampPlacement: expect.stringMatching(/^v2:/), messageToken: expect.any(String) },
    });
    const messageToken = mockRouter.push.mock.calls.at(-1)?.[0].params.messageToken as string;
    expect(consumePostcardMessageHandoff(messageToken, 'photo-1', '京都')).toBe('京都午后微风');
  });

  test('requires a photo while allowing optional decorations to be removed', async () => {
    const screen = await render(<PostcardApplyScreen />);

    expect(screen.queryByLabelText('选择贴纸：酷酷的小橘')).toBeNull();
    expect(screen.getByLabelText('下一步').props.accessibilityState.disabled).toBe(true);
    await act(async () => {
      fireEvent.press(screen.getByLabelText('下一步'));
    });
    expect(mockRouter.push).not.toHaveBeenCalled();

    await act(async () => {
      fireEvent.press(screen.getByLabelText('选择明信片照片：photo-1'));
    });
    await act(async () => { fireEvent.press(screen.getByLabelText('下一步')); });
    await act(async () => { fireEvent.press(screen.getByLabelText('选择贴纸：酷酷的小橘')); });
    await act(async () => { fireEvent.press(screen.getByLabelText('选择贴纸：酷酷的小橘')); });
    await waitFor(() => expect(screen.getByText(/照片：photo-1/)).toBeTruthy());
    expect(screen.getByText(/贴纸：未选择/)).toBeTruthy();
  });

  test('a sticker entry keeps the sticker selected while adding a photo and city stamp', async () => {
    const diary = useAppStore.getState().diaries[0];
    if (!diary) throw new Error('expected a saved diary fixture');
    const visitedDiary = { ...diary, status: 'ready' as const, location: '京都' };
    useAppStore.setState({ diaries: [visitedDiary] });
    const [cityStampId] = [...getVisitedCityStampIds([visitedDiary])];
    mockParams = { stickerId: 'stickerCool' };
    const screen = await render(<PostcardApplyScreen />);

    expect(screen.getByText(/贴纸：酷酷的小橘/)).toBeTruthy();
    await act(async () => {
      fireEvent.press(screen.getByLabelText('选择明信片照片：photo-2'));
    });
    await act(async () => { fireEvent.press(screen.getByLabelText('下一步')); });
    await act(async () => { fireEvent.press(screen.getByLabelText('下一步')); });
    await act(async () => {
      fireEvent.press(screen.getByLabelText(/选择城市印章：/));
    });
    await act(async () => {
      fireEvent.press(screen.getByLabelText('预览明信片'));
    });

    await waitFor(() => expect(mockRouter.push).toHaveBeenCalled());
    expect(mockRouter.push).toHaveBeenCalledWith({
      pathname: '/postcard',
      params: { photoId: 'photo-2', stickerId: 'stickerCool', cityStampId, stampPlacement: expect.stringMatching(/^v2:/), messageToken: expect.any(String) },
    });
  });

  test('a city stamp entry keeps the stamp selected while adding a photo and sticker', async () => {
    const diary = useAppStore.getState().diaries[0];
    if (!diary) throw new Error('expected a saved diary fixture');
    const visitedDiary = { ...diary, status: 'ready' as const, location: '京都' };
    useAppStore.setState({ diaries: [visitedDiary] });
    const [cityStampId] = [...getVisitedCityStampIds([visitedDiary])];
    mockParams = { cityStampId };
    const screen = await render(<PostcardApplyScreen />);

    expect(screen.getByText(/印章：/)).toBeTruthy();
    await act(async () => {
      fireEvent.press(screen.getByLabelText('选择明信片照片：photo-1'));
    });
    await act(async () => { fireEvent.press(screen.getByLabelText('下一步')); });
    await act(async () => {
      fireEvent.press(screen.getByLabelText('选择贴纸：一起记录'));
    });
    await act(async () => { fireEvent.press(screen.getByLabelText('下一步')); });
    await act(async () => {
      fireEvent.press(screen.getByLabelText('预览明信片'));
    });

    await waitFor(() => expect(mockRouter.push).toHaveBeenCalled());
    expect(mockRouter.push).toHaveBeenCalledWith({
      pathname: '/postcard',
      params: { photoId: 'photo-1', stickerId: 'stickerCamera', cityStampId, stampPlacement: expect.stringMatching(/^v2:/), messageToken: expect.any(String) },
    });
  });

  test('shows no invented city stamps when the device has no unlocked cities', async () => {
    useAppStore.setState({ diaries: [] });
    mockParams = { photoId: 'photo-1', step: 'stamp' };
    const screen = await render(<PostcardApplyScreen />);

    expect(screen.getByText('暂无已解锁的城市印章。')).toBeTruthy();
    expect(screen.queryByLabelText(/选择城市印章：/)).toBeNull();
  });

  test('keeps unlocked stamps beyond the library home preview limit selectable', async () => {
    const diary = useAppStore.getState().diaries[0];
    if (!diary) throw new Error('expected a saved diary fixture');
    const cities = cityStampCatalogCities.slice(0, 4);
    if (cities.length < 4) throw new Error('expected four city catalog fixtures');
    const visitedDiaries = cities.map((city, index) => ({
      ...diary,
      id: `visited-${index}`,
      status: 'ready' as const,
      location: city.cityName,
    }));
    useAppStore.setState({ diaries: visitedDiaries });
    const unlockedIds = [...getVisitedCityStampIds(visitedDiaries)];
    const fourthStamp = getCityStampConfig(unlockedIds[3]);
    if (!fourthStamp) throw new Error('expected a fourth unlocked stamp');

    mockParams = { photoId: 'photo-1', step: 'stamp' };
    const screen = await render(<PostcardApplyScreen />);
    expect(screen.getByLabelText(`选择城市印章：${fourthStamp.cityName}`)).toBeTruthy();
  });

  test('skips optional steps without including previously selected decorations', async () => {
    mockParams = { photoId: 'photo-1', stickerId: 'stickerCool', stampPlacement: '2' };
    const screen = await render(<PostcardApplyScreen />);
    await act(async () => { fireEvent.press(screen.getByLabelText('下一步')); });
    await act(async () => { fireEvent.press(screen.getByLabelText('跳过')); });
    expect(screen.getByText(/贴纸：未选择/)).toBeTruthy();
    await act(async () => { fireEvent.press(screen.getByLabelText('跳过')); });
    await waitFor(() => expect(mockRouter.push).toHaveBeenCalled());
    expect(mockRouter.push).toHaveBeenLastCalledWith({
      pathname: '/postcard',
      params: { photoId: 'photo-1', stampPlacement: '2', messageToken: expect.any(String) },
    });
  });

  test('shows loading and waits for the greeting before navigating without duplicate requests', async () => {
    let resolveMessage!: (message: string) => void;
    mockGeneratePostcardMessage.mockImplementation(() => new Promise(resolve => {
      resolveMessage = resolve;
    }));
    mockParams = { photoId: 'photo-1', step: 'stamp' };
    const screen = await render(<PostcardApplyScreen />);

    await act(async () => { fireEvent.press(screen.getByLabelText('预览明信片')); });
    await waitFor(() => expect(mockGeneratePostcardMessage).toHaveBeenCalledTimes(1));
    expect(screen.getByLabelText('正在生成寄语…').props.accessibilityState).toMatchObject({
      disabled: true,
      busy: true,
    });
    expect(screen.getByLabelText('正在生成明信片寄语')).toBeTruthy();
    expect(mockRouter.push).not.toHaveBeenCalled();

    await act(async () => { fireEvent.press(screen.getByLabelText('正在生成寄语…')); });
    expect(mockGeneratePostcardMessage).toHaveBeenCalledTimes(1);
    expect(mockRouter.push).not.toHaveBeenCalled();

    await act(async () => { resolveMessage('京都午后微风'); });
    await waitFor(() => expect(mockRouter.push).toHaveBeenCalledTimes(1));
    const route = mockRouter.push.mock.calls[0]?.[0];
    expect(route).toMatchObject({
      pathname: '/postcard',
      params: { photoId: 'photo-1', messageToken: expect.any(String) },
    });
    expect(JSON.stringify(route)).not.toContain('京都午后微风');
    expect(mockRequestAIConsent).toHaveBeenCalledWith('postcard', expect.any(AbortSignal));
  });

  test('stays on the selection page when greeting authorization is refused', async () => {
    mockRequestAIConsent.mockResolvedValue(false);
    mockParams = { photoId: 'photo-1', step: 'stamp' };
    const screen = await render(<PostcardApplyScreen />);

    await act(async () => { fireEvent.press(screen.getByLabelText('预览明信片')); });
    await waitFor(() => expect(screen.getByText('请授权明信片寄语后再预览。')).toBeTruthy());
    expect(mockGeneratePostcardMessage).not.toHaveBeenCalled();
    expect(mockRouter.push).not.toHaveBeenCalled();
  });

  test('stays on the selection page when greeting generation fails', async () => {
    mockGeneratePostcardMessage.mockRejectedValue(new Error('provider unavailable'));
    mockParams = { photoId: 'photo-1', step: 'stamp' };
    const screen = await render(<PostcardApplyScreen />);

    await act(async () => { fireEvent.press(screen.getByLabelText('预览明信片')); });
    await waitFor(() => expect(screen.getByText('寄语暂时无法生成，请稍后重试。')).toBeTruthy());
    expect(mockRouter.push).not.toHaveBeenCalled();
  });

  test('cancels a pending greeting when the selected photo location changes', async () => {
    let resolveMessage!: (message: string) => void;
    let requestSignal: AbortSignal | undefined;
    mockGeneratePostcardMessage.mockImplementation((_photoId: string, _location: string, signal: AbortSignal) => {
      requestSignal = signal;
      return new Promise(resolve => { resolveMessage = resolve; });
    });
    mockParams = { photoId: 'photo-1', step: 'stamp' };
    const screen = await render(<PostcardApplyScreen />);
    await act(async () => { fireEvent.press(screen.getByLabelText('预览明信片')); });
    await waitFor(() => expect(mockGeneratePostcardMessage).toHaveBeenCalledTimes(1));

    const updatedPhoto = { ...useAppStore.getState().photos.find(photo => photo.id === 'photo-1')!, location: '杭州' };
    await act(async () => { useAppStore.getState().registerPhotos([updatedPhoto]); });
    await waitFor(() => expect(requestSignal?.aborted).toBe(true));
    await act(async () => { resolveMessage('旧地点寄语'); });

    expect(mockRouter.push).not.toHaveBeenCalled();
    expect(screen.getByLabelText('预览明信片').props.accessibilityState.disabled).toBe(false);
  });

  test('aborts a pending greeting when leaving the selection page', async () => {
    let resolveMessage!: (message: string) => void;
    let requestSignal: AbortSignal | undefined;
    mockGeneratePostcardMessage.mockImplementation((_photoId: string, _location: string, signal: AbortSignal) => {
      requestSignal = signal;
      return new Promise(resolve => { resolveMessage = resolve; });
    });
    mockParams = { photoId: 'photo-1', step: 'stamp' };
    const screen = await render(<PostcardApplyScreen />);
    await act(async () => { fireEvent.press(screen.getByLabelText('预览明信片')); });
    await waitFor(() => expect(mockGeneratePostcardMessage).toHaveBeenCalledTimes(1));

    await screen.unmount();
    expect(requestSignal?.aborted).toBe(true);
    await act(async () => { resolveMessage('离开页面后的寄语'); });
    expect(mockRouter.push).not.toHaveBeenCalled();
  });

  test('keeps the step controls, summary and actions in the fixed footer instead of the header', async () => {
    mockParams = { photoId: 'photo-1' };
    const screen = await render(<PostcardApplyScreen />);
    const footer = screen.getByTestId('application-footer');
    const header = screen.getByTestId('application-header');
    const isWithin = (node: typeof footer, container: typeof footer) => {
      for (let current: typeof node | null = node; current; current = current.parent) {
        if (current === container) return true;
      }
      return false;
    };
    for (const node of [
      screen.getByLabelText('明信片步骤：照片'),
      screen.getByText(/照片：photo-1/),
      screen.getByLabelText('下一步'),
    ]) {
      expect(isWithin(node, footer)).toBe(true);
      expect(isWithin(node, header)).toBe(false);
    }
    await act(async () => { fireEvent.press(screen.getByLabelText('下一步')); });
    expect(isWithin(screen.getByLabelText('跳过'), screen.getByTestId('application-footer'))).toBe(true);
  });

  test('keeps the latest six stamps and pins a selected older stamp returned from the region catalog', async () => {
    const diary = useAppStore.getState().diaries[0];
    if (!diary) throw new Error('expected diary');
    const cities = cityStampCatalogCities.slice(0, 8);
    useAppStore.setState({ diaries: cities.map((city, index) => ({
      ...diary, id: `recent-${index}`, status: 'ready' as const,
      date: `2026.10.${String(index + 1).padStart(2, '0')}`, location: city.cityName,
    })) });
    const [olderId] = [...getVisitedCityStampIds([{ ...diary, status: 'ready', location: cities[0]!.cityName }])];
    mockParams = { photoId: 'photo-1', stickerId: 'stickerCool', step: 'stamp', stampPlacement: '1' };
    const screen = await render(<PostcardApplyScreen />);
    expect(screen.getAllByLabelText(/选择城市印章：/)).toHaveLength(6);
    await act(async () => { fireEvent.press(screen.getByLabelText('按地区浏览城市印章')); });
    expect(mockRouter.push).toHaveBeenLastCalledWith({
      pathname: '/library/cities',
      params: { mode: 'postcard', photoId: 'photo-1', stickerId: 'stickerCool', cityStampId: '', stampPlacement: '1' },
    });

    mockParams = { ...mockParams, cityStampId: olderId };
    await screen.rerender(<PostcardApplyScreen />);
    const olderStamp = getCityStampConfig(olderId)!;
    const selected = screen.getByLabelText(`选择城市印章：${olderStamp.cityName}`);
    expect(selected.props.accessibilityState.selected).toBe(true);
    expect(screen.getAllByLabelText(/选择城市印章：/)).toHaveLength(7);
    await act(async () => { fireEvent.press(selected); });
    expect(screen.getByText(/印章：未选择/)).toBeTruthy();
    expect(screen.getAllByLabelText(/选择城市印章：/)).toHaveLength(6);
    expect(screen.getByText(/贴纸：酷酷的小橘/)).toBeTruthy();
    mockParams = { ...mockParams, selectionToken: 'second-selection' };
    await screen.rerender(<PostcardApplyScreen />);
    expect(screen.getByLabelText(`选择城市印章：${olderStamp.cityName}`).props.accessibilityState.selected).toBe(true);
  });

  test('rerolls for a changed photo but not the same photo, sticker changes or step navigation', async () => {
    const random = jest.spyOn(Math, 'random').mockReturnValue(0.25);
    mockParams = { photoId: 'photo-1', stampPlacement: 'v2:430:640:-13' };
    const screen = await render(<PostcardApplyScreen />);
    await act(async () => { fireEvent.press(screen.getByLabelText('选择明信片照片：photo-1')); });
    await act(async () => { fireEvent.press(screen.getByLabelText('明信片步骤：贴纸')); });
    await act(async () => { fireEvent.press(screen.getByLabelText('选择贴纸：比心小橘')); });
    await act(async () => { fireEvent.press(screen.getByLabelText('明信片步骤：城市印章')); });
    await act(async () => { fireEvent.press(screen.getByLabelText('预览明信片')); });
    await waitFor(() => expect(mockRouter.push).toHaveBeenCalled());
    expect(mockRouter.push).toHaveBeenLastCalledWith({
      pathname: '/postcard',
      params: { photoId: 'photo-1', stickerId: 'stickerLove', stampPlacement: 'v2:430:640:-13', messageToken: expect.any(String) },
    });
    expect(random).not.toHaveBeenCalled();
    await act(async () => { fireEvent.press(screen.getByLabelText('明信片步骤：照片')); });
    await act(async () => { fireEvent.press(screen.getByLabelText('选择明信片照片：photo-2')); });
    await act(async () => { fireEvent.press(screen.getByLabelText('明信片步骤：城市印章')); });
    await act(async () => { fireEvent.press(screen.getByLabelText('预览明信片')); });
    await waitFor(() => expect(mockRouter.push).toHaveBeenCalledTimes(2));
    expect(mockRouter.push).toHaveBeenLastCalledWith({
      pathname: '/postcard',
      params: { photoId: 'photo-2', stickerId: 'stickerLove', stampPlacement: 'v2:250:250:-9', messageToken: expect.any(String) },
    });
    random.mockClear();
    await screen.rerender(<PostcardApplyScreen />);
    await act(async () => { fireEvent.press(screen.getByLabelText('预览明信片')); });
    await waitFor(() => expect(mockRouter.push).toHaveBeenCalledTimes(3));
    expect(random).not.toHaveBeenCalled();
    expect(mockRouter.push.mock.calls.at(-1)?.[0].params.stampPlacement).toBe('v2:250:250:-9');
  });

  test('rerolls on stamp replacement and reselection, including region catalog returns', async () => {
    const diary = useAppStore.getState().diaries[0]!;
    const cities = cityStampCatalogCities.slice(0, 2);
    useAppStore.setState({ diaries: cities.map((city, index) => ({
      ...diary, id: `stamp-${index}`, status: 'ready' as const, location: city.cityName,
    })) });
    const ids = [...getVisitedCityStampIds(useAppStore.getState().diaries)];
    const first = getCityStampConfig(ids[0])!;
    const second = getCityStampConfig(ids[1])!;
    const random = jest.spyOn(Math, 'random').mockReturnValue(0.2);
    mockParams = { photoId: 'photo-1', cityStampId: first.id, step: 'stamp', stampPlacement: 'v2:430:640:-13' };
    const screen = await render(<PostcardApplyScreen />);
    await act(async () => { fireEvent.press(screen.getByLabelText(`选择城市印章：${second.cityName}`)); });
    await act(async () => { fireEvent.press(screen.getByLabelText('按地区浏览城市印章')); });
    expect(mockRouter.push.mock.calls.at(-1)?.[0].params.stampPlacement).toBe('v2:200:200:-11');
    mockParams = { ...mockRouter.push.mock.calls.at(-1)?.[0].params, step: 'stamp', selectionToken: 'same-stamp' };
    random.mockClear();
    await screen.rerender(<PostcardApplyScreen />);
    await act(async () => { fireEvent.press(screen.getByLabelText('预览明信片')); });
    await waitFor(() => expect(mockRouter.push).toHaveBeenCalledTimes(2));
    expect(random).not.toHaveBeenCalled();
    expect(mockRouter.push.mock.calls.at(-1)?.[0].params.stampPlacement).toBe('v2:200:200:-11');

    await act(async () => { fireEvent.press(screen.getByLabelText(`选择城市印章：${second.cityName}`)); });
    expect(random).not.toHaveBeenCalled();
    random.mockReturnValue(0.7);
    await act(async () => { fireEvent.press(screen.getByLabelText(`选择城市印章：${second.cityName}`)); });
    await act(async () => { fireEvent.press(screen.getByLabelText('预览明信片')); });
    await waitFor(() => expect(mockRouter.push).toHaveBeenCalledTimes(3));
    expect(mockRouter.push.mock.calls.at(-1)?.[0].params.stampPlacement).toBe('v2:700:700:7');

    random.mockReturnValue(0.4);
    mockParams = { ...mockParams, cityStampId: first.id, selectionToken: 'different-stamp' };
    await screen.rerender(<PostcardApplyScreen />);
    await act(async () => { fireEvent.press(screen.getByLabelText('预览明信片')); });
    await waitFor(() => expect(mockRouter.push).toHaveBeenCalledTimes(4));
    expect(mockRouter.push.mock.calls.at(-1)?.[0].params).toMatchObject({
      photoId: 'photo-1', cityStampId: first.id, stampPlacement: 'v2:400:400:-4',
    });
  });
});
