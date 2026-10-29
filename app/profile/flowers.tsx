import { useCallback, useEffect, useState } from 'react';
import { Alert, Pressable, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useFocusEffect, useRouter } from 'expo-router';
import { GrowthScreen } from '../../src/components/profile/growth-screen';
import { GrowthArtwork } from '../../src/components/profile/growth-artwork';
import { TopBar } from '../../src/components/layout/top-bar';
import { Button } from '../../src/components/common/button';
import { GROWTH_FLOWER_IDS } from '../../src/contracts/growth-insight-contract';
import { useAppStore } from '../../src/store/use-app-store';
import { useAIConsent } from '../../src/hooks/use-ai-consent';

export default function FlowersScreen() {
  const router = useRouter();
  const { width } = useWindowDimensions();
  const contentWidth = Math.min(width, 480) - 22;
  const state = useAppStore(value => value.growthInsights);
  const status = useAppStore(value => value.growthInsightsStatus);
  const error = useAppStore(value => value.growthInsightsError);
  const loadGrowthInsights = useAppStore(value => value.loadGrowthInsights);
  const initializeGrowthFlowers = useAppStore(value => value.initializeGrowthFlowers);
  const retryGrowthFlowers = useAppStore(value => value.retryGrowthFlowers);
  const { authorize, requestingConsent, cancelConsent } = useAIConsent();
  const [consentDeclined, setConsentDeclined] = useState(false);
  const bloomedCount = state?.flowers.filter(flower => flower.status === 'bloomed').length ?? 0;
  const flowerStates = Object.fromEntries(
    GROWTH_FLOWER_IDS.map(id => [id, state?.flowers.find(flower => flower.flowerId === id)?.status === 'bloomed']),
  ) as Record<(typeof GROWTH_FLOWER_IDS)[number], boolean>;

  useFocusEffect(useCallback(() => {
    let active = true;
    void (async () => {
      const current = await loadGrowthInsights();
      if (active && current?.flowerAnalysis.status === 'not_started') {
        const allowed = await authorize('insights');
        if (!active) return;
        setConsentDeclined(!allowed);
        if (!allowed) return;
        await initializeGrowthFlowers();
      }
    })();
    return () => { active = false; cancelConsent(); };
  }, [authorize, cancelConsent, initializeGrowthFlowers, loadGrowthInsights]));

  useEffect(() => {
    const analysisStatus = state?.flowerAnalysis.status;
    if (analysisStatus !== 'pending' && analysisStatus !== 'running') return undefined;
    const timer = setTimeout(() => { void loadGrowthInsights(); }, 3_000);
    return () => clearTimeout(timer);
  }, [loadGrowthInsights, state?.flowerAnalysis.status, state?.flowerAnalysis.completedBatches]);

  const onReportPress = () => {
    if (!state) {
      Alert.alert('成长状态暂不可用', '读取成功后才能确认报告是否解锁。');
      return;
    }
    if (state.report.unlocked) {
      router.push('/profile/report');
      return;
    }
    Alert.alert('继续完成成长记录', `已完成 ${bloomedCount}/3 项，完成首次旅行、连续记录 30 天和 100 个锚点后即可查看专属洞察报告。`);
  };

  return <GrowthScreen header={<View style={s.header}><TopBar title="记忆花朵" onBackPress={() => {cancelConsent();router.canGoBack() ? router.back() : router.replace('/profile/insights');}} /></View>} contentStyle={s.content}>
    {state
      ? <GrowthArtwork kind="flowers" width={contentWidth} flowerStates={flowerStates} />
      : <View style={[s.artworkLoading, { width: contentWidth }]}><Text style={s.status}>正在读取记忆花朵…</Text></View>}
    <View style={s.lower}>
      <View style={s.milestonePanel}>
        <Text style={s.section}>成长记录</Text>
        {consentDeclined ? <View style={s.retry}>
          <Text style={s.status}>尚未授权全库分析，已有记录保持不变。</Text>
          <Button disabled={requestingConsent} label="授权并整理日记" onPress={() => { void (async () => {
            if (!(await authorize('insights'))) return;
            setConsentDeclined(false);
            await initializeGrowthFlowers();
          })(); }} />
        </View> : null}
        {state?.flowerAnalysis.status === 'pending' || state?.flowerAnalysis.status === 'running'
          ? <Text style={s.status}>小橘正在从你的日记里认识你…（{state.flowerAnalysis.completedBatches}/{state.flowerAnalysis.totalBatches}）</Text>
          : null}
        {status === 'loading' && !state ? <Text style={s.status}>正在读取成长记录…</Text> : null}
        {status === 'error' && !state
          ? <View style={s.retry}><Text style={s.error}>{error ?? '成长记录暂时无法读取。'}</Text><Button label="重新读取成长记录" onPress={() => { void loadGrowthInsights(); }} /></View>
          : null}
        {status === 'error' && state ? <Text style={s.error}>{error ?? '成长状态更新失败，当前显示上次成功读取的数据。'}</Text> : null}
        {state?.flowerAnalysis.status === 'failed'
          ? <View style={s.retry}><Text style={s.error}>花朵识别暂时没有完成，已有的成长记录仍会保留。</Text><Button disabled={requestingConsent} label="重试识别" onPress={() => { void (async () => {
            if (await authorize('insights')) await retryGrowthFlowers();
          })(); }} /></View>
          : null}
        {state?.flowerAnalysis.status === 'succeeded' && state.flowers.every(flower => flower.status === 'locked')
          ? <Text style={s.unavailable}>目前还没有足够的日记线索绽放花朵，保存新的日记后小橘会继续认识你。</Text>
          : null}
        {state ? <View style={s.milestones}>
          <Milestone title="首次旅行" detail={state.milestones.firstTrip.achieved ? '已从日记中找到旅行回忆' : '等待旅行日记线索'} complete={state.milestones.firstTrip.achieved} />
          <Milestone
            title="连续记录30天"
            detail={state.milestones.streak30.achieved && state.milestones.streak30.currentDays < 30
              ? `已达成 · 当前 ${state.milestones.streak30.currentDays}/30 天`
              : `${state.milestones.streak30.currentDays}/30 天`}
            complete={state.milestones.streak30.achieved}
          />
          <Milestone
            title="100个锚点"
            detail={state.milestones.anchors100.unavailable
              ? '暂时无法读取'
              : state.milestones.anchors100.achieved && (state.milestones.anchors100.count ?? 0) < 100
                ? `已达成 · 当前 ${state.milestones.anchors100.count ?? '—'}/100`
                : `${state.milestones.anchors100.count ?? '—'}/100`}
            complete={state.milestones.anchors100.achieved ?? false}
          />
        </View> : null}
      </View>
      {state ? <LinearGradient colors={['#FF9908', '#FFAB34']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={s.progress}>
        <Text style={s.progressTitle}>完成 3 项成长记录可解锁专属洞察报告（{bloomedCount}/3）</Text>
        <View style={s.progressTrack}><View style={[s.progressValue, { width: `${Math.round((bloomedCount / 3) * 100)}%` }]} /></View>
        <Pressable accessibilityRole="button" accessibilityLabel={state.report.unlocked ? '查看专属洞察报告' : '查看报告解锁条件'} onPress={onReportPress} style={({ pressed }) => [s.reportAction, pressed && { opacity: 0.78 }]}>
          <Text style={s.reportActionText}>{state.report.unlocked ? '查看专属洞察报告' : '了解解锁条件'}</Text>
        </Pressable>
      </LinearGradient> : null}
      {state?.flowers.filter(flower => flower.status === 'bloomed' && flower.summary).map(flower => (
        <View key={flower.flowerId} style={s.flowerSummary}>
          <Text style={s.flowerSummaryTitle}>{flower.title}</Text>
          <Text style={s.flowerSummaryText}>{flower.summary}</Text>
        </View>
      ))}
    </View>
  </GrowthScreen>;
}

function Milestone({ title, detail, complete }: { title: string; detail: string; complete: boolean }) {
  return <View accessibilityLabel={`${title}：${detail}`} style={s.milestone}>
    <View style={[s.milestoneDot, complete && s.milestoneDotComplete]} />
    <Text style={s.milestoneTitle}>{title}</Text>
    <Text style={s.milestoneDetail}>{detail}</Text>
  </View>;
}

const s = StyleSheet.create({
  content: { gap: 0, paddingHorizontal: 0, paddingTop: 6, paddingBottom: 23 }, header: { paddingHorizontal: 19, marginBottom: 1 },
  lower: { paddingHorizontal: 19, gap: 14, marginTop: 8 },
  milestonePanel: { borderRadius: 22, backgroundColor: '#FFF9F0', paddingTop: 20, paddingBottom: 15, paddingHorizontal: 9, gap: 10, shadowColor: '#D9AA70', shadowOpacity: 0.07, shadowOffset: { width: 0, height: 3 }, shadowRadius: 4 },
  artworkLoading: { height: 495, alignSelf: 'center', alignItems: 'center', justifyContent: 'center' },
  section: { position: 'absolute', top: -12, left: 8, paddingHorizontal: 10, paddingVertical: 4, borderRadius: 13, backgroundColor: '#FFF9F0', fontSize: 17, lineHeight: 24, fontWeight: '600', color: '#37281B' },
  unavailable: { fontSize: 13, lineHeight: 21, color: '#8A7159', textAlign: 'center', paddingHorizontal: 10 },
  status: { fontSize: 13, lineHeight: 21, color: '#8A7159', textAlign: 'center' },
  error: { fontSize: 13, lineHeight: 21, color: '#985A39', textAlign: 'center' },
  retry: { gap: 8, alignItems: 'center' },
  milestones: { flexDirection: 'row', justifyContent: 'space-between', gap: 7, marginTop: 3 },
  milestone: { flex: 1, minHeight: 87, alignItems: 'center', justifyContent: 'center', borderRadius: 16, backgroundColor: '#FFF3D9', paddingHorizontal: 5, paddingVertical: 8, gap: 5 },
  milestoneDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: '#D5C4A7' },
  milestoneDotComplete: { backgroundColor: '#77A849' },
  milestoneTitle: { color: '#5C4935', fontSize: 12, lineHeight: 17, fontWeight: '600', textAlign: 'center' },
  milestoneDetail: { color: '#8A7159', fontSize: 10, lineHeight: 15, textAlign: 'center' },
  progress: { padding: 17, borderRadius: 18, gap: 13, shadowColor: '#ECA64C', shadowOpacity: 0.12, shadowOffset: { width: 0, height: 3 }, shadowRadius: 5 },
  progressTitle: { color: '#FFFFFF', fontSize: 14, lineHeight: 21, fontWeight: '500' },
  progressTrack: { height: 10, backgroundColor: 'rgba(255,255,255,0.35)', borderRadius: 6, overflow: 'hidden' },
  progressValue: { height: '100%', backgroundColor: '#FFF9F0', borderRadius: 6 },
  reportAction: { alignSelf: 'flex-start', backgroundColor: '#FFF9F0', borderRadius: 18, paddingHorizontal: 13, paddingVertical: 8 },
  reportActionText: { color: '#93550E', fontSize: 13, fontWeight: '600' },
  flowerSummary: { borderRadius: 18, backgroundColor: '#FFF9F0', borderWidth: 1, borderColor: '#F2E2D0', padding: 14, gap: 6 },
  flowerSummaryTitle: { color: '#50381F', fontSize: 15, lineHeight: 22, fontWeight: '600' },
  flowerSummaryText: { color: '#806C58', fontSize: 13, lineHeight: 21 },
});
