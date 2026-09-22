import { useState } from 'react';
import { Alert, Image, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import { Screen } from '../../src/components/layout/screen';
import { BottomSheet } from '../../src/components/common/bottom-sheet';
import { TopBar } from '../../src/components/layout/top-bar';
import { Button } from '../../src/components/common/button';
import { EmptyResult, IconAction, SearchField, SectionTitle, supportStyles as u } from '../../src/components/common/support-ui';
import { useAppStore } from '../../src/store/use-app-store';
import { mockPhotos } from '../../src/mocks/photos';
import { art } from '../../src/theme/assets';
import { colors } from '../../src/theme/tokens';

type Preview = { title: string; image: number; photoId?: string; artKey?: keyof typeof art };
const stickerItems = [
  { title: '开心的小橘', image: art.stickerHappy, artKey: 'stickerHappy' },
  { title: '一起记录', image: art.mascotCamera, artKey: 'mascotCamera' },
  { title: '酷酷的小橘', image: art.stickerCool, artKey: 'stickerCool' },
  { title: '抱抱小橘', image: art.stickerCry, artKey: 'stickerCry' },
  { title: '喜欢你', image: art.stickerLove, artKey: 'stickerLove' },
] as const;
const inspirationCards = ['今天阳光正好，发生了什么小确幸？', '如果用一个颜色形容今天，你会选什么？', '最近有没有什么让你心动的瞬间？'];

export default function LibraryScreen() {
  const router = useRouter();
  const material = useAppStore(s => s.materialPhotoIds);
  const diaries = useAppStore(s => s.diaries);
  const add = useAppStore(s => s.addMaterialPhoto);
  const [search, setSearch] = useState('');
  const [searching, setSearching] = useState(false);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [sheet, setSheet] = useState<'upload' | 'diary' | 'ai' | 'inspiration' | null>(null);
  const [prompt, setPrompt] = useState('');
  const [answer, setAnswer] = useState('');
  const [generating, setGenerating] = useState(false);
  const photos = material.map(id => mockPhotos.find(p => p.id === id)).filter(p => p !== undefined).filter(p => `${p.title}${p.location}`.includes(search));
  const close = () => { setSheet(null); setPreview(null); };
  const applyPhoto = (diaryId: string) => {
    if (!preview?.photoId) return;
    const store = useAppStore.getState();
    const id = store.beginEdit(diaryId);
    const block = diaries.find(d => d.id === diaryId)?.blocks.find(b => b.type === 'text');
    if (!id || !block || block.type !== 'text') return;
    store.setDraftBlockPhotos(id, block.id, [...(block.photoIds ?? []), preview.photoId]);
    close();
    router.push({ pathname: '/diary/[id]/edit', params: { id: diaryId, draftId: id } });
  };
  return <Screen>
    <TopBar title="素材库 · 灵感" centered onBackPress={() => router.back()} trailing={<IconAction name="search-outline" label="搜索素材" onPress={() => setSearching(!searching)} />} />
    {searching ? <SearchField value={search} onChangeText={setSearch} placeholder="搜索照片与地点" /> : null}
    <SectionTitle title="我的照片素材" action="上传" onPress={() => setSheet('upload')} />
    <View style={s.grid}>{photos.map(p => <Pressable accessibilityRole="button" accessibilityLabel={`预览${p.title}`} key={p.id} onPress={() => setPreview({ title: p.title, image: p.image!, photoId: p.id })} style={s.photo}><Image source={p.image} style={s.image} />{!diaries.some(d => d.photoIds.includes(p.id)) ? <Text style={s.badge}>未生成日记</Text> : null}</Pressable>)}<Pressable accessibilityLabel="添加照片" onPress={() => setSheet('upload')} style={s.add}><Ionicons name="add-outline" size={27} color={colors.textSecondary} /></Pressable></View>
    {photos.length === 0 && search ? <EmptyResult title="没有找到这张照片" /> : null}
    <View style={s.divider} />
    <SectionTitle title="贴纸表情" />
    <View style={s.stickers}>{stickerItems.map(item => <Pressable accessibilityLabel={`预览${item.title}`} key={item.title} onPress={() => setPreview(item)}><Image source={item.image} style={s.stickerImage} resizeMode="contain" /></Pressable>)}</View>
    <SectionTitle title="城市印章" />
    <View style={s.stampRow}>{[{ title: '京都', image: art.stampKyoto, artKey: 'stampKyoto' }, { title: '镰仓', image: art.stampKamakura, artKey: 'stampKamakura' }, { title: '台南', image: art.stamp, artKey: 'stamp' }].map(item => <Pressable key={item.title} accessibilityLabel={`预览${item.title}印章`} onPress={() => setPreview(item as Preview)}><Image source={item.image} style={s.stamp} resizeMode="contain" /></Pressable>)}</View>
    <SectionTitle title="灵感卡" />
    <View style={s.inspirations}>{inspirationCards.map(q => <Pressable key={q} style={s.inspirationCard} onPress={() => { setPrompt(q); setAnswer(''); setSheet('inspiration'); }}><Text style={s.inspirationText}>{q}</Text></Pressable>)}</View>
    <SectionTitle title="AI补图" />
    <LinearGradient colors={['#ff841a', '#ffb054']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={s.inspiration}><View style={s.inspirationCopy}><Text style={s.inspirationTitle}>为没拍照的时刻{`\n`}配一张图</Text><Pressable onPress={() => { setPrompt(''); setSheet('ai'); }} style={s.try}><Text style={s.tryText}>去试试</Text></Pressable></View><Image source={art.night} style={s.inspirationImage} /></LinearGradient>
    <BottomSheet visible={Boolean(preview || sheet)} onClose={close} title={sheet === 'upload' ? '添加照片' : sheet === 'diary' ? '添加到哪篇日记？' : sheet === 'ai' ? '让想象成为一张照片' : sheet === 'inspiration' ? '留住这个小瞬间' : preview?.title} scroll maxHeight="85%" sheetStyle={s.sheet} contentContainerStyle={{ gap: 15 }}>
          {sheet === 'upload' ? <><Text style={u.muted}>选择一张示例照片，体验上传。</Text><View style={s.grid}>{mockPhotos.map(p => <Pressable key={p.id} accessibilityLabel={`添加${p.title}`} onPress={() => { add(p.id); close(); Alert.alert('已添加', `${p.title} 已加入素材库。`); }} style={s.photo}><Image source={p.image} style={s.image} />{material.includes(p.id) ? <View style={s.added}><Ionicons name="checkmark" size={15} color="#fff" /></View> : null}</Pressable>)}</View></> : null}
          {sheet === 'diary' ? diaries.map(d => <Pressable key={d.id} style={s.diaryOption} onPress={() => applyPhoto(d.id)}><Text style={u.body}>{d.title}</Text><Ionicons name="chevron-forward" size={18} color={colors.textMuted} /></Pressable>) : null}
          {sheet === 'ai' ? <><Text style={u.body}>描述你想留下的画面</Text><TextInput accessibilityLabel="画面描述" value={prompt} onChangeText={setPrompt} placeholder="比如：日落时分，老街亮起温柔的灯" multiline style={s.textInput} /><Button disabled={!prompt.trim() || generating} label={generating ? '正在描绘…' : '生成配图'} onPress={() => { setGenerating(true); add('photo-9'); setGenerating(false); setSheet(null); setPreview({ title: '给回忆配一张图', image: art.night, photoId: 'photo-9' }); Alert.alert('配图已准备好', '这是本地示例配图，可用于日记。'); }} /></> : null}
          {sheet === 'inspiration' ? <><Text style={u.body}>{prompt}</Text><TextInput accessibilityLabel="记录灵感" value={answer} onChangeText={setAnswer} multiline placeholder="慢慢写，把心情留在这里…" style={s.textInput} /><Button disabled={!answer.trim()} label="和小橘聊聊" onPress={() => { useAppStore.getState().sendChat(`${prompt}\n${answer}`); close(); router.push('/(tabs)/pet'); }} /></> : null}
          {preview && !sheet ? <><Image source={preview.image} style={s.preview} resizeMode="contain" />{preview.photoId ? <Button label="用于日记" onPress={() => setSheet('diary')} /> : null}<Button label="用于明信片" variant={preview.photoId ? 'secondary' : 'primary'} onPress={() => { const params = preview.photoId ? { photoId: preview.photoId } : { decoration: preview.artKey! }; close(); router.push({ pathname: '/postcard', params }); }} /></> : null}
    </BottomSheet>
  </Screen>;
}

const s = StyleSheet.create({
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 7 }, photo: { width: '31.8%', aspectRatio: 1.05, borderRadius: 8, overflow: 'hidden', backgroundColor: colors.surface }, image: { width: '100%', height: '100%', resizeMode: 'cover' }, badge: { position: 'absolute', right: 4, bottom: 4, borderRadius: 9, backgroundColor: '#fff9ec', fontSize: 9, paddingVertical: 3, paddingHorizontal: 6, color: colors.textSecondary }, add: { width: '23%', height: 43, marginTop: 3, borderWidth: 1, borderColor: colors.textMuted, borderStyle: 'dashed', borderRadius: 7, alignItems: 'center', justifyContent: 'center' },
  divider: { height: 1, backgroundColor: colors.border, marginTop: -4 }, stickers: { flexDirection: 'row', justifyContent: 'space-between', marginTop: -8 }, stickerImage: { width: 47, height: 49 }, stampRow: { flexDirection: 'row', justifyContent: 'space-between', marginTop: -10 }, stamp: { width: 110, height: 71 }, inspirations: { flexDirection: 'row', gap: 8, marginTop: -7 }, inspirationCard: { flex: 1, borderWidth: 1, borderColor: colors.border, backgroundColor: '#fff0dc', borderRadius: 8, padding: 10, minHeight: 70, justifyContent: 'center' }, inspirationText: { color: colors.textPrimary, fontSize: 11, lineHeight: 18 },
  inspiration: { borderRadius: 13, height: 86, overflow: 'hidden', flexDirection: 'row', marginTop: -9 }, inspirationCopy: { flex: 1, padding: 10, gap: 5 }, inspirationTitle: { color: '#fff', fontSize: 13, fontWeight: '600', lineHeight: 20 }, inspirationImage: { width: '43%', height: '100%', resizeMode: 'cover', borderRadius: 12 }, try: { borderRadius: 13, alignSelf: 'flex-start', backgroundColor: '#fff', paddingHorizontal: 13, paddingVertical: 4 }, tryText: { color: colors.brandStrong, fontSize: 11, fontWeight: '600' },
  sheet: { paddingHorizontal: 20, paddingBottom: 38, borderTopLeftRadius: 24, borderTopRightRadius: 24 }, preview: { width: '100%', height: 300, borderRadius: 12 }, added: { position: 'absolute', right: 5, top: 5, width: 21, height: 21, borderRadius: 11, backgroundColor: colors.brand, alignItems: 'center', justifyContent: 'center' }, diaryOption: { flexDirection: 'row', justifyContent: 'space-between', borderBottomWidth: 1, borderColor: colors.border, paddingVertical: 15 }, textInput: { minHeight: 100, borderWidth: 1, borderColor: colors.border, borderRadius: 12, padding: 14, color: colors.textPrimary, fontSize: 14, textAlignVertical: 'top', backgroundColor: colors.surface },
});
