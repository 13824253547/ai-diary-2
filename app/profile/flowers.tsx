import { StyleSheet, Text, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import { GrowthScreen } from '../../src/components/profile/growth-screen';
import { TopBar } from '../../src/components/layout/top-bar';

export default function FlowersScreen() {
  const router = useRouter();
  return <GrowthScreen header={<View style={s.header}><TopBar title="记忆花朵" onBackPress={() => router.canGoBack() ? router.back() : router.replace('/profile/insights')} /></View>} contentStyle={s.content}>
    <View style={s.lower}>
      <View style={s.milestonePanel}>
        <Text style={s.section}>成长记录</Text>
        <Text style={s.unavailable}>真实成长事件和解锁规则尚未接入。</Text>
      </View>
      <LinearGradient colors={['#FF9908', '#FFAB34']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={s.progress}>
        <Text style={s.progressTitle}>专属洞察报告暂不可用</Text>
      </LinearGradient>
    </View>
  </GrowthScreen>;
}
const s = StyleSheet.create({
  content: { gap: 0, paddingHorizontal: 0, paddingTop: 6, paddingBottom: 23 }, header: { paddingHorizontal: 19, marginBottom: 1 },
  lower: { paddingHorizontal: 19, gap: 14, marginTop: 8 },
  milestonePanel: { borderRadius: 22, backgroundColor: '#FFF9F0', paddingTop: 20, paddingBottom: 15, paddingHorizontal: 9, shadowColor: '#D9AA70', shadowOpacity: 0.07, shadowOffset: { width: 0, height: 3 }, shadowRadius: 4 },
  section: { position: 'absolute', top: -12, left: 8, paddingHorizontal: 10, paddingVertical: 4, borderRadius: 13, backgroundColor: '#FFF9F0', fontSize: 17, lineHeight: 24, fontWeight: '600', color: '#37281B' },
  unavailable: { fontSize: 13, lineHeight: 21, color: '#8A7159', textAlign: 'center' },
  progress: { padding: 17, borderRadius: 18, gap: 13, shadowColor: '#ECA64C', shadowOpacity: 0.12, shadowOffset: { width: 0, height: 3 }, shadowRadius: 5 },
  progressTitle: { color: '#FFFFFF', fontSize: 14, lineHeight: 21, fontWeight: '500' },
});
