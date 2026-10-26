import { ActivityIndicator, Image, Pressable, StyleSheet, Text, View } from 'react-native';
import { useEffect, useState } from 'react';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Screen } from '../../src/components/layout/screen';
import { TopBar } from '../../src/components/layout/top-bar';
import { EmptyResult, supportStyles as u } from '../../src/components/common/support-ui';
import { Button } from '../../src/components/common/button';
import { createBackendDiscoveryRepository } from '../../src/store/adapters/backend-discovery-adapter';
import type { DiscoveryStoryContract } from '../../src/contracts/discovery-contract';
import { colors } from '../../src/theme/tokens';

export default function DiscoverDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const [item, setItem] = useState<DiscoveryStoryContract>();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [liking, setLiking] = useState(false);
  useEffect(() => {
    let active = true;
    if (!id) {
      setLoading(false);
      return;
    }
    void createBackendDiscoveryRepository().getStory(id).then(story => {
      if (active) setItem(story);
    }).catch(() => {
      if (active) setError(true);
    }).finally(() => {
      if (active) setLoading(false);
    });
    return () => { active = false; };
  }, [id]);
  const toggleLike = async () => {
    if (!item?.likesEnabled || liking) return;
    setLiking(true);
    try {
      const result = await createBackendDiscoveryRepository().setLike(item.id, !item.liked);
      setItem(current => current ? { ...current, liked: result.liked, likeCount: result.likeCount } : current);
    } catch {
      setError(true);
    } finally {
      setLiking(false);
    }
  };
  return <Screen header={<TopBar title="旅途中的故事" onBackPress={() => router.back()} />}>{loading ? <ActivityIndicator accessibilityLabel="正在加载故事" color={colors.brand} /> : error || !item ? <EmptyResult title={error ? '故事暂时无法加载' : '这篇故事暂时不在这里'}><Button label="返回发现" onPress={() => router.replace('/(tabs)/discover')} /></EmptyResult> : <><Image source={{ uri: item.coverUri }} style={s.image} /><Text style={u.title}>{item.title}</Text><View style={u.row}><Text style={u.body}>{item.author}</Text><Text style={u.muted}>{item.date}</Text></View><Text style={u.muted}>{item.location}</Text><Text style={s.body}>{item.body}</Text>{item.likesEnabled ? <Pressable accessibilityLabel={item.liked ? '取消点赞' : '点赞'} accessibilityState={{ selected: item.liked, disabled: liking }} disabled={liking} onPress={() => { void toggleLike(); }} style={s.like}><Ionicons name={item.liked ? 'heart' : 'heart-outline'} size={23} color={colors.brand} /><Text style={u.body}>{item.likeCount} 人喜欢这个瞬间</Text></Pressable> : null}</>}</Screen>;
}
const s = StyleSheet.create({ image: { width: '100%', height: 345, borderRadius: 16 }, body: { fontSize: 16, lineHeight: 29, color: colors.textSecondary }, like: { flexDirection: 'row', alignItems: 'center', gap: 9, padding: 17, borderRadius: 16, borderColor: colors.border, borderWidth: 1, backgroundColor: colors.surface } });
