import React from 'react';
import { act, fireEvent, render, waitFor } from '@testing-library/react-native';
import PermissionScreen from '../permission/photos';
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

let mockDraftId = '';
const mockRequestPhotoPermission = jest.fn();

jest.mock('expo-router', () => ({
  useRouter: () => mockRouter,
  useLocalSearchParams: () => ({ draftId: mockDraftId }),
}));

jest.mock('../../src/services/photo-permission', () => ({
  requestPhotoPermission: (...args: unknown[]) => mockRequestPhotoPermission(...args),
  getPhotoPermissionStatus: jest.fn(),
}));

jest.mock('../../src/components/common/bottom-sheet', () => ({
  BottomSheet: ({
    visible,
    children,
    onAfterClose,
  }: {
    visible: boolean;
    children: React.ReactNode;
    onAfterClose?: () => void;
  }) => {
    const React = require('react');
    const { View } = require('react-native');
    React.useEffect(() => {
      if (!visible) onAfterClose?.();
    }, [visible, onAfterClose]);
    return visible ? <View>{children}</View> : null;
  },
}));

jest.mock('../../src/components/common/button', () => ({
  Button: ({
    label,
    onPress,
    disabled,
  }: {
    label: string;
    onPress?: () => void;
    disabled?: boolean;
  }) => {
    const { Pressable, Text } = require('react-native');
    return (
      <Pressable accessibilityRole="button" accessibilityLabel={label} disabled={disabled} onPress={onPress}>
        <Text>{label}</Text>
      </Pressable>
    );
  },
}));

function createDeferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error?: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

function resetAppStore() {
  const current = useAppStore.getState() as Record<string, unknown>;
  const fresh = createTestStore().store.getState() as Record<string, unknown>;
  const next = Object.fromEntries(
    Object.keys(current).map(key => [key, typeof current[key] === 'function' ? current[key] : fresh[key]]),
  );
  useAppStore.setState(next as AppStore, true);
}

describe('Photo permission screen', () => {
  beforeEach(() => {
    resetAppStore();
    jest.clearAllMocks();
    const draftId = useAppStore.getState().beginCreation();
    mockDraftId = draftId;
  });

  test('allows access with the same draft and navigates to album once', async () => {
    mockRequestPhotoPermission.mockResolvedValue({
      status: 'full',
      granted: true,
      canAskAgain: true,
    });

    const screen = await render(<PermissionScreen />);
    await act(async () => {
      fireEvent.press(screen.getByLabelText('允许访问相册'));
    });

    await waitFor(() => {
      expect(useAppStore.getState().photoPermissionStatus).toBe('full');
      expect(useAppStore.getState().hasPhotoPermission).toBe(true);
      expect(mockRouter.replace).toHaveBeenCalledWith({
        pathname: '/album/select',
        params: { draftId: mockDraftId },
      });
    });

    expect(Object.keys(useAppStore.getState().drafts)).toEqual([mockDraftId]);
  });

  test('shows the explanation first and does not request permission before explicit allow', async () => {
    const screen = await render(<PermissionScreen />);

    expect(screen.getByText('允许访问你的相册')).toBeTruthy();
    expect(screen.getByText('为了帮你生成精美的回忆日记')).toBeTruthy();
    expect(mockRequestPhotoPermission).not.toHaveBeenCalled();
    expect(useAppStore.getState().photoPermissionStatus).toBe('unknown');
    expect(useAppStore.getState().hasPhotoPermission).toBe(false);
    expect(mockRouter.replace).not.toHaveBeenCalledWith({
      pathname: '/album/select',
      params: { draftId: mockDraftId },
    });
  });

  test('repeated allow taps only request once and keep draft privacy private', async () => {
    const deferred = createDeferred<{ status: 'full'; granted: true; canAskAgain: true }>();
    mockRequestPhotoPermission.mockReturnValue(deferred.promise);

    const screen = await render(<PermissionScreen />);
    await act(async () => {
      fireEvent.press(screen.getByLabelText('允许访问相册'));
      fireEvent.press(screen.getByLabelText('允许访问相册'));
    });

    expect(mockRequestPhotoPermission).toHaveBeenCalledTimes(1);

    await act(async () => {
      deferred.resolve({
        status: 'full',
        granted: true,
        canAskAgain: true,
      });
    });

    await waitFor(() => {
      expect(mockRouter.replace).toHaveBeenCalledWith({
        pathname: '/album/select',
        params: { draftId: mockDraftId },
      });
    });

    expect(useAppStore.getState().drafts[mockDraftId]?.diary.privacy).toBe('private');
  });

  test('temporarily denying access discards the unsaved draft', async () => {
    const screen = await render(<PermissionScreen />);
    await act(async () => {
      fireEvent.press(screen.getByText('暂不允许'));
    });

    await waitFor(() => {
      expect(useAppStore.getState().drafts[mockDraftId]).toBeUndefined();
    });

    expect(mockRouter.replace).toHaveBeenCalledWith('/(tabs)/home');
  });

  test('closing the explanation discards the unsaved draft', async () => {
    const screen = await render(<PermissionScreen />);
    await act(async () => {
      fireEvent.press(screen.getByLabelText('关闭'));
    });

    await waitFor(() => {
      expect(useAppStore.getState().drafts[mockDraftId]).toBeUndefined();
    });

    expect(mockRouter.replace).toHaveBeenCalledWith('/(tabs)/home');
    expect(mockRequestPhotoPermission).not.toHaveBeenCalled();
  });

  test('late permission success after closing does not revive the discarded draft', async () => {
    const deferred = createDeferred<{ status: 'full'; granted: true; canAskAgain: true }>();
    mockRequestPhotoPermission.mockReturnValue(deferred.promise);

    const screen = await render(<PermissionScreen />);
    await act(async () => {
      fireEvent.press(screen.getByLabelText('允许访问相册'));
    });
    await act(async () => {
      fireEvent.press(screen.getByLabelText('关闭'));
    });

    await waitFor(() => {
      expect(useAppStore.getState().drafts[mockDraftId]).toBeUndefined();
    });

    await act(async () => {
      deferred.resolve({
        status: 'full',
        granted: true,
        canAskAgain: true,
      });
    });

    await waitFor(() => {
      expect(mockRouter.replace).toHaveBeenCalledWith('/(tabs)/home');
    });

    expect(useAppStore.getState().drafts[mockDraftId]).toBeUndefined();
    expect(mockRouter.replace).not.toHaveBeenCalledWith({
      pathname: '/album/select',
      params: { draftId: mockDraftId },
    });
  });
});
