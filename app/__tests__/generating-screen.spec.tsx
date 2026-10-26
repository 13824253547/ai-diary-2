import React from 'react';
import { Alert } from 'react-native';
import { act, render, waitFor } from '@testing-library/react-native';
import GeneratingScreen from '../create/generating';
import { createTestStore } from '../../src/test-utils/create-test-store';
import { useAppStore } from '../../src/store/use-app-store';
import type { AppStore } from '../../src/store/use-app-store';

const mockRouter = {
  push: jest.fn(),
  replace: jest.fn(),
  dismissAll: jest.fn(),
  setParams: jest.fn(),
  canGoBack: jest.fn(),
  back: jest.fn(),
};

let mockDraftId: string | undefined;

jest.mock('expo-router', () => {
  const React = require('react');
  return {
    useFocusEffect: (callback: () => void | (() => void)) => {
      React.useEffect(() => callback(), [callback]);
    },
  };
});

jest.mock('../../src/hooks/use-diary-flow', () => {
  const { useAppStore } = require('../../src/store/use-app-store');
  return {
    useDraftRoute: () => ({
      draft: useAppStore((state: AppStore) => (mockDraftId ? state.drafts[mockDraftId] : undefined)),
      router: mockRouter,
    }),
  };
});

jest.mock('@expo/vector-icons', () => {
  const { Text: MockText } = require('react-native');
  return {
    Ionicons: ({ name }: { name: string }) => <MockText>{name}</MockText>,
  };
});

jest.mock('expo-linear-gradient', () => ({
  LinearGradient: ({ children }: { children: React.ReactNode }) => {
    const React = require('react');
    return <React.Fragment>{children}</React.Fragment>;
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

jest.mock('../../src/components/common/design-ui', () => ({
  Empty: ({ title }: { title?: string }) => {
    const { Text } = require('react-native');
    return <Text>{title ?? '空'}</Text>;
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

async function advanceVisiblePhase() {
  await act(async () => {
    jest.advanceTimersByTime(3_000);
    await Promise.resolve();
  });
}

describe('Generating screen', () => {
  const alertSpy = jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
  const createDeferred = <T,>() => {
    let resolve!: (value: T) => void;
    const promise = new Promise<T>(res => {
      resolve = res;
    });
    return { promise, resolve };
  };

  beforeEach(() => {
    resetAppStore();
    jest.clearAllMocks();
    mockDraftId = undefined;
  });

  afterAll(() => {
    alertSpy.mockRestore();
  });

  test('smoothly shows the backend target, active work step, and selected photo count', async () => {
    const originalRefreshDraftGeneration = useAppStore.getState().refreshDraftGeneration;
    const draftId = useAppStore.getState().beginCreation();
    mockDraftId = draftId;
    useAppStore.getState().setDraftPhotos(draftId, ['photo-11', 'photo-12', 'photo-1', 'photo-2']);
    useAppStore.setState(state => ({
      drafts: {
        ...state.drafts,
        [draftId]: {
          ...state.drafts[draftId],
          people: [],
          diary: { ...state.drafts[draftId].diary, people: [], status: 'generating' },
          generation: {
            round: 1,
            progress: 15,
            status: 'running',
            remoteJobId: 'job-progress-phases',
            remoteStage: 'analyzing-photos',
            progressMilestones: [
              { milestoneId: 'queued', stage: 'queued', progressPercent: 0, reachedAt: 1, attemptCount: 0 },
              { milestoneId: 'photo-processing-started', stage: 'analyzing-photos', progressPercent: 0, reachedAt: 2, attemptCount: 1 },
              { milestoneId: 'photos-ready', stage: 'analyzing-photos', progressPercent: 15, reachedAt: 3, attemptCount: 1 },
            ],
          },
        },
      },
      refreshDraftGeneration: jest.fn(async () => undefined),
    }));

    const screen = await render(<GeneratingScreen />);
    try {
      expect(screen.queryByText('18%')).toBeNull();
      await waitFor(() => {
        const now = screen.getByRole('progressbar').props.accessibilityValue.now as number;
        expect(now).toBeGreaterThan(0);
        expect(now).toBeLessThan(15);
      });
      await waitFor(() => expect(screen.getByText('15%')).toBeTruthy(), { timeout: 2_500 });
      expect(screen.getByLabelText('正在检查照片素材进行中')).toBeTruthy();
      expect(screen.getByText('4 张照片 · 让回忆有温度')).toBeTruthy();
      expect(screen.queryByText(/地点/)).toBeNull();
    } finally {
      screen.unmount();
      useAppStore.setState({ refreshDraftGeneration: originalRefreshDraftGeneration });
    }
  });

  test('slowly advances while waiting but stays below the next backend milestone', async () => {
    jest.useFakeTimers();
    const originalStartGeneration = useAppStore.getState().startGeneration;
    const originalRefreshDraftGeneration = useAppStore.getState().refreshDraftGeneration;
    const draftId = useAppStore.getState().beginCreation();
    mockDraftId = draftId;
    useAppStore.getState().setDraftPhotos(draftId, ['photo-11', 'photo-12', 'photo-1']);
    const milestones = [
      { milestoneId: 'queued', stage: 'queued', progressPercent: 0, reachedAt: 1, attemptCount: 0 },
      { milestoneId: 'photo-processing-started', stage: 'analyzing-photos', progressPercent: 0, reachedAt: 2, attemptCount: 1 },
      { milestoneId: 'photos-ready', stage: 'analyzing-photos', progressPercent: 15, reachedAt: 3, attemptCount: 1 },
      { milestoneId: 'provider-submitted', stage: 'drafting', progressPercent: 25, reachedAt: 4, attemptCount: 1 },
    ] as const;
    const pendingRefresh = createDeferred<void>();
    useAppStore.setState(state => ({
      drafts: {
        ...state.drafts,
        [draftId]: {
          ...state.drafts[draftId],
          diary: { ...state.drafts[draftId].diary, status: 'generating' },
          generation: {
            round: 1,
            progress: 25,
            status: 'running',
            remoteJobId: 'job-progress-waiting',
            remoteStage: 'drafting',
            progressMilestones: [...milestones],
          },
        },
      },
      startGeneration: jest.fn(() => 1),
      refreshDraftGeneration: jest.fn(() => pendingRefresh.promise),
    }));

    let screen: Awaited<ReturnType<typeof render>> | undefined;
    try {
      await act(async () => {
        screen = await render(<GeneratingScreen />);
      });

      await act(async () => {
        jest.advanceTimersByTime(60_000);
        await Promise.resolve();
      });
      const movingProgress = screen?.getByRole('progressbar').props.accessibilityValue.now as number;
      expect(movingProgress).toBeGreaterThanOrEqual(55);
      expect(movingProgress).toBeLessThan(80);

      await act(async () => {
        jest.advanceTimersByTime(360_000);
        await Promise.resolve();
      });
      const cappedProgress = screen?.getByRole('progressbar').props.accessibilityValue.now as number;
      expect(cappedProgress).toBe(79);
    } finally {
      screen?.unmount();
      useAppStore.setState({
        startGeneration: originalStartGeneration,
        refreshDraftGeneration: originalRefreshDraftGeneration,
      });
      jest.useRealTimers();
    }
  });

  test('holds each real work phase for three seconds before navigating on success', async () => {
    jest.useFakeTimers();
    const originalRefreshDraftGeneration = useAppStore.getState().refreshDraftGeneration;
    const draftId = useAppStore.getState().beginCreation();
    mockDraftId = draftId;
    useAppStore.getState().setDraftPhotos(draftId, ['photo-11', 'photo-12', 'photo-1']);
    const milestones = [
      { milestoneId: 'queued', stage: 'queued', progressPercent: 0, reachedAt: 1, attemptCount: 0 },
      { milestoneId: 'photo-processing-started', stage: 'analyzing-photos', progressPercent: 0, reachedAt: 2, attemptCount: 1 },
      { milestoneId: 'photos-ready', stage: 'analyzing-photos', progressPercent: 15, reachedAt: 3, attemptCount: 1 },
      { milestoneId: 'provider-submitted', stage: 'drafting', progressPercent: 25, reachedAt: 4, attemptCount: 1 },
      { milestoneId: 'provider-response-received', stage: 'structuring', progressPercent: 80, reachedAt: 5, attemptCount: 1 },
      { milestoneId: 'result-validated', stage: 'structuring', progressPercent: 95, reachedAt: 6, attemptCount: 1 },
    ] as const;
    useAppStore.setState(state => ({
      drafts: {
        ...state.drafts,
        [draftId]: {
          ...state.drafts[draftId],
          people: [],
          diary: { ...state.drafts[draftId].diary, people: [], status: 'generating' },
          generation: {
            round: 1,
            progress: 95,
            status: 'running',
            remoteJobId: 'job-phase-minimum',
            remoteStage: 'structuring',
            progressMilestones: [...milestones],
          },
        },
      },
      refreshDraftGeneration: jest.fn(async () => {
        useAppStore.setState(state => ({
          drafts: {
            ...state.drafts,
            [draftId]: {
              ...state.drafts[draftId],
              generation: {
                ...state.drafts[draftId].generation,
                progress: 100,
                status: 'complete',
                remoteStage: 'completed',
                progressMilestones: [
                  ...milestones,
                  { milestoneId: 'completed', stage: 'completed', progressPercent: 100, reachedAt: 7, attemptCount: 1 },
                ],
              },
            },
          },
        }));
      }),
    }));

    const screen = await render(<GeneratingScreen />);
    try {
      await act(async () => Promise.resolve());
      expect(screen.getByLabelText('正在检查照片素材进行中')).toBeTruthy();
      expect(mockRouter.replace).not.toHaveBeenCalled();

      await act(async () => { jest.advanceTimersByTime(2_999); });
      expect(screen.getByLabelText('正在检查照片素材进行中')).toBeTruthy();
      expect(mockRouter.replace).not.toHaveBeenCalled();

      await act(async () => { jest.advanceTimersByTime(1); });
      expect(screen.getByLabelText('正在等待模型创作进行中')).toBeTruthy();
      await act(async () => { jest.advanceTimersByTime(2_999); });
      expect(screen.getByLabelText('正在等待模型创作进行中')).toBeTruthy();
      expect(mockRouter.replace).not.toHaveBeenCalled();

      await act(async () => { jest.advanceTimersByTime(1); });
      expect(screen.getByLabelText('正在整理并校验结果进行中')).toBeTruthy();
      await act(async () => { jest.advanceTimersByTime(2_999); });
      expect(screen.getByLabelText('正在整理并校验结果进行中')).toBeTruthy();
      expect(mockRouter.replace).not.toHaveBeenCalled();
      await act(async () => { jest.advanceTimersByTime(1); });
      expect(mockRouter.replace).toHaveBeenCalledTimes(1);
    } finally {
      screen.unmount();
      jest.useRealTimers();
      useAppStore.setState({ refreshDraftGeneration: originalRefreshDraftGeneration });
    }
  });

  test('re-entering an already completed task still presents all three phases before navigation', async () => {
    jest.useFakeTimers();
    const draftId = useAppStore.getState().beginCreation();
    mockDraftId = draftId;
    useAppStore.getState().setDraftPhotos(draftId, ['photo-11', 'photo-12', 'photo-1']);
    useAppStore.setState(state => ({
      drafts: {
        ...state.drafts,
        [draftId]: {
          ...state.drafts[draftId],
          people: [],
          diary: { ...state.drafts[draftId].diary, people: [], status: 'ready' },
          generation: {
            round: 1,
            progress: 100,
            status: 'complete',
            remoteJobId: 'job-already-complete',
            remoteStage: 'completed',
            progressMilestones: [
              { milestoneId: 'queued', stage: 'queued', progressPercent: 0, reachedAt: 1, attemptCount: 0 },
              { milestoneId: 'photo-processing-started', stage: 'analyzing-photos', progressPercent: 0, reachedAt: 2, attemptCount: 1 },
              { milestoneId: 'photos-ready', stage: 'analyzing-photos', progressPercent: 15, reachedAt: 3, attemptCount: 1 },
              { milestoneId: 'provider-submitted', stage: 'drafting', progressPercent: 25, reachedAt: 4, attemptCount: 1 },
              { milestoneId: 'provider-response-received', stage: 'structuring', progressPercent: 80, reachedAt: 5, attemptCount: 1 },
              { milestoneId: 'result-validated', stage: 'structuring', progressPercent: 95, reachedAt: 6, attemptCount: 1 },
              { milestoneId: 'completed', stage: 'completed', progressPercent: 100, reachedAt: 7, attemptCount: 1 },
            ],
          },
        },
      },
    }));
    const refreshDraftGeneration = jest.fn();
    useAppStore.setState({ refreshDraftGeneration });

    const screen = await render(<GeneratingScreen />);
    try {
      expect(screen.getByLabelText('正在检查照片素材进行中')).toBeTruthy();
      expect(mockRouter.replace).not.toHaveBeenCalled();
      expect(refreshDraftGeneration).not.toHaveBeenCalled();
      await advanceVisiblePhase();
      expect(screen.getByLabelText('正在等待模型创作进行中')).toBeTruthy();
      expect(mockRouter.replace).not.toHaveBeenCalled();
      await advanceVisiblePhase();
      expect(screen.getByLabelText('正在整理并校验结果进行中')).toBeTruthy();
      expect(mockRouter.replace).not.toHaveBeenCalled();
      await advanceVisiblePhase();
      expect(mockRouter.replace).toHaveBeenCalledTimes(1);
    } finally {
      screen.unmount();
      jest.clearAllTimers();
      jest.useRealTimers();
    }
  });

  test('retargets from the current animated value and resets only for a new generation round', async () => {
    const draftId = useAppStore.getState().beginCreation();
    mockDraftId = draftId;
    useAppStore.getState().setDraftPhotos(draftId, ['photo-11', 'photo-12', 'photo-1']);
    useAppStore.setState(state => ({
      drafts: {
        ...state.drafts,
        [draftId]: {
          ...state.drafts[draftId],
          diary: { ...state.drafts[draftId].diary, status: 'generating' },
          generation: {
            round: 1,
            progress: 30,
            status: 'running',
            remoteJobId: 'job-progress-interrupt',
            remoteStage: 'analyzing-photos',
          },
        },
      },
      refreshDraftGeneration: jest.fn(async () => undefined),
    }));

    const screen = await render(<GeneratingScreen />);
    try {
      await waitFor(() => {
        const now = screen.getByRole('progressbar').props.accessibilityValue.now as number;
        expect(now).toBeGreaterThan(0);
        expect(now).toBeLessThan(30);
      });
      await act(async () => {
        useAppStore.setState(state => ({
          drafts: {
            ...state.drafts,
            [draftId]: {
              ...state.drafts[draftId],
              generation: {
                ...state.drafts[draftId].generation,
                progress: 60,
                remoteStage: 'drafting',
              },
            },
          },
        }));
      });
      expect(screen.queryByText('60%')).toBeNull();
      await waitFor(() => expect(screen.getByText('60%')).toBeTruthy(), { timeout: 2_500 });

      await act(async () => {
        useAppStore.setState(state => ({
          drafts: {
            ...state.drafts,
            [draftId]: {
              ...state.drafts[draftId],
              generation: {
                ...state.drafts[draftId].generation,
                round: 2,
                progress: 30,
                remoteJobId: 'job-progress-retry',
                remoteStage: 'analyzing-photos',
              },
            },
          },
        }));
      });
      expect(screen.queryByText('60%')).toBeNull();
      await waitFor(() => expect(screen.getByText('30%')).toBeTruthy(), { timeout: 2_500 });
    } finally {
      screen.unmount();
    }
  });

  test('failed generation can return directly to the home screen', async () => {
    const originalStartGeneration = useAppStore.getState().startGeneration;
    const originalFinishGeneration = useAppStore.getState().finishGeneration;
    const draftId = useAppStore.getState().beginCreation();
    mockDraftId = draftId;
    useAppStore.getState().setDraftPhotos(draftId, ['photo-11', 'photo-12', 'photo-1']);

    useAppStore.setState(state => ({
      drafts: {
        ...state.drafts,
        [draftId]: {
          ...state.drafts[draftId],
          people: [],
          diary: {
            ...state.drafts[draftId].diary,
            people: [],
          },
        },
      },
    }));

    const startGeneration = jest.fn((id: string) => originalStartGeneration(id));
    let refreshCount = 0;
    const refreshDraftGeneration = jest.fn(async (id: string, round: number) => {
      refreshCount += 1;
      if (refreshCount === 1) {
        useAppStore.setState(state => ({
          drafts: {
            ...state.drafts,
            [id]: {
              ...state.drafts[id],
              diary: {
                ...state.drafts[id].diary,
                status: 'draft',
              },
              generation: {
                ...state.drafts[id].generation,
                round,
                status: 'failed',
                remoteStage: 'failed',
                errorMessage: '生成超时，请稍后重试。',
              },
            },
          },
        }));
        return;
      }
      originalFinishGeneration(id, round);
    });

    useAppStore.setState({
      startGeneration,
      refreshDraftGeneration,
    });

    await render(<GeneratingScreen />);

    await waitFor(() => {
      expect(alertSpy).toHaveBeenCalledTimes(1);
    });

    const [title, message, buttons] = alertSpy.mock.calls[0] ?? [];
    expect(title).toBe('生成未完成');
    expect(message).toBe('生成超时，请稍后重试。');
    expect(buttons?.map(button => button.text ?? '')).toEqual(['返回首页', '重新生成']);

    await act(async () => {
      buttons?.[0]?.onPress?.();
    });

    expect(mockRouter.replace).toHaveBeenCalledWith('/(tabs)/home');
    expect(mockRouter.back).not.toHaveBeenCalled();
    expect(startGeneration).toHaveBeenCalledTimes(1);
    expect(refreshDraftGeneration).toHaveBeenCalledTimes(1);
  });

  test('generic provider failure shows the precise fallback copy and only retries after confirmation', async () => {
    const originalStartGeneration = useAppStore.getState().startGeneration;
    const originalFinishGeneration = useAppStore.getState().finishGeneration;
    const draftId = useAppStore.getState().beginCreation();
    mockDraftId = draftId;
    useAppStore.getState().setDraftPhotos(draftId, ['photo-11', 'photo-12', 'photo-1']);

    useAppStore.setState(state => ({
      drafts: {
        ...state.drafts,
        [draftId]: {
          ...state.drafts[draftId],
          people: [],
          diary: {
            ...state.drafts[draftId].diary,
            people: [],
          },
        },
      },
    }));

    const startGeneration = jest.fn((id: string) => originalStartGeneration(id));
    let refreshCount = 0;
    const refreshDraftGeneration = jest.fn(async (id: string, round: number) => {
      refreshCount += 1;
      if (refreshCount === 1) {
        useAppStore.setState(state => ({
          drafts: {
            ...state.drafts,
            [id]: {
              ...state.drafts[id],
              diary: {
                ...state.drafts[id].diary,
                status: 'draft',
              },
              generation: {
                ...state.drafts[id].generation,
                round,
                status: 'failed',
                remoteStage: 'failed',
                errorMessage: '生成失败，请稍后重试。',
              },
            },
          },
        }));
        return;
      }
      originalFinishGeneration(id, round);
    });

    useAppStore.setState({
      startGeneration,
      refreshDraftGeneration,
    });

    await render(<GeneratingScreen />);

    await waitFor(() => {
      expect(alertSpy).toHaveBeenCalledTimes(1);
    });

    const [title, message, buttons] = alertSpy.mock.calls[0] ?? [];
    expect(title).toBe('生成未完成');
    expect(message).toBe('生成失败，请稍后重试。');
    expect(mockRouter.replace).not.toHaveBeenCalled();

    await act(async () => {
      buttons?.[1]?.onPress?.();
      await Promise.resolve();
    });

    await waitFor(() => {
      expect(startGeneration).toHaveBeenCalledTimes(2);
      expect(refreshDraftGeneration).toHaveBeenCalledTimes(2);
      expect(useAppStore.getState().drafts[draftId].generation.status).toBe('complete');
    });
    expect(mockRouter.replace).not.toHaveBeenCalled();
  });

  test('generation job creation failure shows the precise startup failure copy and only retries after confirmation', async () => {
    const originalStartGeneration = useAppStore.getState().startGeneration;
    const originalFinishGeneration = useAppStore.getState().finishGeneration;
    const draftId = useAppStore.getState().beginCreation();
    mockDraftId = draftId;
    useAppStore.getState().setDraftPhotos(draftId, ['photo-11', 'photo-12', 'photo-1']);

    useAppStore.setState(state => ({
      drafts: {
        ...state.drafts,
        [draftId]: {
          ...state.drafts[draftId],
          people: [],
          diary: {
            ...state.drafts[draftId].diary,
            people: [],
          },
        },
      },
    }));

    const startGeneration = jest.fn((id: string) => originalStartGeneration(id));
    let refreshCount = 0;
    const refreshDraftGeneration = jest.fn(async (id: string, round: number) => {
      refreshCount += 1;
      if (refreshCount === 1) {
        useAppStore.setState(state => ({
          drafts: {
            ...state.drafts,
            [id]: {
              ...state.drafts[id],
              diary: {
                ...state.drafts[id].diary,
                status: 'draft',
              },
              generation: {
                ...state.drafts[id].generation,
                round,
                remoteJobId: undefined,
                status: 'failed',
                remoteStage: 'failed',
                errorMessage: '生成结果异常，请稍后重试。',
              },
            },
          },
        }));
        return;
      }
      originalFinishGeneration(id, round);
    });

    useAppStore.setState({
      startGeneration,
      refreshDraftGeneration,
    });

    await render(<GeneratingScreen />);

    await waitFor(() => {
      expect(alertSpy).toHaveBeenCalledTimes(1);
    });

    const [title, message, buttons] = alertSpy.mock.calls[0] ?? [];
    expect(title).toBe('生成未完成');
    expect(message).toBe('生成结果异常，请稍后重试。');
    expect(mockRouter.replace).not.toHaveBeenCalled();

    await act(async () => {
      buttons?.[1]?.onPress?.();
      await Promise.resolve();
    });

    await waitFor(() => {
      expect(startGeneration).toHaveBeenCalledTimes(2);
      expect(refreshDraftGeneration).toHaveBeenCalledTimes(2);
      expect(useAppStore.getState().drafts[draftId].generation.status).toBe('complete');
    });
    expect(mockRouter.replace).not.toHaveBeenCalled();
  });

  test('generation job creation permission loss shows the precise startup device warning and only retries after confirmation', async () => {
    const originalStartGeneration = useAppStore.getState().startGeneration;
    const originalFinishGeneration = useAppStore.getState().finishGeneration;
    const draftId = useAppStore.getState().beginCreation();
    mockDraftId = draftId;
    useAppStore.getState().setDraftPhotos(draftId, ['photo-11', 'photo-12', 'photo-1']);

    useAppStore.setState(state => ({
      drafts: {
        ...state.drafts,
        [draftId]: {
          ...state.drafts[draftId],
          people: [],
          diary: {
            ...state.drafts[draftId].diary,
            people: [],
          },
        },
      },
    }));

    const startGeneration = jest.fn((id: string) => originalStartGeneration(id));
    let refreshCount = 0;
    const refreshDraftGeneration = jest.fn(async (id: string, round: number) => {
      refreshCount += 1;
      if (refreshCount === 1) {
        useAppStore.setState(state => ({
          drafts: {
            ...state.drafts,
            [id]: {
              ...state.drafts[id],
              diary: {
                ...state.drafts[id].diary,
                status: 'draft',
              },
              generation: {
                ...state.drafts[id].generation,
                round,
                remoteJobId: undefined,
                status: 'failed',
                remoteStage: 'failed',
                errorMessage: '当前设备无法发起该生成任务，请返回后重试。',
              },
            },
          },
        }));
        return;
      }
      originalFinishGeneration(id, round);
    });

    useAppStore.setState({
      startGeneration,
      refreshDraftGeneration,
    });

    await render(<GeneratingScreen />);

    await waitFor(() => {
      expect(alertSpy).toHaveBeenCalledTimes(1);
    });

    const [title, message, buttons] = alertSpy.mock.calls[0] ?? [];
    expect(title).toBe('生成未完成');
    expect(message).toBe('当前设备无法发起该生成任务，请返回后重试。');
    expect(mockRouter.replace).not.toHaveBeenCalled();

    await act(async () => {
      buttons?.[1]?.onPress?.();
      await Promise.resolve();
    });

    await waitFor(() => {
      expect(startGeneration).toHaveBeenCalledTimes(2);
      expect(refreshDraftGeneration).toHaveBeenCalledTimes(2);
      expect(useAppStore.getState().drafts[draftId].generation.status).toBe('complete');
    });
    expect(mockRouter.replace).not.toHaveBeenCalled();
  });

  test('generation job creation timeout shows the precise startup timeout copy and only retries after confirmation', async () => {
    const originalStartGeneration = useAppStore.getState().startGeneration;
    const originalFinishGeneration = useAppStore.getState().finishGeneration;
    const draftId = useAppStore.getState().beginCreation();
    mockDraftId = draftId;
    useAppStore.getState().setDraftPhotos(draftId, ['photo-11', 'photo-12', 'photo-1']);

    useAppStore.setState(state => ({
      drafts: {
        ...state.drafts,
        [draftId]: {
          ...state.drafts[draftId],
          people: [],
          diary: {
            ...state.drafts[draftId].diary,
            people: [],
          },
        },
      },
    }));

    const startGeneration = jest.fn((id: string) => originalStartGeneration(id));
    let refreshCount = 0;
    const refreshDraftGeneration = jest.fn(async (id: string, round: number) => {
      refreshCount += 1;
      if (refreshCount === 1) {
        useAppStore.setState(state => ({
          drafts: {
            ...state.drafts,
            [id]: {
              ...state.drafts[id],
              diary: {
                ...state.drafts[id].diary,
                status: 'draft',
              },
              generation: {
                ...state.drafts[id].generation,
                round,
                remoteJobId: undefined,
                status: 'failed',
                remoteStage: 'failed',
                errorMessage: '生成超时，请稍后重试。',
              },
            },
          },
        }));
        return;
      }
      originalFinishGeneration(id, round);
    });

    useAppStore.setState({
      startGeneration,
      refreshDraftGeneration,
    });

    await render(<GeneratingScreen />);

    await waitFor(() => {
      expect(alertSpy).toHaveBeenCalledTimes(1);
    });

    const [title, message, buttons] = alertSpy.mock.calls[0] ?? [];
    expect(title).toBe('生成未完成');
    expect(message).toBe('生成超时，请稍后重试。');
    expect(mockRouter.replace).not.toHaveBeenCalled();

    await act(async () => {
      buttons?.[1]?.onPress?.();
      await Promise.resolve();
    });

    await waitFor(() => {
      expect(startGeneration).toHaveBeenCalledTimes(2);
      expect(refreshDraftGeneration).toHaveBeenCalledTimes(2);
      expect(useAppStore.getState().drafts[draftId].generation.status).toBe('complete');
    });
    expect(mockRouter.replace).not.toHaveBeenCalled();
  });

  test('generation job creation network failure shows the precise startup network copy and only retries after confirmation', async () => {
    const originalStartGeneration = useAppStore.getState().startGeneration;
    const originalFinishGeneration = useAppStore.getState().finishGeneration;
    const draftId = useAppStore.getState().beginCreation();
    mockDraftId = draftId;
    useAppStore.getState().setDraftPhotos(draftId, ['photo-11', 'photo-12', 'photo-1']);

    useAppStore.setState(state => ({
      drafts: {
        ...state.drafts,
        [draftId]: {
          ...state.drafts[draftId],
          people: [],
          diary: {
            ...state.drafts[draftId].diary,
            people: [],
          },
        },
      },
    }));

    const startGeneration = jest.fn((id: string) => originalStartGeneration(id));
    let refreshCount = 0;
    const refreshDraftGeneration = jest.fn(async (id: string, round: number) => {
      refreshCount += 1;
      if (refreshCount === 1) {
        useAppStore.setState(state => ({
          drafts: {
            ...state.drafts,
            [id]: {
              ...state.drafts[id],
              diary: {
                ...state.drafts[id].diary,
                status: 'draft',
              },
              generation: {
                ...state.drafts[id].generation,
                round,
                remoteJobId: undefined,
                status: 'failed',
                remoteStage: 'failed',
                errorMessage: '生成启动失败，请检查网络后重试。',
              },
            },
          },
        }));
        return;
      }
      originalFinishGeneration(id, round);
    });

    useAppStore.setState({
      startGeneration,
      refreshDraftGeneration,
    });

    await render(<GeneratingScreen />);

    await waitFor(() => {
      expect(alertSpy).toHaveBeenCalledTimes(1);
    });

    const [title, message, buttons] = alertSpy.mock.calls[0] ?? [];
    expect(title).toBe('生成未完成');
    expect(message).toBe('生成启动失败，请检查网络后重试。');
    expect(mockRouter.replace).not.toHaveBeenCalled();

    await act(async () => {
      buttons?.[1]?.onPress?.();
      await Promise.resolve();
    });

    await waitFor(() => {
      expect(startGeneration).toHaveBeenCalledTimes(2);
      expect(refreshDraftGeneration).toHaveBeenCalledTimes(2);
      expect(useAppStore.getState().drafts[draftId].generation.status).toBe('complete');
    });
    expect(mockRouter.replace).not.toHaveBeenCalled();
  });

  test('invalid generated structure shows the precise retry message and never navigates before retry succeeds', async () => {
    const originalStartGeneration = useAppStore.getState().startGeneration;
    const originalFinishGeneration = useAppStore.getState().finishGeneration;
    const draftId = useAppStore.getState().beginCreation();
    mockDraftId = draftId;
    useAppStore.getState().setDraftPhotos(draftId, ['photo-11', 'photo-12', 'photo-1']);

    useAppStore.setState(state => ({
      drafts: {
        ...state.drafts,
        [draftId]: {
          ...state.drafts[draftId],
          people: [],
          diary: {
            ...state.drafts[draftId].diary,
            people: [],
          },
        },
      },
    }));

    const startGeneration = jest.fn((id: string) => originalStartGeneration(id));
    let refreshCount = 0;
    const refreshDraftGeneration = jest.fn(async (id: string, round: number) => {
      refreshCount += 1;
      if (refreshCount === 1) {
        useAppStore.setState(state => ({
          drafts: {
            ...state.drafts,
            [id]: {
              ...state.drafts[id],
              diary: {
                ...state.drafts[id].diary,
                status: 'draft',
              },
              generation: {
                ...state.drafts[id].generation,
                round,
                status: 'failed',
                remoteStage: 'failed',
                errorMessage: '生成结果结构无效，请重新生成。',
              },
            },
          },
        }));
        return;
      }
      originalFinishGeneration(id, round);
    });

    useAppStore.setState({
      startGeneration,
      refreshDraftGeneration,
    });

    await render(<GeneratingScreen />);

    await waitFor(() => {
      expect(alertSpy).toHaveBeenCalledTimes(1);
    });

    const [title, message, buttons] = alertSpy.mock.calls[0] ?? [];
    expect(title).toBe('生成未完成');
    expect(message).toBe('生成结果结构无效，请重新生成。');
    expect(mockRouter.replace).not.toHaveBeenCalled();

    await act(async () => {
      buttons?.[1]?.onPress?.();
      await Promise.resolve();
    });

    await waitFor(() => {
      expect(startGeneration).toHaveBeenCalledTimes(2);
      expect(refreshDraftGeneration).toHaveBeenCalledTimes(2);
      expect(useAppStore.getState().drafts[draftId].generation.status).toBe('complete');
    });
    expect(mockRouter.replace).not.toHaveBeenCalled();
  });

  test('missing remote job shows the precise recovery message on the generating screen', async () => {
    const originalStartGeneration = useAppStore.getState().startGeneration;
    const originalFinishGeneration = useAppStore.getState().finishGeneration;
    const draftId = useAppStore.getState().beginCreation();
    mockDraftId = draftId;
    useAppStore.getState().setDraftPhotos(draftId, ['photo-11', 'photo-12', 'photo-1']);

    useAppStore.setState(state => ({
      drafts: {
        ...state.drafts,
        [draftId]: {
          ...state.drafts[draftId],
          people: [],
          diary: {
            ...state.drafts[draftId].diary,
            people: [],
          },
        },
      },
    }));

    const startGeneration = jest.fn((id: string) => originalStartGeneration(id));
    let refreshCount = 0;
    const refreshDraftGeneration = jest.fn(async (id: string, round: number) => {
      refreshCount += 1;
      if (refreshCount === 1) {
        useAppStore.setState(state => ({
          drafts: {
            ...state.drafts,
            [id]: {
              ...state.drafts[id],
              diary: {
                ...state.drafts[id].diary,
                status: 'draft',
              },
              generation: {
                ...state.drafts[id].generation,
                round,
                status: 'failed',
                remoteStage: 'failed',
                errorMessage: '生成任务已失效，请重新生成。',
              },
            },
          },
        }));
        return;
      }
      originalFinishGeneration(id, round);
    });

    useAppStore.setState({
      startGeneration,
      refreshDraftGeneration,
    });

    await render(<GeneratingScreen />);

    await waitFor(() => {
      expect(alertSpy).toHaveBeenCalledTimes(1);
    });

    const [title, message, buttons] = alertSpy.mock.calls[0] ?? [];
    expect(title).toBe('生成未完成');
    expect(message).toBe('生成任务已失效，请重新生成。');

    await act(async () => {
      buttons?.[1]?.onPress?.();
      await Promise.resolve();
    });

    await waitFor(() => {
      expect(startGeneration).toHaveBeenCalledTimes(2);
      expect(refreshDraftGeneration).toHaveBeenCalledTimes(2);
      expect(useAppStore.getState().drafts[draftId].generation.status).toBe('complete');
    });
  });

  test('missing remote draft shows the precise sync warning and only retries after explicit confirmation', async () => {
    const originalStartGeneration = useAppStore.getState().startGeneration;
    const originalFinishGeneration = useAppStore.getState().finishGeneration;
    const draftId = useAppStore.getState().beginCreation();
    mockDraftId = draftId;
    useAppStore.getState().setDraftPhotos(draftId, ['photo-11', 'photo-12', 'photo-1']);

    useAppStore.setState(state => ({
      drafts: {
        ...state.drafts,
        [draftId]: {
          ...state.drafts[draftId],
          people: [],
          diary: {
            ...state.drafts[draftId].diary,
            people: [],
          },
        },
      },
    }));

    const startGeneration = jest.fn((id: string) => originalStartGeneration(id));
    let refreshCount = 0;
    const refreshDraftGeneration = jest.fn(async (id: string, round: number) => {
      refreshCount += 1;
      if (refreshCount === 1) {
        useAppStore.setState(state => ({
          drafts: {
            ...state.drafts,
            [id]: {
              ...state.drafts[id],
              diary: {
                ...state.drafts[id].diary,
                status: 'draft',
              },
              generation: {
                ...state.drafts[id].generation,
                round,
                status: 'failed',
                remoteStage: 'failed',
                errorMessage: '当前草稿尚未同步完成，请稍后重试。',
              },
            },
          },
        }));
        return;
      }
      originalFinishGeneration(id, round);
    });

    useAppStore.setState({
      startGeneration,
      refreshDraftGeneration,
    });

    await render(<GeneratingScreen />);

    await waitFor(() => {
      expect(alertSpy).toHaveBeenCalledTimes(1);
    });

    const [title, message, buttons] = alertSpy.mock.calls[0] ?? [];
    expect(title).toBe('生成未完成');
    expect(message).toBe('当前草稿尚未同步完成，请稍后重试。');
    expect(mockRouter.replace).not.toHaveBeenCalled();

    await act(async () => {
      buttons?.[1]?.onPress?.();
      await Promise.resolve();
    });

    await waitFor(() => {
      expect(startGeneration).toHaveBeenCalledTimes(2);
      expect(refreshDraftGeneration).toHaveBeenCalledTimes(2);
      expect(useAppStore.getState().drafts[draftId].generation.status).toBe('complete');
    });
    expect(mockRouter.replace).not.toHaveBeenCalled();
  });

  test('permission denied shows the device-specific warning and waits for explicit retry', async () => {
    const originalStartGeneration = useAppStore.getState().startGeneration;
    const originalFinishGeneration = useAppStore.getState().finishGeneration;
    const draftId = useAppStore.getState().beginCreation();
    mockDraftId = draftId;
    useAppStore.getState().setDraftPhotos(draftId, ['photo-11', 'photo-12', 'photo-1']);

    useAppStore.setState(state => ({
      drafts: {
        ...state.drafts,
        [draftId]: {
          ...state.drafts[draftId],
          people: [],
          diary: {
            ...state.drafts[draftId].diary,
            people: [],
          },
        },
      },
    }));

    const startGeneration = jest.fn((id: string) => originalStartGeneration(id));
    let refreshCount = 0;
    const refreshDraftGeneration = jest.fn(async (id: string, round: number) => {
      refreshCount += 1;
      if (refreshCount === 1) {
        useAppStore.setState(state => ({
          drafts: {
            ...state.drafts,
            [id]: {
              ...state.drafts[id],
              diary: {
                ...state.drafts[id].diary,
                status: 'draft',
              },
              generation: {
                ...state.drafts[id].generation,
                round,
                status: 'failed',
                remoteStage: 'failed',
                errorMessage: '当前设备无法继续读取该生成任务，请重新生成。',
              },
            },
          },
        }));
        return;
      }
      originalFinishGeneration(id, round);
    });

    useAppStore.setState({
      startGeneration,
      refreshDraftGeneration,
    });

    await render(<GeneratingScreen />);

    await waitFor(() => {
      expect(alertSpy).toHaveBeenCalledTimes(1);
    });

    const [title, message, buttons] = alertSpy.mock.calls[0] ?? [];
    expect(title).toBe('生成未完成');
    expect(message).toBe('当前设备无法继续读取该生成任务，请重新生成。');
    expect(mockRouter.replace).not.toHaveBeenCalled();

    await act(async () => {
      buttons?.[1]?.onPress?.();
      await Promise.resolve();
    });

    await waitFor(() => {
      expect(startGeneration).toHaveBeenCalledTimes(2);
      expect(refreshDraftGeneration).toHaveBeenCalledTimes(2);
      expect(useAppStore.getState().drafts[draftId].generation.status).toBe('complete');
    });
    expect(mockRouter.replace).not.toHaveBeenCalled();
  });

  test('cancelled generation shows the precise cancel copy and only retries after confirmation', async () => {
    const originalStartGeneration = useAppStore.getState().startGeneration;
    const originalFinishGeneration = useAppStore.getState().finishGeneration;
    const draftId = useAppStore.getState().beginCreation();
    mockDraftId = draftId;
    useAppStore.getState().setDraftPhotos(draftId, ['photo-11', 'photo-12', 'photo-1']);

    useAppStore.setState(state => ({
      drafts: {
        ...state.drafts,
        [draftId]: {
          ...state.drafts[draftId],
          people: [],
          diary: {
            ...state.drafts[draftId].diary,
            people: [],
          },
        },
      },
    }));

    const startGeneration = jest.fn((id: string) => originalStartGeneration(id));
    let refreshCount = 0;
    const refreshDraftGeneration = jest.fn(async (id: string, round: number) => {
      refreshCount += 1;
      if (refreshCount === 1) {
        useAppStore.setState(state => ({
          drafts: {
            ...state.drafts,
            [id]: {
              ...state.drafts[id],
              diary: {
                ...state.drafts[id].diary,
                status: 'draft',
              },
              generation: {
                ...state.drafts[id].generation,
                round,
                status: 'cancelled',
                remoteStage: 'cancelled',
                errorMessage: '本次生成已取消。',
              },
            },
          },
        }));
        return;
      }
      originalFinishGeneration(id, round);
    });

    useAppStore.setState({
      startGeneration,
      refreshDraftGeneration,
    });

    await render(<GeneratingScreen />);

    await waitFor(() => {
      expect(alertSpy).toHaveBeenCalledTimes(1);
    });

    const [title, message, buttons] = alertSpy.mock.calls[0] ?? [];
    expect(title).toBe('生成未完成');
    expect(message).toBe('本次生成已取消。');
    expect(mockRouter.replace).not.toHaveBeenCalled();

    await act(async () => {
      buttons?.[1]?.onPress?.();
      await Promise.resolve();
    });

    await waitFor(() => {
      expect(startGeneration).toHaveBeenCalledTimes(2);
      expect(refreshDraftGeneration).toHaveBeenCalledTimes(2);
      expect(useAppStore.getState().drafts[draftId].generation.status).toBe('complete');
    });
    expect(mockRouter.replace).not.toHaveBeenCalled();
  });

  test('stage-only running generation shows fallback progress on the screen', async () => {
    const draftId = useAppStore.getState().beginCreation();
    mockDraftId = draftId;

    useAppStore.setState(state => ({
      drafts: {
        ...state.drafts,
        [draftId]: {
          ...state.drafts[draftId],
          diary: {
            ...state.drafts[draftId].diary,
            status: 'generating',
          },
          generation: {
            round: 1,
            progress: 80,
            status: 'running',
            remoteStage: 'structuring',
            remoteJobId: 'job-stage-only-ui',
            errorMessage: undefined,
          },
        },
      },
    }));

    const refreshDraftGeneration = jest.fn().mockResolvedValue(undefined);
    useAppStore.setState({
      refreshDraftGeneration,
    });

    const screen = await render(<GeneratingScreen />);

    await waitFor(() => {
      expect(screen.getByText('80%')).toBeTruthy();
      expect(screen.getByText('正在整理并校验结果')).toBeTruthy();
    }, { timeout: 2_500 });
  });

  test('missing generation preconditions show a clear failure instead of polling', async () => {
    const draftId = useAppStore.getState().beginCreation();
    mockDraftId = draftId;
    useAppStore.getState().setDraftPhotos(draftId, ['photo-11', 'photo-12']);

    const startGeneration = jest.fn(() => undefined);
    const refreshDraftGeneration = jest.fn();
    useAppStore.setState({
      startGeneration,
      refreshDraftGeneration,
    });

    await render(<GeneratingScreen />);

    await waitFor(() => {
      expect(alertSpy).toHaveBeenCalledTimes(1);
    });

    const [title, message, buttons] = alertSpy.mock.calls[0] ?? [];
    expect(title).toBe('生成未完成');
    expect(message).toBe('当前草稿还不能生成，请返回首页检查照片和排版师。');
    expect(startGeneration).toHaveBeenCalledWith(draftId);
    expect(refreshDraftGeneration).not.toHaveBeenCalled();

    await act(async () => {
      buttons?.[0]?.onPress?.();
    });

    expect(mockRouter.replace).toHaveBeenCalledWith('/(tabs)/home');
    expect(mockRouter.back).not.toHaveBeenCalled();
  });

  test('waits for each status request before polling again after three seconds', async () => {
    const draftId = useAppStore.getState().beginCreation();
    mockDraftId = draftId;
    useAppStore.getState().setDraftPhotos(draftId, ['photo-11', 'photo-12', 'photo-1']);

    const firstRefresh = createDeferred<void>();
    const secondRefresh = createDeferred<void>();
    const startGeneration = jest.fn((id: string) => {
      useAppStore.setState(state => ({
        drafts: {
          ...state.drafts,
          [id]: {
            ...state.drafts[id],
            diary: {
              ...state.drafts[id].diary,
              status: 'generating',
            },
            generation: {
              round: 1,
              progress: 0,
              status: 'running',
              remoteJobId: 'job-three-second-poll',
              remoteStage: 'analyzing-photos',
              errorMessage: undefined,
            },
          },
        },
      }));
      return 1;
    });
    const refreshDraftGeneration = jest.fn()
      .mockReturnValueOnce(firstRefresh.promise)
      .mockReturnValueOnce(secondRefresh.promise);
    const pauseGeneration = jest.fn();

    useAppStore.setState({
      startGeneration,
      refreshDraftGeneration,
      pauseGeneration,
    });

    jest.useFakeTimers();
    let unmount: (() => void) | undefined;
    try {
      const screen = await render(<GeneratingScreen />);
      unmount = screen.unmount;
      expect(refreshDraftGeneration).toHaveBeenCalledTimes(1);

      await act(async () => {
        jest.advanceTimersByTime(15_000);
      });
      expect(refreshDraftGeneration).toHaveBeenCalledTimes(1);

      await act(async () => {
        firstRefresh.resolve();
        await firstRefresh.promise;
      });

      await act(async () => {
        jest.advanceTimersByTime(2_999);
      });
      expect(refreshDraftGeneration).toHaveBeenCalledTimes(1);

      await act(async () => {
        jest.advanceTimersByTime(1);
      });
      expect(refreshDraftGeneration).toHaveBeenCalledTimes(2);

      secondRefresh.resolve();
      await secondRefresh.promise;
    } finally {
      await act(async () => {
        unmount?.();
      });
      jest.clearAllTimers();
      jest.useRealTimers();
    }
  });

  test('leaving the generating screen pauses the active round and ignores a late success', async () => {
    const draftId = useAppStore.getState().beginCreation();
    mockDraftId = draftId;
    useAppStore.getState().setDraftPhotos(draftId, ['photo-11', 'photo-12', 'photo-1']);

    const refreshDeferred = createDeferred<void>();
    const startGeneration = jest.fn((id: string) => {
      const round = 1;
      useAppStore.setState(state => ({
        drafts: {
          ...state.drafts,
          [id]: {
            ...state.drafts[id],
            diary: {
              ...state.drafts[id].diary,
              status: 'generating',
            },
            generation: {
              round,
              progress: 0,
              status: 'running',
              remoteJobId: 'job-leave-late-success',
              remoteStage: 'analyzing-photos',
              errorMessage: undefined,
            },
          },
        },
      }));
      return round;
    });
    const refreshDraftGeneration = jest.fn(() => refreshDeferred.promise);
    const pauseGeneration = jest.fn();

    useAppStore.setState({
      startGeneration,
      refreshDraftGeneration,
      pauseGeneration,
    });

    const screen = await render(<GeneratingScreen />);

    await waitFor(() => {
      expect(refreshDraftGeneration).toHaveBeenCalledWith(draftId, 1);
    });

    await act(async () => {
      screen.unmount();
    });

    expect(pauseGeneration).toHaveBeenCalledWith(draftId, 1);

    useAppStore.setState(state => ({
      drafts: {
        ...state.drafts,
        [draftId]: {
          ...state.drafts[draftId],
          people: [],
          diary: {
            ...state.drafts[draftId].diary,
            status: 'ready',
            title: '晚到的成功结果',
            summary: '这条结果不该在离开页面后继续触发导航。',
          },
          generation: {
            ...state.drafts[draftId].generation,
            round: 1,
            progress: 100,
            status: 'complete',
            remoteStage: 'completed',
            errorMessage: undefined,
          },
        },
      },
    }));

    await act(async () => {
      refreshDeferred.resolve();
      await refreshDeferred.promise;
      await Promise.resolve();
    });

    expect(mockRouter.replace).not.toHaveBeenCalled();
  });

  test('switching from round A to completed round B ignores A late success without navigating early', async () => {
    const draftA = useAppStore.getState().beginCreation();
    const draftB = useAppStore.getState().beginCreation();
    useAppStore.getState().setDraftPhotos(draftA, ['photo-11', 'photo-12', 'photo-1']);
    useAppStore.getState().setDraftPhotos(draftB, ['photo-11', 'photo-12', 'photo-1']);
    mockDraftId = draftA;

    const refreshADeferred = createDeferred<void>();
    const startGeneration = jest.fn((id: string) => {
      const round = 1;
      useAppStore.setState(state => ({
        drafts: {
          ...state.drafts,
          [id]: {
            ...state.drafts[id],
            diary: {
              ...state.drafts[id].diary,
              status: 'generating',
            },
            generation: {
              round,
              progress: 0,
              status: 'running',
              remoteJobId: `job-${id}`,
              remoteStage: 'analyzing-photos',
              errorMessage: undefined,
            },
          },
        },
      }));
      return round;
    });
    const refreshDraftGeneration = jest.fn(async (id: string, round: number) => {
      if (id === draftA) {
        await refreshADeferred.promise;
        return;
      }
      useAppStore.setState(state => ({
        drafts: {
          ...state.drafts,
          [id]: {
            ...state.drafts[id],
            people: [],
            diary: {
              ...state.drafts[id].diary,
              title: 'B 轮次完成结果',
              summary: '只有 B 可以触发导航。',
              location: '台南',
              date: '2026.10.13',
              people: [],
              companionName: '自己',
              status: 'ready',
            },
            generation: {
              round,
              progress: 100,
              status: 'complete',
              remoteJobId: `job-${id}`,
              remoteStage: 'completed',
              errorMessage: undefined,
            },
          },
        },
      }));
    });
    const pauseGeneration = jest.fn();

    useAppStore.setState({
      startGeneration,
      refreshDraftGeneration,
      pauseGeneration,
    });

    const screen = await render(<GeneratingScreen />);

    await waitFor(() => {
      expect(refreshDraftGeneration).toHaveBeenCalledWith(draftA, 1);
    });

    mockDraftId = draftB;
    await act(async () => {
      await screen.rerender(<GeneratingScreen />);
    });

    await waitFor(() => {
      expect(pauseGeneration).toHaveBeenCalledWith(draftA, 1);
      expect(refreshDraftGeneration).toHaveBeenCalledWith(draftB, 1);
      expect(useAppStore.getState().drafts[draftB].generation.status).toBe('complete');
    });
    expect(mockRouter.replace).not.toHaveBeenCalled();

    useAppStore.setState(state => ({
      drafts: {
        ...state.drafts,
        [draftA]: {
          ...state.drafts[draftA],
          people: [],
          diary: {
            ...state.drafts[draftA].diary,
            title: 'A 轮次迟到结果',
            summary: '这条结果不该覆盖 B。',
            status: 'ready',
          },
          generation: {
            ...state.drafts[draftA].generation,
            round: 1,
            progress: 100,
            status: 'complete',
            remoteStage: 'completed',
            errorMessage: undefined,
          },
        },
      },
    }));

    await act(async () => {
      refreshADeferred.resolve();
      await refreshADeferred.promise;
      await Promise.resolve();
    });

    expect(mockRouter.replace).not.toHaveBeenCalled();
    expect(mockRouter.replace).not.toHaveBeenCalledWith({
      pathname: '/diary/[id]/edit',
      params: { id: 'new', draftId: draftA },
    });
  });

  test('generation with no detected people routes directly to edit', async () => {
    const draftId = useAppStore.getState().beginCreation();
    mockDraftId = draftId;
    const initialDiaryCount = useAppStore.getState().diaries.length;

    useAppStore.getState().setDraftPhotos(draftId, ['photo-11', 'photo-12', 'photo-1']);

    const startGeneration = jest.fn((id: string) => {
      const round = 1;
      useAppStore.setState(state => ({
        drafts: {
          ...state.drafts,
          [id]: {
            ...state.drafts[id],
            diary: {
              ...state.drafts[id].diary,
              status: 'generating',
            },
            generation: {
              round,
              progress: 0,
              status: 'running',
              remoteJobId: 'job-no-people',
              remoteStage: 'queued',
              errorMessage: undefined,
            },
          },
        },
      }));
      return round;
    });

    const refreshDraftGeneration = jest.fn(async (id: string, round: number) => {
      useAppStore.setState(state => ({
        drafts: {
          ...state.drafts,
          [id]: {
            ...state.drafts[id],
            people: [],
            diary: {
              ...state.drafts[id].diary,
              title: '没有人物候选',
              summary: '直接进入编辑页。',
              location: '台南',
              date: '2026.10.13',
              people: [],
              companionName: '自己',
              status: 'ready',
            },
            generation: {
              round,
              progress: 100,
              status: 'complete',
              remoteJobId: 'job-no-people',
              remoteStage: 'completed',
              errorMessage: undefined,
            },
          },
        },
      }));
    });

    useAppStore.setState({
      startGeneration,
      refreshDraftGeneration,
    });

    jest.useFakeTimers();
    const screen = await render(<GeneratingScreen />);
    try {
      await act(async () => {
        await Promise.resolve();
        await Promise.resolve();
      });
      expect(useAppStore.getState().drafts[draftId].generation.status).toBe('complete');
      expect(mockRouter.replace).not.toHaveBeenCalled();
      await advanceVisiblePhase();
      expect(mockRouter.replace).not.toHaveBeenCalled();
      await advanceVisiblePhase();
      expect(mockRouter.replace).not.toHaveBeenCalled();
      await advanceVisiblePhase();
      expect(mockRouter.replace).toHaveBeenCalledWith({
        pathname: '/diary/[id]/edit',
        params: { id: 'new', draftId },
      });
      expect(useAppStore.getState().drafts[draftId].savedDiaryId).toBeUndefined();
      expect(useAppStore.getState().diaries).toHaveLength(initialDiaryCount);
    } finally {
      screen.unmount();
      jest.clearAllTimers();
      jest.useRealTimers();
    }
  });

  test('generation with detected people routes to naming and does not save a diary yet', async () => {
    const draftId = useAppStore.getState().beginCreation();
    mockDraftId = draftId;
    const initialDiaryCount = useAppStore.getState().diaries.length;

    useAppStore.getState().setDraftPhotos(draftId, ['photo-11', 'photo-12', 'photo-1']);

    const startGeneration = jest.fn((id: string) => {
      const round = 1;
      useAppStore.setState(state => ({
        drafts: {
          ...state.drafts,
          [id]: {
            ...state.drafts[id],
            diary: {
              ...state.drafts[id].diary,
              status: 'generating',
            },
            generation: {
              round,
              progress: 0,
              status: 'running',
              remoteJobId: 'job-with-people',
              remoteStage: 'queued',
              errorMessage: undefined,
            },
          },
        },
      }));
      return round;
    });

    const refreshDraftGeneration = jest.fn(async (id: string, round: number) => {
      useAppStore.setState(state => ({
        drafts: {
          ...state.drafts,
          [id]: {
            ...state.drafts[id],
            people: [
              {
                id: 'person-friend',
                name: '同行人',
                avatarPhotoId: 'photo-11',
                photoIds: ['photo-11'],
                aliases: [],
              },
            ],
            diary: {
              ...state.drafts[id].diary,
              title: '有人物候选',
              summary: '先去命名页确认人物。',
              location: '台南',
              date: '2026.10.13',
              people: [
                {
                  id: 'person-friend',
                  name: '同行人',
                  avatarPhotoId: 'photo-11',
                  photoIds: ['photo-11'],
                  aliases: [],
                },
              ],
              companionName: '同行人',
              status: 'ready',
            },
            generation: {
              round,
              progress: 100,
              status: 'complete',
              remoteJobId: 'job-with-people',
              remoteStage: 'completed',
              errorMessage: undefined,
            },
          },
        },
      }));
    });

    useAppStore.setState({
      startGeneration,
      refreshDraftGeneration,
    });

    jest.useFakeTimers();
    const screen = await render(<GeneratingScreen />);
    try {
      await act(async () => {
        await Promise.resolve();
        await Promise.resolve();
      });
      expect(useAppStore.getState().drafts[draftId].generation.status).toBe('complete');
      expect(mockRouter.replace).not.toHaveBeenCalled();
      await advanceVisiblePhase();
      expect(mockRouter.replace).not.toHaveBeenCalled();
      await advanceVisiblePhase();
      expect(mockRouter.replace).not.toHaveBeenCalled();
      await advanceVisiblePhase();
      expect(mockRouter.replace).toHaveBeenCalledWith({
        pathname: '/companion/naming',
        params: { draftId },
      });
      expect(useAppStore.getState().drafts[draftId].savedDiaryId).toBeUndefined();
      expect(useAppStore.getState().diaries).toHaveLength(initialDiaryCount);
    } finally {
      screen.unmount();
      jest.clearAllTimers();
      jest.useRealTimers();
    }
  });
});
