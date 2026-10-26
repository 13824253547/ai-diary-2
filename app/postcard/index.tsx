import { Image, StyleSheet, Text, View, type ImageSourcePropType } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Screen } from '../../src/components/layout/screen';
import { TopBar } from '../../src/components/layout/top-bar';
import { Button } from '../../src/components/common/button';
import { EmptyResult, IconAction } from '../../src/components/common/support-ui';
import { CityStamp, getCityStampConfig } from '../../src/components/library/city-stamp';
import { art } from '../../src/theme/assets';
import { colors } from '../../src/theme/tokens';
import { useAppStore } from '../../src/store/use-app-store';
import type { DiaryPhoto } from '../../src/types/diary';

const stickerDecorations = ['stickerHappy', 'mascotCamera', 'stickerCool', 'stickerCry', 'stickerLove'] as const;

function isStickerDecoration(value?: string): value is (typeof stickerDecorations)[number] {
  return stickerDecorations.includes(value as (typeof stickerDecorations)[number]);
}

function getPhotoImageSource(photo: DiaryPhoto): ImageSourcePropType | undefined {
  if (photo.localUri || photo.uri) return { uri: photo.localUri ?? photo.uri };
  return photo.image;
}

export default function PostcardScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ photoId?: string; decoration?: string }>();
  const registeredPhoto = useAppStore(state => state.photos.find(photo => photo.id === params.photoId));
  const materialPhoto = registeredPhoto?.source === 'device' ? registeredPhoto : undefined;
  const image = materialPhoto ? getPhotoImageSource(materialPhoto) : undefined;
  const cityStamp = getCityStampConfig(params.decoration);
  const decoration = isStickerDecoration(params.decoration) ? art[params.decoration] : art.mascot;
  return <Screen header={<TopBar title="明信片" centered onBackPress={() => router.back()} trailing={<IconAction name="images-outline" label="选择素材" onPress={() => router.push('/library')} />} />}>
    {!materialPhoto ? <EmptyResult title="请选择真实照片"><Button label="前往素材库" onPress={() => router.replace('/library')} /></EmptyResult> : <>
      <View style={s.stack}><View style={[s.backCard, { transform: [{ rotate: '-6deg' }] }]} /><View style={[s.backCard, { transform: [{ rotate: '4deg' }] }]} /><View style={s.card}><Image testID="postcard-photo" source={image as ImageSourcePropType} style={s.image} /><View style={s.stamp}><Text style={s.stampText}>{`${materialPhoto.location}\n${materialPhoto.date}`}</Text></View><Text style={s.words}>把这段真实回忆，{`\n`}寄给未来的自己</Text>{cityStamp ? <CityStamp {...cityStamp} testID="postcard-decoration" style={s.mascot} /> : <Image testID="postcard-decoration" source={decoration} resizeMode="contain" style={s.mascot} />}</View></View>
      <Text style={s.note}>已使用你从设备相册选择的照片</Text>
      <Button disabled label="明信片文件导出暂未接入" onPress={() => {}} />
    </>}
  </Screen>;
}
const s = StyleSheet.create({
  stack: { height: 435, alignItems: 'center', justifyContent: 'center', marginTop: 8 }, backCard: { position: 'absolute', width: '85%', height: 388, backgroundColor: '#fff9ed', borderWidth: 1, borderColor: colors.border, borderRadius: 10, top: 24 }, card: { width: '88%', height: 397, backgroundColor: '#fffaf0', borderWidth: 1, borderColor: colors.border, borderRadius: 8, padding: 12, transform: [{ rotate: '2deg' }], shadowColor: '#785636', shadowOpacity: .13, shadowRadius: 5, shadowOffset: { width: 0, height: 3 } }, image: { width: '100%', height: 280, borderRadius: 3, resizeMode: 'cover' }, stamp: { position: 'absolute', top: 31, right: 21, borderWidth: 1, borderColor: '#9f7b5e', width: 69, height: 69, borderRadius: 36, alignItems: 'center', justifyContent: 'center', transform: [{ rotate: '-14deg' }] }, stampText: { color: '#78583f', fontSize: 8, textAlign: 'center', lineHeight: 11 }, words: { fontSize: 20, lineHeight: 30, color: '#38291e', fontFamily: 'Kaiti SC', marginTop: 12, marginLeft: 4 }, mascot: { width: 66, height: 72, position: 'absolute', bottom: 8, right: 9 }, note: { textAlign: 'center', color: colors.textSecondary, fontSize: 13 },
});
