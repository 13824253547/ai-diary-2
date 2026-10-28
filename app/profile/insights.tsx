import { Ionicons } from '@expo/vector-icons';
import { useEffect } from 'react';
import { Image, Pressable, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { useRouter } from 'expo-router';
import { GrowthScreen } from '../../src/components/profile/growth-screen';
import { GrowthArtwork } from '../../src/components/profile/growth-artwork';
import { getDiaryStatistics, useAppStore } from '../../src/store/use-app-store';
import { art } from '../../src/theme/assets';

export default function InsightsEntry() {
  const router = useRouter();
  const growth = useAppStore(state => state.growthInsights);
  const growthStatus = useAppStore(state => state.growthInsightsStatus);
  const growthError = useAppStore(state => state.growthInsightsError);
  const loadGrowthInsights = useAppStore(state => state.loadGrowthInsights);
  useEffect(() => { void loadGrowthInsights(); }, [loadGrowthInsights]);
  const stats = getDiaryStatistics(useAppStore(s => s.diaries));
  const flowers = growth?.flowers.filter(flower => flower.status === 'bloomed').length ?? 0;
  const { width } = useWindowDimensions();
  const contentWidth = Math.min(width, 480) - 22;
  return <GrowthScreen header={<View style={s.hero}>
      <Image source={art.mascot} resizeMode="contain" style={s.mascot} />
      <View style={s.heroCopy}>
        <Text style={s.title}>小橘眼中的你</Text>
        <Text style={s.subtitle}>{stats.diaries} 篇日记</Text>
      </View>
      <Pressable accessibilityRole="button" accessibilityLabel="返回我的" onPress={() => router.canGoBack() ? router.back() : router.replace('/(tabs)/profile')} style={s.back}>
        <Ionicons name="chevron-back" size={23} color="#68513B" />
      </Pressable>
    </View>} contentStyle={s.screen}>
    <GrowthArtwork kind="tree" width={contentWidth} onLabelPress={({ id }) => router.push({ pathname: '/profile/anchors', params: { tag: id } })} onFlowerPress={() => router.push('/profile/flowers')} />
    <Pressable accessibilityRole="button" accessibilityLabel="查看记忆花朵" onPress={() => router.push('/profile/flowers')} style={({ pressed }) => [s.grow, pressed && { opacity: 0.75 }]}>
      <Ionicons name="leaf" size={17} color="#88B64E" />
      <Text style={s.growText}>
        {growth
          ? `${flowers}/3 朵记忆花 · ${growth.report.unlocked ? '专属报告已解锁' : '继续记录，等待花朵绽放'}`
          : growthStatus === 'error'
            ? growthError ?? '成长记录暂时无法读取'
            : '正在读取真实成长记录…'}
      </Text>
    </Pressable>
  </GrowthScreen>;
}
const s = StyleSheet.create({
  screen: { gap: 0, paddingHorizontal: 0, paddingTop: 0, paddingBottom: 20 },
  hero: { flexDirection: 'row', alignItems: 'center', height: 104, paddingHorizontal: 17, gap: 8 },
  mascot: { width: 108, height: 104 }, heroCopy: { flex: 1, gap: 12 },
  title: { fontSize: 25, lineHeight: 33, color: '#231C15', fontWeight: '700' },
  subtitle: { color: '#8A7763', fontSize: 14, lineHeight: 22 },
  back: { position: 'absolute', top: -4, left: 1, width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },
  grow: { alignSelf: 'center', minHeight: 43, paddingHorizontal: 24, gap: 8, flexDirection: 'row', alignItems: 'center', borderRadius: 24, backgroundColor: '#FFF5E7', borderWidth: 1, borderColor: '#F5DEC2', marginTop: -4, shadowColor: '#B77932', shadowOpacity: 0.1, shadowOffset: { width: 0, height: 2 }, shadowRadius: 3 },
  growText: { fontSize: 16, lineHeight: 24, color: '#806952' },
});
