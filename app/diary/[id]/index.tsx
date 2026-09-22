import { Ionicons } from '@expo/vector-icons';
import { Image, Pressable, StyleSheet, Text, View } from 'react-native';
import { Screen } from '../../../src/components/layout/screen';
import { TopBar } from '../../../src/components/layout/top-bar';
import { Empty } from '../../../src/components/common/design-ui';
import { DiaryPaper } from '../../../src/components/diary/diary-paper';
import { useDiaryRoute } from '../../../src/hooks/use-diary-flow';
import { art } from '../../../src/theme/assets';
import { colors } from '../../../src/theme/tokens';

export default function Detail() {
  const { diary, router } = useDiaryRoute();
  if (!diary) {
    return <Screen><Empty title="没有找到这篇日记" detail="它可能还没有保存，或已被移出回忆。" home /></Screen>;
  }

  return (
    <Screen>
      <TopBar
        onBackPress={() => (router.canGoBack() ? router.back() : router.replace('/(tabs)/memories'))}
        trailing={
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="更多操作"
            hitSlop={12}
            onPress={() => router.push({ pathname: '/share/privacy', params: { diaryId: diary.id, returnTo: 'detail' } })}
            style={s.moreButton}
          >
            <Ionicons name="ellipsis-horizontal" size={22} color={colors.textPrimary} />
          </Pressable>
        }
      />
      <DiaryPaper diary={diary} />
      <Pressable onPress={() => router.push('/profile/anchors')} style={s.helperCard}>
        <Image source={art.mascotHello} style={s.helperMascot} resizeMode="contain" />
        <View style={s.helperCopy}>
          <Text style={s.helperText}>{diary.helperMessage}</Text>
          <Text style={s.helperTag}>记忆锚点 · 珍视旧友</Text>
        </View>
        <View style={s.heartButton}>
          <Ionicons name="heart" size={23} color="#FF7F86" />
        </View>
      </Pressable>
    </Screen>
  );
}

const s = StyleSheet.create({
  moreButton: {
    width: 46,
    height: 46,
    borderRadius: 23,
    borderWidth: 1,
    borderColor: '#F0D6BF',
    backgroundColor: '#FFFDF8',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#B77A38',
    shadowOpacity: 0.08,
    shadowOffset: { width: 0, height: 2 },
    shadowRadius: 6,
  },
  helperCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    borderRadius: 24,
    borderWidth: 1,
    borderColor: '#F0D6BF',
    backgroundColor: '#FFF9F1',
    paddingHorizontal: 14,
    paddingVertical: 12,
    marginTop: 2,
  },
  helperMascot: { width: 70, height: 70, marginLeft: -3 },
  helperCopy: { flex: 1, gap: 8, paddingRight: 8 },
  helperText: {
    fontSize: 13,
    lineHeight: 24,
    color: '#705949',
    fontFamily: 'PingFang SC',
    fontWeight: '500',
  },
  helperTag: {
    alignSelf: 'flex-start',
    fontSize: 12,
    color: '#CC965B',
    backgroundColor: '#FFF1DE',
    borderRadius: 14,
    paddingHorizontal: 12,
    paddingVertical: 5,
    overflow: 'hidden',
  },
  heartButton: {
    width: 54,
    height: 54,
    borderRadius: 27,
    borderWidth: 1.5,
    borderColor: '#F1D3BE',
    backgroundColor: '#FFFDF9',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#D39A6A',
    shadowOpacity: 0.1,
    shadowOffset: { width: 0, height: 3 },
    shadowRadius: 8,
  },
});
