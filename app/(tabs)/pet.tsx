import { useEffect, useRef, useState } from 'react';
import { Animated, Easing, Image, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { Screen } from '../../src/components/layout/screen';
import { BottomTabs } from '../../src/components/navigation/bottom-tabs';
import { getDiaryStatistics, useAppStore } from '../../src/store/use-app-store';
import { art } from '../../src/theme/assets';
import { colors } from '../../src/theme/tokens';

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
  const [message, setMessage] = useState('');
  const skipNextSubmit = useRef(false);
  const scrollRef = useRef<ScrollView>(null);
  const messages = useAppStore(s => s.chatMessages);
  const chatBusy = useAppStore(s => s.chatTurnRequests.some(request => request.status === 'pending'));
  const sendChat = useAppStore(s => s.sendChat);
  const retryChat = useAppStore(s => s.retryChat);
  const stats = getDiaryStatistics(useAppStore(s => s.diaries));
  const send = () => { if (!chatBusy && message.trim()) { sendChat(message.trim()); setMessage(''); } };
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
        <View style={s.hero}><Image source={art.mascot} resizeMode="contain" style={s.mascot} /></View>
        <View style={s.statistics}><Text style={s.remembered}>小橘记住了你的</Text><View style={s.stats}><Text style={s.number}>{stats.diaries}<Text style={s.label}> 篇日记</Text></Text></View></View>
        {messages.map(item => {
          const bubbleStyle = [s.bubble, item.role === 'user' && s.userBubble];
          const messageStyle = [s.message, item.role === 'user' && { color: '#fff' }];
          return <View key={item.id} style={[s.messageRow, item.role === 'user' && s.userRow]}>
            {item.role === 'assistant'
              ? <Image source={art.mascot} style={s.avatar} resizeMode="contain" />
              : <View style={[s.avatar, s.userAvatar]}><Ionicons name="person-outline" size={20} color={colors.textSecondary} /></View>}
            {item.source === 'failed' && item.requestId
              ? <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={`聊天回复失败，点击重试，消息标识 ${item.requestId}`}
                  accessibilityState={{ disabled: chatBusy }}
                  disabled={chatBusy}
                  onPress={() => retryChat(item.requestId!)}
                  style={[bubbleStyle, chatBusy && { opacity: 0.7 }]}
                ><Text style={messageStyle}>{item.text}</Text></Pressable>
              : <View style={bubbleStyle}>
                  {item.text ? <Text style={messageStyle}>{item.text}</Text> : null}
                  {item.source === 'pending' && <TypingIndicator />}
                </View>}
          </View>;
        })}
      </ScrollView>
      <View style={s.inputWrap}><View style={s.inputRow}><TextInput accessibilityLabel="和小橘聊天" value={message} onChangeText={setMessage} placeholder="和小橘聊聊…" placeholderTextColor={colors.textMuted} style={s.input} multiline maxLength={500} returnKeyType="send" submitBehavior="submit" onSubmitEditing={handleSubmit} onKeyPress={(event: any) => {
        if (event.nativeEvent.key === 'Enter' && event.nativeEvent.shiftKey) {
          skipNextSubmit.current = true;
          setMessage(current => `${current}\n`);
        }
      }} /><Pressable accessibilityRole="button" accessibilityLabel="发送消息" accessibilityState={{ disabled: !message.trim() || chatBusy }} disabled={!message.trim() || chatBusy} onPress={send} style={[s.send, (!message.trim() || chatBusy) && { opacity: 0.45 }]}><Ionicons name="arrow-up" size={20} color="#fff" /></Pressable></View></View>
    </Screen>;
}

const s = StyleSheet.create({
  page: { flex: 1, gap: 0, paddingBottom: 0 },
  scrollContent: { gap: 17, paddingBottom: 14 },
  anchor: { alignSelf: 'flex-end', backgroundColor: colors.brand, paddingHorizontal: 12, paddingVertical: 6, borderRadius: 14 }, anchorText: { color: '#fff', fontSize: 11, fontWeight: '600' }, hero: { alignItems: 'center', marginTop: -6 }, mascot: { width: 184, height: 186 },
  statistics: { backgroundColor: colors.surface, borderRadius: 19, paddingVertical: 17, paddingHorizontal: 23, borderWidth: 1, borderColor: colors.border, gap: 5 }, remembered: { fontSize: 12, color: colors.textPrimary }, stats: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }, number: { color: colors.brandStrong, fontSize: 36, fontWeight: '600' }, label: { color: colors.textPrimary, fontSize: 12, fontWeight: '400' }, dot: { fontSize: 18, color: colors.textMuted },
  messageRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 8 }, userRow: { flexDirection: 'row-reverse' }, avatar: { width: 39, height: 42, borderRadius: 20 }, userAvatar: { alignItems: 'center', justifyContent: 'center', backgroundColor: colors.surfaceAlt }, bubble: { maxWidth: '82%', backgroundColor: colors.surface, borderRadius: 18, borderTopLeftRadius: 7, borderWidth: 1, borderColor: colors.border, paddingHorizontal: 15, paddingVertical: 11 }, userBubble: { backgroundColor: colors.brand, borderColor: colors.brand, borderTopLeftRadius: 18, borderTopRightRadius: 7 }, message: { fontSize: 14, lineHeight: 23, color: colors.textPrimary },
  typing: { flexDirection: 'row', alignItems: 'center', height: 23, gap: 2 }, typingDot: { fontSize: 19, lineHeight: 22, color: colors.brandStrong },
  inputWrap: { paddingTop: 10, paddingBottom: 8, backgroundColor: colors.background }, inputRow: { flexDirection: 'row', alignItems: 'center', backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: 18, padding: 11, gap: 8 }, input: { flex: 1, fontSize: 14, color: colors.textPrimary, paddingHorizontal: 6, paddingVertical: 8, maxHeight: 110 }, send: { backgroundColor: colors.brand, width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
});
