import { Image, Pressable, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Screen } from '../../src/components/layout/screen';
import { BottomTabs } from '../../src/components/navigation/bottom-tabs';
import { getDiaryStatistics, useAppStore } from '../../src/store/use-app-store';
import { art } from '../../src/theme/assets';
import { colors } from '../../src/theme/tokens';

export default function InsightsEntry() {
  const router = useRouter();
  const stats = getDiaryStatistics(useAppStore(s => s.diaries));
  const anchors = [
    { name: '珍视旧友', left: '4%', top: '12%' },
    { name: '追光的人', right: '1%', top: '27%' },
    { name: '山与海', right: '6%', top: '58%' },
    { name: '深夜食堂', left: '2%', top: '62%' },
  ] as const;

  return (
    <Screen
      scroll={false}
      contentStyle={s.screen}
      footer={<BottomTabs current="profile" />}
    >
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="返回我的"
        onPress={() => router.back()}
        style={s.back}
      >
        <Text style={s.backIcon}>‹</Text>
      </Pressable>

      <View style={s.hero}>
        <Image source={art.mascotHello} resizeMode="contain" style={s.mascot} />
        <View style={s.heroCopy}>
          <Text style={s.title}>小橘眼中的你</Text>
          <Text style={s.subtitle}>{stats.diaries} 篇日记 · 12 个记忆锚点</Text>
        </View>
      </View>

      <View style={s.treeArea}>
        <Image source={art.tree} style={s.tree} resizeMode="contain" />
        {anchors.map(tag => (
          <Pressable
            key={tag.name}
            accessibilityRole="button"
            accessibilityLabel={`查看${tag.name}记忆锚点`}
            onPress={() => router.push({ pathname: '/profile/anchors', params: { tag: tag.name } })}
            style={[s.badge, tag]}
          >
            <Text style={s.badgeText}>{tag.name}</Text>
          </Pressable>
        ))}
        <Pressable
          accessibilityLabel="查看记忆花朵"
          onPress={() => router.push('/profile/flowers')}
          style={s.treeCaption}
        >
          <Text style={s.treeCaptionText}>人生旷野的寻路者</Text>
        </Pressable>
      </View>

      <Pressable onPress={() => router.push('/profile/flowers')} style={s.grow}>
        <Text style={s.growLeaf}>🌱</Text>
        <Text style={s.growText}>再长 3 片叶子就会开花啦</Text>
      </Pressable>
    </Screen>
  );
}
const s = StyleSheet.create({
  screen: {
    flex: 1,
    gap: 0,
    paddingTop: 10,
    paddingBottom: 8,
  },
  back: {
    width: 34,
    height: 34,
    justifyContent: 'center',
    alignItems: 'flex-start',
    marginBottom: 4,
  },
  backIcon: {
    fontSize: 40,
    lineHeight: 34,
    color: colors.textPrimary,
    fontWeight: '300',
  },
  hero: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 4,
  },
  mascot: {
    width: 116,
    height: 116,
    marginLeft: -4,
  },
  heroCopy: {
    flex: 1,
    paddingTop: 6,
  },
  title: {
    color: colors.textPrimary,
    fontSize: 30,
    lineHeight: 38,
    fontWeight: '800',
    letterSpacing: 0.3,
  },
  subtitle: {
    color: '#7F6E60',
    fontSize: 16,
    lineHeight: 24,
    marginTop: 8,
  },
  treeArea: {
    flex: 1,
    width: '100%',
    alignSelf: 'center',
    position: 'relative',
    marginTop: 2,
    minHeight: 0,
  },
  tree: {
    width: '100%',
    height: '100%',
  },
  badge: {
    position: 'absolute',
    minWidth: 92,
    height: 46,
    borderRadius: 23,
    paddingHorizontal: 18,
    backgroundColor: '#FFF3E3',
    borderWidth: 1,
    borderColor: '#EBC79E',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#B97A39',
    shadowOpacity: 0.08,
    shadowOffset: { width: 0, height: 3 },
    shadowRadius: 8,
  },
  badgeText: {
    fontSize: 13,
    color: '#5E4736',
    fontWeight: '600',
  },
  treeCaption: {
    position: 'absolute',
    left: '39%',
    bottom: '17%',
    width: 166,
    height: 46,
    backgroundColor: '#E4B24B',
    justifyContent: 'center',
    alignItems: 'center',
    borderRadius: 4,
    shadowColor: '#A56F1C',
    shadowOpacity: 0.16,
    shadowOffset: { width: 0, height: 4 },
    shadowRadius: 8,
  },
  treeCaptionText: {
    fontSize: 16,
    color: '#4C3316',
    fontWeight: '700',
  },
  grow: {
    minHeight: 54,
    borderRadius: 28,
    borderWidth: 1,
    borderColor: '#F0DDC7',
    backgroundColor: '#FFFDFC',
    paddingHorizontal: 24,
    alignSelf: 'center',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 9,
    marginTop: 8,
    marginBottom: 4,
  },
  growLeaf: {
    fontSize: 22,
    lineHeight: 24,
  },
  growText: {
    fontSize: 16,
    color: '#766556',
    fontWeight: '600',
  },
});
