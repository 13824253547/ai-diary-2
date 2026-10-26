import React from 'react';
import { act, cleanup, fireEvent, render, waitFor } from '@testing-library/react-native';
import { Alert } from 'react-native';
import LibraryScreen from '../library';
import { createTestStore } from '../../src/test-utils/create-test-store';
import { useAppStore } from '../../src/store/use-app-store';
import type { AppStore } from '../../src/store/use-app-store';
import type { DiaryPhoto } from '../../src/types/diary';
import * as saveImage from '../../src/services/save-generated-image';

const mockRouter = {
  push: jest.fn(),
  back: jest.fn(),
  canGoBack: jest.fn(() => false),
  replace: jest.fn(),
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

jest.mock('../../src/components/common/button', () => ({
  Button: ({ label, onPress, disabled = false }: {
    label: string;
    onPress?: () => void;
    disabled?: boolean;
  }) => {
    const { Text } = require('react-native');
    return <Text accessibilityRole="button" accessibilityLabel={label} accessibilityState={{ disabled }} onPress={onPress}>{label}</Text>;
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
    expect(screen.queryByLabelText('用于日记')).toBeNull();
    expect(screen.queryByLabelText('用于明信片')).toBeNull();

    expect(useAppStore.getState().materialPhotoIds).toContain('generated-material-1');
    await pressAction(screen, '保存到相册');
    await waitFor(() => expect(saveImage.saveGeneratedImageToLibrary).toHaveBeenCalledWith(
      expect.objectContaining({ source: 'generated', generationSource: 'provider' }),
    ));
    expect(screen.getByText('已保存到系统相册。')).toBeTruthy();

    await pressAction(screen, '更多配图操作');
    expect(Alert.alert).toHaveBeenCalledWith('更多操作', undefined, [
      expect.objectContaining({ text: '用于日记', onPress: expect.any(Function) }),
      expect.objectContaining({ text: '用于明信片', onPress: expect.any(Function) }),
      expect.objectContaining({ text: '取消', style: 'cancel' }),
    ]);
    const actions = (Alert.alert as jest.Mock).mock.calls.at(-1)?.[2] as Array<{
      text: string;
      onPress?: () => void;
    }>;
    await act(async () => {
      actions.find(action => action.text === '用于明信片')?.onPress?.();
    });
    expect(mockRouter.push).toHaveBeenCalledWith({
      pathname: '/postcard',
      params: { photoId: 'generated-material-1' },
    });
  });
});
