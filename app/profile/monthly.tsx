import { useState } from 'react';
import { Alert, Image, Pressable, StyleSheet, Text, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Screen } from '../../src/components/layout/screen';
import { BottomSheet } from '../../src/components/common/bottom-sheet';
import { TopBar } from '../../src/components/layout/top-bar';
import { Button } from '../../src/components/common/button';
import { EmptyResult, supportStyles as u } from '../../src/components/common/support-ui';
import { getHistoryGroups, useAppStore } from '../../src/store/use-app-store';
import { mockPhotos } from '../../src/mocks/photos';
import { art } from '../../src/theme/assets';
import { colors } from '../../src/theme/tokens';

const covers = [art.bookOrange, art.bookBlue, art.bookGreen, art.bookPink];
const coverColors = ['#ffa132', '#84c5e6', '#b5ce75', '#eabfc1'];
export default function MonthlyScreen() {
  const router = useRouter();
  const { month } = useLocalSearchParams<{ month?: string }>();
  const diaries = useAppStore(s => s.diaries);
  const groups = getHistoryGroups(diaries);
  const [selectedId, setSelectedId] = useState<string | null>(month ? groups.find(g => g.label.includes(month))?.id ?? null : null);
  const selected = groups.find(g => g.id === selectedId);
  return <Screen>
    <TopBar title="月度装订" centered onBackPress={() => router.back()} />
    <Text style={s.intro}>把每个月的心情，装订成一本小小的日记。</Text>
    {groups.length === 0 ? <EmptyResult title="先写下第一篇日记吧" /> : <View style={s.grid}>{groups.map((g, i) => <Pressable accessibilityLabel={`打开${g.label}合集`} key={g.id} onPress={() => setSelectedId(g.id)} style={s.book}><View style={s.cover}><Image source={covers[i % covers.length]} style={s.image} /><View style={[s.coverLabel, { backgroundColor: coverColors[i % coverColors.length] }]}><Text style={s.coverTitle}>AI日记</Text><Text style={s.coverMonth}>{g.label}</Text></View></View><Text style={s.month}>{g.label}</Text><Text style={s.count}>{g.diaryIds.length} 篇回忆 · 点击翻阅</Text></Pressable>)}</View>}
    <BottomSheet visible={Boolean(selected)} onClose={() => setSelectedId(null)} title={selected ? `${selected.label} · 月度合集` : ''} scroll maxHeight="90%" sheetStyle={s.sheet} contentContainerStyle={s.sheetContent}>
      {selected?.diaryIds.map(id => { const d = diaries.find(item => item.id === id); return d ? <Pressable key={id} style={s.diary} onPress={() => { setSelectedId(null); router.push(`/diary/${id}`); }}><Image source={mockPhotos.find(p => p.id === d.coverPhotoId)?.image ?? art.temple} style={s.diaryImage} /><View style={{ flex: 1, gap: 5 }}><Text style={u.body}>{d.title}</Text><Text style={u.muted}>{d.date}</Text></View></Pressable> : null; })}
      <Button label="导出这个月的回忆" onPress={() => Alert.alert('月度装订演示', `${selected?.label} 的 ${selected?.diaryIds.length ?? 0} 篇日记已整理为合集预览。本次为本地演示，没有写入文件。`)} />
    </BottomSheet>
  </Screen>;
}
const s = StyleSheet.create({ intro: { color: colors.textSecondary, fontSize: 14, lineHeight: 23 }, grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 16 }, book: { width: '47%', gap: 6 }, cover: { width: '100%', aspectRatio: .62, borderRadius: 9, overflow: 'hidden', borderWidth: 1, borderColor: colors.border }, image: { width: '100%', height: '100%', resizeMode: 'cover' }, coverLabel: { position: 'absolute', top: 0, left: 0, right: 0, height: '34%', paddingHorizontal: 12, paddingTop: 13, gap: 4 }, coverTitle: { fontSize: 27, color: '#fff', fontWeight: '600' }, coverMonth: { color: '#fff', fontSize: 13 }, month: { fontSize: 14, color: colors.textPrimary, fontWeight: '600' }, count: { fontSize: 11, color: colors.textMuted }, sheet: { borderTopLeftRadius: 24, borderTopRightRadius: 24 }, sheetContent: { paddingBottom: 4 }, diary: { flexDirection: 'row', gap: 12, alignItems: 'center' }, diaryImage: { width: 68, height: 56, borderRadius: 8 } });
