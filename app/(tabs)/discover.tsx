import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Image, Pressable, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Screen } from '../../src/components/layout/screen';
import { EmptyResult, IconAction, SearchField, supportStyles as u } from '../../src/components/common/support-ui';
import { Button } from '../../src/components/common/button';
import { BottomTabs } from '../../src/components/navigation/bottom-tabs';
import { createBackendDiscoveryRepository } from '../../src/store/adapters/backend-discovery-adapter';
import type { DiscoveryStoryContract } from '../../src/contracts/discovery-contract';
import { DeviceCityError, getCurrentDeviceCity } from '../../src/services/device-city';
import { resolveDiscoveryMediaUri } from '../../src/services/discovery-media';
import { colors } from '../../src/theme/tokens';

type DiscoveryCategory = 'latest' | 'same-city';

export default function DiscoverScreen() {
  const router = useRouter();
  const [search, setSearch] = useState('');
  const [searching, setSearching] = useState(false);
  const [category, setCategory] = useState<DiscoveryCategory>('latest');
  const [city, setCity] = useState('');
  const [locationError, setLocationError] = useState<DeviceCityError['code'] | null>(null);
  const [locating, setLocating] = useState(false);
  const [items, setItems] = useState<DiscoveryStoryContract[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [likingIds, setLikingIds] = useState<string[]>([]);
  const locationRequestId = useRef(0);

  const requestCity = async () => {
    const requestId = locationRequestId.current + 1;
    locationRequestId.current = requestId;
    setLocationError(null);
    setLocating(true);
    try {
      const nextCity = await getCurrentDeviceCity();
      if (locationRequestId.current === requestId) {
        setCity(nextCity);
      }
    } catch (requestError) {
      if (locationRequestId.current === requestId) {
        setLocationError(requestError instanceof DeviceCityError ? requestError.code : 'location_failed');
      }
    } finally {
      if (locationRequestId.current === requestId) {
        setLocating(false);
      }
    }
  };

  const selectCategory = (nextCategory: DiscoveryCategory) => {
    setCategory(nextCategory);
    setError(false);
    if (nextCategory === 'same-city' && !city) {
      void requestCity();
    } else if (nextCategory === 'latest') {
      locationRequestId.current += 1;
      setLocationError(null);
      setLocating(false);
    }
  };

  useEffect(() => {
    if (category === 'same-city' && !city) {
      setItems([]);
      setError(false);
      setLoading(locating);
      return;
    }
    let active = true;
    setLoading(true);
    setError(false);
    void createBackendDiscoveryRepository().listStories({
      category,
      ...(category === 'same-city' ? { city } : {}),
      keyword: search.trim() || undefined,
      page: 1,
      pageSize: 20,
    }).then(page => {
      if (active) setItems(page.items);
    }).catch(() => {
      if (active) {
        setItems([]);
        setError(true);
      }
    }).finally(() => {
      if (active) setLoading(false);
    });
    return () => { active = false; };
  }, [category, city, locating, search]);

  const toggleLike = async (item: DiscoveryStoryContract) => {
    if (!item.likesEnabled || likingIds.includes(item.id)) return;
    setLikingIds(current => [...current, item.id]);
    try {
      const result = await createBackendDiscoveryRepository().setLike(item.id, !item.liked);
      setItems(current => current.map(story => story.id === item.id
        ? { ...story, liked: result.liked, likeCount: result.likeCount }
        : story));
    } catch {
      setError(true);
    } finally {
      setLikingIds(current => current.filter(id => id !== item.id));
    }
  };

  const locationMessage = locationError === 'permission_denied'
    ? '允许定位后才能筛选同城故事'
    : locationError === 'city_unavailable'
      ? '暂时无法识别你所在的城市'
      : '暂时无法获取所在城市';

  return <Screen footer={<BottomTabs current="discover" />}>
    <View style={u.row}><Text style={u.title}>发现</Text><IconAction name="search-outline" label="搜索发现" onPress={() => setSearching(!searching)} /></View>
    <View style={s.categories} accessibilityRole="tablist">
      <Pressable
        accessibilityRole="tab"
        accessibilityState={{ selected: category === 'latest' }}
        onPress={() => selectCategory('latest')}
        style={[s.category, category === 'latest' && s.categoryActive]}
      >
        <Text style={[s.categoryText, category === 'latest' && s.categoryTextActive]}>最新</Text>
      </Pressable>
      <Pressable
        accessibilityRole="tab"
        accessibilityState={{ selected: category === 'same-city' }}
        onPress={() => selectCategory('same-city')}
        style={[s.category, category === 'same-city' && s.categoryActive]}
      >
        <Text style={[s.categoryText, category === 'same-city' && s.categoryTextActive]}>同城</Text>
      </Pressable>
    </View>
    {searching ? <SearchField value={search} onChangeText={setSearch} placeholder="搜索风景、地点和作者" /> : null}
    {loading || locating
      ? <ActivityIndicator accessibilityLabel={locating ? '正在定位当前城市' : '正在加载发现内容'} color={colors.brand} />
      : locationError && category === 'same-city'
        ? <EmptyResult title={locationMessage}><Button label="重新定位" onPress={() => { void requestCity(); }} /></EmptyResult>
        : error
          ? <EmptyResult title="发现内容暂时无法加载" />
          : items.length === 0
            ? <EmptyResult title={search ? '没有找到相关故事' : category === 'same-city' ? '暂时还没有同城故事' : '暂时还没有公开故事'} />
            : <View style={s.grid}>{[0, 1].map(column => <View key={column} style={s.column}>{items.filter((_, index) => index % 2 === column).map((item, index) => <View key={item.id} style={s.card}><Pressable accessibilityRole="button" accessibilityLabel={`阅读${item.title}`} onPress={() => router.push(`/discover/${item.id}`)}>{item.coverUri ? <Image source={{ uri: resolveDiscoveryMediaUri(item.coverUri) }} style={[s.image, { height: column === 0 && index === 0 ? 206 : 171 }]} /> : null}<Text style={s.cardTitle}>{item.title}</Text></Pressable><View style={s.metadata}><View style={s.avatar}><Text style={s.avatarText}>{item.author.slice(0, 1) || ' '}</Text></View><Text numberOfLines={1} style={s.author}>{item.author}</Text>{item.likesEnabled ? <Pressable accessibilityLabel={item.liked ? '取消点赞' : '点赞'} accessibilityState={{ selected: item.liked, disabled: likingIds.includes(item.id) }} disabled={likingIds.includes(item.id)} onPress={() => { void toggleLike(item); }} hitSlop={7} style={s.like}><Ionicons name={item.liked ? 'heart' : 'heart-outline'} size={14} color={item.liked ? colors.brand : colors.textMuted} /><Text style={s.count}>{item.likeCount}</Text></Pressable> : null}</View></View>)}</View>)}</View>}
  </Screen>;
}

const s = StyleSheet.create({
  categories: { flexDirection: 'row', gap: 20, borderBottomWidth: 1, borderBottomColor: colors.border, marginBottom: 12 },
  category: { paddingHorizontal: 5, paddingVertical: 9, borderBottomWidth: 2, borderBottomColor: 'transparent' },
  categoryActive: { borderBottomColor: colors.brand },
  categoryText: { fontSize: 14, color: colors.textMuted },
  categoryTextActive: { color: colors.textPrimary, fontWeight: '700' },
  grid: { flexDirection: 'row', gap: 8 },
  column: { flex: 1, gap: 12 },
  card: { borderWidth: 1, borderColor: colors.border, borderRadius: 14, backgroundColor: colors.surface, overflow: 'hidden' },
  image: { width: '100%', resizeMode: 'cover' },
  cardTitle: { fontSize: 14, lineHeight: 22, color: colors.textPrimary, marginHorizontal: 9, marginTop: 8, minHeight: 43 },
  metadata: { flexDirection: 'row', alignItems: 'center', gap: 4, padding: 9 },
  avatar: { width: 19, height: 19, borderRadius: 10, backgroundColor: colors.surfaceAlt, alignItems: 'center', justifyContent: 'center' },
  avatarText: { fontSize: 10, color: colors.textSecondary },
  author: { fontSize: 10, color: colors.textSecondary, flex: 1 },
  like: { flexDirection: 'row', alignItems: 'center', gap: 2 },
  count: { fontSize: 10, color: colors.textMuted },
});
