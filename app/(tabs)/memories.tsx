import { useEffect, useMemo, useState } from 'react';
import { Image, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Button } from '../../src/components/common/button';
import { Screen } from '../../src/components/layout/screen';
import { BottomSheet } from '../../src/components/common/bottom-sheet';
import { EmptyResult, IconAction, SearchField, SectionTitle, supportStyles as u } from '../../src/components/common/support-ui';
import { BottomTabs } from '../../src/components/navigation/bottom-tabs';
import { useAppStore } from '../../src/store/use-app-store';
import { mockPhotos } from '../../src/mocks/photos';
import { art } from '../../src/theme/assets';
import { colors } from '../../src/theme/tokens';

function formatDiaryCardAccessibilityLabel(title: string, date: string) {
  return `${title}，${date}`;
}

function formatRecentDiaryCardAccessibilityLabel(title: string, date: string) {
  return `刚刚写下的回忆，${title}，${date}`;
}

export default function MemoriesScreen() {
  const router = useRouter();
  const memoriesSourceItems = useAppStore(s => s.memoriesSourceItems);
  const memoriesItems = useAppStore(s => s.memoriesItems);
  const memoriesStatus = useAppStore(s => s.memoriesStatus);
  const memoriesError = useAppStore(s => s.memoriesError);
  const month = useAppStore(s => s.memoriesFilterMonth);
  const day = useAppStore(s => s.memoriesFilterDay);
  const search = useAppStore(s => s.memoriesSearchKeyword);
  const showSearch = useAppStore(s => s.memoriesSearchVisible);
  const setMemoriesFilters = useAppStore(s => s.setMemoriesFilters);
  const searchMemories = useAppStore(s => s.searchMemories);
  const retryMemoriesSearch = useAppStore(s => s.retryMemoriesSearch);
  const sourceDiaries = memoriesSourceItems;
  const months = useMemo(() => Array.from(new Set(sourceDiaries.map(d => d.date.slice(0, 7)))).sort().reverse(), [sourceDiaries]);
  const fallbackMonth = `${new Date().getFullYear()}.${String(new Date().getMonth() + 1).padStart(2, '0')}`;
  const selectedMonth = month === '全部' ? (months[0] ?? fallbackMonth) : month;
  const displayedDiaries = memoriesStatus === 'idle' ? sourceDiaries : memoriesItems;
  const travel = displayedDiaries.filter(d => d.type === 'travel').sort((a, b) => b.date.localeCompare(a.date));
  const thoughts = displayedDiaries.filter(d => d.type !== 'travel');
  const defaultFocusDay = 20;
  const [pickerVisible, setPickerVisible] = useState(false);
  const referenceDate = new Date(Number(selectedMonth.slice(0, 4)), Number(selectedMonth.slice(5, 7)) - 1, day ?? defaultFocusDay);
  const weekDates = useMemo(() => {
    const mondayOffset = (referenceDate.getDay() + 6) % 7;
    const monday = new Date(referenceDate);
    monday.setDate(referenceDate.getDate() - mondayOffset);
    return Array.from({ length: 7 }, (_, index) => {
      const date = new Date(monday);
      date.setDate(monday.getDate() + index);
      return date;
    });
  }, [referenceDate]);
  const recent = displayedDiaries.filter(d => d.createdInSession);
  const monthStart = new Date(Number(selectedMonth.slice(0, 4)), Number(selectedMonth.slice(5, 7)) - 1, 1);
  const daysInMonth = new Date(Number(selectedMonth.slice(0, 4)), Number(selectedMonth.slice(5, 7)), 0).getDate();
  const calendar = Array.from({ length: ((monthStart.getDay() + 6) % 7) + daysInMonth }, (_, i) => i - ((monthStart.getDay() + 6) % 7) + 1);
  const daysWithEntries = useMemo(() => {
    const days = new Set<number>();
    sourceDiaries.forEach((diary) => {
      if (!diary.date.startsWith(selectedMonth)) return;
      const match = diary.date.match(/^(\d{4})[./-](\d{2})[./-](\d{2})(?:[–-](\d{2})[./-](\d{2}))?$/);
      if (!match) return;
      const startDay = Number(match[3]);
      const endDay = match[5] ? Number(match[5]) : startDay;
      for (let current = startDay; current <= endDay; current += 1) days.add(current);
    });
    return days;
  }, [selectedMonth, sourceDiaries]);
  const hasEntriesOnDate = (date: Date) => sourceDiaries.some((diary) => {
    const monthKey = `${date.getFullYear()}.${String(date.getMonth() + 1).padStart(2, '0')}`;
    if (!diary.date.startsWith(monthKey)) return false;
    const match = diary.date.match(/^(\d{4})[./-](\d{2})[./-](\d{2})(?:[–-](\d{2})[./-](\d{2}))?$/);
    if (!match) return false;
    const targetDay = date.getDate();
    const startDay = Number(match[3]);
    const endDay = match[5] ? Number(match[5]) : startDay;
    return targetDay >= startDay && targetDay <= endDay;
  });
  useEffect(() => {
    const queryMonth = month === '全部' ? undefined : month.replaceAll('.', '-');
    const queryDay = day && queryMonth ? `${queryMonth}-${String(day).padStart(2, '0')}` : undefined;
    void searchMemories({
      month: queryMonth,
      day: queryDay,
      keyword: search.trim() || undefined,
      page: 1,
      pageSize: 100,
    });
  }, [day, month, search, searchMemories, selectedMonth]);
  return <Screen footer={<BottomTabs current="memories" />}>
    <View style={u.row}>
      <Pressable accessibilityRole="button" accessibilityLabel="选择回忆月份" onPress={() => setPickerVisible(true)} style={s.monthButton}><Text style={s.month}>{month === '全部' ? '我的回忆' : `${month.slice(0, 4)}年${Number(month.slice(5, 7))}月`}</Text><Ionicons name="chevron-down" size={17} color={colors.textPrimary} /></Pressable>
      <View style={s.tools}><IconAction name="search-outline" label="搜索日记" onPress={() => setMemoriesFilters({ searchVisible: !showSearch })} /><IconAction name="calendar-outline" label="按月份筛选" onPress={() => setPickerVisible(true)} /></View>
    </View>
    {showSearch ? <SearchField value={search} onChangeText={searchKeyword => setMemoriesFilters({ searchKeyword })} placeholder="搜索地点、标题或回忆" /> : null}
    <View style={s.week}>{weekDates.map((date, i) => {
      const dayNumber = date.getDate();
      const targetMonth = `${date.getFullYear()}.${String(date.getMonth() + 1).padStart(2, '0')}`;
      const hasEntries = hasEntriesOnDate(date);
      const isSelected = day === dayNumber && selectedMonth === targetMonth;
      return <Pressable key={`${targetMonth}-${dayNumber}`} accessibilityRole="button" accessibilityLabel={`${date.getMonth() + 1}月${dayNumber}日`} accessibilityState={{ selected: isSelected }} style={s.day} onPress={() => setMemoriesFilters({ month: targetMonth, day: isSelected ? null : dayNumber })}>
        <Text style={s.weekName}>{['一', '二', '三', '四', '五', '六', '日'][i]}</Text>
        <View style={s.dayBadge}>
          <Text style={[s.dayNumber, isSelected && s.selectedDay]}>{dayNumber}</Text>
          {hasEntries ? <View accessibilityLabel={`周条有回忆-${targetMonth}-${dayNumber}`} style={[s.dayDot, isSelected && s.selectedDayDot]} /> : null}
        </View>
      </Pressable>;
    })}</View>
    {day || month !== '全部' ? <Pressable onPress={() => setMemoriesFilters({ month: '全部', day: null })}><Text style={u.muted}>查看{day ? `${day}日` : '本月'}的回忆　·　显示全部</Text></Pressable> : null}
    {recent.length > 0 && month !== '全部' && !search ? <View style={s.group}><SectionTitle title="刚刚写下的回忆" />{recent.map(d => <Pressable key={d.id} accessibilityRole="button" accessibilityLabel={formatRecentDiaryCardAccessibilityLabel(d.title, d.date)} onPress={() => router.push(`/diary/${d.id}`)} style={s.diary}><Image source={mockPhotos.find(p => p.id === d.coverPhotoId)?.image ?? art.temple} style={s.cover} /><View style={s.copy}><Text style={s.diaryTitle}>{d.title}</Text><Text style={u.muted}>{d.date}</Text></View></Pressable>)}</View> : null}
    {memoriesStatus === 'error' ? <View style={s.group}><Text style={u.muted}>{memoriesError ?? '回忆加载失败，请稍后再试。'}</Text><Button variant="secondary" label="重新加载" onPress={() => void retryMemoriesSearch()} /></View> : displayedDiaries.length === 0 ? <EmptyResult /> : <>
      {travel.length > 0 ? <View style={s.group}><SectionTitle title={`▸ 旅行游记 · ${travel.length}篇`} /><View style={{ gap: 7 }}>{travel.map(d => <Pressable accessibilityRole="button" accessibilityLabel={formatDiaryCardAccessibilityLabel(d.title, d.date)} key={d.id} onPress={() => router.push(`/diary/${d.id}`)} style={s.diary}><Image source={mockPhotos.find(p => p.id === d.coverPhotoId)?.image ?? art.temple} style={s.cover} /><View style={s.copy}><Text style={s.diaryTitle} numberOfLines={2}>{d.title}</Text><Text style={u.muted}>{d.date.replaceAll('.', '/')}</Text></View><Image source={art.mascot} style={s.smallMascot} resizeMode="contain" /></Pressable>)}</View></View> : null}
      {thoughts.length > 0 ? <View style={s.group}><SectionTitle title={`▸ 生活感悟 · ${thoughts.length}篇`} /><View style={s.thoughts}>{thoughts.map(d => <Pressable key={d.id} accessibilityRole="button" accessibilityLabel={formatDiaryCardAccessibilityLabel(d.title, d.date)} onPress={() => router.push(`/diary/${d.id}`)} style={s.thought}><Text style={s.quote}>“</Text><Text numberOfLines={3} style={u.body}>{d.summary}</Text><Text style={u.muted}>{d.date.slice(5).replace('.', '月')}日</Text></Pressable>)}</View></View> : null}
    </>}
    <View style={s.group}><SectionTitle title="▸ 旅游明信片" action="制作一张" onPress={() => router.push('/postcard')} /><ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 7 }}>{[art.santorini, art.balloons, art.mountain, art.train].map((source, i) => <Pressable accessibilityLabel={`查看第${i + 1}张明信片`} key={i} onPress={() => router.push({ pathname: '/postcard', params: { photo: String(i) } })}><Image source={source} style={s.postcard} /></Pressable>)}</ScrollView></View>
    <BottomSheet visible={pickerVisible} onClose={() => setPickerVisible(false)} title="选择日期" actionLabel="完成" onAction={() => setPickerVisible(false)} showClose={false} scroll maxHeight="92%" sheetStyle={s.sheet}>
      <Text style={u.body}>{selectedMonth.replace('.', '年')}月</Text><View style={s.calendar}>{calendar.map((d, i) => {
      const hasEntries = d > 0 && daysWithEntries.has(d);
      const isSelected = d === day;
      return d > 0 ? <Pressable key={i} accessibilityLabel={`选择${d}日`} onPress={() => { setMemoriesFilters({ month: selectedMonth, day: d }); setPickerVisible(false); }} style={s.calendarCell}>
        <View style={s.dayBadge}>
          <Text style={[s.dayNumber, isSelected && s.selectedDay]}>{d}</Text>
          {hasEntries ? <View accessibilityLabel={`月历有回忆-${selectedMonth}-${d}`} style={[s.dayDot, isSelected && s.selectedDayDot]} /> : null}
        </View>
      </Pressable> : <View key={i} style={s.calendarCell} />;
    })}</View>{['全部', ...months].map(m => <Pressable key={m} style={s.monthChoice} onPress={() => { setMemoriesFilters({ month: m, day: null }); setPickerVisible(false); }}><Text style={u.body}>{m === '全部' ? '全部回忆' : `${m.slice(0, 4)}年${Number(m.slice(5))}月`}</Text>{m === month ? <Ionicons name="checkmark-circle" size={22} color={colors.brand} /> : null}</Pressable>)}
    </BottomSheet>
  </Screen>;
}

const s = StyleSheet.create({
  monthButton: { flexDirection: 'row', gap: 8, alignItems: 'center' }, month: { fontSize: 23, fontWeight: '600', color: colors.textPrimary }, tools: { flexDirection: 'row', gap: 10 },
  week: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 2 }, day: { alignItems: 'center', gap: 9, minWidth: 36 }, weekName: { fontSize: 12, color: colors.textMuted }, dayBadge: { alignItems: 'center', minHeight: 44 }, dayNumber: { fontSize: 16, color: colors.textPrimary, width: 36, height: 36, textAlign: 'center', lineHeight: 36, overflow: 'hidden', borderRadius: 18 }, selectedDay: { color: '#fff', backgroundColor: colors.brand }, dayDot: { width: 5, height: 5, borderRadius: 3, backgroundColor: colors.brand, marginTop: 3 }, selectedDayDot: { backgroundColor: '#fff', marginTop: -7 },
  group: { borderWidth: 1, borderColor: colors.border, borderRadius: 16, padding: 9, gap: 10 }, diary: { flexDirection: 'row', borderWidth: 1, borderColor: colors.border, borderRadius: 12, backgroundColor: colors.surface, overflow: 'hidden', alignItems: 'center', gap: 12 }, cover: { width: 139, height: 82 }, copy: { flex: 1, paddingRight: 4, gap: 6 }, diaryTitle: { fontSize: 14, lineHeight: 21, color: colors.textPrimary }, smallMascot: { width: 32, height: 35, position: 'absolute', bottom: 0, right: 3 },
  thoughts: { flexDirection: 'row', gap: 8, flexWrap: 'wrap' }, thought: { flexBasis: '48%', flexGrow: 1, padding: 12, paddingTop: 4, backgroundColor: colors.surface, borderRadius: 12, borderColor: colors.border, borderWidth: 1, gap: 5 }, quote: { color: colors.brand, fontSize: 26, height: 22 }, postcard: { width: 80, height: 94, borderRadius: 9 },
  calendar: { flexDirection: 'row', flexWrap: 'wrap' }, calendarCell: { width: '14.28%', alignItems: 'center', paddingVertical: 2 },
  sheet: { paddingHorizontal: 24, paddingTop: 20, paddingBottom: 44, borderTopLeftRadius: 24, borderTopRightRadius: 24 }, monthChoice: { paddingVertical: 13, borderBottomWidth: 1, borderColor: colors.border, flexDirection: 'row', justifyContent: 'space-between' },
});
