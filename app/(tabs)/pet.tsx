import { useEffect, useRef, useState } from 'react';
import { Image, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { Screen } from '../../src/components/layout/screen';
import { BottomTabs } from '../../src/components/navigation/bottom-tabs';
import { getDiaryStatistics, useAppStore } from '../../src/store/use-app-store';
import { art } from '../../src/theme/assets';
import { colors } from '../../src/theme/tokens';

export default function PetScreen() {
  const router = useRouter();
  const [message, setMessage] = useState('');
  const skipNextSubmit = useRef(false);
  const scrollRef = useRef<ScrollView>(null);
  const messages = useAppStore(s => s.chatMessages);
  const sendChat = useAppStore(s => s.sendChat);
  const stats = getDiaryStatistics(useAppStore(s => s.diaries));
  const send = () => { if (message.trim()) { sendChat(message.trim()); setMessage(''); } };
  const handleSubmit = () => {
    if (skipNextSubmit.current) {
      skipNextSubmit.current = false;
      return;
    }
    send();
  };
  useEffect(() => {
    const frame = requestAnimationFrame(() => {
      scrollRef.current?.scrollToEnd({ animated: true });
    });
    return () => cancelAnimationFrame(frame);
  }, [messages.length]);
  return <Screen scroll={false} contentStyle={s.page} footer={<BottomTabs current="pet" />}>
      <ScrollView ref={scrollRef} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false} contentContainerStyle={s.scrollContent} onContentSizeChange={() => scrollRef.current?.scrollToEnd({ animated: true })}>
        <Pressable accessibilityRole="button" onPress={() => router.push('/profile/anchors')} style={s.anchor}><Text style={s.anchorText}>记忆锚点</Text></Pressable>
        <View style={s.hero}><Image source={art.mascot} resizeMode="contain" style={s.mascot} /><Text style={s.name}>小橘</Text></View>
        <View style={s.statistics}><Text style={s.remembered}>小橘记住了你的</Text><View style={s.stats}><Text style={s.number}>{stats.diaries}<Text style={s.label}> 篇日记</Text></Text><Text style={s.dot}>·</Text><Text style={s.number}>12<Text style={s.label}> 个记忆锚点</Text></Text></View></View>
        {messages.map(item => <View key={item.id} style={[s.messageRow, item.role === 'user' && s.userRow]}><Image source={item.role === 'assistant' ? art.mascot : art.personSelf} style={s.avatar} resizeMode="contain" /><View style={[s.bubble, item.role === 'user' && s.userBubble]}><Text style={[s.message, item.role === 'user' && { color: '#fff' }]}>{item.text}</Text></View></View>)}
      </ScrollView>
      <View style={s.inputWrap}><View style={s.inputRow}><TextInput accessibilityLabel="和小橘聊天" value={message} onChangeText={setMessage} placeholder="和小橘聊聊…" placeholderTextColor={colors.textMuted} style={s.input} multiline maxLength={500} returnKeyType="send" submitBehavior="submit" onSubmitEditing={handleSubmit} onKeyPress={(event: any) => {
        if (event.nativeEvent.key === 'Enter' && event.nativeEvent.shiftKey) {
          skipNextSubmit.current = true;
          setMessage(current => `${current}\n`);
        }
      }} /><Pressable accessibilityRole="button" accessibilityLabel="发送消息" disabled={!message.trim()} onPress={send} style={[s.send, !message.trim() && { opacity: 0.45 }]}><Ionicons name="arrow-up" size={20} color="#fff" /></Pressable></View></View>
    </Screen>;
}

const s = StyleSheet.create({
  page: { flex: 1, gap: 0, paddingBottom: 0 },
  scrollContent: { gap: 17, paddingBottom: 14 },
  anchor: { alignSelf: 'flex-end', backgroundColor: colors.brand, paddingHorizontal: 12, paddingVertical: 6, borderRadius: 14 }, anchorText: { color: '#fff', fontSize: 11, fontWeight: '600' }, hero: { alignItems: 'center', marginTop: -6 }, mascot: { width: 184, height: 186 }, name: { color: colors.textPrimary, fontSize: 27, fontWeight: '700', marginTop: -2 },
  statistics: { backgroundColor: colors.surface, borderRadius: 19, paddingVertical: 17, paddingHorizontal: 23, borderWidth: 1, borderColor: colors.border, gap: 5 }, remembered: { fontSize: 12, color: colors.textPrimary }, stats: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }, number: { color: colors.brandStrong, fontSize: 36, fontWeight: '600' }, label: { color: colors.textPrimary, fontSize: 12, fontWeight: '400' }, dot: { fontSize: 18, color: colors.textMuted },
  messageRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 8 }, userRow: { flexDirection: 'row-reverse' }, avatar: { width: 39, height: 42, borderRadius: 20 }, bubble: { maxWidth: '82%', backgroundColor: colors.surface, borderRadius: 18, borderTopLeftRadius: 7, borderWidth: 1, borderColor: colors.border, paddingHorizontal: 15, paddingVertical: 11 }, userBubble: { backgroundColor: colors.brand, borderColor: colors.brand, borderTopLeftRadius: 18, borderTopRightRadius: 7 }, message: { fontSize: 14, lineHeight: 23, color: colors.textPrimary },
  inputWrap: { paddingTop: 10, paddingBottom: 8, backgroundColor: colors.background }, inputRow: { flexDirection: 'row', alignItems: 'center', backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: 18, padding: 11, gap: 8 }, input: { flex: 1, fontSize: 14, color: colors.textPrimary, paddingHorizontal: 6, paddingVertical: 8, maxHeight: 110 }, send: { backgroundColor: colors.brand, width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
});
