import { useCallback, useEffect, useState } from 'react';
import { Alert, KeyboardAvoidingView, Modal, Platform, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { GrowthScreen } from '../../src/components/profile/growth-screen';
import { Button } from '../../src/components/common/button';
import { EmptyResult, IconAction, supportStyles as u } from '../../src/components/common/support-ui';
import { Photo } from '../../src/components/diary/photo';
import { createBackendAnchorReadModelRepository } from '../../src/store/adapters/backend-anchor-read-model-adapter';
import { createBackendAnchorCorrectionRepository } from '../../src/store/adapters/backend-anchor-correction-adapter';
import { colors } from '../../src/theme/tokens';
import type { PersistedAnchorRecord } from '../../src/contracts/anchor-read-model-contract';

const anchorLabels: Record<string, string> = {
  friends: '珍视旧友',
  light: '追光的人',
  mountains: '山与海',
  food: '深夜食堂',
};

export default function AnchorsScreen() {
  const router = useRouter();
  const { tag } = useLocalSearchParams<{ tag?: string }>();
  const tagId = tag && anchorLabels[tag] ? tag : 'friends';
  const label = anchorLabels[tagId];
  const [anchors, setAnchors] = useState<PersistedAnchorRecord[]>([]);
  const [corrections, setCorrections] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [editing, setEditing] = useState<PersistedAnchorRecord | null>(null);
  const [text, setText] = useState('');
  const [saving, setSaving] = useState(false);
  const loadAnchors = useCallback(async () => {
    setLoading(true);
    setLoadError(false);
    try {
      const page = await createBackendAnchorReadModelRepository().listByTag({ tagId, page: 1, pageSize: 20 });
      setAnchors(page.items);
      setCorrections({});
    } catch {
      setAnchors([]);
      setLoadError(true);
    } finally {
      setLoading(false);
    }
  }, [tagId]);
  useEffect(() => { void loadAnchors(); }, [loadAnchors]);
  const beginCorrection = async (anchor: PersistedAnchorRecord) => {
    setEditing(anchor);
    setText(corrections[anchor.anchorId] ?? anchor.excerpt);
    try {
      const correction = await createBackendAnchorCorrectionRepository().getCorrection({
        diaryId: anchor.diary.id,
        diaryVersion: anchor.diary.version,
        anchorId: anchor.anchorId,
      });
      if (correction) {
        setCorrections(current => ({ ...current, [anchor.anchorId]: correction.correction }));
        setText(correction.correction);
      }
    } catch {
      Alert.alert('暂时无法读取', '记忆锚点的纠正内容读取失败，请稍后重试。');
    }
  };
  const saveCorrection = async () => {
    if (!editing || !text.trim() || saving) return;
    setSaving(true);
    try {
      const repository = createBackendAnchorCorrectionRepository();
      const current = await repository.getCorrection({
        diaryId: editing.diary.id,
        diaryVersion: editing.diary.version,
        anchorId: editing.anchorId,
      });
      const result = await repository.saveCorrection({
        diaryId: editing.diary.id,
        diaryVersion: editing.diary.version,
        anchorId: editing.anchorId,
        sourceBlockId: editing.sourceBlockId,
        correction: text.trim(),
        expectedVersion: current?.version ?? 0,
        idempotencyKey: `${editing.anchorId}-${Date.now()}`,
      });
      setCorrections(state => ({ ...state, [editing.anchorId]: result.correction }));
      setEditing(null);
    } catch {
      Alert.alert('保存失败', '这次纠正没有写入服务，请稍后重试。');
    } finally {
      setSaving(false);
    }
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
        {anchors.map(anchor => {
          const diary = anchor.diary;
          const savedCorrection = corrections[anchor.anchorId];
          return (
            <View key={anchor.id} style={s.card}>
              <Pressable accessibilityRole="button" accessibilityLabel={`查看${diary.title}`} onPress={() => router.push(`/diary/${diary.id}`)} style={({ pressed }) => [s.diaryLink, pressed && s.pressed]}>
                <Photo id={diary.coverPhotoId} diaryId={diary.id} style={s.image} />
                <View style={s.copy}>
                  <Text numberOfLines={2} style={s.cardTitle}>{diary.date.slice(0, 10)} · {diary.title}</Text>
                  <Text numberOfLines={3} style={s.quote}>“{savedCorrection ?? anchor.excerpt}”</Text>
                  {savedCorrection ? <Text style={s.saved}>已按你的想法更新</Text> : null}
                </View>
              </Pressable>
              <Pressable accessibilityRole="button" accessibilityLabel={`纠正${diary.title}的锚点`} hitSlop={5} onPress={() => { void beginCorrection(anchor); }} style={s.more}>
                <Ionicons name="ellipsis-horizontal" size={20} color="#A58870" />
              </Pressable>
            </View>
          );
        })}
        {loading ? <EmptyResult title="正在读取真实记忆锚点" /> : loadError ? <EmptyResult title="记忆锚点暂时无法读取"><Button label="重新加载" onPress={() => { void loadAnchors(); }} /></EmptyResult> : !anchors.length ? <EmptyResult title="还没有这个记忆锚点" /> : null}
      </View>
      {anchors.length > 0 && <Pressable accessibilityRole="button" onPress={() => { void beginCorrection(anchors[0]); }} style={({ pressed }) => [s.correct, pressed && s.pressed]}>
        <Text style={s.correctText}>它可能看错了？点我纠正</Text>
      </Pressable>}
      <Modal visible={Boolean(editing)} transparent animationType="slide" onRequestClose={() => setEditing(null)}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={s.modal}>
          <Pressable style={s.shade} onPress={() => setEditing(null)}>
            <Pressable style={s.sheet} onPress={event => event.stopPropagation()}>
              <View style={u.row}><Text style={u.heading}>说说你的理解</Text><IconAction name="close-outline" label="取消纠正" onPress={() => setEditing(null)} /></View>
              <Text style={u.body}>这条纠正会保存到你的记忆锚点记录中。</Text>
              <TextInput accessibilityLabel="纠正记忆锚点" multiline value={text} onChangeText={setText} maxLength={240} placeholder="这段回忆对我来说是…" placeholderTextColor={colors.textMuted} style={s.input} />
              <Button disabled={!text.trim() || saving} label={saving ? '正在保存…' : '保存我的想法'} onPress={() => { void saveCorrection(); }} />
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
