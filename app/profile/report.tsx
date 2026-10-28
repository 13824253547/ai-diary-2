import { useCallback, useEffect } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useRouter } from 'expo-router';
import { GrowthScreen } from '../../src/components/profile/growth-screen';
import { Button } from '../../src/components/common/button';
import { EmptyResult } from '../../src/components/common/support-ui';
import { colors } from '../../src/theme/tokens';
import { useAppStore } from '../../src/store/use-app-store';

export default function ReportScreen() {
  const router = useRouter();
  const state = useAppStore(value => value.growthInsights);
  const status = useAppStore(value => value.growthInsightsStatus);
  const error = useAppStore(value => value.growthInsightsError);
  const loadGrowthInsights = useAppStore(value => value.loadGrowthInsights);
  const ensureCurrentGrowthReport = useAppStore(value => value.ensureCurrentGrowthReport);
  const retryGrowthReport = useAppStore(value => value.retryGrowthReport);

  useFocusEffect(useCallback(() => {
    let active = true;
    void (async () => {
      const current = await loadGrowthInsights();
      if (active && current?.report.unlocked) {
        await ensureCurrentGrowthReport();
      }
    })();
    return () => { active = false; };
  }, [ensureCurrentGrowthReport, loadGrowthInsights]));

  useEffect(() => {
    if (state?.report.status !== 'pending' && state?.report.status !== 'running') return undefined;
    const timer = setTimeout(() => { void loadGrowthInsights(); }, 3_000);
    return () => clearTimeout(timer);
  }, [loadGrowthInsights, state?.report.status]);

  return (
    <GrowthScreen header={<View style={s.header}>
        <Pressable accessibilityRole="button" accessibilityLabel="返回" hitSlop={8} onPress={() => router.back()} style={s.back}>
          <Ionicons name="chevron-back" size={25} color={colors.textPrimary} />
        </Pressable>
        <View style={s.heading}>
          <Text style={s.title}>小橘的专属洞察报告</Text>
        </View>
      </View>} contentStyle={s.content}>
      {!state && status === 'error'
        ? <EmptyResult title="暂时无法确认报告状态">
            <Text style={s.body}>{error ?? '请检查网络后重试。'}</Text>
            <Button label="重新读取" onPress={() => { void loadGrowthInsights(); }} />
          </EmptyResult>
        : !state
          ? <Text style={s.status}>正在读取报告授权状态…</Text>
          : !state.report.unlocked
        ? <EmptyResult title="专属洞察报告尚未解锁">
            <Text style={s.body}>集齐三类记忆花朵后，小橘就会为你整理专属洞察。</Text>
            <Button label="返回记忆花朵" onPress={() => router.replace('/profile/flowers')} />
          </EmptyResult>
        : <>
            {state.report.status === 'pending' || state.report.status === 'running'
              ? <Text style={s.status}>{state.report.current ? '正在更新报告，先为你保留上次的成功版本。' : '小橘正在阅读你的日记并整理报告…'}</Text>
              : null}
            {status === 'error'
              ? <View style={s.errorPanel}>
                  <Text style={s.errorText}>{error ?? '洞察报告暂时无法读取。'}</Text>
                  <Button label="重试生成报告" onPress={() => { void retryGrowthReport(); }} />
                </View>
              : null}
            {state.report.status === 'failed'
              ? <View style={s.errorPanel}>
                  <Text style={s.errorText}>这次没有生成新报告；之前成功的报告仍会保留。</Text>
                  <Button label="重试生成报告" onPress={() => { void retryGrowthReport(); }} />
                </View>
              : null}
            {state.report.current
              ? <ScrollView contentContainerStyle={s.reportContent} showsVerticalScrollIndicator={false}>
                  <Text style={s.source}>基于你的 {state.report.current.sourceDiaryCount} 篇日记生成</Text>
                  {state.report.current.generatedAt
                    ? <Text style={s.generatedAt}>最近生成于 {new Date(state.report.current.generatedAt).toLocaleDateString()}</Text>
                    : null}
                  {state.report.current.dimensions.map(dimension => (
                    <View key={dimension.id} style={s.dimension}>
                      <View style={s.dimensionIcon}>
                        <Ionicons
                          name={dimension.id === 'inner-contrast' ? 'scale-outline' : dimension.id === 'cherished-connections' ? 'heart-outline' : 'happy-outline'}
                          size={23}
                          color="#FFFFFF"
                        />
                      </View>
                      <View style={s.dimensionCopy}>
                        <Text style={s.dimensionTitle}>{dimension.title}</Text>
                        <Text style={s.dimensionBody}>{dimension.content}</Text>
                      </View>
                    </View>
                  ))}
                  <Text style={s.disclaimer}>这不是定义，只是一面镜子。报告由服务端 AI 根据当前可访问的日记生成，并按设备身份隔离保存。</Text>
                </ScrollView>
              : state.report.status === 'idle' || state.report.status === 'stale'
                ? <Text style={s.status}>正在准备当前日记版本的洞察报告…</Text>
                : null}
          </>}
    </GrowthScreen>
  );
}

const s = StyleSheet.create({
  content: { paddingHorizontal: 21, paddingTop: 7, paddingBottom: 32, gap: 0 },
  header: { marginBottom: 26 },
  back: { width: 40, height: 34, justifyContent: 'center' },
  heading: { alignItems: 'center', gap: 12, marginTop: -1 },
  title: { fontSize: 24, lineHeight: 35, fontWeight: '600', color: '#201A15', textAlign: 'center' },
  body: { fontSize: 14, lineHeight: 25, color: '#897665' },
  status: { color: '#897665', fontSize: 14, lineHeight: 23, textAlign: 'center', marginBottom: 13 },
  errorPanel: { alignItems: 'center', gap: 12, marginBottom: 16 },
  errorText: { color: '#985A39', fontSize: 14, lineHeight: 22, textAlign: 'center' },
  reportContent: { gap: 14, paddingBottom: 20 },
  source: { color: '#6F5A45', fontSize: 15, lineHeight: 23, textAlign: 'center', fontWeight: '600' },
  generatedAt: { color: '#9A8876', fontSize: 12, lineHeight: 18, textAlign: 'center', marginTop: -10 },
  dimension: { flexDirection: 'row', gap: 14, alignItems: 'center', borderRadius: 22, backgroundColor: '#FFF9F0', padding: 15, shadowColor: '#D9AA70', shadowOpacity: 0.07, shadowOffset: { width: 0, height: 3 }, shadowRadius: 4 },
  dimensionIcon: { width: 58, height: 58, borderRadius: 29, backgroundColor: '#F59A18', alignItems: 'center', justifyContent: 'center' },
  dimensionCopy: { flex: 1, gap: 7 },
  dimensionTitle: { color: '#35271B', fontSize: 17, lineHeight: 24, fontWeight: '600' },
  dimensionBody: { color: '#806C58', fontSize: 14, lineHeight: 24 },
  disclaimer: { color: '#9A8876', fontSize: 12, lineHeight: 20, textAlign: 'center', paddingHorizontal: 12, marginTop: 6 },
});
