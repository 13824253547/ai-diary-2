import React from 'react';
import { act, cleanup, fireEvent, render, waitFor } from '@testing-library/react-native';
import { Alert } from 'react-native';
import LibraryScreen from '../library';
import { createTestStore } from '../../src/test-utils/create-test-store';
import { useAppStore } from '../../src/store/use-app-store';
import type { AppStore } from '../../src/store/use-app-store';
import type { DiaryPhoto } from '../../src/types/diary';
import * as saveImage from '../../src/services/save-generated-image';
import * as materialPhotoApi from '../../src/services/material-photo-api';
import { requestAIConsent } from '../../src/services/ai-consent';

jest.mock('../../src/services/ai-consent', () => ({
  requestAIConsent: jest.fn(async () => true),
}));

const mockRouter = {
  push: jest.fn(),
  back: jest.fn(),
  canGoBack: jest.fn(() => false),
  replace: jest.fn(),
};

jest.mock('expo-router', () => ({
  useRouter: () => mockRouter,
  useLocalSearchParams: () => ({}),
}));

jest.mock('../../src/components/layout/screen', () => ({
  Screen: ({ children, header, footer }: { children: React.ReactNode; header?: React.ReactNode; footer?: React.ReactNode }) => {
    const { View } = require('react-native');
    return <View>{header}{children}{footer}</View>;
  },
}));

jest.mock('../../src/components/common/button', () => ({
  Button: ({ label, onPress, disabled = false, loading = false }: {
    label: string;
    onPress?: () => void;
    disabled?: boolean;
    loading?: boolean;
  }) => {
    const { Text, View } = require('react-native');
    return <View>
      <Text accessibilityRole="button" accessibilityLabel={label} accessibilityState={{ disabled }} onPress={onPress}>{label}</Text>
      {loading ? <Text accessibilityRole="progressbar" accessibilityLabel="正在生成配图">⟳</Text> : null}
    </View>;
  },
}));

jest.mock('../../src/components/common/bottom-sheet', () => ({
  BottomSheet: ({ visible, onClose, title, children, headerAction }: {
    visible: boolean;
    onClose: () => void;
    title?: string;
    children: React.ReactNode;
    headerAction?: React.ReactNode;
  }) => {
    const { Pressable, Text, View } = require('react-native');
    return visible ? <View>
      <View><Text>{title}</Text>{headerAction}</View>
      <Pressable accessibilityRole="button" accessibilityLabel="关闭底部面板" onPress={onClose}>
        <Text>关闭</Text>
      </Pressable>
      {children}
    </View> : null;
  },
}));

jest.mock('@expo/vector-icons', () => ({
  Ionicons: () => null,
}));

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
  useAppStore.setState({ materialPhotoIds: [] });
}

function generatedPhoto(requestId: string, prompt: string): DiaryPhoto {
  return {
    id: 'generated-material-1',
    sourceAssetId: requestId,
    title: prompt,
    location: '',
    emoji: '🖼',
    color: '#EFE3D5',
    date: '2026.10.23',
    filename: 'generated-material-1.jpg',
    uri: 'https://api.example.test/photos/materials/generated-material-1/content',
    remoteHeaders: { 'x-device-id': 'device-1' },
    source: 'generated',
    generationRequestId: requestId,
    generationPrompt: prompt,
    generationSource: 'provider',
  };
}

async function openAIPanel(screen: Awaited<ReturnType<typeof render>>) {
  fireEvent.press(screen.getByText('去试试'));
  await waitFor(() => expect(screen.getByText('让想象成为一张照片')).toBeTruthy());
}

async function pressAction(screen: Awaited<ReturnType<typeof render>>, label: string) {
  await act(async () => {
    fireEvent.press(screen.getByLabelText(label));
    await Promise.resolve();
  });
}

describe('Library AI image generation panel', () => {
  beforeEach(() => {
    resetAppStore();
    jest.clearAllMocks();
    jest.spyOn(saveImage, 'saveGeneratedImageToLibrary').mockResolvedValue({ ok: true });
    jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
  });

  afterEach(() => {
    cleanup();
    jest.restoreAllMocks();
  });

  test('preserves the scene description and does not generate after declining consent', async () => {
    jest.mocked(requestAIConsent).mockResolvedValueOnce(false);
    const generate = jest.fn();
    useAppStore.setState({ generateMaterialImage: generate as AppStore['generateMaterialImage'] });
    const screen = await render(<LibraryScreen />);
    await openAIPanel(screen);
    await act(async () => { fireEvent.changeText(screen.getByLabelText('画面描述'), '海边日落'); });
    await pressAction(screen, '生成配图');
    expect(generate).not.toHaveBeenCalled();
    expect(screen.getByLabelText('画面描述').props.value).toBe('海边日落');
    expect(screen.getByLabelText('生成配图').props.accessibilityState.disabled).toBe(false);
  });

  test('does not submit the description if the panel closes before consent completes', async () => {
    let finishConsent!: (allowed: boolean) => void;
    const consent = new Promise<boolean>(resolve => { finishConsent = resolve; });
    jest.mocked(requestAIConsent).mockReturnValueOnce(consent);
    const generate = jest.fn();
    useAppStore.setState({ generateMaterialImage: generate as AppStore['generateMaterialImage'] });
    const screen = await render(<LibraryScreen />);
    await openAIPanel(screen);
    await act(async () => { fireEvent.changeText(screen.getByLabelText('画面描述'), '海边日落'); });
    await pressAction(screen, '生成配图');
    expect(generate).not.toHaveBeenCalled();
    expect(screen.getByLabelText('正在确认授权…')).toBeTruthy();
    await pressAction(screen, '关闭底部面板');
    await act(async () => { finishConsent(true); await consent; });
    expect(generate).not.toHaveBeenCalled();
    expect(screen.queryByLabelText('画面描述')).toBeNull();
  });

  test('shows loading, disables the prompt and allows cancelling an in-flight request', async () => {
    let resolveGeneration: ((value: {
      ok: false;
      requestId: string;
      reason: 'cancelled';
      message: string;
    }) => void) | undefined;
    const cancel = jest.fn((requestId: string) => {
      expect(requestId).toBe('image-request-1');
      resolveGeneration?.({
        ok: false,
        requestId,
        reason: 'cancelled',
        message: '本次配图生成已取消。',
      });
    });
    const generate = jest.fn(() => {
      useAppStore.setState({
        aiImageGenerationRequests: [{
          id: 'image-request-1',
          description: '海边日落',
          attempt: 1,
          status: 'pending',
        }],
      });
      return new Promise<{
        ok: false;
        requestId: string;
        reason: 'cancelled';
        message: string;
      }>(resolve => {
        resolveGeneration = resolve;
      });
    });
    useAppStore.setState({
      generateMaterialImage: generate as AppStore['generateMaterialImage'],
      cancelMaterialImageGeneration: cancel,
    });
    const screen = await render(<LibraryScreen />);
    useAppStore.setState({ generateMaterialImage: generate as AppStore['generateMaterialImage'] });
    await openAIPanel(screen);
    fireEvent.changeText(screen.getByLabelText('画面描述'), '海边日落');
    await waitFor(() => expect(screen.getByLabelText('画面描述').props.value).toBe('海边日落'));

    await pressAction(screen, '生成配图');

    await waitFor(() => expect(generate).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(screen.getByLabelText('正在生成配图')).toBeTruthy());
    expect(screen.getByLabelText('正在为你描绘画面，请稍候…')).toBeTruthy();
    expect(screen.queryByText('正在生成…')).toBeNull();
    expect(screen.getByLabelText('画面描述').props.editable).toBe(false);
    await pressAction(screen, '取消生成');
    await waitFor(() => expect(cancel).toHaveBeenCalledWith('image-request-1'));
    expect(screen.getByText('本次配图生成已取消，可以调整描述后重新生成。')).toBeTruthy();
    expect(screen.getByLabelText('重新生成')).toBeTruthy();
  });

  test('keeps failures retryable and opens only a provider asset after success', async () => {
    let attempt = 0;
    const generate = jest.fn(async (description: string) => {
      attempt += 1;
      if (attempt === 1) {
        return {
          ok: false as const,
          reason: 'provider_failed' as const,
          message: '配图服务暂时不可用，请稍后重试。',
        };
      }
      const photo = generatedPhoto('image-request-2', description);
      useAppStore.getState().registerPhotos([photo]);
      useAppStore.getState().addMaterialPhoto(photo.id);
      return {
        ok: true as const,
        requestId: 'image-request-2',
        photoId: photo.id,
        source: 'provider' as const,
      };
    });
    useAppStore.setState({
      generateMaterialImage: generate as AppStore['generateMaterialImage'],
    });
    const screen = await render(<LibraryScreen />);
    useAppStore.setState({ generateMaterialImage: generate as AppStore['generateMaterialImage'] });
    await openAIPanel(screen);
    fireEvent.changeText(screen.getByLabelText('画面描述'), '雨后的老街');
    await waitFor(() => expect(screen.getByLabelText('画面描述').props.value).toBe('雨后的老街'));

    await pressAction(screen, '生成配图');
    expect(await screen.findByText('配图服务暂时不可用，请稍后重试。')).toBeTruthy();
    expect(screen.getByLabelText('重新生成')).toBeTruthy();

    await pressAction(screen, '重新生成');
    await waitFor(() => expect(screen.getByTestId('material-photo-preview')).toBeTruthy());
    expect(screen.getByLabelText('保存到相册')).toBeTruthy();
    expect(screen.getByLabelText('用于明信片')).toBeTruthy();
    expect(screen.queryByLabelText('更多配图操作')).toBeNull();
    expect(screen.queryByLabelText('用于日记')).toBeNull();

    expect(useAppStore.getState().materialPhotoIds).toContain('generated-material-1');
    await pressAction(screen, '保存到相册');
    await waitFor(() => expect(saveImage.saveGeneratedImageToLibrary).toHaveBeenCalledWith(
      expect.objectContaining({ source: 'generated', generationSource: 'provider' }),
    ));
    expect(screen.getByText('已保存到系统相册。')).toBeTruthy();
    expect(Alert.alert).not.toHaveBeenCalled();

    await pressAction(screen, '用于明信片');
    expect(mockRouter.push).toHaveBeenCalledWith({
      pathname: '/postcard/apply',
      params: { photoId: 'generated-material-1' },
    });

    await pressAction(screen, '预览雨后的老街');
    expect(screen.getByTestId('material-photo-preview')).toBeTruthy();
    expect(screen.getByLabelText('保存到相册')).toBeTruthy();
    expect(screen.getByLabelText('用于明信片')).toBeTruthy();
    expect(screen.queryByLabelText('更多配图操作')).toBeNull();
    expect(screen.queryByLabelText('用于日记')).toBeNull();

    await pressAction(screen, '生成日记');
    expect(mockRouter.push).toHaveBeenLastCalledWith({
      pathname: '/album/select',
      params: { draftId: expect.any(String), source: 'materials' },
    });
    const draftId = (mockRouter.push.mock.calls.at(-1)?.[0] as {
      params: { draftId: string };
    }).params.draftId;
    expect(useAppStore.getState().drafts[draftId]?.selectedPhotoIds).toEqual(['generated-material-1']);
    expect(useAppStore.getState().currentStep).toBe('album');
  });

  test('keeps a newly saved AI material when an older initial refresh finishes later', async () => {
    let finishRefresh!: (result: { ok: true; photos: DiaryPhoto[] }) => void;
    const initialRefresh = new Promise<{ ok: true; photos: DiaryPhoto[] }>(resolve => {
      finishRefresh = resolve;
    });
    jest.spyOn(materialPhotoApi, 'listMaterialPhotosFromBackend').mockReturnValue(initialRefresh);
    const generate = jest.fn(async (description: string) => {
      const photo = generatedPhoto('image-request-race', description);
      useAppStore.getState().registerPhotos([photo]);
      useAppStore.getState().addMaterialPhoto(photo.id);
      return {
        ok: true as const,
        requestId: 'image-request-race',
        photoId: photo.id,
        source: 'provider' as const,
      };
    });
    useAppStore.setState({ generateMaterialImage: generate as AppStore['generateMaterialImage'] });
    const workerId = process.env.JEST_WORKER_ID;
    delete process.env.JEST_WORKER_ID;
    try {
      const screen = await render(<LibraryScreen />);
      useAppStore.setState({ generateMaterialImage: generate as AppStore['generateMaterialImage'] });
      await openAIPanel(screen);
      fireEvent.changeText(screen.getByLabelText('画面描述'), '雨后的老街');
      await waitFor(() => expect(screen.getByLabelText('画面描述').props.value).toBe('雨后的老街'));
      await pressAction(screen, '生成配图');
      await waitFor(() => expect(generate).toHaveBeenCalledTimes(1));
      await waitFor(() => expect(useAppStore.getState().materialPhotoIds).toContain('generated-material-1'));

      await act(async () => {
        finishRefresh({ ok: true, photos: [] });
        await initialRefresh;
      });

      expect(useAppStore.getState().materialPhotoIds).toContain('generated-material-1');
    } finally {
      if (workerId === undefined) delete process.env.JEST_WORKER_ID;
      else process.env.JEST_WORKER_ID = workerId;
    }
  });

  test('disables the existing generate button when uploaded and AI images fill the library', async () => {
    const generated = generatedPhoto('saved-image-request', '之前的配图');
    const uploaded = Array.from({ length: 99 }, (_, index) => ({
      ...generated,
      id: `uploaded-${index}`,
      source: 'device' as const,
      generationRequestId: undefined,
      generationPrompt: undefined,
      generationSource: undefined,
    }));
    const generate = jest.fn();
    useAppStore.setState({
      photos: [generated, ...uploaded],
      materialPhotoIds: [generated.id, ...uploaded.map(photo => photo.id)],
      generateMaterialImage: generate as AppStore['generateMaterialImage'],
    });
    const screen = await render(<LibraryScreen />);

    await openAIPanel(screen);
    fireEvent.changeText(screen.getByLabelText('画面描述'), '第 101 张配图');
    await waitFor(() => expect(screen.getByLabelText('素材库已满，请先删除部分照片')).toBeTruthy());
    expect(screen.getByLabelText('素材库已满，请先删除部分照片').props.accessibilityState.disabled).toBe(true);
    expect(generate).not.toHaveBeenCalled();
  });
});
