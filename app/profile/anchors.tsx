import { useCallback, useEffect, useRef, useState } from 'react';
import { Alert, Animated, Easing, KeyboardAvoidingView, Modal, Platform, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { GrowthScreen } from '../../src/components/profile/growth-screen';
import { Button } from '../../src/components/common/button';
import { EmptyResult, IconAction, supportStyles as u } from '../../src/components/common/support-ui';
import { Photo } from '../../src/components/diary/photo';
import { createBackendAnchorReadModelRepository } from '../../src/store/adapters/backend-anchor-read-model-adapter';
import { createBackendAnchorCorrectionRepository } from '../../src/store/adapters/backend-anchor-correction-adapter';
import { colors } from '../../src/theme/tokens';
import type { MemoryAnchorFeedRecord } from '../../src/contracts/anchor-read-model-contract';

const anchorLabels: Record<string, string> = {
  friends: '珍视旧友',
  light: '追光的人',
  mountains: '山与海',
  food: '深夜食堂',
};

export default function AnchorsScreen() {
  const router = useRouter();
  const { tag } = useLocalSearchParams<{ tag?: string }>();
  const tagId = tag && anchorLabels[tag] ? tag : undefined;
  const label = tagId ? anchorLabels[tagId] : '全部';
  const [anchors, setAnchors] = useState<MemoryAnchorFeedRecord[]>([]);
  const [total, setTotal] = useState(0);
  const [pageNumber, setPageNumber] = useState(1);
  const [corrections, setCorrections] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [loadError, setLoadError] = useState(false);
  const [editing, setEditing] = useState<MemoryAnchorFeedRecord | null>(null);
  const [correctionModalVisible, setCorrectionModalVisible] = useState(false);
  const backdropOpacity = useRef(new Animated.Value(0)).current;
  const sheetOpacity = useRef(new Animated.Value(1)).current;
  const sheetTranslateY = useRef(new Animated.Value(16)).current;
  const animationFrameRef = useRef<number | null>(null);
  const [text, setText] = useState('');
  const [saving, setSaving] = useState(false);
  useEffect(() => () => {
    if (animationFrameRef.current !== null) cancelAnimationFrame(animationFrameRef.current);
    backdropOpacity.stopAnimation();
    sheetOpacity.stopAnimation();
    sheetTranslateY.stopAnimation();
  }, [backdropOpacity, sheetOpacity, sheetTranslateY]);
  const loadAnchors = useCallback(async () => {
    setLoading(true);
    setLoadError(false);
    try {
      const page = await createBackendAnchorReadModelRepository().listFeed({
        ...(tagId ? { tagId } : {}),
        page: 1,
        pageSize: 20,
      });
      setAnchors(page.items);
      setTotal(page.total);
      setPageNumber(1);
      setCorrections({});
    } catch {
      setAnchors([]);
      setLoadError(true);
    } finally {
      setLoading(false);
    }
  }, [tagId]);
  useEffect(() => { void loadAnchors(); }, [loadAnchors]);
  const loadMore = async () => {
    if (loadingMore || anchors.length >= total) return;
    setLoadingMore(true);
    try {
      const nextPage = pageNumber + 1;
      const page = await createBackendAnchorReadModelRepository().listFeed({
        ...(tagId ? { tagId } : {}),
        page: nextPage,
        pageSize: 20,
      });
      setAnchors(current => {
        const ids = new Set(current.map(anchor => anchor.id));
        return [...current, ...page.items.filter(anchor => !ids.has(anchor.id))];
      });
      setTotal(page.total);
      setPageNumber(nextPage);
    } catch {
      Alert.alert('暂时无法读取', '更多记忆锚点加载失败，请稍后重试。');
    } finally {
      setLoadingMore(false);
    }
  };
  const readCorrection = async (anchor: MemoryAnchorFeedRecord) => {
    const repository = createBackendAnchorCorrectionRepository();
    if (anchor.sourceType === 'diary' && anchor.diary) {
      return repository.getCorrection({
        diaryId: anchor.diary.id,
        diaryVersion: anchor.diary.version,
        anchorId: anchor.anchorId,
      });
    }
    if (anchor.sourceType === 'chat' && anchor.chat) {
      return repository.getChatCorrection({
        anchorId: anchor.anchorId,
        anchorBatchId: anchor.chat.batchId,
      });
    }
    throw new Error('锚点来源不可用。');
  };
  const openCorrectionModal = () => {
    if (animationFrameRef.current !== null) cancelAnimationFrame(animationFrameRef.current);
    backdropOpacity.stopAnimation();
    sheetOpacity.stopAnimation();
    sheetTranslateY.stopAnimation();
    backdropOpacity.setValue(0);
    sheetOpacity.setValue(1);
    sheetTranslateY.setValue(16);
    setCorrectionModalVisible(true);
    animationFrameRef.current = requestAnimationFrame(() => {
      animationFrameRef.current = null;
      Animated.parallel([
        Animated.timing(backdropOpacity, {
          toValue: 1,
          duration: 180,
          easing: Easing.out(Easing.quad),
          useNativeDriver: true,
        }),
        Animated.spring(sheetTranslateY, {
          toValue: 0,
          damping: 24,
          mass: 0.9,
          stiffness: 240,
          useNativeDriver: true,
        }),
      ]).start();
    });
  };
  const closeCorrectionModal = () => {
    if (animationFrameRef.current !== null) {
      cancelAnimationFrame(animationFrameRef.current);
      animationFrameRef.current = null;
    }
    backdropOpacity.stopAnimation();
    sheetOpacity.stopAnimation();
    sheetTranslateY.stopAnimation();
    Animated.parallel([
      Animated.timing(backdropOpacity, {
        toValue: 0,
        duration: 200,
        easing: Easing.out(Easing.quad),
        useNativeDriver: true,
      }),
      Animated.timing(sheetTranslateY, {
        toValue: 56,
        duration: 200,
        easing: Easing.bezier(0.3, 0, 1, 1),
        useNativeDriver: true,
      }),
      Animated.timing(sheetOpacity, {
        toValue: 0,
        duration: 200,
        easing: Easing.bezier(0.3, 0, 1, 1),
        useNativeDriver: true,
      }),
    ]).start(({ finished }) => {
      if (finished) {
        setCorrectionModalVisible(false);
        setEditing(null);
      }
    });
  };
  const beginCorrection = async (anchor: MemoryAnchorFeedRecord) => {
    setEditing(anchor);
    setText(corrections[anchor.anchorId] ?? anchor.correction ?? anchor.excerpt);
    openCorrectionModal();
    try {
      const correction = await readCorrection(anchor);
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
    const normalized = text.trim();
    if (Array.from(normalized).length > 240) {
      Alert.alert('内容太长了', '纠正内容最多 240 字。');
      return;
    }
    setSaving(true);
    try {
      const repository = createBackendAnchorCorrectionRepository();
      const current = await readCorrection(editing);
      const result = editing.sourceType === 'diary' && editing.diary && editing.sourceBlockId
        ? await repository.saveCorrection({
          diaryId: editing.diary.id,
          diaryVersion: editing.diary.version,
          anchorId: editing.anchorId,
          sourceBlockId: editing.sourceBlockId,
          correction: normalized,
          expectedVersion: current?.version ?? 0,
          idempotencyKey: `diary-${editing.anchorId}-${Date.now()}`,
        })
        : editing.sourceType === 'chat' && editing.chat
          ? await repository.saveChatCorrection({
            anchorId: editing.anchorId,
            anchorBatchId: editing.chat.batchId,
            correction: normalized,
            expectedVersion: current?.version ?? 0,
            idempotencyKey: `chat-${editing.anchorId}-${Date.now()}`,
          })
          : undefined;
      if (!result) throw new Error('锚点来源不可用。');
      setCorrections(state => ({ ...state, [editing.anchorId]: result.correction }));
      closeCorrectionModal();
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
        <Text style={s.subtitle}>小橘从日记和聊天里记住的片段</Text>
      </View>} contentStyle={s.content}>
      <View style={s.cards}>
        {anchors.map(anchor => {
          const diary = anchor.diary;
          const chat = anchor.chat;
          const title = anchor.sourceType === 'diary' ? anchor.title : '小橘的陪伴记忆';
          const savedCorrection = corrections[anchor.anchorId] ?? anchor.correction;
          const openSource = () => {
            if (diary) {
              router.push(`/diary/${diary.id}`);
              return;
            }
            if (!chat?.batchId) return;
            router.push({
              pathname: '/profile/chat-history',
              params: { anchorBatchId: chat.batchId },
            });
          };
          return (
            <View key={anchor.id} style={s.card}>
              <Pressable accessibilityRole="button" accessibilityLabel={`查看${title}`} onPress={openSource} style={({ pressed }) => [s.diaryLink, pressed && s.pressed]}>
                {diary
                  ? <Photo id={diary.coverPhotoId} diaryId={diary.id} style={s.image} />
                  : <View style={[s.image, s.chatCover]}><Ionicons name="chatbubble-ellipses-outline" size={34} color={colors.textSecondary} /></View>}
                <View style={s.copy}>
                  <Text numberOfLines={2} style={s.cardTitle}>{new Date(anchor.displayDate).toLocaleDateString()} · {title}</Text>
                  <Text numberOfLines={3} style={s.quote}>“{savedCorrection ?? anchor.excerpt}”</Text>
                  {savedCorrection ? <Text style={s.saved}>已按你的想法更新</Text> : null}
                </View>
              </Pressable>
              <Pressable accessibilityRole="button" accessibilityLabel={`纠正${title}的锚点`} hitSlop={5} onPress={() => { void beginCorrection(anchor); }} style={s.more}>
                <Ionicons name="ellipsis-horizontal" size={20} color="#A58870" />
              </Pressable>
            </View>
          );
        })}
        {!loading && !loadError && anchors.length < total
          ? <Button variant="secondary" disabled={loadingMore} label={loadingMore ? '正在加载…' : '加载更多'} onPress={() => { void loadMore(); }} />
          : null}
        {loading ? <EmptyResult title="正在读取真实记忆锚点" /> : loadError ? <EmptyResult title="记忆锚点暂时无法读取"><Button label="重新加载" onPress={() => { void loadAnchors(); }} /></EmptyResult> : !anchors.length ? <EmptyResult title="还没有这个记忆锚点" /> : null}
      </View>
      {anchors.length > 0 && <Pressable accessibilityRole="button" onPress={() => { void beginCorrection(anchors[0]); }} style={({ pressed }) => [s.correct, pressed && s.pressed]}>
        <Text style={s.correctText}>它可能看错了？点我纠正</Text>
      </Pressable>}
      <Modal
        visible={correctionModalVisible}
        transparent
        animationType="none"
        onRequestClose={closeCorrectionModal}
      >
        <View style={s.modal}>
          <Animated.View
            pointerEvents="none"
            style={[StyleSheet.absoluteFill, s.shade, { opacity: backdropOpacity }]}
          />
          <Pressable
            accessibilityLabel="关闭纠正弹窗"
            onPress={closeCorrectionModal}
            style={StyleSheet.absoluteFill}
          />
          <KeyboardAvoidingView
            behavior={Platform.OS === 'ios' ? 'padding' : undefined}
            pointerEvents="box-none"
            style={s.modalContent}
          >
            <Animated.View style={{ opacity: sheetOpacity, transform: [{ translateY: sheetTranslateY }] }}>
              <View style={s.sheet}>
                <View style={u.row}><Text style={u.heading}>说说你的理解</Text><IconAction name="close-outline" label="取消纠正" onPress={closeCorrectionModal} /></View>
                <Text style={u.body}>这条纠正会保存到你的记忆锚点记录中。</Text>
                <TextInput accessibilityLabel="纠正记忆锚点" multiline value={text} onChangeText={setText} maxLength={240} placeholder="这段回忆对我来说是…" placeholderTextColor={colors.textMuted} style={s.input} />
                <Button disabled={!text.trim() || saving} label={saving ? '正在保存…' : '保存我的想法'} onPress={() => { void saveCorrection(); }} />
              </View>
            </Animated.View>
          </KeyboardAvoidingView>
        </View>
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
  chatCover: { alignItems: 'center', justifyContent: 'center', backgroundColor: colors.surfaceAlt },
  copy: { flex: 1, gap: 16 },
  cardTitle: { fontSize: 15, lineHeight: 23, fontWeight: '500', color: '#34271D', paddingRight: 35 },
  quote: { fontSize: 15, lineHeight: 27, color: '#8A7360' },
  saved: { color: colors.brandStrong, fontSize: 10, marginTop: -10 },
  more: { position: 'absolute', top: 12, right: 8, width: 36, height: 40, alignItems: 'center', justifyContent: 'center' },
  correct: { borderRadius: 25, borderWidth: 1, borderColor: '#F5E2CC', paddingHorizontal: 29, paddingVertical: 12, alignSelf: 'center', marginTop: 34, backgroundColor: '#FFF6EA' },
  correctText: { color: '#957A63', fontSize: 15, lineHeight: 22 },
  modal: { flex: 1 },
  modalContent: { flex: 1, justifyContent: 'center', padding: 22 },
  shade: { backgroundColor: '#0005' },
  sheet: { backgroundColor: '#FFF3E5', borderRadius: 23, padding: 20, gap: 14 },
  input: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: 12, height: 130, padding: 14, fontSize: 14, color: colors.textPrimary, textAlignVertical: 'top' },
});
