import { useCallback } from 'react';
import { Alert, Image, StyleSheet, Text, View } from 'react-native';
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

const phaseIcons = ['images-outline', 'location-outline', 'create-outline'] as const;
const phaseTitles = ['正在分析照片内容', '正在整理这次旅程', '正在将美好串成文字…'];

function getStageProgress(progress: number, stage?: string) {
  if (stage === 'completed') return 100;
  if (stage === 'structuring') return Math.max(progress, 82);
  if (stage === 'drafting') return Math.max(progress, 48);
  if (stage === 'analyzing-photos') return Math.max(progress, 18);
  return progress;
}

export default function Generating() {
  const { draft, router } = useDraftRoute();
  const id = draft?.id;

  useFocusEffect(useCallback(() => {
    if (!id) return;

    let finished = false;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let activeRound: number | undefined;

    const goNext = () => {
      if (finished) return;
      finished = true;
      const current = useAppStore.getState().drafts[id];
      if (!current) return;
      router.replace({
        pathname: current.people.length ? '/companion/naming' : '/diary/[id]/edit',
        params: current.people.length ? { draftId: id } : { id: 'new', draftId: id },
      });
    };

    const showFailure = (message: string) => {
      if (finished) return;
      finished = true;
      Alert.alert('生成未完成', message, [
        {
          text: '返回上一页',
          onPress: () => router.back(),
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
        goNext();
        return;
      }
      if (before.generation.status === 'failed' || before.generation.status === 'cancelled') {
        showFailure(before.generation.errorMessage ?? '请返回上一页后重新发起生成。');
        return;
      }

      await useAppStore.getState().refreshDraftGeneration(id, round);

      const after = useAppStore.getState().drafts[id];
      if (!after || after.generation.round !== round || cancelled || finished) return;
      if (after.generation.status === 'complete') {
        goNext();
        return;
      }
      if (after.generation.status === 'failed' || after.generation.status === 'cancelled') {
        showFailure(after.generation.errorMessage ?? '请返回上一页后重新发起生成。');
        return;
      }

      timer = setTimeout(() => {
        void poll(round);
      }, after.generation.remoteJobId ? 700 : 250);
    };

    const beginAttempt = () => {
      const current = useAppStore.getState().drafts[id];
      if (current?.generation.status === 'complete') {
        goNext();
        return;
      }

      const round = useAppStore.getState().startGeneration(id);
      if (round === undefined) {
        showFailure('当前草稿还不能生成，请返回上一页检查照片和排版师。');
        return;
      }
      activeRound = round;
      void poll(round);
    };

    const current = useAppStore.getState().drafts[id];
    if (current?.generation.status === 'complete') {
      goNext();
      return;
    }

    beginAttempt();

    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
      if (activeRound !== undefined) {
        useAppStore.getState().pauseGeneration(id, activeRound);
      }
    };
  }, [id, router]));

  if (!draft) return <Screen><Empty title="没有待生成的日记" home /></Screen>;

  const progress = getStageProgress(draft.generation.progress, draft.generation.remoteStage);

  return (
    <Screen scroll={false} header={<TopBar onBackPress={() => router.back()} />}>
      <View style={s.content}>
        <Image source={art.generationHero} style={s.hero} resizeMode="contain" />
        <Text style={s.title}>小橘正在帮你{'\n'}生成回忆日记中…</Text>
        <View style={s.track}>
          <LinearGradient colors={[colors.brandDeep, colors.brand]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={[s.fill, { width: `${Math.max(progress, 9)}%` }]} />
          <Text style={s.percent}>{progress}%</Text>
        </View>
        {phaseTitles.map((title, index) => {
          const ready = progress >= [18, 48, 82][index];
          return (
            <View style={s.phase} key={title}>
              <Ionicons name={ready ? 'checkmark-circle' : 'ellipse-outline'} size={18} color={ready ? colors.success : colors.brand} />
              <Ionicons name={phaseIcons[index]} size={18} color={colors.brand} />
              <Text style={[s.phaseText, { opacity: ready ? 1 : 0.65 }]}>{title}</Text>
              {ready ? <Ionicons name="checkmark" size={16} color={colors.success} /> : null}
            </View>
          );
        })}
        <Text style={s.note}>找到了 3 个地点 · {draft.selectedPhotoIds.length} 张照片 · 让回忆有温度</Text>
      </View>
    </Screen>
  );
}

const s = StyleSheet.create({
  content: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingBottom: 55, gap: 16 },
  hero: { width: 290, height: 292 },
  title: { fontSize: 24, lineHeight: 32, fontWeight: '700', color: colors.brandStrong, textAlign: 'center' },
  track: { width: '80%', height: 19, borderRadius: 12, backgroundColor: '#F2E8D7', overflow: 'hidden' },
  fill: { height: '100%', borderRadius: 12 },
  percent: { position: 'absolute', alignSelf: 'center', top: 2, fontSize: 11, color: 'white', fontWeight: '600' },
  phase: { flexDirection: 'row', gap: 12, alignItems: 'center', width: '79%' },
  phaseText: { flex: 1, fontSize: 12, color: colors.textSecondary },
  note: { fontSize: 10, color: colors.textMuted, marginTop: 7 },
});
