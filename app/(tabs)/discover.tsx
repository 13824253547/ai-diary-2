import { useState } from 'react';
import { Image, Pressable, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Screen } from '../../src/components/layout/screen';
import { EmptyResult, IconAction, SearchField, supportStyles as u } from '../../src/components/common/support-ui';
import { BottomTabs } from '../../src/components/navigation/bottom-tabs';
import { discoveryItems } from '../../src/mocks/discovery';
import { useAppStore } from '../../src/store/use-app-store';
import { colors } from '../../src/theme/tokens';

export default function DiscoverScreen() {
  const router = useRouter();
  const [category, setCategory] = useState('推荐');
  const [search, setSearch] = useState('');
  const [searching, setSearching] = useState(false);
  const liked = useAppStore(s => s.likedDiscoveryIds);
  const toggle = useAppStore(s => s.toggleDiscoveryLike);
  const items = discoveryItems.filter(i => (category !== '同城' || i.location.includes('台南')) && `${i.title}${i.location}${i.author}`.includes(search)).sort((a, b) => category === '最新' ? b.date.localeCompare(a.date) : 0);
  return <Screen footer={<BottomTabs current="discover" />}>
    <View style={u.row}><Text style={u.title}>发现</Text><IconAction name="search-outline" label="搜索发现" onPress={() => setSearching(!searching)} /></View>
    {searching ? <SearchField value={search} onChangeText={setSearch} placeholder="搜索风景、地点和作者" /> : null}
    <View style={s.tabs}>{['推荐', '同城', '最新'].map(c => <Pressable key={c} accessibilityRole="button" accessibilityState={{ selected: c === category }} onPress={() => setCategory(c)} style={[u.pill, c === category && u.pillSelected]}><Text style={[u.pillText, c === category && u.pillTextSelected]}>{c}</Text></Pressable>)}</View>
    {items.length === 0 ? <EmptyResult title="没有找到这处风景" /> : <View style={s.grid}>{[0, 1].map(column => <View key={column} style={s.column}>{items.filter((_, index) => index % 2 === column).map((item, index) => <View key={item.id} style={s.card}><Pressable accessibilityRole="button" accessibilityLabel={`阅读${item.title}`} onPress={() => router.push(`/discover/${item.id}`)}><Image source={item.image} style={[s.image, { height: column === 0 && index === 0 ? 206 : 171 }]} /><Text style={s.cardTitle}>{item.title}</Text></Pressable><View style={s.metadata}><Image source={item.avatar} style={s.avatar} /><Text numberOfLines={1} style={s.author}>{item.author}</Text><Pressable accessibilityLabel={liked.includes(item.id) ? '取消点赞' : '点赞'} accessibilityState={{ selected: liked.includes(item.id) }} onPress={() => toggle(item.id)} hitSlop={7} style={s.like}><Ionicons name={liked.includes(item.id) ? 'heart' : 'heart-outline'} size={14} color={liked.includes(item.id) ? colors.brand : colors.textMuted} /><Text style={s.count}>{item.likes + (liked.includes(item.id) ? 1 : 0)}</Text></Pressable></View></View>)}</View>)}</View>}
  </Screen>;
}

const s = StyleSheet.create({ tabs: { flexDirection: 'row', gap: 10 }, grid: { flexDirection: 'row', gap: 8 }, column: { flex: 1, gap: 12 }, card: { borderWidth: 1, borderColor: colors.border, borderRadius: 14, backgroundColor: colors.surface, overflow: 'hidden' }, image: { width: '100%', resizeMode: 'cover' }, cardTitle: { fontSize: 14, lineHeight: 22, color: colors.textPrimary, marginHorizontal: 9, marginTop: 8, minHeight: 43 }, metadata: { flexDirection: 'row', alignItems: 'center', gap: 4, padding: 9 }, avatar: { width: 19, height: 19, borderRadius: 10 }, author: { fontSize: 10, color: colors.textSecondary, flex: 1 }, like: { flexDirection: 'row', alignItems: 'center', gap: 2 }, count: { fontSize: 10, color: colors.textMuted } });
