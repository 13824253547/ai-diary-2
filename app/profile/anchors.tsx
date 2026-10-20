import { useState } from 'react';
import { Image, KeyboardAvoidingView, Modal, Platform, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { GrowthScreen } from '../../src/components/profile/growth-screen';
import { Button } from '../../src/components/common/button';
import { EmptyResult, IconAction, supportStyles as u } from '../../src/components/common/support-ui';
import { useAppStore } from '../../src/store/use-app-store';
import { mockPhotos } from '../../src/mocks/photos';
import { art } from '../../src/theme/assets';
import { colors } from '../../src/theme/tokens';
import type { DiaryItem } from '../../src/types/diary';

const groupsByTagId = {
  friends: { label: '珍视旧友', diaryIds: ['diary-1', 'diary-2', 'diary-4'] },
  light: { label: '追光的人', diaryIds: ['diary-5', 'diary-6', 'diary-1'] },
  mountains: { label: '山与海', diaryIds: ['diary-7', 'diary-2', 'diary-5'] },
  food: { label: '深夜食堂', diaryIds: ['diary-4', 'diary-1'] },
};

// An anchor is a short excerpt of its linked diary, rather than its entire paragraph.
function anchorExcerpt(diary: DiaryItem, tag: string) {
  const paragraphs = diary.blocks.filter(block => block.type === 'text').map(block => block.content);
  const sentences = paragraphs.join('').match(/[^。！？]+[。！？]?/g) ?? [diary.summary || '这段回忆，值得好好收藏。'];
  const sentence = tag === '珍视旧友'
    ? sentences.find(value => diary.companionName && diary.companionName !== '自己' && value.includes(diary.companionName)) ?? sentences[0]
    : sentences[0];
  if (sentence.length <= 28) return sentence;
  const phraseEnd = sentence.lastIndexOf('，', 28);
  return phraseEnd > 12 ? `${sentence.slice(0, phraseEnd)}…` : `${sentence.slice(0, 28)}…`;
}

export default function AnchorsScreen() {
  const router = useRouter();
  const { tag } = useLocalSearchParams<{ tag?: string }>();
  const group = (tag ? groupsByTagId[tag as keyof typeof groupsByTagId] : undefined)
    ?? Object.values(groupsByTagId).find(item => item.label === tag)
    ?? groupsByTagId.friends;
  const label = group.label;
  const diaries = useAppStore(s => s.diaries);
  const corrected = useAppStore(s => s.correctedAnchors);
  const correct = useAppStore(s => s.correctAnchor);
  const [editing, setEditing] = useState<string | null>(null);
  const [text, setText] = useState('');
  const anchors = group.diaryIds.map(id => diaries.find(diary => diary.id === id)).filter(diary => diary !== undefined);
  const beginCorrection = (diary: DiaryItem) => {
    setEditing(diary.id);
    setText(corrected[`${label}-${diary.id}`] ?? anchorExcerpt(diary, label));
  };

  return (
    <GrowthScreen header={<View style={s.header}>
        <View style={s.titleRow}>
          <Pressable accessibilityRole="button" accessibilityLabel="返回" hitSlop={8} onPress={() => router.back()} style={s.back}>
            <Ionicons name="chevron-back" size={25} color={colors.textPrimary} />
          </Pressable>
          <Text style={s.title}>记忆锚点 · {label}</Text>
          <View style={s.back} />
        </View>
        <Text style={s.subtitle}>小橘从你的日记里记住了这个</Text>
      </View>} contentStyle={s.content}>
      <View style={s.cards}>
        {anchors.map(diary => {
          const savedCorrection = corrected[`${label}-${diary.id}`];
          const photo = mockPhotos.find(item => item.id === diary.coverPhotoId);
          return (
            <View key={diary.id} style={s.card}>
              <Pressable accessibilityRole="button" accessibilityLabel={`查看${diary.title}`} onPress={() => router.push(`/diary/${diary.id}`)} style={({ pressed }) => [s.diaryLink, pressed && s.pressed]}>
                <Image source={photo?.image ?? art.street} style={s.image} />
                <View style={s.copy}>
                  <Text numberOfLines={2} style={s.cardTitle}>{Number(diary.date.slice(5, 7))}月{Number(diary.date.slice(8, 10))}日 · {diary.title}</Text>
                  <Text numberOfLines={3} style={s.quote}>“{savedCorrection ?? anchorExcerpt(diary, label)}”</Text>
                  {savedCorrection ? <Text style={s.saved}>已按你的想法更新</Text> : null}
                </View>
              </Pressable>
              <Pressable accessibilityRole="button" accessibilityLabel={`纠正${diary.title}的锚点`} hitSlop={5} onPress={() => beginCorrection(diary)} style={s.more}>
                <Ionicons name="ellipsis-horizontal" size={20} color="#A58870" />
              </Pressable>
            </View>
          );
        })}
        {!anchors.length ? <EmptyResult title="还没有这个记忆锚点" /> : null}
      </View>
      {anchors.length > 0 && <Pressable accessibilityRole="button" onPress={() => beginCorrection(anchors[0])} style={({ pressed }) => [s.correct, pressed && s.pressed]}>
        <Text style={s.correctText}>它可能看错了？点我纠正</Text>
      </Pressable>}
      <Modal visible={Boolean(editing)} transparent animationType="slide" onRequestClose={() => setEditing(null)}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={s.modal}>
          <Pressable style={s.shade} onPress={() => setEditing(null)}>
            <Pressable style={s.sheet} onPress={event => event.stopPropagation()}>
              <View style={u.row}><Text style={u.heading}>说说你的理解</Text><IconAction name="close-outline" label="取消纠正" onPress={() => setEditing(null)} /></View>
              <Text style={u.body}>小橘会记住你的想法。</Text>
              <TextInput accessibilityLabel="纠正记忆锚点" multiline value={text} onChangeText={setText} maxLength={240} placeholder="这段回忆对我来说是…" placeholderTextColor={colors.textMuted} style={s.input} />
              <Button disabled={!text.trim()} label="保存我的想法" onPress={() => { if (editing) correct(`${label}-${editing}`, text.trim()); setEditing(null); }} />
            </Pressable>
          </Pressable>
        </KeyboardAvoidingView>
      </Modal>
    </GrowthScreen>
  );
}

const s = StyleSheet.create({
  content: { paddingHorizontal: 19, paddingTop: 12, paddingBottom: 34, gap: 0 },
  header: { marginBottom: 31 },
  titleRow: { flexDirection: 'row', alignItems: 'center', minHeight: 43 },
  back: { width: 30, minHeight: 43, justifyContent: 'center' },
  title: { flex: 1, textAlign: 'center', fontSize: 23, lineHeight: 31, fontWeight: '600', color: '#201A15' },
  subtitle: { fontSize: 15, lineHeight: 24, color: '#8A7765', textAlign: 'center', marginTop: 13 },
  cards: { gap: 15 },
  card: {
    borderRadius: 22, backgroundColor: '#FFFCF7', padding: 13,
    shadowColor: '#C38D53', shadowOpacity: 0.11, shadowRadius: 7, shadowOffset: { width: 0, height: 4 }, elevation: 2,
  },
  diaryLink: { flexDirection: 'row', alignItems: 'center', gap: 15, minHeight: 124 },
  pressed: { opacity: 0.72 },
  image: { width: 111, height: 124, borderRadius: 10 },
  copy: { flex: 1, gap: 16 },
  cardTitle: { fontSize: 15, lineHeight: 23, fontWeight: '500', color: '#34271D', paddingRight: 35 },
  quote: { fontSize: 15, lineHeight: 27, color: '#8A7360' },
  saved: { color: colors.brandStrong, fontSize: 10, marginTop: -10 },
  more: { position: 'absolute', top: 12, right: 8, width: 36, height: 40, alignItems: 'center', justifyContent: 'center' },
  correct: { borderRadius: 25, borderWidth: 1, borderColor: '#F5E2CC', paddingHorizontal: 29, paddingVertical: 12, alignSelf: 'center', marginTop: 34, backgroundColor: '#FFF6EA' },
  correctText: { color: '#957A63', fontSize: 15, lineHeight: 22 },
  modal: { flex: 1 },
  shade: { flex: 1, backgroundColor: '#0005', justifyContent: 'center', padding: 22 },
  sheet: { backgroundColor: '#FFF3E5', borderRadius: 23, padding: 20, gap: 14 },
  input: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: 12, height: 130, padding: 14, fontSize: 14, color: colors.textPrimary, textAlignVertical: 'top' },
});
