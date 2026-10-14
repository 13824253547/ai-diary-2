import { Ionicons } from '@expo/vector-icons';
import { useEffect, useRef, useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { Screen } from '../../../src/components/layout/screen';
import { TopBar } from '../../../src/components/layout/top-bar';
import { Empty, Sheet } from '../../../src/components/common/design-ui';
import { Button } from '../../../src/components/common/button';
import { Photo } from '../../../src/components/diary/photo';
import { useDraftRoute, leaveDraft } from '../../../src/hooks/use-diary-flow';
import { validateReadableDevicePhotoIds } from '../../../src/services/photo-library';
import { appSelectors, useAppStore } from '../../../src/store/use-app-store';
import { colors } from '../../../src/theme/tokens';

function getRewriteFailureMessage(issue?: string) {
  if (!issue?.startsWith('段落重写失败：')) return undefined;
  if (issue.includes('timed out')) return '重写超时，请稍后重试。';
  if (issue.includes('response is invalid')) return '重写结果异常，请稍后重试。';
  if (issue.includes('cancelled')) return '本次重写已取消。';
  if (issue.includes('socket') || issue.includes('network')) return '重写失败，请检查网络后重试。';
  return '重写失败，请稍后重试。';
}

export default function Edit() {
  const { draft, params, router } = useDraftRoute();
  const [blockId, setBlockId] = useState('');
  const [photoBlock, setPhotoBlock] = useState('');
  const [pick, setPick] = useState<string[]>([]);
  const [photoPickError, setPhotoPickError] = useState<string>();
  const [confirmingPhotoPick, setConfirmingPhotoPick] = useState(false);
  const saveLockedRef = useRef(false);
  const [saveLocked, setSaveLocked] = useState(false);
  const latestIssue = useAppStore(state => state.issueLog[state.issueLog.length - 1]);
  const issueLogCount = useAppStore(state => state.issueLog.length);
  const handledIssueCountRef = useRef(issueLogCount);
  const remoteSaving = useAppStore(state => draft ? state.savingDraftIds.includes(draft.id) : false);
  const saving = remoteSaving || saveLocked;

  useEffect(() => {
    if (draft && params.openPhotos === '1') {
      router.setParams({ openPhotos: '' });
      router.push({ pathname: '/album/select', params: { draftId: draft.id, mode: 'replace' } });
    }
  }, [draft?.id, params.openPhotos, router]);

  useEffect(() => {
    if (!draft || !params.openBlockPhotos) return;
    const targetBlock = draft.diary.blocks.find(block => block.id === params.openBlockPhotos);
    if (!targetBlock || targetBlock.type === 'photo') {
      router.setParams({ openBlockPhotos: '' });
      return;
    }
    setPhotoBlock(targetBlock.id);
    setPick('photoIds' in targetBlock ? targetBlock.photoIds ?? [] : []);
    setPhotoPickError(undefined);
    router.setParams({ openBlockPhotos: '' });
  }, [draft, params.openBlockPhotos, router]);

  useEffect(() => {
    if (!params.draftId && params.id) {
      const id = useAppStore.getState().beginEdit(params.id);
      if (id) router.setParams({ draftId: id });
    }
  }, [params.id, params.draftId, router]);

  useEffect(() => {
    saveLockedRef.current = false;
    setSaveLocked(false);
    handledIssueCountRef.current = issueLogCount;
  }, [draft?.id]);

  useEffect(() => {
    if (!draft) return;
    if (issueLogCount <= handledIssueCountRef.current) return;

    handledIssueCountRef.current = issueLogCount;
    const message = getRewriteFailureMessage(latestIssue);
    if (!message) return;

    Alert.alert('重写失败', message);
  }, [draft, issueLogCount, latestIssue]);

  if (!draft) {
    return (
      <Screen>
        <Empty title="没有找到这篇日记" home />
      </Screen>
    );
  }

  const currentDraft = draft;
  const paragraphs = currentDraft.diary.blocks.filter(block => block.type === 'text' || block.type === 'quote');
  const selectedBlock = blockId ? paragraphs.find(block => block.id === blockId) : paragraphs[0];
  const selected = selectedBlock?.id;
  const rewriteTargetMissing = !!blockId && !selectedBlock;
  const rewriteDisabled = !selected;
  const rewriteHint = !paragraphs.length
    ? '当前没有可重写的文字段落'
    : rewriteTargetMissing
      ? '当前选中的段落已失效，请重新点选需要重写的文字。'
      : '';

  function unlockSave() {
    saveLockedRef.current = false;
    setSaveLocked(false);
  }

  async function save() {
    if (saveLockedRef.current) return;

    saveLockedRef.current = true;
    setSaveLocked(true);

    const result = await useAppStore.getState().submitDraft(currentDraft.id);
    if (!result.ok) {
      if (result.reason === 'needs_regeneration') {
        unlockSave();
        Alert.alert('需要重新整理', result.message, [
          {
            text: '继续生成',
            onPress: () => router.replace({ pathname: '/create/generating', params: { draftId: currentDraft.id } }),
          },
        ]);
        return;
      }

      if (result.reason === 'version_conflict') {
        unlockSave();
        Alert.alert('保存失败', result.message, [
          { text: '继续编辑', style: 'cancel' },
          {
            text: '返回回忆列表',
            onPress: () => {
              router.dismissAll();
              router.replace('/(tabs)/memories');
            },
          },
        ]);
        return;
      }

      if (result.reason === 'source_missing') {
        unlockSave();
        Alert.alert('原日记已不存在', result.message, [
          {
            text: '知道了',
            onPress: () => {
              router.dismissAll();
              router.replace('/(tabs)/memories');
            },
          },
        ]);
        return;
      }

      if (result.reason === 'pending') {
        unlockSave();
        return;
      }

      unlockSave();
      Alert.alert('保存失败', result.message, [
        { text: '继续编辑', style: 'cancel' },
        { text: '重试保存', onPress: () => { void save(); } },
      ]);
      return;
    }

    router.dismissAll();
    router.replace(result.destination === 'detail' ? `/diary/${result.diaryId}` : `/create/complete?diaryId=${result.diaryId}`);
  }

  function rewriteSelectedBlock() {
    if (!selected) return;
    void useAppStore.getState().rewriteDraftBlock(currentDraft.id, selected);
  }

  function closePhotoSheet() {
    setPhotoBlock('');
    setPhotoPickError(undefined);
    setConfirmingPhotoPick(false);
  }

  async function confirmPhotoPick() {
    if (!photoBlock || confirmingPhotoPick) return;

    setPhotoPickError(undefined);
    setConfirmingPhotoPick(true);

    try {
      const validation = await validateReadableDevicePhotoIds(pick);
      if (validation.invalidIds.length) {
        setPhotoPickError(`有${validation.invalidIds.length}张引用图片已不可用，请重新选择。`);
        return;
      }

      useAppStore.getState().setDraftBlockPhotos(currentDraft.id, photoBlock, validation.validIds);
      closePhotoSheet();
    } catch {
      setPhotoPickError('当前无法更新引用图片，请稍后重试。');
    } finally {
      setConfirmingPhotoPick(false);
    }
  }

  return (
    <Screen
      header={(
        <TopBar
          onBackPress={() => leaveDraft(draft.id, () => {
            router.dismissAll();
            router.replace(currentDraft.sourceDiaryId ? `/diary/${currentDraft.sourceDiaryId}` : '/(tabs)/home');
          })}
          trailing={(
            <Pressable onPress={() => void save()} disabled={saving} accessibilityRole="button">
              <Text style={[styles.save, saving && styles.saveDisabled]}>{saving ? '保存中' : '保存'}</Text>
            </Pressable>
          )}
        />
      )}
    >
      <Text style={styles.location}>♧ {currentDraft.diary.location} · {currentDraft.diary.date}</Text>

      <TextInput
        accessibilityLabel="日记标题"
        style={styles.title}
        value={currentDraft.diary.title}
        onChangeText={title => useAppStore.getState().updateDraft(currentDraft.id, { title })}
      />

      <Pressable
        style={styles.photos}
        accessibilityLabel="更换照片"
        onPress={() => router.push({ pathname: '/album/select', params: { draftId: currentDraft.id, mode: 'replace' } })}
      >
        {currentDraft.selectedPhotoIds.slice(0, 3).map(id => (
          <Photo key={id} id={id} style={styles.topPhoto} />
        ))}
      </Pressable>

      {paragraphs.map(block => (
        <View key={block.id} style={{ gap: 9 }}>
          <View style={styles.editRow}>
            <TextInput
              accessibilityLabel={`编辑段落${paragraphs.indexOf(block) + 1}`}
              multiline
              value={'content' in block ? block.content : ''}
              onFocus={() => setBlockId(block.id)}
              onChangeText={text => useAppStore.getState().updateDraftBlock(currentDraft.id, block.id, text)}
              style={[styles.paragraph, block.id === selected && styles.active]}
            />

            <Pressable
              style={styles.reference}
              accessibilityRole="button"
              accessibilityLabel={`为第${paragraphs.indexOf(block) + 1}段选择引用图片`}
              onPress={() => {
                setPhotoBlock(block.id);
                setPick('photoIds' in block ? block.photoIds ?? [] : []);
                setPhotoPickError(undefined);
              }}
            >
              <Ionicons name="add-circle" size={27} color={colors.borderStrong} />
              <Text style={styles.refText}>引用图片</Text>
            </Pressable>
          </View>

          {'photoIds' in block && block.photoIds?.length ? (
            <View style={styles.inlinePhotos}>
              {block.photoIds.map(id => (
                <Photo key={id} id={id} style={{ width: 68, height: 56, borderRadius: 6 }} />
              ))}
            </View>
          ) : null}
        </View>
      ))}

      <View style={styles.actions}>
        <View style={{ flex: 1 }}>
          <Button
            variant="secondary"
            label="更换排版师"
            onPress={() => router.push({ pathname: '/create/character', params: { draftId: currentDraft.id, mode: 'replace' } })}
          />
        </View>

        <View style={{ flex: 1 }}>
          <Button variant="secondary" label="重写本段" disabled={rewriteDisabled} onPress={rewriteSelectedBlock} />
        </View>
      </View>

      {rewriteHint ? <Text style={styles.helper}>{rewriteHint}</Text> : null}

      <Sheet visible={!!photoBlock} title="选择要引用的图片" onClose={closePhotoSheet}>
        <ScrollView horizontal contentContainerStyle={{ gap: 8 }}>
          {appSelectors.photos.map((photo, index) => (
            <Pressable
              key={photo.id}
              accessibilityRole="checkbox"
              accessibilityLabel={`引用图片${index + 1}`}
              accessibilityState={{ checked: pick.includes(photo.id) }}
              onPress={() => setPick(current => current.includes(photo.id) ? current.filter(id => id !== photo.id) : [...current, photo.id])}
              style={{ gap: 7 }}
            >
              <Photo
                id={photo.id}
                style={{
                  width: 73,
                  height: 85,
                  borderRadius: 7,
                  borderWidth: pick.includes(photo.id) ? 2 : 0,
                  borderColor: colors.brandStrong,
                }}
              />
              <Text style={styles.refText}>图 {index + 1} {pick.includes(photo.id) ? '✓' : ''}</Text>
            </Pressable>
          ))}
        </ScrollView>

        {photoPickError ? <Text style={styles.helper}>{photoPickError}</Text> : null}

        <Button
          label={confirmingPhotoPick ? '处理中…' : '引用所选图片'}
          disabled={confirmingPhotoPick}
          onPress={() => { void confirmPhotoPick(); }}
        />
      </Sheet>
    </Screen>
  );
}

const styles = StyleSheet.create({
  save: { fontSize: 15, color: colors.brandStrong },
  saveDisabled: { opacity: 0.5 },
  location: {
    alignSelf: 'flex-start',
    paddingHorizontal: 12,
    paddingVertical: 5,
    backgroundColor: '#F5E6D2',
    borderRadius: 17,
    fontSize: 11,
    color: colors.textSecondary,
  },
  title: { fontSize: 27, fontWeight: '700', color: colors.textPrimary },
  photos: { flexDirection: 'row', gap: 8 },
  topPhoto: { flex: 1, height: 99, borderRadius: 9 },
  editRow: { flexDirection: 'row', gap: 8, alignItems: 'flex-start' },
  paragraph: {
    flex: 1,
    fontSize: 14,
    lineHeight: 24,
    color: colors.textPrimary,
    textAlignVertical: 'top',
    padding: 10,
    minHeight: 120,
    borderRadius: 7,
    borderWidth: 1,
    borderColor: 'transparent',
  },
  active: { borderColor: colors.brandStrong, backgroundColor: colors.paper },
  reference: {
    width: 75,
    height: 112,
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: colors.borderStrong,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 9,
  },
  refText: { fontSize: 11, color: colors.textSecondary, textAlign: 'center' },
  inlinePhotos: { flexDirection: 'row', gap: 7 },
  actions: { flexDirection: 'row', gap: 12 },
  helper: { fontSize: 12, color: colors.textSecondary },
});
