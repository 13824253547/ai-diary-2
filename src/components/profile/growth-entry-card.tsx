import { Ionicons } from '@expo/vector-icons';
import { Image, Pressable, StyleSheet, Text, View } from 'react-native';
import { useAppStore } from '../../store/use-app-store';

export function GrowthEntryCard({ onPress }: { onPress: () => void }) {
  const diaryCount = useAppStore(state => state.diaries.length);
  return <Pressable accessibilityRole="button" accessibilityLabel="小橘眼中的你，查看成长记忆" onPress={onPress} style={({ pressed }) => [s.card, pressed && { opacity: 0.8 }]}>
    <View style={s.copy}><Text style={s.title}>小橘眼中的你</Text><Text style={s.subtitle}>{diaryCount} 篇日记 ·{'\n'}成长记录以真实回忆为准</Text></View>
    <Ionicons name="chevron-forward" size={20} color="#3F2D1D" style={s.arrow} />
    <Image source={require('../../../assets/restored/growth-globe.png')} style={s.art} resizeMode="contain" accessibilityIgnoresInvertColors />
  </Pressable>;
}
const s = StyleSheet.create({
  card: { minHeight: 150, flexDirection: 'row', alignItems: 'center', backgroundColor: '#FFF9F1', borderWidth: 1, borderColor: '#F5E3CD', borderRadius: 23, paddingLeft: 19, paddingRight: 7, gap: 4, overflow: 'hidden' },
  copy: { flex: 1, gap: 13, paddingVertical: 17 }, title: { fontSize: 22, lineHeight: 28, fontWeight: '600', color: '#2D231A' },
  subtitle: { fontSize: 13, lineHeight: 23, color: '#8A7867' }, arrow: { marginRight: 0 }, art: { width: 119, height: 146 },
});
