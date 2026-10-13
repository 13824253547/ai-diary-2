import { Alert, Pressable, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { GrowthScreen } from '../../src/components/profile/growth-screen';
import { GrowthArtwork } from '../../src/components/profile/growth-artwork';
import { TopBar } from '../../src/components/layout/top-bar';
import { useAppStore } from '../../src/store/use-app-store';

export default function FlowersScreen() {
  const router = useRouter();
  const { scenario } = useLocalSearchParams<{ scenario?: string }>();
  const storedUnlocked = useAppStore(s => s.flowerUnlocked);
  const unlocked = storedUnlocked || (__DEV__ && scenario === 'unlocked');
  const { width } = useWindowDimensions();
  const openReport = () => {
    if (!unlocked) { Alert.alert('还差一朵记忆花', '集满 3 朵花后，就可以查看小橘的专属洞察报告。'); return; }
    router.push({ pathname: '/profile/report', params: scenario ? { scenario } : {} });
  };
  return <GrowthScreen header={<View style={s.header}><TopBar title="记忆花朵" onBackPress={() => router.canGoBack() ? router.back() : router.replace('/profile/insights')} /></View>} contentStyle={s.content}>
    <GrowthArtwork kind="flowers" width={Math.min(width, 480) - 24} unlocked={unlocked} />
    <View style={s.lower}>
      <View style={s.milestonePanel}>
        <Text style={s.section}>成长里程碑</Text>
        <View style={s.milestones}>
          <View style={s.milestone}><View style={s.medal}><MaterialCommunityIcons name="bag-suitcase-outline" size={40} color="#765024" /></View><Text style={s.milestoneText}>首次旅行</Text></View>
          <View style={s.milestone}><View style={s.medal}><Ionicons name="calendar-outline" size={39} color="#765024" /><View style={s.calendarNumber}><Text style={s.number}>30</Text></View></View><Text style={s.milestoneText}>连续记录30天</Text></View>
          <View style={s.milestone}><View style={s.medal}><Ionicons name="location-outline" size={29} color="#765024" /><Text style={s.number}>100</Text></View><Text style={s.milestoneText}>100个锚点</Text></View>
        </View>
      </View>
      <Pressable accessibilityRole="button" accessibilityLabel={unlocked ? '查看专属洞察报告' : '专属洞察报告尚未解锁，查看解锁条件'} onPress={openReport} style={({ pressed }) => pressed && { opacity: 0.85 }}>
        <LinearGradient colors={['#FF9908', '#FFAB34']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={s.progress}>
          <Text style={s.progressTitle}>{unlocked ? '3 朵记忆花已绽放 · 查看专属洞察报告 ›' : '集满 3 朵花可解锁专属洞察报告（2/3）'}</Text>
          <View accessibilityRole="progressbar" accessibilityValue={{ min: 0, max: 3, now: unlocked ? 3 : 2 }} style={s.bar}><View style={[s.barFill, { width: unlocked ? '100%' : '66.667%' }]} /></View>
        </LinearGradient>
      </Pressable>
    </View>
  </GrowthScreen>;
}
const s = StyleSheet.create({
  content: { gap: 0, paddingHorizontal: 0, paddingTop: 6, paddingBottom: 23 }, header: { paddingHorizontal: 19, marginBottom: 1 },
  lower: { paddingHorizontal: 19, gap: 14, marginTop: 8 },
  milestonePanel: { borderRadius: 22, backgroundColor: '#FFF9F0', paddingTop: 20, paddingBottom: 15, paddingHorizontal: 9, shadowColor: '#D9AA70', shadowOpacity: 0.07, shadowOffset: { width: 0, height: 3 }, shadowRadius: 4 },
  section: { position: 'absolute', top: -12, left: 8, paddingHorizontal: 10, paddingVertical: 4, borderRadius: 13, backgroundColor: '#FFF9F0', fontSize: 17, lineHeight: 24, fontWeight: '600', color: '#37281B' },
  milestones: { flexDirection: 'row', justifyContent: 'space-around', paddingTop: 1 }, milestone: { flex: 1, alignItems: 'center', gap: 9 },
  medal: { width: 73, height: 73, borderRadius: 37, backgroundColor: '#FFF1D2', borderWidth: 1, borderColor: '#FFE2AB', alignItems: 'center', justifyContent: 'center', shadowColor: '#DEA957', shadowOpacity: 0.08, shadowOffset: { width: 0, height: 3 }, shadowRadius: 5 },
  number: { fontSize: 17, lineHeight: 20, color: '#765024', fontWeight: '600' }, calendarNumber: { position: 'absolute', top: 32, backgroundColor: '#FFF1D2', height: 20 },
  milestoneText: { fontSize: 13, lineHeight: 20, color: '#8A7159', textAlign: 'center' },
  progress: { padding: 17, borderRadius: 18, gap: 13, shadowColor: '#ECA64C', shadowOpacity: 0.12, shadowOffset: { width: 0, height: 3 }, shadowRadius: 5 },
  progressTitle: { color: '#FFFFFF', fontSize: 14, lineHeight: 21, fontWeight: '500' }, bar: { height: 15, borderRadius: 9, backgroundColor: '#FFCA85', overflow: 'hidden' }, barFill: { height: '100%', backgroundColor: '#FFF4DF', borderRadius: 9 },
});
