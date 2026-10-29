import { useEffect, useRef, useState } from 'react';
import { Image, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Screen } from '../../src/components/layout/screen';
import { TopBar } from '../../src/components/layout/top-bar';
import { Button } from '../../src/components/common/button';
import { createBackendPetChatRepository } from '../../src/store/adapters/backend-pet-chat-adapter';
import { createBackendAnchorReadModelRepository } from '../../src/store/adapters/backend-anchor-read-model-adapter';
import { ensureDeviceIdentity } from '../../src/services/device-identity';
import type { PetChatMessage } from '../../src/contracts/pet-chat-contract';
import { art } from '../../src/theme/assets';
import { colors } from '../../src/theme/tokens';

export default function ChatHistoryScreen() {
  const router = useRouter();
  const { conversationId, focusMessageId, anchorBatchId } = useLocalSearchParams<{
    conversationId?: string; focusMessageId?: string; anchorBatchId?: string;
  }>();
  const [messages, setMessages] = useState<PetChatMessage[]>([]);
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const [revision, setRevision] = useState(0);
  const scroll = useRef<ScrollView>(null);
  const offsets = useRef<Record<string, number>>({});
  const focused = useRef(false);
  const returnToChat = () => router.dismissTo('/(tabs)/pet');

  useEffect(() => {
    let active = true;
    setMessages([]);
    setStatus('loading');
    offsets.current = {};
    focused.current = false;
    void (async () => {
      const deviceId = await ensureDeviceIdentity();
      let loaded: PetChatMessage[];
      if (anchorBatchId) {
        const repository = createBackendAnchorReadModelRepository();
        const items: PetChatMessage[] = [];
        let sourceVersion: string | undefined;
        let total: number | undefined;
        for (let page = 1; ; page += 1) {
          const result = await repository.getChatHistory({ batchId: anchorBatchId, page, pageSize: 100 });
          if (!active) return;
          if (result.batchId !== anchorBatchId || result.page !== page || result.pageSize !== 100
            || (sourceVersion !== undefined && sourceVersion !== result.sourceVersion)
            || (total !== undefined && total !== result.total)
            || await ensureDeviceIdentity() !== deviceId) throw new Error('history source changed');
          sourceVersion = result.sourceVersion;
          total = result.total;
          items.push(...result.items);
          if (items.length >= total) break;
          if (!result.items.length) throw new Error('incomplete history');
        }
        if (items.length !== total || new Set(items.map(item => item.id)).size !== total) {
          throw new Error('incomplete history');
        }
        loaded = items;
      } else {
        if (!conversationId) throw new Error('missing conversation');
        const result = await createBackendPetChatRepository().getConversation(conversationId);
        if (!active) return;
        if (result.id !== conversationId) throw new Error('history conversation changed');
        loaded = result.messages;
      }
      if (await ensureDeviceIdentity() !== deviceId) throw new Error('history identity changed');
      if (!active) return;
      setMessages(loaded);
      setStatus('ready');
    })().catch(() => {
      if (active) setStatus('error');
    });
    return () => { active = false; };
  }, [conversationId, focusMessageId, anchorBatchId, revision]);

  const focusSource = () => {
    if (focused.current || !focusMessageId || offsets.current[focusMessageId] === undefined) return;
    scroll.current?.scrollTo({ y: Math.max(0, offsets.current[focusMessageId] - 16), animated: false });
    focused.current = true;
  };

  return <Screen scroll={false} header={<TopBar title="聊天记录" onBackPress={() => {
    if (router.canGoBack()) router.back();
    else returnToChat();
  }} />} contentStyle={s.page}>
    {status === 'loading' ? <Text style={s.note}>正在读取聊天记录…</Text> : null}
    {status === 'error' ? <View style={s.error}>
      <Text style={s.note}>聊天记录暂时无法读取。</Text>
      <Button label="重新加载" onPress={() => setRevision(value => value + 1)} />
    </View> : null}
    <ScrollView
      testID="chat-history-scroll"
      ref={scroll}
      showsVerticalScrollIndicator={false}
      contentContainerStyle={s.messages}
      onContentSizeChange={focusSource}
    >
      {(status === 'ready' ? messages : []).map(item => (
        <View testID={`history-message-${item.id}`} key={item.id} onLayout={event => {
          offsets.current[item.id] = event.nativeEvent.layout.y;
          focusSource();
        }} style={[s.row, item.role === 'user' && s.userRow]}>
          {item.role === 'assistant' ? <Image source={art.mascot} style={s.avatar} resizeMode="contain" /> : null}
          <View style={[s.bubble, item.role === 'user' && s.userBubble]}>
            <Text selectable style={[s.text, item.role === 'user' && s.userText]}>{item.text}</Text>
          </View>
        </View>
      ))}
    </ScrollView>
    <Button label="返回当前聊天" onPress={returnToChat} />
  </Screen>;
}

const s = StyleSheet.create({
  page: { gap: 12, paddingBottom: 12 },
  note: { fontSize: 12, lineHeight: 19, color: colors.textSecondary },
  error: { gap: 12 },
  messages: { gap: 17, paddingBottom: 16 },
  row: { flexDirection: 'row', gap: 8, alignItems: 'flex-start' },
  userRow: { justifyContent: 'flex-end' },
  avatar: { width: 39, height: 42 },
  bubble: { maxWidth: '82%', backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: 18, paddingHorizontal: 15, paddingVertical: 11 },
  userBubble: { backgroundColor: colors.brand, borderColor: colors.brand },
  text: { fontSize: 14, lineHeight: 23, color: colors.textPrimary },
  userText: { color: '#fff' },
});
