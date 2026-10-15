import { useState } from 'react';
import { Alert, Image, Pressable, StyleSheet, Text, View, type ImageSourcePropType } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Screen } from '../../src/components/layout/screen';
import { BottomSheet } from '../../src/components/common/bottom-sheet';
import { TopBar } from '../../src/components/layout/top-bar';
import { Button } from '../../src/components/common/button';
import { supportStyles as u, IconAction } from '../../src/components/common/support-ui';
import { art } from '../../src/theme/assets';
import { colors } from '../../src/theme/tokens';
import { useAppStore } from '../../src/store/use-app-store';
import type { DiaryPhoto } from '../../src/types/diary';

const postcards = [
  { image: art.santorini, label: '圣托里尼', stamp: 'SANTORINI\n20 AUG\n2026\nGREECE' },
  { image: art.balloons, label: '卡帕多奇亚', stamp: 'CAPPADOCIA\n15 AUG\n2026\nTÜRKIYE' },
  { image: art.mountain, label: '因特拉肯', stamp: 'INTERLAKEN\n10 AUG\n2026\nSWISS' },
  { image: art.train, label: '海边小火车', stamp: 'TAIWAN\n12 SEP\n2026\nSEA TRIP' },
];
const decorations = ['stickerHappy', 'mascotCamera', 'stickerCool', 'stickerCry', 'stickerLove', 'stampKyoto', 'stampKamakura', 'stamp'];

function getPhotoImageSource(photo: DiaryPhoto): ImageSourcePropType | undefined {
  if (photo.localUri || photo.uri) return { uri: photo.localUri ?? photo.uri };
  return photo.image;
}

export default function PostcardScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ photo?: string; photoId?: string; decoration?: string }>();
  const initial = Number(params.photo ?? 0);
  const [index, setIndex] = useState(Number.isInteger(initial) && initial >= 0 && initial < postcards.length ? initial : 0);
  const registeredPhoto = useAppStore(state => state.photos.find(photo => photo.id === params.photoId));
  const [showMaterialPhoto, setShowMaterialPhoto] = useState(Boolean(params.photoId));
  const materialPhoto = showMaterialPhoto ? registeredPhoto : undefined;
  const [generated, setGenerated] = useState(false);
  const [share, setShare] = useState(false);
  const card = postcards[index];
  const image = materialPhoto ? getPhotoImageSource(materialPhoto) : card.image;
  const decoration = params.decoration && decorations.includes(params.decoration) ? art[params.decoration as keyof typeof art] : art.mascot;
  const make = () => { setGenerated(true); };
  const shareDemo = (platform: string) => { setShare(false); Alert.alert(platform, '明信片预览已准备好。'); };
  return <Screen header={<TopBar title="明信片" centered onBackPress={() => router.back()} trailing={<IconAction name="images-outline" label="选择素材" onPress={() => router.push('/library')} />} />}>
    <View style={s.stack}><View style={[s.backCard, { transform: [{ rotate: '-6deg' }] }]} /><View style={[s.backCard, { transform: [{ rotate: '4deg' }] }]} /><View style={s.card}><Image testID="postcard-photo" source={image} style={s.image} /><View style={s.stamp}><Text style={s.stampText}>{materialPhoto ? `${materialPhoto.location}\n${materialPhoto.date}` : card.stamp}</Text></View><Text style={s.words}>把浪漫的瞬间，{`\n`}寄给未来的自己</Text><Image testID="postcard-decoration" source={decoration} resizeMode="contain" style={s.mascot} /></View></View>
    <View style={s.switchRow}>{postcards.map((p, i) => <Pressable key={p.label} accessibilityLabel={`选择${p.label}明信片`} accessibilityState={{ selected: i === index && !materialPhoto }} onPress={() => { setIndex(i); setShowMaterialPhoto(false); setGenerated(false); }} style={[s.thumb, i === index && !materialPhoto && s.thumbSelected]}><Image source={p.image} style={s.thumbImage} /></Pressable>)}</View>
    <Button label={generated ? '明信片已生成 ✓' : '✦ 生成明信片'} onPress={make} />
    <Pressable accessibilityRole="button" onPress={() => { make(); setShare(true); }}><Text style={s.share}>分享给好友</Text></Pressable>
    <BottomSheet visible={share} onClose={() => setShare(false)} title="分享这张明信片" sheetStyle={s.sheet}>
      <View style={s.platforms}>{[{ title: '微信好友', icon: 'chatbubble-ellipses-outline' }, { title: '朋友圈', icon: 'flower-outline' }, { title: '保存图片', icon: 'download-outline' }].map(p => <Pressable accessibilityRole="button" key={p.title} onPress={() => shareDemo(p.title)} style={s.platform}><Ionicons name={p.icon as 'chatbubble-ellipses-outline'} size={25} color={colors.brand} /><Text style={u.body}>{p.title}</Text></Pressable>)}</View>
    </BottomSheet>
  </Screen>;
}
const s = StyleSheet.create({
  stack: { height: 435, alignItems: 'center', justifyContent: 'center', marginTop: 8 }, backCard: { position: 'absolute', width: '85%', height: 388, backgroundColor: '#fff9ed', borderWidth: 1, borderColor: colors.border, borderRadius: 10, top: 24 }, card: { width: '88%', height: 397, backgroundColor: '#fffaf0', borderWidth: 1, borderColor: colors.border, borderRadius: 8, padding: 12, transform: [{ rotate: '2deg' }], shadowColor: '#785636', shadowOpacity: .13, shadowRadius: 5, shadowOffset: { width: 0, height: 3 } }, image: { width: '100%', height: 280, borderRadius: 3, resizeMode: 'cover' }, stamp: { position: 'absolute', top: 31, right: 21, borderWidth: 1, borderColor: '#9f7b5e', width: 69, height: 69, borderRadius: 36, alignItems: 'center', justifyContent: 'center', transform: [{ rotate: '-14deg' }] }, stampText: { color: '#78583f', fontSize: 8, textAlign: 'center', lineHeight: 11 }, words: { fontSize: 20, lineHeight: 30, color: '#38291e', fontFamily: 'Kaiti SC', marginTop: 12, marginLeft: 4 }, mascot: { width: 66, height: 72, position: 'absolute', bottom: 8, right: 9 }, switchRow: { flexDirection: 'row', gap: 10, justifyContent: 'center', marginTop: -3 }, thumb: { width: 42, height: 35, borderRadius: 5, overflow: 'hidden', borderWidth: 2, borderColor: 'transparent' }, thumbSelected: { borderColor: colors.brand }, thumbImage: { width: '100%', height: '100%', resizeMode: 'cover' }, share: { textAlign: 'center', color: colors.textSecondary, fontSize: 14 },
  sheet: { paddingBottom: 42, borderTopLeftRadius: 24, borderTopRightRadius: 24 }, platforms: { flexDirection: 'row', justifyContent: 'space-around' }, platform: { alignItems: 'center', gap: 12, paddingVertical: 15 },
});
