import { useEffect, useMemo, useState } from 'react';
import { Image, Pressable, ScrollView, StyleSheet, Text, View, type ImageSourcePropType } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Button } from '../../src/components/common/button';
import { Screen } from '../../src/components/layout/screen';
import { TopBar } from '../../src/components/layout/top-bar';
import { CityStamp } from '../../src/components/library/city-stamp';
import { getCityStampConfig, getVisitedCityStampIds, type CityStampConfig } from '../../src/components/library/city-stamp-catalog';
import { useAppStore } from '../../src/store/use-app-store';
import { art } from '../../src/theme/assets';
import { colors } from '../../src/theme/tokens';
import type { DiaryPhoto } from '../../src/types/diary';
import type { PostcardComposition } from '../../src/types/postcard';

const stickerItems = [
  { title: '开心的小橘', artKey: 'stickerHappy' },
  { title: '一起记录', artKey: 'mascotCamera' },
  { title: '酷酷的小橘', artKey: 'stickerCool' },
  { title: '抱抱小橘', artKey: 'stickerCry' },
  { title: '喜欢你', artKey: 'stickerLove' },
] as const;
type StickerId = (typeof stickerItems)[number]['artKey'];

function isStickerId(value?: string): value is StickerId {
  return stickerItems.some(item => item.artKey === value);
}

function getPhotoSource(photo: DiaryPhoto): ImageSourcePropType | undefined {
  if (photo.localUri || photo.uri) {
    return { uri: photo.localUri ?? photo.uri, ...(!photo.localUri && photo.remoteHeaders ? { headers: photo.remoteHeaders } : {}) };
  }
  return photo.image;
}

export default function PostcardApplyScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<PostcardComposition>();
  const materialPhotoIds = useAppStore(state => state.materialPhotoIds);
  const photoCatalog = useAppStore(state => state.photos);
  const diaries = useAppStore(state => state.diaries);
  const [composition, setComposition] = useState<PostcardComposition>(() => ({
    photoId: params.photoId,
    stickerId: isStickerId(params.stickerId) ? params.stickerId : undefined,
    cityStampId: params.cityStampId,
  }));

  const unlockedCityStampIds = useMemo(() => getVisitedCityStampIds(diaries), [diaries]);
  const cityStamps = useMemo(() => [...unlockedCityStampIds]
    .map(id => getCityStampConfig(id))
    .filter((stamp): stamp is CityStampConfig => stamp !== undefined)
    .slice(0, 3), [unlockedCityStampIds]);
  const photoById = new Map(photoCatalog.map(photo => [photo.id, photo]));
  const photos = materialPhotoIds
    .map(id => photoById.get(id))
    .filter((photo): photo is DiaryPhoto => photo !== undefined)
    .filter(photo => photo.source === 'device' || photo.source === 'generated');
  const selectedPhoto = photos.find(photo => photo.id === composition.photoId);
  const selectedSticker = stickerItems.find(item => item.artKey === composition.stickerId);
  const selectedCityStamp = cityStamps.find(stamp => stamp.id === composition.cityStampId);

  useEffect(() => {
    setComposition({
      photoId: params.photoId,
      stickerId: isStickerId(params.stickerId) ? params.stickerId : undefined,
      cityStampId: params.cityStampId,
    });
  }, [params.photoId, params.stickerId, params.cityStampId]);
  useEffect(() => {
    const cityStampId = composition.cityStampId;
    if (cityStampId && !unlockedCityStampIds.has(cityStampId)) {
      setComposition(current => current.cityStampId === cityStampId
        ? { ...current, cityStampId: undefined }
        : current);
    }
  }, [composition.cityStampId, unlockedCityStampIds]);

  const previewPostcard = () => {
    if (!selectedPhoto) return;
    router.push({
      pathname: '/postcard',
      params: {
        photoId: selectedPhoto.id,
        ...(selectedSticker ? { stickerId: selectedSticker.artKey } : {}),
        ...(selectedCityStamp ? { cityStampId: selectedCityStamp.id } : {}),
      },
    });
  };

  return <Screen
    header={<TopBar title="应用到明信片" centered onBackPress={() => router.back()} />}
    footer={<View style={s.footer}>
      <Text style={s.summary}>照片：{selectedPhoto?.title ?? '请选择'}　贴纸：{selectedSticker?.title ?? '未选择'}　印章：{selectedCityStamp?.cityName ?? '未选择'}</Text>
      {!selectedPhoto ? <Text style={s.hint}>先选择一张照片，再预览明信片。</Text> : null}
      <Button disabled={!selectedPhoto} label="预览明信片" onPress={previewPostcard} />
    </View>}
  >
    <Text style={s.intro}>选择照片后，可再添加一张贴纸和一个已解锁的城市印章。</Text>
    <View style={s.section}>
      <Text style={s.heading}>照片</Text>
      {photos.length ? <View style={s.photoGrid}>
        {photos.map(photo => {
          const selected = composition.photoId === photo.id;
          return <Pressable
            key={photo.id}
            accessibilityRole="button"
            accessibilityLabel={`选择明信片照片：${photo.title}`}
            accessibilityState={{ selected }}
            onPress={() => setComposition(current => ({ ...current, photoId: photo.id }))}
            style={[s.photoCell, selected && s.selectedCell]}
          >
            <Image source={getPhotoSource(photo)} resizeMode="cover" style={s.photo} testID={`postcard-option-${photo.id}`} />
            {selected ? <View style={s.check}><Ionicons name="checkmark" size={14} color="#fff" /></View> : null}
          </Pressable>;
        })}
      </View> : <Text style={s.empty}>素材库里还没有可用照片。</Text>}
    </View>

    <View style={s.section}>
      <Text style={s.heading}>贴纸表情</Text>
      <View style={s.decorationRow}>
        {stickerItems.map(item => {
          const selected = composition.stickerId === item.artKey;
          return <Pressable
            key={item.artKey}
            accessibilityRole="button"
            accessibilityLabel={`选择贴纸：${item.title}`}
            accessibilityState={{ selected }}
            onPress={() => setComposition(current => ({
              ...current,
              stickerId: current.stickerId === item.artKey ? undefined : item.artKey,
            }))}
            style={[s.stickerCell, selected && s.selectedCell]}
          >
            <Image source={art[item.artKey]} resizeMode="contain" style={s.sticker} />
            {selected ? <View style={s.check}><Ionicons name="checkmark" size={14} color="#fff" /></View> : null}
          </Pressable>;
        })}
      </View>
      <Text style={s.hint}>再次点选已选贴纸可移除；选择其它贴纸会替换。</Text>
    </View>

    <View style={s.section}>
      <Text style={s.heading}>城市印章</Text>
      {cityStamps.length ? <View style={s.decorationRow}>
        {cityStamps.map(stamp => {
          const selected = composition.cityStampId === stamp.id;
          return <Pressable
            key={stamp.id}
            accessibilityRole="button"
            accessibilityLabel={`选择城市印章：${stamp.cityName}`}
            accessibilityState={{ selected }}
            onPress={() => setComposition(current => ({
              ...current,
              cityStampId: current.cityStampId === stamp.id ? undefined : stamp.id,
            }))}
            style={[s.stampCell, selected && s.selectedCell]}
          >
            <CityStamp {...stamp} width="100%" height="100%" />
            {selected ? <View style={s.check}><Ionicons name="checkmark" size={14} color="#fff" /></View> : null}
          </Pressable>;
        })}
      </View> : <Text style={s.empty}>暂无已解锁的城市印章。</Text>}
      <Text style={s.hint}>再次点选已选印章可移除；印章只显示已解锁项目。</Text>
    </View>
  </Screen>;
}

const s = StyleSheet.create({
  intro: { color: colors.textSecondary, fontSize: 13, lineHeight: 19 },
  section: { gap: 9 },
  heading: { color: colors.textPrimary, fontSize: 16, fontWeight: '600' },
  photoGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  photoCell: { width: '31.8%', aspectRatio: 0.92, borderRadius: 10, overflow: 'hidden', backgroundColor: colors.surface },
  photo: { width: '100%', height: '100%' },
  decorationRow: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', gap: 8 },
  stickerCell: { width: '18%', height: 66, borderRadius: 9, alignItems: 'center', justifyContent: 'center' },
  sticker: { width: 48, height: 52 },
  stampCell: { width: '31%', height: 80, borderRadius: 9, alignItems: 'center', justifyContent: 'center' },
  selectedCell: { borderWidth: 2, borderColor: colors.brandStrong, backgroundColor: colors.surfaceAlt },
  check: { position: 'absolute', top: 4, right: 4, width: 20, height: 20, borderRadius: 10, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.brandStrong },
  empty: { color: colors.textMuted, fontSize: 12, lineHeight: 18 },
  hint: { color: colors.textMuted, fontSize: 11, lineHeight: 16 },
  footer: { paddingHorizontal: 16, paddingTop: 10, paddingBottom: 8, gap: 8 },
  summary: { color: colors.textSecondary, fontSize: 11, lineHeight: 16 },
});
