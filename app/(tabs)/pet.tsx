import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Animated, Easing, Image, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Screen } from '../../src/components/layout/screen';
import { BottomTabs } from '../../src/components/navigation/bottom-tabs';
import { getDiaryStatistics, useAppStore } from '../../src/store/use-app-store';
import { art } from '../../src/theme/assets';
import { colors } from '../../src/theme/tokens';
import { createBackendAnchorReadModelRepository } from '../../src/store/adapters/backend-anchor-read-model-adapter';
import { useAIConsent } from '../../src/hooks/use-ai-consent';

function TypingIndicator() {
  const progress = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const animation = Animated.loop(Animated.sequence([
      Animated.timing(progress, { toValue: 1, duration: 900, easing: Easing.linear, useNativeDriver: true }),
      Animated.timing(progress, { toValue: 0, duration: 0, useNativeDriver: true }),
    ]));
    animation.start();
    return () => animation.stop();
  }, [progress]);

  return <View accessibilityRole="progressbar" accessibilityLabel="小橘正在输入" style={s.typing}>
    {[0, 1, 2].map(index => {
      const start = index * 0.2;
      const opacity = progress.interpolate({
        inputRange: [0, start, start + 0.15, start + 0.45, 1],
        outputRange: [0.3, 0.3, 1, 0.3, 0.3],
        extrapolate: 'clamp',
      });
      const scale = progress.interpolate({
        inputRange: [0, start + 0.15, start + 0.45, 1],
        outputRange: [0.85, 1.2, 0.85, 0.85],
        extrapolate: 'clamp',
      });
      return <Animated.Text key={index} style={[s.typingDot, { opacity, transform: [{ scale }] }]}>•</Animated.Text>;
    })}
  </View>;
}

export default function PetScreen() {
  const router = useRouter();
  const { conversationId, focusMessageId } = useLocalSearchParams<{
    conversationId?: string;
    focusMessageId?: string;
  }>();
  const [message, setMessage] = useState('');
  const latestMessage = useRef(message);
  latestMessage.current = message;
  const { authorize, requestingConsent } = useAIConsent();
  const [anchorCount, setAnchorCount] = useState<number>();
  const skipNextSubmit = useRef(false);
  const scrollRef = useRef<ScrollView>(null);
  const messageOffsets = useRef<Record<string, number>>({});
  const lastFocusedMessageId = useRef<string | undefined>(undefined);
  const [viewingHistory, setViewingHistory] = useState(false);
  const messages = useAppStore(s => s.chatMessages);
  const currentConversationId = useAppStore(s => s.chatConversationId);
  const historyStatus = useAppStore(s => s.chatHistoryStatus);
  const chatBusy = useAppStore(s => s.chatTurnRequests.some(request => request.status === 'pending')) || historyStatus === 'loading' || requestingConsent;
  const sendChat = useAppStore(s => s.sendChat);
  const loadChatConversation = useAppStore(s => s.loadChatConversation);
  const restoreLatestChatConversation = useAppStore(s => s.restoreLatestChatConversation);
  const retryChat = useAppStore(s => s.retryChat);
  const stats = getDiaryStatistics(useAppStore(s => s.diaries));
  useEffect(() => {
    let active = true;
    void createBackendAnchorReadModelRepository().getSummary()
      .then(result => {
        if (active) setAnchorCount(result.total);
      })
      .catch(() => {
        if (active) setAnchorCount(undefined);
      });
    return () => { active = false; };
  }, []);
  useEffect(() => {
    if (conversationId) return;
    void restoreLatestChatConversation();
  }, [conversationId, restoreLatestChatConversation]);
  useEffect(() => {
    if (!conversationId || conversationId === useAppStore.getState().chatConversationId) return;
    router.replace({
      pathname: '/profile/chat-history',
      params: { conversationId, focusMessageId },
    });
  }, [conversationId, focusMessageId, router]);
  useEffect(() => {
    lastFocusedMessageId.current = undefined;
  }, [conversationId, focusMessageId]);
  const send = async () => {
    if (historyStatus === 'error') {
      void (conversationId
        ? loadChatConversation(conversationId)
        : restoreLatestChatConversation());
    } else if (!chatBusy && historyStatus === 'ready' && message.trim()) {
      const text = message.trim();
      const conversation = useAppStore.getState().chatConversationId;
      if (!(await authorize('chat'))) return;
      const latest = useAppStore.getState();
      if (latestMessage.current.trim() !== text || latest.chatConversationId !== conversation
        || latest.chatHistoryStatus !== 'ready' || latest.chatTurnRequests.some(turn => turn.status === 'pending')) return;
      sendChat(text);
      setMessage('');
      setViewingHistory(false);
      router.setParams({ conversationId: undefined, focusMessageId: undefined });
    }
  };
  const handleSubmit = () => {
    if (skipNextSubmit.current) {
      skipNextSubmit.current = false;
      return;
    }
    void send();
  };
  useEffect(() => {
    const frame = requestAnimationFrame(() => {
      if (focusMessageId && lastFocusedMessageId.current !== focusMessageId) {
        const offset = messageOffsets.current[focusMessageId];
        if (offset !== undefined) {
          scrollRef.current?.scrollTo({ y: Math.max(0, offset - 24), animated: true });
          lastFocusedMessageId.current = focusMessageId;
          setViewingHistory(true);
          return;
        }
      }
      if (!focusMessageId && !viewingHistory) {
        scrollRef.current?.scrollToEnd({ animated: true });
      }
    });
    return () => cancelAnimationFrame(frame);
  }, [messages.length, focusMessageId, currentConversationId, viewingHistory]);
  const returnToLatest = () => {
    setViewingHistory(false);
    router.setParams({ conversationId: undefined, focusMessageId: undefined });
    scrollRef.current?.scrollToEnd({ animated: true });
  };
  return <Screen scroll={false} header={<View testID="pet-fixed-header" style={s.header}>
        {viewingHistory ? <Pressable accessibilityRole="button" accessibilityLabel="回到最新消息" onPress={returnToLatest}><Text style={s.latest}>回到最新消息</Text></Pressable> : <View />}
        <Pressable accessibilityRole="button" accessibilityLabel="记忆锚点" onPress={() => router.push('/profile/anchors')} style={s.anchor}><Text style={s.anchorText}>记忆锚点</Text></Pressable>
      </View>} contentStyle={s.page} footer={<BottomTabs current="pet" />}>
      <ScrollView testID="pet-chat-scroll" ref={scrollRef} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false} contentContainerStyle={s.scrollContent} onContentSizeChange={() => {
        if (focusMessageId
          && lastFocusedMessageId.current !== focusMessageId
          && messageOffsets.current[focusMessageId] !== undefined) {
          scrollRef.current?.scrollTo({ y: Math.max(0, messageOffsets.current[focusMessageId] - 24), animated: true });
          lastFocusedMessageId.current = focusMessageId;
          setViewingHistory(true);
        } else if (!focusMessageId && !viewingHistory) {
          scrollRef.current?.scrollToEnd({ animated: true });
        }
      }}>
        <View style={s.hero}><Image source={art.mascot} resizeMode="contain" style={s.mascot} /></View>
        <View style={s.statistics}>
          <Text style={s.remembered}>小橘记住了你的</Text>
          <View style={s.stats}>
            <Text style={s.statNumber}>{stats.diaries}<Text style={s.label}> 篇日记</Text></Text>
            {anchorCount !== undefined
              ? <Text accessibilityLabel={`${anchorCount} 个锚点`} style={s.statNumber}>{anchorCount}<Text style={s.label}> 个锚点</Text></Text>
              : null}
          </View>
        </View>
        {(historyStatus === 'ready' ? messages : []).map(item => {
          const bubbleStyle = [s.bubble, item.role === 'user' && s.userBubble];
          const messageStyle = [s.message, item.role === 'user' && { color: '#fff' }];
          return <View testID={`pet-message-${item.id}`} key={item.id} onLayout={event => {
            messageOffsets.current[item.id] = event.nativeEvent.layout.y;
            if (focusMessageId === item.id && lastFocusedMessageId.current !== item.id) {
              requestAnimationFrame(() => {
                scrollRef.current?.scrollTo({ y: Math.max(0, event.nativeEvent.layout.y - 24), animated: true });
                lastFocusedMessageId.current = item.id;
                setViewingHistory(true);
              });
            }
          }} style={[s.messageRow, item.role === 'user' && s.userRow]}>
            {item.role === 'assistant'
              ? <Image source={art.mascot} style={s.avatar} resizeMode="contain" />
              : <View style={[s.avatar, s.userAvatar]}><Ionicons name="person-outline" size={20} color={colors.textSecondary} /></View>}
            {item.source === 'failed' && item.requestId
              ? <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={`聊天回复失败，点击重试，消息标识 ${item.requestId}`}
                  accessibilityState={{ disabled: chatBusy }}
                  disabled={chatBusy}
                  onPress={() => { void (async () => {
                    if (await authorize('chat')) retryChat(item.requestId!);
                  })(); }}
                  style={[bubbleStyle, chatBusy && { opacity: 0.7 }]}
                ><Text style={messageStyle}>{item.text}</Text></Pressable>
              : <View style={bubbleStyle}>
                  {item.text ? <Text style={messageStyle}>{item.text}</Text> : null}
                  {item.source === 'pending' && <TypingIndicator />}
                </View>}
          </View>;
        })}
      </ScrollView>
      <View style={s.inputWrap}><View style={s.inputRow}><TextInput accessibilityLabel="和小橘聊天" value={message} onChangeText={setMessage} placeholder={historyStatus === 'loading' ? '正在恢复聊天记录…' : historyStatus === 'error' ? '聊天记录加载失败，点箭头重试' : '和小橘聊聊…'} placeholderTextColor={colors.textMuted} style={s.input} multiline maxLength={500} returnKeyType="send" submitBehavior="submit" onSubmitEditing={handleSubmit} onKeyPress={(event: any) => {
        if (event.nativeEvent.key === 'Enter' && event.nativeEvent.shiftKey) {
          skipNextSubmit.current = true;
          setMessage(current => `${current}\n`);
        }
      }} /><Pressable accessibilityRole="button" accessibilityLabel={historyStatus === 'error' ? '重试加载聊天记录' : '发送消息'} accessibilityState={{ disabled: historyStatus !== 'error' && (!message.trim() || chatBusy || historyStatus !== 'ready') }} disabled={historyStatus !== 'error' && (!message.trim() || chatBusy || historyStatus !== 'ready')} onPress={send} style={[s.send, historyStatus !== 'error' && (!message.trim() || chatBusy || historyStatus !== 'ready') && { opacity: 0.45 }]}>{historyStatus === 'loading' ? <ActivityIndicator size="small" color="#fff" /> : <Ionicons name="arrow-up" size={20} color="#fff" />}</Pressable></View></View>
    </Screen>;
}

const s = StyleSheet.create({
  page: { flex: 1, gap: 0, paddingBottom: 0 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', minHeight: 36, paddingBottom: 6 },
  latest: { fontSize: 12, color: colors.textSecondary },
  scrollContent: { gap: 17, paddingBottom: 14 },
  anchor: { alignSelf: 'flex-end', backgroundColor: colors.brand, paddingHorizontal: 12, paddingVertical: 6, borderRadius: 14 }, anchorText: { color: '#fff', fontSize: 11, fontWeight: '600' }, hero: { alignItems: 'center', marginTop: -6 }, mascot: { width: 184, height: 186 },
  statistics: { backgroundColor: colors.surface, borderRadius: 19, paddingVertical: 17, paddingHorizontal: 23, borderWidth: 1, borderColor: colors.border, gap: 5 }, remembered: { fontSize: 12, color: colors.textPrimary }, stats: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }, statNumber: { color: colors.brandStrong, fontSize: 30, fontWeight: '600', fontVariant: ['tabular-nums'] }, label: { color: colors.textPrimary, fontSize: 12, fontWeight: '400' }, dot: { fontSize: 18, color: colors.textMuted },
  messageRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 8 }, userRow: { flexDirection: 'row-reverse' }, avatar: { width: 39, height: 42, borderRadius: 20 }, userAvatar: { alignItems: 'center', justifyContent: 'center', backgroundColor: colors.surfaceAlt }, bubble: { maxWidth: '82%', backgroundColor: colors.surface, borderRadius: 18, borderTopLeftRadius: 7, borderWidth: 1, borderColor: colors.border, paddingHorizontal: 15, paddingVertical: 11 }, userBubble: { backgroundColor: colors.brand, borderColor: colors.brand, borderTopLeftRadius: 18, borderTopRightRadius: 7 }, message: { fontSize: 14, lineHeight: 23, color: colors.textPrimary },
  typing: { flexDirection: 'row', alignItems: 'center', height: 23, gap: 2 }, typingDot: { fontSize: 19, lineHeight: 22, color: colors.brandStrong },
  inputWrap: { paddingTop: 10, paddingBottom: 8, backgroundColor: colors.background }, inputRow: { flexDirection: 'row', alignItems: 'center', backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: 18, padding: 11, gap: 8 }, input: { flex: 1, fontSize: 14, color: colors.textPrimary, paddingHorizontal: 6, paddingVertical: 8, maxHeight: 110 }, send: { backgroundColor: colors.brand, width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
});
