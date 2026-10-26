import { Ionicons } from '@expo/vector-icons';
import { useEffect, useRef, useState } from 'react';
import { Image, Pressable, StyleSheet, Text, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { BottomSheet } from '../../src/components/common/bottom-sheet';
import { Button } from '../../src/components/common/button';
import { requestPhotoPermission } from '../../src/services/photo-permission';
import { useAppStore } from '../../src/store/use-app-store';
import { art } from '../../src/theme/assets';
import { colors } from '../../src/theme/tokens';

export default function Permission() {
  const router = useRouter();
  const { draftId, characterSelected } = useLocalSearchParams<{ draftId: string; characterSelected?: string }>();
  const [open, setOpen] = useState(true);
  const [requesting, setRequesting] = useState(false);
  const requestLockRef = useRef(false);
  const requestVersionRef = useRef(0);
  const closedRef = useRef(false);

  useEffect(() => () => {
    closedRef.current = true;
    requestVersionRef.current += 1;
  }, []);

  function requestClose() {
    if (!open) return;
    closedRef.current = true;
    requestVersionRef.current += 1;
    setOpen(false);
  }

  function handleAfterClose() {
    if (draftId) useAppStore.getState().discardDraft(draftId);
    if (router.canGoBack()) {
      router.back();
      return;
    }
    router.replace('/(tabs)/home');
  }

  async function handleAllow() {
    if (requestLockRef.current) return;

    const store = useAppStore.getState();
    const activeDraftId = typeof draftId === 'string' && store.drafts[draftId] ? draftId : undefined;
    if (!activeDraftId) {
      requestClose();
      return;
    }

    requestLockRef.current = true;
    setRequesting(true);
    closedRef.current = false;
    const requestVersion = requestVersionRef.current + 1;
    requestVersionRef.current = requestVersion;

    try {
      const result = await requestPhotoPermission();
      if (closedRef.current || requestVersion !== requestVersionRef.current) return;

      useAppStore.getState().setPhotoPermissionStatus(result.status, { advanceToAlbum: result.granted });
      if (!result.granted || !useAppStore.getState().drafts[activeDraftId]) {
        requestClose();
        return;
      }

      router.replace({
        pathname: '/album/select',
        params: {
          draftId: activeDraftId,
          ...(characterSelected === 'true' ? { characterSelected } : {}),
        },
      });
    } catch (error) {
      if (closedRef.current || requestVersion !== requestVersionRef.current) return;
      store.setPhotoPermissionStatus('denied');
      store.logIssue(`相册授权请求失败：${error instanceof Error ? error.message : 'unknown error'}`);
      requestClose();
    } finally {
      if (!closedRef.current && requestVersion === requestVersionRef.current) {
        requestLockRef.current = false;
        setRequesting(false);
      }
    }
  }

  return (
    <View style={s.page}>
      <BottomSheet
        visible={open}
        onClose={requestClose}
        onAfterClose={handleAfterClose}
        showClose={false}
        useModal={false}
        maxHeight="88%"
        sheetStyle={s.sheet}
        contentContainerStyle={s.content}
      >
        <Pressable style={s.close} onPress={requestClose} accessibilityLabel="关闭">
          <Ionicons name="close" color={colors.textMuted} size={25} />
        </Pressable>
        <Image source={art.mascotCamera} resizeMode="contain" style={s.pet} />
        <Text style={s.title}>允许访问你的相册</Text>
        <Text style={s.subtitle}>为了帮你生成精美的回忆日记</Text>
        {([
          { icon: 'images', color: '#579BFF', title: '读取你授权的照片', body: '只在你允许的范围内读取照片，用来整理这次回忆。' },
          { icon: 'lock-closed', color: '#FFA22C', title: '默认私密 · 仅自己可见', body: '授权只影响照片读取，草稿与日记默认仍是私密状态。' },
          { icon: 'sync', color: '#87B953', title: '随时可在设置中撤回', body: '你之后可以在系统设置里调整或关闭相册访问权限。' },
        ] as const).map(item => (
          <View style={s.row} key={item.title}>
            <View style={[s.icon, { backgroundColor: item.color }]}>
              <Ionicons name={item.icon} color="white" size={27} />
            </View>
            <View style={s.rowCopy}>
              <Text style={s.rowTitle}>{item.title}</Text>
              <Text style={s.body}>{item.body}</Text>
            </View>
          </View>
        ))}
        <Button label={requesting ? '请求中…' : '允许访问相册'} disabled={requesting} onPress={() => { void handleAllow(); }} />
        <Pressable accessibilityRole="button" style={s.laterAction} onPress={requestClose}>
          <Text style={s.later}>暂不允许</Text>
        </Pressable>
      </BottomSheet>
    </View>
  );
}

const s = StyleSheet.create({
  page: { flex: 1, backgroundColor: 'transparent' },
  sheet: { borderTopLeftRadius: 30, borderTopRightRadius: 30, paddingHorizontal: 27, paddingTop: 24 },
  content: { gap: 12, paddingBottom: 0 },
  close: { position: 'absolute', top: 0, right: 0, zIndex: 2 },
  pet: { width: 108, height: 110, alignSelf: 'center', marginTop: -77 },
  title: { fontSize: 26, fontWeight: '700', textAlign: 'center', color: colors.textPrimary },
  subtitle: { fontSize: 14, color: colors.textMuted, textAlign: 'center', marginBottom: 6 },
  row: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: 15, padding: 13, flexDirection: 'row', alignItems: 'center', gap: 13 },
  rowCopy: { flex: 1, gap: 5 },
  icon: { width: 46, height: 46, borderRadius: 13, alignItems: 'center', justifyContent: 'center' },
  rowTitle: { fontSize: 16, fontWeight: '600', color: colors.textPrimary },
  body: { fontSize: 11, color: colors.textMuted, lineHeight: 18 },
  laterAction: { paddingTop: 6, paddingBottom: 8 },
  later: { textAlign: 'center', fontSize: 16, color: colors.textMuted, fontWeight: '600' },
});
