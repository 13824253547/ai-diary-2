import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Screen } from '../../src/components/layout/screen';
import { BottomTabs } from '../../src/components/navigation/bottom-tabs';
import { Button } from '../../src/components/common/button';
import { EmptyResult } from '../../src/components/common/support-ui';
import { getDiaryStatistics, useAppStore } from '../../src/store/use-app-store';
import { colors } from '../../src/theme/tokens';

const insights = [
  { icon: 'scale-balance', title: '你内在的小矛盾', text: '你向往旷野，却也眷恋被窝。\n每次远行归来，你总会写\n「还是家里好」' },
  { icon: 'heart-outline', title: '你真正珍视的东西', text: '不是目的地，而是一起走路的人。\n你的高光时刻里，总有人\n在你身边' },
  { icon: 'emoticon-happy-outline', title: '你的性格特质', text: '慢热的恒温动物：初识安静，\n相处越久，越能感到你的滚烫' },
] as const;

export default function ReportScreen() {
  const router = useRouter();
  const { scenario } = useLocalSearchParams<{ scenario?: string }>();
  const storedUnlocked = useAppStore(s => s.flowerUnlocked);
  const unlocked = storedUnlocked || (__DEV__ && scenario === 'unlocked');
  const stats = getDiaryStatistics(useAppStore(s => s.diaries));

  return (
    <Screen backgroundColor="#FFF3E5" footer={<BottomTabs current="profile" />} contentStyle={s.content}>
      <View style={s.header}>
        <Pressable accessibilityRole="button" accessibilityLabel="返回" hitSlop={8} onPress={() => router.back()} style={s.back}>
          <Ionicons name="chevron-back" size={25} color={colors.textPrimary} />
        </Pressable>
        {unlocked && <View style={s.heading}>
          <Text style={s.title}>小橘的专属洞察报告</Text>
          <Text style={s.sub}>基于你的 {stats.diaries} 篇记录生成</Text>
        </View>}
      </View>
      {!unlocked ? (
        <EmptyResult title="再等一朵花盛开">
          <Text style={s.body}>集满 3 朵记忆花，即可查看专属洞察报告。</Text>
          <Button label="去看看记忆花朵" onPress={() => router.replace('/profile/flowers')} />
        </EmptyResult>
      ) : (
        <>
          <View style={s.cards}>
            {insights.map(insight => (
              <View key={insight.title} style={s.card}>
                <View style={s.iconHalo}>
                  <View style={s.icon}>
                    <MaterialCommunityIcons name={insight.icon} size={42} color="#FFFFFF" />
                  </View>
                </View>
                <View style={s.copy}>
                  <Text style={s.cardTitle}>{insight.title}</Text>
                  <Text style={s.body}>{insight.text}</Text>
                </View>
              </View>
            ))}
          </View>
          <Text style={s.note}>这不是定义，只是一面镜子 · 数据仅保存在本地</Text>
        </>
      )}
    </Screen>
  );
}

const s = StyleSheet.create({
  content: { paddingHorizontal: 21, paddingTop: 7, paddingBottom: 32, gap: 0 },
  header: { marginBottom: 29 },
  back: { width: 40, height: 34, justifyContent: 'center' },
  heading: { alignItems: 'center', gap: 12, marginTop: -1 },
  title: { fontSize: 25, lineHeight: 35, fontWeight: '700', color: '#201A15', textAlign: 'center' },
  sub: { fontSize: 15, lineHeight: 23, color: '#8A7868' },
  cards: { gap: 18 },
  card: {
    minHeight: 149, flexDirection: 'row', alignItems: 'center', gap: 18,
    paddingVertical: 21, paddingHorizontal: 19, borderRadius: 24, backgroundColor: '#FFFCF7',
    shadowColor: '#C48D51', shadowOpacity: 0.12, shadowRadius: 7, shadowOffset: { width: 0, height: 4 }, elevation: 2,
  },
  iconHalo: {
    width: 77, height: 77, borderRadius: 40, padding: 5, backgroundColor: '#FFF9ED',
    borderWidth: 1, borderColor: '#FFEACD', alignItems: 'center', justifyContent: 'center',
    shadowColor: '#D29443', shadowOpacity: 0.14, shadowRadius: 7, shadowOffset: { width: 0, height: 4 },
  },
  icon: { width: 67, height: 67, borderRadius: 34, alignItems: 'center', justifyContent: 'center', backgroundColor: '#FF9A00' },
  copy: { flex: 1, gap: 11 },
  cardTitle: { fontSize: 18, lineHeight: 25, fontWeight: '600', color: '#2B2118' },
  body: { fontSize: 14, lineHeight: 26, color: '#897665' },
  note: { textAlign: 'center', color: '#9B8471', fontSize: 12, lineHeight: 21, marginTop: 36 },
});
