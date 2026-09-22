import { Ionicons } from '@expo/vector-icons';
import { Image, Pressable, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { useRouter } from 'expo-router';
import { GrowthScreen } from '../../src/components/profile/growth-screen';
import { GrowthArtwork } from '../../src/components/profile/growth-artwork';
import { getDiaryStatistics, useAppStore } from '../../src/store/use-app-store';
import { art } from '../../src/theme/assets';

export default function InsightsEntry() {
  const router = useRouter();
  const stats = getDiaryStatistics(useAppStore(s => s.diaries));
  const { width } = useWindowDimensions();
  const contentWidth = Math.min(width, 480) - 22;
  return <GrowthScreen contentStyle={s.screen}>
    <View style={s.hero}>
      <Image source={art.mascot} resizeMode="contain" style={s.mascot} />
      <View style={s.heroCopy}>
        <Text style={s.title}>小橘眼中的你</Text>
        <Text style={s.subtitle}>{stats.diaries} 篇日记 · 12 个记忆锚点</Text>
      </View>
      <Pressable accessibilityRole="button" accessibilityLabel="返回我的" onPress={() => router.canGoBack() ? router.back() : router.replace('/(tabs)/profile')} style={s.back}>
        <Ionicons name="chevron-back" size={23} color="#68513B" />
      </Pressable>
    </View>
    <GrowthArtwork kind="tree" width={contentWidth} onLabelPress={name => router.push({ pathname: '/profile/anchors', params: { tag: name } })} onFlowerPress={() => router.push('/profile/flowers')} />
    <Pressable accessibilityRole="button" accessibilityLabel="查看记忆花朵" onPress={() => router.push('/profile/flowers')} style={({ pressed }) => [s.grow, pressed && { opacity: 0.75 }]}>
      <Ionicons name="leaf" size={17} color="#88B64E" /><Text style={s.growText}>再长 3 片叶子就会开花啦</Text>
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
