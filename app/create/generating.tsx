import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Alert, Animated, Easing, Image, StyleSheet, Text, View } from 'react-native';
import { useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { Screen } from '../../src/components/layout/screen';
import { TopBar } from '../../src/components/layout/top-bar';
import { Empty } from '../../src/components/common/design-ui';
import { useDraftRoute } from '../../src/hooks/use-diary-flow';
import { useAppStore } from '../../src/store/use-app-store';
import { art } from '../../src/theme/assets';
import { colors } from '../../src/theme/tokens';
import type { GenerationProgressMilestone, GenerationStage } from '../../src/types/diary';

const phaseIcons = ['images-outline', 'create-outline', 'checkmark-done-outline'] as const;
const phaseTitles = ['正在检查照片素材', '正在等待模型创作', '正在整理并校验结果'];
const progressByStage: Record<GenerationStage, number> = {
  queued: 0,
  'analyzing-photos': 0,
  drafting: 25,
  structuring: 80,
  completed: 100,
  failed: 0,
  cancelled: 0,
};
const GENERATION_STATUS_POLL_INTERVAL_MS = 3_000;
const GENERATION_JOB_START_CHECK_INTERVAL_MS = 250;
const MIN_PHASE_DISPLAY_MS = 3_000;
const GENERATION_PROGRESS_MILESTONES = [15, 25, 80, 95, 100] as const;
const WAITING_PROGRESS_PERCENT_PER_SECOND = 2;

function getWaitingProgressTarget(progress: number) {
  const nextMilestone = GENERATION_PROGRESS_MILESTONES.find(value => value > progress);
  return nextMilestone === undefined
    ? progress
    : Math.max(progress, nextMilestone - 1);
}

function getTargetPhase(stage: GenerationStage, milestones?: GenerationProgressMilestone[]) {
  if (milestones?.length) {
    let target = 0;
    milestones.forEach(({ milestoneId }) => {
      if (milestoneId === 'provider-submitted') target = Math.max(target, 1);
      if (
        milestoneId === 'provider-response-received'
        || milestoneId === 'result-validated'
        || milestoneId === 'completed'
      ) target = Math.max(target, 2);
    });
    return target;
  }
  if (stage === 'drafting') return 1;
  if (stage === 'structuring' || stage === 'completed') return 2;
  return 0;
}

function isPhaseCompleteFromBackend(
  index: number,
  stage: GenerationStage,
  status: string,
  milestones?: GenerationProgressMilestone[],
) {
  if (milestones?.length) {
    const reached = new Set(milestones.map(item => item.milestoneId));
    if (index === 0) return reached.has('provider-submitted');
    if (index === 1) return reached.has('provider-response-received');
    return reached.has('result-validated') || reached.has('completed');
  }
  if (index === 0) return ['drafting', 'structuring', 'completed'].includes(stage);
  if (index === 1) return ['structuring', 'completed'].includes(stage);
  return status === 'complete' || stage === 'completed';
}

export default function Generating() {
  const { draft, router } = useDraftRoute();
  const id = draft?.id;
  const progressValue = useRef(new Animated.Value(0)).current;
  const displayedProgressRef = useRef(0);
  const [displayedProgress, setDisplayedProgress] = useState(0);
  const [visiblePhase, setVisiblePhase] = useState(0);
  const [phaseMinimumElapsed, setPhaseMinimumElapsed] = useState(false);
  const [successReady, setSuccessReady] = useState(false);
  const [isPageFocused, setIsPageFocused] = useState(false);
  const round = draft?.generation.round;
  const stage = draft?.generation.remoteStage ?? 'queued';
  const progress = draft
    ? Math.max(0, Math.min(100, draft.generation.progress ?? progressByStage[stage]))
    : 0;
  const targetPhase = draft
    ? getTargetPhase(stage, draft.generation.progressMilestones)
    : 0;
  const progressKey = id === undefined || round === undefined ? undefined : `${id}:${round}`;
  const lastProgressKey = useRef<string | undefined>(undefined);
  const lastPhaseKey = useRef<string | undefined>(undefined);
  const phaseStartedAt = useRef(Date.now());
  const focusActive = useRef(false);
  const navigationDone = useRef(false);

  useEffect(() => {
    const subscription = progressValue.addListener(({ value }) => {
      const next = Math.floor(value);
      displayedProgressRef.current = value;
      setDisplayedProgress(previous => previous === next ? previous : next);
    });
    return () => {
      progressValue.removeListener(subscription);
      progressValue.stopAnimation();
    };
  }, [progressValue]);

  useEffect(() => {
    if (!progressKey) return;
    if (lastProgressKey.current !== progressKey) {
      progressValue.stopAnimation();
      progressValue.setValue(0);
      displayedProgressRef.current = 0;
      setDisplayedProgress(0);
      lastProgressKey.current = progressKey;
    }

    const remaining = Math.max(0, progress - displayedProgressRef.current);
    const isGenerationActive = draft?.generation.status === 'running';
    const startWaitingAnimation = () => {
      if (!isPageFocused || !isGenerationActive) return undefined;
      const waitingTarget = getWaitingProgressTarget(progress);
      const waitingDistance = waitingTarget - progress;
      if (waitingDistance <= 0) return undefined;

      const animation = Animated.timing(progressValue, {
        toValue: waitingTarget,
        duration: Math.ceil(waitingDistance / WAITING_PROGRESS_PERCENT_PER_SECOND * 1_000),
        easing: Easing.linear,
        useNativeDriver: false,
      });
      animation.start();
      return animation;
    };

    let waitingAnimation: Animated.CompositeAnimation | undefined;
    if (remaining === 0) {
      waitingAnimation = startWaitingAnimation();
      return () => waitingAnimation?.stop();
    }

    const confirmedAnimation = Animated.timing(progressValue, {
      toValue: progress,
      duration: Math.min(1_800, Math.max(650, remaining * 28)),
      easing: Easing.out(Easing.cubic),
      useNativeDriver: false,
    });
    confirmedAnimation.start(({ finished }) => {
      if (finished) waitingAnimation = startWaitingAnimation();
    });
    return () => {
      confirmedAnimation.stop();
      waitingAnimation?.stop();
    };
  }, [draft?.generation.status, isPageFocused, progressKey, progress, progressValue]);

  useEffect(() => {
    if (!progressKey || lastPhaseKey.current === progressKey) return;
    lastPhaseKey.current = progressKey;
    phaseStartedAt.current = Date.now();
    setVisiblePhase(0);
    setPhaseMinimumElapsed(false);
    setSuccessReady(false);
    navigationDone.current = false;
  }, [progressKey]);

  useEffect(() => {
    if (!isPageFocused || !progressKey || draft?.generation.status === 'failed' || draft?.generation.status === 'cancelled') return;
    const elapsed = Date.now() - phaseStartedAt.current;
    const remaining = Math.max(0, MIN_PHASE_DISPLAY_MS - elapsed);
    const timer = setTimeout(() => {
      if (targetPhase > visiblePhase) {
        setVisiblePhase(current => Math.min(targetPhase, current + 1));
        phaseStartedAt.current = Date.now();
        setPhaseMinimumElapsed(false);
      } else if (!phaseMinimumElapsed) {
        setPhaseMinimumElapsed(true);
      }
    }, remaining);
    return () => clearTimeout(timer);
  }, [draft?.generation.status, isPageFocused, phaseMinimumElapsed, progressKey, targetPhase, visiblePhase]);

  useEffect(() => {
    if (!id || !isPageFocused || !focusActive.current || navigationDone.current || !successReady
      || visiblePhase !== 2 || !phaseMinimumElapsed) return;
    const current = useAppStore.getState().drafts[id];
    if (!current || current.generation.status !== 'complete') return;
    navigationDone.current = true;
    router.replace({
      pathname: current.people.length ? '/companion/naming' : '/diary/[id]/edit',
      params: current.people.length ? { draftId: id } : { id: 'new', draftId: id },
    });
  }, [id, isPageFocused, phaseMinimumElapsed, router, successReady, visiblePhase]);

  useFocusEffect(useCallback(() => {
    if (!id) return;

    let finished = false;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let activeRound: number | undefined;
    focusActive.current = true;
    navigationDone.current = false;
    setIsPageFocused(true);
    setSuccessReady(false);

    const showFailure = (message: string) => {
      if (finished) return;
      finished = true;
      Alert.alert('生成未完成', message, [
        {
          text: '返回首页',
          onPress: () => router.replace('/(tabs)/home'),
        },
        {
          text: '重新生成',
          onPress: () => {
            finished = false;
            beginAttempt();
          },
        },
      ]);
    };

    const poll = async (round: number) => {
      if (cancelled || finished) return;

      const before = useAppStore.getState().drafts[id];
      if (!before || before.generation.round !== round) return;
      if (before.generation.status === 'complete') {
        setSuccessReady(true);
        return;
      }
      if (before.generation.status === 'failed' || before.generation.status === 'cancelled') {
        showFailure(before.generation.errorMessage ?? '请返回首页后重新发起生成。');
        return;
      }

      await useAppStore.getState().refreshDraftGeneration(id, round);

      const after = useAppStore.getState().drafts[id];
      if (!after || after.generation.round !== round || cancelled || finished) return;
      if (after.generation.status === 'complete') {
        setSuccessReady(true);
        return;
      }
      if (after.generation.status === 'failed' || after.generation.status === 'cancelled') {
        showFailure(after.generation.errorMessage ?? '请返回首页后重新发起生成。');
        return;
      }

      timer = setTimeout(() => {
        void poll(round);
      }, after.generation.remoteJobId
        ? GENERATION_STATUS_POLL_INTERVAL_MS
        : GENERATION_JOB_START_CHECK_INTERVAL_MS);
    };

    const beginAttempt = () => {
      const current = useAppStore.getState().drafts[id];
      if (current?.generation.status === 'complete') {
        setSuccessReady(true);
        return;
      }

      const round = useAppStore.getState().startGeneration(id);
      if (round === undefined) {
        showFailure('当前草稿还不能生成，请返回首页检查照片和排版师。');
        return;
      }
      activeRound = round;
      void poll(round);
    };

    const current = useAppStore.getState().drafts[id];
    if (current?.generation.status === 'complete') {
      setSuccessReady(true);
      return () => {
        focusActive.current = false;
        setIsPageFocused(false);
      };
    }

    beginAttempt();

    return () => {
      cancelled = true;
      focusActive.current = false;
      setIsPageFocused(false);
      setSuccessReady(false);
      if (timer) clearTimeout(timer);
      if (activeRound !== undefined) {
        useAppStore.getState().pauseGeneration(id, activeRound);
      }
    };
  }, [id, router]));

  if (!draft) return <Screen><Empty title="没有待生成的日记" home /></Screen>;

  return (
    <Screen scroll={false} header={<TopBar onBackPress={() => router.back()} />}>
      <View style={s.content}>
        <Image source={art.generationHero} style={s.hero} resizeMode="contain" />
        <Text style={s.title}>小橘正在帮你{'\n'}生成回忆日记中…</Text>
        <View
          style={s.track}
          accessible
          accessibilityRole="progressbar"
          accessibilityValue={{ min: 0, max: 100, now: displayedProgress }}
        >
          <Animated.View style={[s.fill, { width: progressValue.interpolate({
            inputRange: [0, 100],
            outputRange: ['0%', '100%'],
          }) }]}>
            <LinearGradient colors={[colors.brandDeep, colors.brand]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={s.gradient} />
          </Animated.View>
          <Text style={s.percent}>{displayedProgress}%</Text>
        </View>
        {phaseTitles.map((title, index) => {
          const terminalFailure = draft.generation.status === 'failed' || draft.generation.status === 'cancelled';
          const complete = !terminalFailure && (
            index < visiblePhase
            || (
              index === visiblePhase
              && phaseMinimumElapsed
              && targetPhase === visiblePhase
              && isPhaseCompleteFromBackend(index, stage, draft.generation.status, draft.generation.progressMilestones)
            )
          );
          const active = !terminalFailure && index === visiblePhase && !complete;
          return (
            <View style={s.phase} key={title}>
              {active ? (
                <ActivityIndicator
                  size={18}
                  color={colors.brand}
                  accessibilityLabel={`${title}进行中`}
                />
              ) : (
                <Ionicons
                  name={complete ? 'checkmark-circle' : 'ellipse-outline'}
                  size={18}
                  color={complete ? colors.success : colors.brand}
                />
              )}
              <Ionicons name={phaseIcons[index]} size={18} color={colors.brand} />
              <Text style={[s.phaseText, { opacity: active || complete ? 1 : 0.65 }]}>{title}</Text>
              {complete ? <Ionicons name="checkmark" size={16} color={colors.success} /> : null}
            </View>
          );
        })}
        <Text style={s.note}>{draft.selectedPhotoIds.length} 张照片 · 让回忆有温度</Text>
      </View>
    </Screen>
  );
}

const s = StyleSheet.create({
  content: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingBottom: 55, gap: 16 },
  hero: { width: 290, height: 292 },
  title: { fontSize: 24, lineHeight: 32, fontWeight: '700', color: colors.brandStrong, textAlign: 'center' },
  track: { width: '80%', height: 19, borderRadius: 12, backgroundColor: '#F2E8D7', overflow: 'hidden' },
  fill: { height: '100%', borderRadius: 12, overflow: 'hidden' },
  gradient: { width: '100%', height: '100%' },
  percent: { position: 'absolute', alignSelf: 'center', top: 2, fontSize: 11, color: 'white', fontWeight: '600' },
  phase: { flexDirection: 'row', gap: 12, alignItems: 'center', width: '79%' },
  phaseText: { flex: 1, fontSize: 12, color: colors.textSecondary },
  note: { fontSize: 10, color: colors.textMuted, marginTop: 7 },
});
