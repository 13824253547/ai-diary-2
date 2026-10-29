import { useState } from 'react';
import { Alert, ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Button } from '../../src/components/common/button';
import { useAppStore } from '../../src/store/use-app-store';
import { colors } from '../../src/theme/tokens';

export default function More() {
  const router = useRouter();
  const { diaryId } = useLocalSearchParams<{ diaryId?: string }>();
  const diary = useAppStore(state => state.diaries.find(item => item.id === diaryId));
  const deleteDiary = useAppStore(state => state.deleteDiary);
  const [deleting, setDeleting] = useState(false);

  if (!diary) {
    return (
      <View style={s.empty}>
        <Text style={s.text}>这篇日记不存在</Text>
        <Button label="关闭" onPress={() => router.back()} />
      </View>
    );
  }

  const close = () => {
    if (!deleting) router.back();
  };
  const confirmDelete = async () => {
    if (deleting) return;
    setDeleting(true);
    const result = await deleteDiary(diary.id);
    if (!result.ok) {
      setDeleting(false);
      Alert.alert('删除失败', result.message);
      return;
    }
    router.replace('/(tabs)/memories');
  };
  const requestDelete = () => {
    if (deleting) return;
    Alert.alert(
      '删除这篇日记？',
      '日记、发现页公开内容、相关文字记忆与洞察内容、日记照片副本会被清除；未保存的编辑也会丢弃。已达成的成长记录保留，素材库和系统相册原图不受影响。已导出或分享的副本无法撤回。此操作不可恢复。',
      [
        { text: '取消', style: 'cancel' },
        { text: '删除日记', style: 'destructive', onPress: () => { void confirmDelete(); } },
      ],
      { cancelable: true },
    );
  };

  return (
    <View style={s.wrap}>
      <Pressable onPress={close} style={StyleSheet.absoluteFill} />
      <View style={s.sheet}>
        <Text style={s.title}>这篇日记</Text>
        <Button
          variant="secondary"
          label="设置公开范围"
          disabled={deleting}
          onPress={() => router.replace({
            pathname: '/share/privacy',
            params: { diaryId: diary.id, returnTo: 'detail' },
          })}
        />
        <Button
          label="分享这篇日记"
          disabled={deleting}
          onPress={() => router.replace(`/share/result?diaryId=${diary.id}`)}
        />
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={deleting ? '正在删除日记' : '删除日记'}
          accessibilityState={{ disabled: deleting }}
          disabled={deleting}
          onPress={requestDelete}
          style={s.deleteButton}
        >
          {deleting ? <ActivityIndicator color="#B94D48" /> : null}
          <Text style={s.deleteText}>{deleting ? '正在删除…' : '删除日记'}</Text>
        </Pressable>
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  wrap: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(25,20,15,0.4)' },
  sheet: { backgroundColor: colors.background, borderTopLeftRadius: 25, borderTopRightRadius: 25, padding: 22, paddingBottom: 35, gap: 12 },
  title: { fontSize: 19, fontWeight: '700', color: colors.textPrimary, textAlign: 'center' },
  text: { color: colors.textPrimary },
  empty: { flex: 1, justifyContent: 'center', padding: 25, gap: 16 },
  deleteButton: {
    minHeight: 46,
    borderRadius: 26,
    borderWidth: 1,
    borderColor: '#E8B8B3',
    backgroundColor: '#FFF7F5',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  deleteText: { color: '#B94D48', fontSize: 15, fontWeight: '600' },
});
