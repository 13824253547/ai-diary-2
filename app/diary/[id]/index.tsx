import { Ionicons } from '@expo/vector-icons';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Image, Pressable, StyleSheet, Text, View } from 'react-native';
import { Button } from '../../../src/components/common/button';
import { Screen } from '../../../src/components/layout/screen';
import { TopBar } from '../../../src/components/layout/top-bar';
import { Empty } from '../../../src/components/common/design-ui';
import { DiaryPaper } from '../../../src/components/diary/diary-paper';
import { useDiaryRoute } from '../../../src/hooks/use-diary-flow';
import { art } from '../../../src/theme/assets';
import { colors } from '../../../src/theme/tokens';
import type { DiaryItem } from '../../../src/types/diary';

export default function Detail() {
  const { diary, diaryId, readDiaryById, router } = useDiaryRoute();
  const requestVersionRef = useRef(0);
  const [resolvedDiary, setResolvedDiary] = useState<{ diaryId: string; diary: DiaryItem } | undefined>(undefined);
  const currentDiary = resolvedDiary && resolvedDiary.diaryId === diaryId ? resolvedDiary.diary : diary;
  const isSummaryPlaceholder = useMemo(() => {
    if (!currentDiary) return false;
    return currentDiary.blocks.length === 1 && currentDiary.blocks[0]?.id === `${currentDiary.id}-summary`;
  }, [currentDiary]);
  const [status, setStatus] = useState<'idle' | 'loading' | 'ready' | 'not_found' | 'error'>(() => {
    if (!diaryId) return 'not_found';
    if (!currentDiary) return 'idle';
    return isSummaryPlaceholder ? 'loading' : 'ready';
  });
  const [errorMessage, setErrorMessage] = useState<string>();
  const [reloadToken, setReloadToken] = useState(0);
  const shouldLoad = Boolean(diaryId) && (!currentDiary || isSummaryPlaceholder);

  useEffect(() => {
    const requestVersion = ++requestVersionRef.current;
    if (!diaryId) {
      setResolvedDiary(undefined);
      setStatus('not_found');
      return;
    }
    if (!shouldLoad) {
      setStatus(currentDiary ? 'ready' : 'not_found');
      setErrorMessage(undefined);
      return;
    }
    setResolvedDiary(undefined);
    setStatus('loading');
    setErrorMessage(undefined);
    void readDiaryById(diaryId).then(result => {
      if (requestVersion !== requestVersionRef.current) return;
      if (result.ok) {
        setResolvedDiary({ diaryId, diary: result.diary });
        setStatus('ready');
        return;
      }
      if (result.reason === 'not_found') {
        setStatus('not_found');
        return;
      }
      setStatus('error');
      setErrorMessage(result.message);
    });
  }, [currentDiary, diaryId, isSummaryPlaceholder, readDiaryById, reloadToken, shouldLoad]);

  if (status === 'loading') {
    return <Screen><Empty title="正在读取这篇日记" detail="稍等一下，我正在把已保存内容取回来。" /></Screen>;
  }
  if (status === 'error') {
    return <Screen><View style={s.state}><Empty title="暂时没把这篇日记读出来" detail={errorMessage ?? '请重新加载后再试一次。'} /><Button label="重新加载" onPress={() => setReloadToken(value => value + 1)} /></View></Screen>;
  }
  if (!currentDiary || status === 'not_found') {
    return <Screen><Empty title="没有找到这篇日记" detail="它可能还没有保存，或已被移出回忆。" home /></Screen>;
  }

  return (
    <Screen header={<TopBar
        onBackPress={() => (router.canGoBack() ? router.back() : router.replace('/(tabs)/memories'))}
        trailing={
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="更多操作"
            hitSlop={12}
            onPress={() => router.push({ pathname: '/modal/more-actions', params: { diaryId: currentDiary.id } })}
            style={s.moreButton}
          >
            <Ionicons name="ellipsis-horizontal" size={22} color={colors.textPrimary} />
          </Pressable>
        }
      />}>
      <DiaryPaper diary={currentDiary} />
      <Pressable onPress={() => router.push('/profile/anchors')} style={s.helperCard}>
        <Image source={art.mascotHello} style={s.helperMascot} resizeMode="contain" />
        <View style={s.helperCopy}>
          <Text style={s.helperText}>{currentDiary.helperMessage}</Text>
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
  state: {
    flex: 1,
    justifyContent: 'center',
    gap: 16,
  },
});
