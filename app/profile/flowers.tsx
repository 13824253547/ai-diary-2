import { Image, Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Screen } from '../../src/components/layout/screen';
import { TopBar } from '../../src/components/layout/top-bar';
import { useAppStore } from '../../src/store/use-app-store';
import { art } from '../../src/theme/assets';
import { colors } from '../../src/theme/tokens';

export default function FlowersScreen() {
  const router = useRouter();
  const { scenario } = useLocalSearchParams<{ scenario?: string }>();
  const storedUnlocked = useAppStore(s => s.flowerUnlocked);
  const unlocked = storedUnlocked || (__DEV__ && scenario === 'unlocked');
  return <Screen contentStyle={{ gap: 12 }}>
    <TopBar title="记忆花朵" centered onBackPress={() => router.back()} />
    <View style={s.flowers}>
      <View style={s.first}><Image source={art.flowerGold} style={s.flower} resizeMode="contain" /><Text style={s.caption}>人生旷野的寻路者</Text></View>
      <View style={s.second}><Image source={art.flowerSecond} style={s.flower} resizeMode="contain" /><Text style={s.caption}>觉察自我的思考者</Text></View>
      <View style={s.third}><Image source={unlocked ? art.flowerSecond : art.flowerLocked} style={s.lockedFlower} resizeMode="contain" /><Text style={s.lockedCaption}>压力迷茫的疗愈者{unlocked ? '' : '\n· 未解锁'}</Text></View>
    </View>
    <View style={s.milestonePanel}><Text style={s.section}>成长里程碑</Text><View style={s.milestones}>{[{ icon: 'briefcase-outline', label: '首次旅行', number: '' }, { icon: 'calendar-outline', label: '连续记录30天', number: '30' }, { icon: 'location-outline', label: '100个锚点', number: '100' }].map(m => <View key={m.label} style={s.milestone}><View style={s.milestoneIcon}><Ionicons name={m.icon as 'briefcase-outline'} size={29} color="#654723" />{m.number ? <Text style={s.milestoneNumber}>{m.number}</Text> : null}</View><Text style={s.milestoneText}>{m.label}</Text></View>)}</View></View>
    <Pressable accessibilityRole="button" accessibilityLabel={unlocked ? '查看专属洞察报告' : '专属洞察报告尚未解锁'} accessibilityState={{ disabled: !unlocked }} disabled={!unlocked} onPress={() => router.push({ pathname: '/profile/report', params: scenario ? { scenario } : {} })} style={s.progress}><Text style={s.progressTitle}>{unlocked ? '3 朵记忆花已绽放 · 查看专属洞察报告 ›' : '集满 3 朵花可解锁专属洞察报告（2/3）'}</Text><View style={s.bar}><View style={[s.barFill, unlocked && { width: '100%' }]} /></View></Pressable>
    {!unlocked ? <Text style={s.hint}>每一次记录，都会让小花慢慢生长。</Text> : null}
  </Screen>;
}
const s = StyleSheet.create({ flowers: { height: 350, position: 'relative' }, first: { position: 'absolute', top: 0, left: 3, width: 168, height: 228 }, second: { position: 'absolute', top: 39, right: 0, width: 150, height: 218 }, third: { position: 'absolute', top: 204, left: '28%', width: 155, height: 145 }, flower: { width: '100%', height: '100%' }, lockedFlower: { width: '100%', height: '100%' }, caption: { position: 'absolute', bottom: 14, left: '9%', width: '82%', height: 28, textAlign: 'center', lineHeight: 28, backgroundColor: '#f6d08a', color: '#4c341c', fontSize: 12, fontWeight: '500', borderRadius: 3 }, lockedCaption: { position: 'absolute', bottom: 4, left: '9%', width: '82%', minHeight: 34, paddingTop: 2, textAlign: 'center', lineHeight: 16, backgroundColor: '#efdbb8', color: '#67543e', fontSize: 11, borderRadius: 3 }, milestonePanel: { backgroundColor: colors.surface, borderRadius: 17, padding: 13, borderWidth: 1, borderColor: colors.border, gap: 12 }, section: { fontSize: 16, fontWeight: '700', color: colors.textPrimary }, milestones: { flexDirection: 'row', justifyContent: 'space-around' }, milestone: { alignItems: 'center', gap: 8 }, milestoneIcon: { width: 66, height: 66, borderRadius: 34, backgroundColor: '#fff0ca', borderWidth: 1, borderColor: '#efd8a8', alignItems: 'center', justifyContent: 'center' }, milestoneNumber: { color: '#654723', fontSize: 11, fontWeight: '600' }, milestoneText: { fontSize: 11, color: colors.textSecondary, textAlign: 'center' }, progress: { backgroundColor: colors.brand, borderRadius: 15, padding: 15, gap: 12 }, progressTitle: { color: '#fff', fontSize: 13, fontWeight: '600' }, bar: { height: 12, backgroundColor: '#ffc36d', borderRadius: 7, overflow: 'hidden' }, barFill: { width: '66%', height: '100%', backgroundColor: '#fff2d5', borderRadius: 7 }, hint: { color: colors.textMuted, fontSize: 11, textAlign: 'center' } });
