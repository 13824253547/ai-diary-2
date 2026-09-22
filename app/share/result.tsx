import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import { Image, Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Button } from '../../src/components/common/button';
import { Empty, Sheet } from '../../src/components/common/design-ui';
import { Photo } from '../../src/components/diary/photo';
import { Screen } from '../../src/components/layout/screen';
import { TopBar } from '../../src/components/layout/top-bar';
import { projectDiaryForSharing, useAppStore } from '../../src/store/use-app-store';
import type { DiaryItem, ShareMode } from '../../src/types/diary';
import { art } from '../../src/theme/assets';
import { colors } from '../../src/theme/tokens';

// Deliberately non-scannable decorative matrix: no network destination is encoded.
function DemoQr({ large = false }: { large?: boolean }) {
  return <View accessibilityLabel="演示二维码，无真实链接" style={[styles.qr, large && { width: 126, height: 126, padding: 8 }]}>{Array.from({ length: 49 }, (_, i) => <View key={i} style={{ width: '14.285%', height: '14.285%', backgroundColor: ((i * 13 + Math.floor(i / 7) * 3) % 5 < 3) ? '#382E24' : '#FFFFFF' }} />)}</View>;
}
function SharePoster({ diary, expanded = false, onQr }: { diary: DiaryItem; expanded?: boolean; onQr?: () => void }) {
  const photos = diary.posterPhotoIds?.length ? diary.posterPhotoIds : diary.photoIds.slice(0, 2);
  return <View style={[styles.poster, expanded && styles.expandedPoster]}>
    <View style={styles.posterHeading}><Text style={[styles.posterTitle, expanded && { fontSize: 27 }]}>{diary.title}</Text><Image source={art.stamp} style={styles.stamp} resizeMode="contain" /></View>
    <View style={styles.posterPhotos}>{photos.slice(0, 2).map((photoId, index) => <Photo key={photoId} id={photoId} anonymous={diary.anonymous} style={[styles.posterPhoto, { aspectRatio: index === 0 ? 1.55 : 1.65 }]} />)}{photos.length === 0 ? <Text style={styles.quoteOnly}>{diary.summary}</Text> : null}</View>
    <View style={styles.posterFooter}><View style={styles.posterCopy}><Text numberOfLines={2} style={styles.posterCaption}>{diary.summary || '生活很美好 值得被记录 ✨'}</Text><Text style={styles.posterDate}>{diary.date} · {diary.location}</Text>{diary.anonymous ? <Text style={styles.anonymous}>匿名日记 · 人物已遮挡</Text> : null}</View><Pressable accessibilityRole="button" accessibilityLabel="查看演示二维码" onPress={onQr}><DemoQr /></Pressable></View>
    <Image source={art.mascot} style={styles.mascot} resizeMode="contain" />
  </View>;
}
const platforms: { id: ShareMode; label: string; color: string; mark: string }[] = [
  { id: 'moments', label: '微信朋友圈', color: '#20BF35', mark: 'wechat' },
  { id: 'xiaohongshu', label: '小红书', color: '#E75C59', mark: '小红书' },
  { id: 'x', label: 'X', color: '#181817', mark: '𝕏' },
];
export default function ShareResultScreen() {
  const router = useRouter();
  const { diaryId } = useLocalSearchParams<{ diaryId?: string }>();
  const diary = useAppStore(state => state.diaries.find(item => item.id === diaryId));
  const projected = useMemo(() => diary ? projectDiaryForSharing(diary) : undefined, [diary]);
  const [preview, setPreview] = useState(false);
  const [qrVisible, setQrVisible] = useState(false);
  const [feedback, setFeedback] = useState<{ title: string; detail: string; needsPrivacy?: boolean }>();
  if (!diary || !projected) return <Screen><Empty title="没有找到这篇日记" detail="请从已保存的日记进入分享。" home /></Screen>;
  const perform = (mode: ShareMode, title: string) => {
    if (!useAppStore.getState().recordShareDemo(diary.id, mode)) {
      setFeedback({ title: '这篇日记还是私密的', detail: '你可以直接保存长图或导出 PDF。分享给朋友前，请先选择公开范围。', needsPrivacy: true });
      return;
    }
    setFeedback({ title: `${title}演示已完成`, detail: `${mode === 'save' || mode === 'pdf' ? '已生成当前内容的预览，未写入系统相册或文件。' : '已准备当前海报，未向第三方平台发送。'}${projected.anonymous ? '人物和姓名已按匿名设置遮挡。' : ''}` });
  };
  return <Screen contentStyle={styles.screen}>
    <TopBar title="分享日记" onBackPress={() => router.back()} trailing={<Pressable accessibilityRole="button" onPress={() => setPreview(true)}><Text style={styles.previewAction}>预览</Text></Pressable>} />
    <View style={styles.posterArea}><SharePoster diary={projected} onQr={() => setQrVisible(true)} /></View>
    <Text style={styles.caption}>{diary.privacy === 'private' ? '私密日记仅供本地预览与保存' : '分享图已按你的公开范围设置生成'}</Text>
    <View style={styles.platforms}>{platforms.map(platform => <Pressable key={platform.id} accessibilityRole="button" accessibilityLabel={`分享到${platform.label}`} onPress={() => perform(platform.id, platform.label)} style={styles.platform}><View style={[styles.platformMark, { backgroundColor: platform.color }]}>{platform.mark === 'wechat' ? <Ionicons name="chatbubbles" size={17} color="#FFF" /> : <Text style={[styles.markText, platform.id === 'x' && { fontSize: 18, fontWeight: '400' }]}>{platform.mark}</Text>}</View><Text style={styles.platformLabel}>{platform.label}</Text></Pressable>)}</View>
    <View style={styles.actions}><View style={styles.action}><Button label="保存长图" variant="secondary" onPress={() => perform('save', '保存长图')} /></View><View style={styles.action}><Button label="导出PDF" onPress={() => perform('pdf', '导出 PDF')} /></View></View>
    <Modal visible={preview} transparent animationType="fade" onRequestClose={() => setPreview(false)}><View style={styles.previewBackdrop}><View style={styles.previewModal}><View style={styles.previewTop}><Text style={styles.previewTitle}>分享预览</Text><Pressable accessibilityRole="button" accessibilityLabel="关闭预览" onPress={() => setPreview(false)} hitSlop={12}><Ionicons name="close" size={24} color={colors.textPrimary} /></Pressable></View><ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.previewContent}><SharePoster diary={projected} expanded onQr={() => { setPreview(false); setQrVisible(true); }} /><View style={styles.fullContent}>{projected.blocks.map(block => block.type === 'photo' ? <View key={block.id} style={styles.inlineBlock}><Photo id={block.photoId} anonymous={projected.anonymous} style={styles.inlinePhoto} /><Text style={styles.inlineCaption}>{block.caption}</Text></View> : <View key={block.id} style={styles.inlineBlock}>{block.type === 'text' && block.title ? <Text style={styles.blockTitle}>{block.title}</Text> : null}<Text style={block.type === 'quote' ? styles.quote : styles.body}>{block.content}</Text>{block.photoIds?.map(photoId => <Photo key={photoId} id={photoId} anonymous={projected.anonymous} style={styles.inlinePhoto} />)}</View>)}</View></ScrollView></View></View></Modal>
    <Sheet visible={!!feedback} title={feedback?.title ?? ''} onClose={() => setFeedback(undefined)}><Text style={styles.feedbackText}>{feedback?.detail}</Text>{feedback?.needsPrivacy ? <Button label="调整公开范围" onPress={() => { setFeedback(undefined); router.push({ pathname: '/share/privacy', params: { diaryId: diary.id } }); }} /> : <Button label="查看预览" onPress={() => { setFeedback(undefined); setPreview(true); }} />}</Sheet>
    <Sheet visible={qrVisible} title="分享二维码" onClose={() => setQrVisible(false)}><View style={styles.qrPanel}><DemoQr large /><Text style={styles.feedbackText}>这是演示二维码，没有真实链接。分享内容以当前海报预览为准。</Text></View></Sheet>
  </Screen>;
}
const styles = StyleSheet.create({
  screen: { gap: 12 }, previewAction: { color: colors.brandStrong, fontSize: 15, fontWeight: '600' }, posterArea: { alignItems: 'center', marginTop: 2, marginHorizontal: 23 }, poster: { width: '100%', backgroundColor: '#FFFBF4', borderRadius: 12, borderWidth: 1, borderColor: '#E8CFB6', padding: 13, paddingTop: 15, shadowColor: '#82511D', shadowOpacity: 0.16, shadowRadius: 5, shadowOffset: { width: 0, height: 3 }, overflow: 'visible' }, expandedPoster: { shadowOpacity: 0, borderRadius: 10 }, posterHeading: { flexDirection: 'row', alignItems: 'center', minHeight: 47, marginBottom: 8 }, posterTitle: { fontFamily: 'Songti SC', fontWeight: '800', fontSize: 24, color: '#422B17', flex: 1, letterSpacing: 0.4 }, stamp: { width: 79, height: 50, marginRight: -5 }, posterPhotos: { gap: 6 }, posterPhoto: { width: '100%', borderRadius: 8 }, quoteOnly: { fontFamily: 'Songti SC', fontSize: 20, lineHeight: 32, paddingVertical: 34, color: colors.textPrimary }, posterFooter: { minHeight: 39, marginTop: 14, flexDirection: 'row', gap: 7, alignItems: 'flex-end', paddingRight: 66 }, posterCopy: { flex: 1, gap: 3 }, posterCaption: { fontSize: 9, lineHeight: 13, color: '#948575' }, posterDate: { fontSize: 9, color: '#948575', lineHeight: 13 }, anonymous: { fontSize: 8, color: colors.brandStrong }, mascot: { position: 'absolute', width: 83, height: 93, right: -8, bottom: 10 }, qr: { width: 31, height: 31, borderWidth: 1, borderColor: '#EDE8DD', borderRadius: 3, padding: 2, backgroundColor: '#FFF', flexDirection: 'row', flexWrap: 'wrap' }, caption: { textAlign: 'center', fontSize: 10, color: colors.textMuted, marginTop: 2 },
  platforms: { flexDirection: 'row', gap: 10 }, platform: { flex: 1, minHeight: 36, flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 5, backgroundColor: '#FFFCF9', borderRadius: 22 }, platformMark: { width: 21, height: 21, borderRadius: 11, alignItems: 'center', justifyContent: 'center' }, markText: { fontSize: 5.5, color: '#FFF', fontWeight: '800' }, platformLabel: { fontSize: 11, color: '#22221E' }, actions: { flexDirection: 'row', gap: 20, marginTop: 2 }, action: { flex: 1 },
  previewBackdrop: { flex: 1, backgroundColor: 'rgba(40,28,16,0.52)', justifyContent: 'center', paddingHorizontal: 17, paddingVertical: 55 }, previewModal: { maxHeight: '100%', borderRadius: 18, backgroundColor: colors.background, padding: 15 }, previewTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingBottom: 14 }, previewTitle: { fontSize: 17, fontWeight: '600', color: colors.textPrimary }, previewContent: { padding: 4, gap: 22, paddingBottom: 25 }, fullContent: { paddingHorizontal: 9, gap: 17 }, inlineBlock: { gap: 9 }, blockTitle: { fontFamily: 'Songti SC', fontSize: 18, color: colors.textPrimary }, body: { fontSize: 14, lineHeight: 25, color: colors.textSecondary }, quote: { fontFamily: 'Kaiti SC', fontSize: 21, color: colors.brandStrong, lineHeight: 30, textAlign: 'center' }, inlinePhoto: { width: '100%', height: 160, borderRadius: 7 }, inlineCaption: { fontSize: 11, color: colors.textMuted }, feedbackText: { fontSize: 14, lineHeight: 24, color: colors.textSecondary }, qrPanel: { alignItems: 'center', gap: 18, paddingVertical: 12 },
});
