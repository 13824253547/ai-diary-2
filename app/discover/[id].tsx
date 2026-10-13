import { Image, Pressable, StyleSheet, Text, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Screen } from '../../src/components/layout/screen';
import { TopBar } from '../../src/components/layout/top-bar';
import { EmptyResult, supportStyles as u } from '../../src/components/common/support-ui';
import { Button } from '../../src/components/common/button';
import { discoveryItems } from '../../src/mocks/discovery';
import { useAppStore } from '../../src/store/use-app-store';
import { colors } from '../../src/theme/tokens';

export default function DiscoverDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const item = discoveryItems.find(i => i.id === id);
  const liked = useAppStore(s => s.likedDiscoveryIds.includes(id ?? ''));
  const toggle = useAppStore(s => s.toggleDiscoveryLike);
  return <Screen header={<TopBar title="旅途中的故事" onBackPress={() => router.back()} />}>{!item ? <EmptyResult title="这篇故事暂时不在这里"><Button label="返回发现" onPress={() => router.replace('/(tabs)/discover')} /></EmptyResult> : <><Image source={item.image} style={s.image} /><Text style={u.title}>{item.title}</Text><View style={u.row}><View style={s.author}><Image source={item.avatar} style={s.avatar} /><Text style={u.body}>{item.author}</Text></View><Text style={u.muted}>{item.date}</Text></View><Text style={u.muted}>⌖ {item.location}</Text><Text style={s.body}>{item.body}</Text><Pressable accessibilityLabel={liked ? '取消点赞' : '点赞'} onPress={() => toggle(item.id)} style={s.like}><Ionicons name={liked ? 'heart' : 'heart-outline'} size={23} color={colors.brand} /><Text style={u.body}>{item.likes + Number(liked)} 人喜欢这个瞬间</Text></Pressable></>}</Screen>;
}
const s = StyleSheet.create({ image: { width: '100%', height: 345, borderRadius: 16 }, author: { flexDirection: 'row', gap: 8, alignItems: 'center' }, avatar: { width: 29, height: 29, borderRadius: 15 }, body: { fontSize: 16, lineHeight: 29, color: colors.textSecondary }, like: { flexDirection: 'row', alignItems: 'center', gap: 9, padding: 17, borderRadius: 16, borderColor: colors.border, borderWidth: 1, backgroundColor: colors.surface } });
