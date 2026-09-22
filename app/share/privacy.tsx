import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { Alert, Image, Pressable, StyleSheet, Text, View } from 'react-native';
import { Button } from '../../src/components/common/button';
import { Empty } from '../../src/components/common/design-ui';
import { Photo } from '../../src/components/diary/photo';
import { Screen } from '../../src/components/layout/screen';
import { TopBar } from '../../src/components/layout/top-bar';
import { publicParagraphs, useAppStore } from '../../src/store/use-app-store';
import { art } from '../../src/theme/assets';
import type { DiaryPrivacy } from '../../src/types/diary';
import { colors } from '../../src/theme/tokens';

const options: { id: DiaryPrivacy; title: string; detail: string; icon: keyof typeof Ionicons.glyphMap; color: string }[] = [
  { id: 'private', title: '私密 · 仅自己可见', detail: '只有你自己能看到', icon: 'lock-closed', color: '#FF871E' },
  { id: 'anonymous', title: '匿名公开 · 独立马甲', detail: '以匿名身份公开，保护隐私', icon: 'glasses', color: '#B4B1AD' },
  { id: 'public-likes', title: '公开 · 仅点赞', detail: '所有人可见，但不可评论', icon: 'heart', color: '#ED8584' },
  { id: 'public-comments', title: '公开 · 可评论', detail: '所有人可见，可评论互动', icon: 'chatbubble', color: '#79ACDD' },
];

export default function PrivacyScreen() {
  const router = useRouter();
  const { diaryId, returnTo } = useLocalSearchParams<{ diaryId?: string; returnTo?: string }>();
  const diary = useAppStore(state => state.diaries.find(item => item.id === diaryId));
  const [privacy, setPrivacy] = useState<DiaryPrivacy>(diary?.privacy ?? 'private');
  const [selectedBlocks, setSelectedBlocks] = useState<string[]>(diary?.publicBlockIds ?? (diary ? publicParagraphs(diary).map(block => block.id) : []));
  const [expanded, setExpanded] = useState(false);
  useEffect(() => {
    if (diary) {
      setPrivacy(diary.privacy);
      setSelectedBlocks(diary.publicBlockIds ?? publicParagraphs(diary).map(block => block.id));
    }
  }, [diaryId]);
  if (!diary) return <Screen><Empty title="没有找到这篇日记" detail="请从已保存的日记进入分享。" home /></Screen>;
  const blocks = publicParagraphs(diary);
  const visibleBlocks = expanded ? blocks : blocks.slice(0, 2);
  const finish = () => {
    const ids = selectedBlocks.length === blocks.length ? undefined : selectedBlocks;
    if (!useAppStore.getState().savePrivacy(diary.id, privacy, ids)) {
      Alert.alert('至少公开一段内容', '勾选一段正文或引用，再生成分享预览。');
      return;
    }
    if (returnTo === 'detail') {
      router.back();
      return;
    }
    router.push({ pathname: '/share/result', params: { diaryId: diary.id } });
  };
  const displayDate = diary.date.includes('–') ? diary.date.split('–').at(-1)?.replace('.', '月') ?? diary.date : diary.date.slice(5).replace('.', '月');
  return <Screen contentStyle={styles.content} footer={<View style={styles.footer}><Button label="完成" onPress={finish} /></View>}>
    <TopBar title="这篇日记给谁看？" onBackPress={() => router.back()} />
    <View style={styles.diary}>
      <Photo id={diary.coverPhotoId} style={styles.cover} />
      <View style={styles.diaryCopy}>
        <Text numberOfLines={1} style={styles.diaryTitle}>{diary.title}</Text>
        <Text style={styles.date}>{displayDate}</Text>
      </View>
    </View>
    <View style={styles.options}>{options.map(option => <Pressable key={option.id} accessibilityRole="radio" accessibilityState={{ selected: privacy === option.id }} accessibilityLabel={option.title} onPress={() => setPrivacy(option.id)} style={[styles.option, privacy === option.id && styles.optionActive]}>
      <View style={[styles.icon, { backgroundColor: option.color }]}><Ionicons name={option.icon} size={26} color="#FFF" /></View>
      <View style={styles.optionCopy}><View style={styles.optionTitleRow}><Text style={styles.optionTitle}>{option.title}</Text>{option.id === 'private' ? <Text style={styles.default}>默认</Text> : null}</View><Text style={styles.optionDetail}>{option.detail}</Text></View>
      <View style={[styles.radio, privacy === option.id && styles.radioActive]}>{privacy === option.id ? <View style={styles.radioInner} /> : null}</View>
    </Pressable>)}</View>
    <View style={styles.sectionHeading}><Text style={styles.sectionTitle}>选段公开</Text><Pressable onPress={() => Alert.alert('选段公开', '只分享勾选的段落，其余内容仅自己可见。')} accessibilityLabel="了解选段公开"><Ionicons name="information-circle-outline" size={18} color={colors.textMuted} /></Pressable></View>
    <Text style={styles.sectionDetail}>只分享勾选的段落，其余内容仅自己可见</Text>
    <View style={styles.blocks}>{visibleBlocks.map(block => {
      const selected = selectedBlocks.includes(block.id);
      return <Pressable key={block.id} accessibilityRole="checkbox" accessibilityState={{ checked: selected }} accessibilityLabel={`公开内容：${block.content}`} onPress={() => setSelectedBlocks(current => current.includes(block.id) ? current.filter(id => id !== block.id) : [...current, block.id])} style={styles.block}>
        <Text numberOfLines={3} style={styles.blockText}>{block.content}</Text><View style={[styles.checkbox, selected && styles.checked]}>{selected ? <Ionicons name="checkmark" size={18} color="#FFF" /> : null}</View>
      </Pressable>;
    })}</View>
    {blocks.length > 2 ? <Pressable onPress={() => setExpanded(value => !value)} style={styles.more} accessibilityRole="button"><Text style={styles.moreText}>{expanded ? '收起段落' : `查看全部 ${blocks.length} 段 · 已选 ${selectedBlocks.length} 段`} <Ionicons name={expanded ? 'chevron-up' : 'chevron-down'} size={11} /></Text></Pressable> : null}
    <View style={styles.tipCard}>
      <Image source={art.mascotHello} style={styles.tipMascot} resizeMode="contain" />
      <Text style={styles.tipText}>匿名公开时，我会自动给照片里的人脸打码</Text>
    </View>
  </Screen>;
}
const styles = StyleSheet.create({
  content: { gap: 12 },
  diary: { flexDirection: 'row', alignItems: 'center', gap: 14, padding: 10, borderRadius: 18, backgroundColor: '#FFFBF6', borderWidth: 1, borderColor: '#F3E7D8' },
  cover: { width: 109, height: 58, borderRadius: 9 },
  diaryCopy: { flex: 1, gap: 6 },
  diaryTitle: { fontSize: 17, fontWeight: '700', color: colors.textPrimary, lineHeight: 24 },
  date: { color: colors.textMuted, fontWeight: '500', fontSize: 13 },
  options: { gap: 10 },
  option: { minHeight: 78, flexDirection: 'row', alignItems: 'center', gap: 14, borderWidth: 1, borderColor: '#F2ECE3', borderRadius: 18, paddingVertical: 12, paddingHorizontal: 15, backgroundColor: '#FFFDFB' },
  optionActive: { borderColor: '#FFD4B0', backgroundColor: '#FFFEFB' },
  icon: { width: 52, height: 52, borderRadius: 26, alignItems: 'center', justifyContent: 'center' },
  optionCopy: { flex: 1, gap: 5 },
  optionTitleRow: { flexDirection: 'row', gap: 7, alignItems: 'center', flexWrap: 'wrap' },
  optionTitle: { fontSize: 15, fontWeight: '700', color: colors.textPrimary },
  default: { fontSize: 10, borderWidth: 1, borderColor: '#FFDCC3', borderRadius: 6, paddingHorizontal: 5, paddingVertical: 1, color: colors.brandStrong, backgroundColor: '#FFF7F0' },
  optionDetail: { fontSize: 12, color: '#AAA39B', lineHeight: 18 },
  radio: { width: 26, height: 26, borderWidth: 1.5, borderColor: '#D5D0C9', borderRadius: 13, justifyContent: 'center', alignItems: 'center' },
  radioActive: { borderColor: colors.brandStrong },
  radioInner: { width: 14, height: 14, borderRadius: 7, backgroundColor: colors.brandStrong },
  sectionHeading: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 2 },
  sectionTitle: { fontSize: 18, fontWeight: '700', color: colors.textPrimary },
  sectionDetail: { fontSize: 12, color: colors.textMuted, marginTop: -6, marginBottom: 2 },
  blocks: { gap: 10 },
  block: { flexDirection: 'row', alignItems: 'flex-start', gap: 14, backgroundColor: '#FFFDFB', borderWidth: 1, borderColor: '#F2ECE3', borderRadius: 16, paddingHorizontal: 15, paddingVertical: 14 },
  blockText: { flex: 1, fontSize: 14, lineHeight: 26, color: colors.textPrimary, letterSpacing: 0.15 },
  checkbox: { width: 28, height: 28, borderWidth: 1.5, borderColor: '#D5D0C9', borderRadius: 6, alignItems: 'center', justifyContent: 'center', marginTop: 1 },
  checked: { backgroundColor: colors.brandStrong, borderColor: colors.brandStrong },
  more: { alignSelf: 'flex-end', paddingVertical: 2, paddingHorizontal: 2 },
  moreText: { fontSize: 11, color: colors.textSecondary },
  tipCard: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: '#FFF7EF', borderWidth: 1, borderColor: '#F2E2D0', borderRadius: 18, paddingHorizontal: 12, paddingVertical: 9, marginTop: -2 },
  tipMascot: { width: 48, height: 48 },
  tipText: { flex: 1, fontSize: 13, lineHeight: 21, color: '#7C6656' },
  footer: { paddingHorizontal: 18, paddingTop: 10, paddingBottom: 14, backgroundColor: colors.background },
});
