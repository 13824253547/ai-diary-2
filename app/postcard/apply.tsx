import { useEffect, useMemo, useRef, useState } from 'react';
import { Image, Pressable, StyleSheet, Text, View, type ImageSourcePropType } from 'react-native';
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
import { createPostcardStampPlacement, getRecentPostcardStampIds, isPostcardStampPlacement } from '../../src/services/postcard-composition';
import { requestAIConsent } from '../../src/services/ai-consent';
import { generatePostcardMessage } from '../../src/services/postcard-message-api';
import { createPostcardMessageHandoff } from '../../src/services/postcard-message-handoff';

type Step = 'photo' | 'sticker' | 'stamp';
const steps = [
  { id: 'photo', title: '照片' },
  { id: 'sticker', title: '贴纸' },
  { id: 'stamp', title: '城市印章' },
] as const;

const stickerItems = [
  { title: '开心的小橘', artKey: 'stickerHappy' },
  { title: '一起记录', artKey: 'stickerCamera' },
  { title: '酷酷的小橘', artKey: 'stickerCool' },
  { title: '抱抱小橘', artKey: 'stickerCry' },
  { title: '比心小橘', artKey: 'stickerLove' },
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
  const params = useLocalSearchParams<PostcardComposition & { step?: Step; selectionToken?: string }>();
  const [step, setStep] = useState<Step>(params.step ?? 'photo');
  const materialPhotoIds = useAppStore(state => state.materialPhotoIds);
  const photoCatalog = useAppStore(state => state.photos);
  const diaries = useAppStore(state => state.diaries);
  const [composition, setComposition] = useState<PostcardComposition>(() => ({
    photoId: params.photoId,
    stickerId: isStickerId(params.stickerId) ? params.stickerId : undefined,
    cityStampId: params.cityStampId,
    stampPlacement: isPostcardStampPlacement(params.stampPlacement) ? params.stampPlacement : createPostcardStampPlacement(),
  }));
  const stampPlacement = composition.stampPlacement!;

  const unlockedCityStampIds = useMemo(() => getVisitedCityStampIds(diaries), [diaries]);
  const recentStampIds = useMemo(() => getRecentPostcardStampIds(diaries), [diaries]);
  const cityStamps = useMemo(() => [
    ...(composition.cityStampId && unlockedCityStampIds.has(composition.cityStampId)
      && !recentStampIds.includes(composition.cityStampId) ? [composition.cityStampId] : []),
    ...recentStampIds,
  ]
    .map(id => getCityStampConfig(id))
    .filter((stamp): stamp is CityStampConfig => stamp !== undefined),
  [recentStampIds, composition.cityStampId, unlockedCityStampIds]);
  const photoById = new Map(photoCatalog.map(photo => [photo.id, photo]));
  const photos = materialPhotoIds
    .map(id => photoById.get(id))
    .filter((photo): photo is DiaryPhoto => photo !== undefined)
    .filter(photo => photo.source === 'device' || photo.source === 'generated');
  const selectedPhoto = photos.find(photo => photo.id === composition.photoId);
  const selectedSticker = stickerItems.find(item => item.artKey === composition.stickerId);
  const selectedCityStamp = cityStamps.find(stamp => stamp.id === composition.cityStampId);
  const postcardLocation = selectedPhoto?.location?.trim();
  const messageLocation = postcardLocation && postcardLocation !== '未知地点' ? postcardLocation : '';
  const previewInputKey = `${selectedPhoto?.id ?? ''}:${selectedPhoto?.localUri ?? selectedPhoto?.uri ?? ''}:${messageLocation}`;
  const previewInputKeyRef = useRef(previewInputKey);
  previewInputKeyRef.current = previewInputKey;
  const previewControllerRef = useRef<AbortController | null>(null);
  const [isGeneratingMessage, setIsGeneratingMessage] = useState(false);
  const [previewError, setPreviewError] = useState('');

  useEffect(() => {
    setComposition(current => ({
      photoId: params.photoId,
      stickerId: isStickerId(params.stickerId) ? params.stickerId : undefined,
      cityStampId: params.cityStampId,
      stampPlacement: current.photoId !== params.photoId || current.cityStampId !== params.cityStampId
        ? createPostcardStampPlacement()
        : isPostcardStampPlacement(params.stampPlacement) ? params.stampPlacement : current.stampPlacement,
    }));
  }, [params.photoId, params.stickerId, params.cityStampId, params.stampPlacement, params.selectionToken]);
  useEffect(() => {
    if (params.step) setStep(params.step);
  }, [params.step, params.cityStampId, params.selectionToken]);
  useEffect(() => {
    const cityStampId = composition.cityStampId;
    if (cityStampId && !unlockedCityStampIds.has(cityStampId)) {
      setComposition(current => current.cityStampId === cityStampId
        ? { ...current, cityStampId: undefined }
        : current);
    }
  }, [composition.cityStampId, unlockedCityStampIds]);

  useEffect(() => {
    setPreviewError('');
    setIsGeneratingMessage(false);
    return () => {
      previewControllerRef.current?.abort();
      previewControllerRef.current = null;
    };
  }, [previewInputKey]);

  const previewPostcard = async (skipStamp = false) => {
    if (!selectedPhoto || previewControllerRef.current) return;
    const inputKey = previewInputKey;
    const controller = new AbortController();
    previewControllerRef.current = controller;
    setIsGeneratingMessage(true);
    setPreviewError('');
    try {
      const allowed = await requestAIConsent('postcard', controller.signal);
      if (!allowed) {
        if (!controller.signal.aborted && previewInputKeyRef.current === inputKey) {
          setPreviewError('请授权明信片寄语后再预览。');
        }
        return;
      }
      const message = await generatePostcardMessage(selectedPhoto.id, messageLocation, controller.signal);
      if (controller.signal.aborted || previewInputKeyRef.current !== inputKey) return;
      const messageToken = createPostcardMessageHandoff(selectedPhoto.id, messageLocation, message);
      router.push({
        pathname: '/postcard',
        params: {
          photoId: selectedPhoto.id,
          ...(selectedSticker ? { stickerId: selectedSticker.artKey } : {}),
          ...(!skipStamp && selectedCityStamp ? { cityStampId: selectedCityStamp.id } : {}),
          stampPlacement,
          messageToken,
        },
      });
    } catch {
      if (!controller.signal.aborted && previewInputKeyRef.current === inputKey) {
        setPreviewError('寄语暂时无法生成，请稍后重试。');
      }
    } finally {
      if (previewControllerRef.current === controller) {
        previewControllerRef.current = null;
        setIsGeneratingMessage(false);
      }
    }
  };
  const nextStep = () => {
    if (step === 'photo') {
      if (selectedPhoto) setStep('sticker');
    } else if (step === 'sticker') setStep('stamp');
    else previewPostcard();
  };
  const skipStep = () => {
    if (step === 'sticker') {
      setComposition(current => ({ ...current, stickerId: undefined }));
      setStep('stamp');
    } else if (step === 'stamp') {
      setComposition(current => ({ ...current, cityStampId: undefined }));
      previewPostcard(true);
    }
  };
  const browseStamps = () => {
    router.push({
      pathname: '/library/cities',
      params: {
        mode: 'postcard',
        photoId: composition.photoId ?? '',
        stickerId: composition.stickerId ?? '',
        cityStampId: composition.cityStampId ?? '',
        stampPlacement,
      },
    });
  };

  return <Screen key={step}
    header={<TopBar title="应用到明信片" centered onBackPress={() => {
        if (isGeneratingMessage) return;
        if (step === 'stamp') setStep('sticker');
        else if (step === 'sticker') setStep('photo');
        else router.back();
      }} />}
    footer={<View style={s.footer}>
      <View style={s.stepRow}>{steps.map((item, index) => <Pressable
        key={item.id}
        accessibilityRole="button"
        accessibilityLabel={`明信片步骤：${item.title}`}
        accessibilityState={{ selected: step === item.id, disabled: isGeneratingMessage || (item.id !== 'photo' && !selectedPhoto) }}
        disabled={isGeneratingMessage || (item.id !== 'photo' && !selectedPhoto)}
        onPress={() => setStep(item.id)}
        style={s.stepItem}
      ><Text style={[s.stepText, step === item.id && s.activeStep]}>{index + 1}. {item.title}</Text></Pressable>)}</View>
      <Text style={s.summary}>照片：{selectedPhoto?.title ?? '请选择'}　贴纸：{selectedSticker?.title ?? '未选择'}　印章：{selectedCityStamp?.cityName ?? '未选择'}</Text>
      <View style={s.actions}>
        {step !== 'photo' ? <Button disabled={isGeneratingMessage} label="跳过" variant="secondary" onPress={skipStep} /> : null}
        <View style={s.nextAction}><Button
          disabled={!selectedPhoto || isGeneratingMessage}
          loading={isGeneratingMessage && step === 'stamp'}
          loadingLabel="正在生成明信片寄语"
          label={isGeneratingMessage && step === 'stamp' ? '正在生成寄语…' : step === 'stamp' ? '预览明信片' : '下一步'}
          onPress={nextStep}
        /></View>
      </View>
      {previewError ? <Text accessibilityLiveRegion="polite" style={s.previewError}>{previewError}</Text> : null}
    </View>}
  >
    {step === 'photo' ? <View style={s.section}>
      <Text style={s.heading}>照片</Text>
      {photos.length ? <View style={s.photoGrid}>
        {photos.map(photo => {
          const selected = composition.photoId === photo.id;
          return <Pressable
            key={photo.id}
            accessibilityRole="button"
            accessibilityLabel={`选择明信片照片：${photo.title}`}
            accessibilityState={{ selected, disabled: isGeneratingMessage }}
            disabled={isGeneratingMessage}
            onPress={() => setComposition(current => ({
              ...current,
              photoId: photo.id,
              stampPlacement: current.photoId !== photo.id ? createPostcardStampPlacement() : current.stampPlacement,
            }))}
            style={[s.photoCell, selected && s.selectedCell]}
          >
            <Image source={getPhotoSource(photo)} resizeMode="cover" style={s.photo} testID={`postcard-option-${photo.id}`} />
            {selected ? <View style={s.check}><Ionicons name="checkmark" size={14} color="#fff" /></View> : null}
          </Pressable>;
        })}
      </View> : <Text style={s.empty}>素材库里还没有可用照片。</Text>}
    </View> : null}

    {step === 'sticker' ? <View style={s.section}>
      <Text style={s.heading}>贴纸表情</Text>
      <View style={s.decorationRow}>
        {stickerItems.map(item => {
          const selected = composition.stickerId === item.artKey;
          return <Pressable
            key={item.artKey}
            accessibilityRole="button"
            accessibilityLabel={`选择贴纸：${item.title}`}
            accessibilityState={{ selected, disabled: isGeneratingMessage }}
            disabled={isGeneratingMessage}
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
    </View> : null}

    {step === 'stamp' ? <View style={s.section}>
      <View style={s.sectionHeader}><Text style={s.heading}>城市印章</Text>
        <Pressable accessibilityRole="button" accessibilityLabel="按地区浏览城市印章" accessibilityState={{ disabled: isGeneratingMessage }} disabled={isGeneratingMessage} onPress={browseStamps}><Text style={s.browse}>按地区浏览 ›</Text></Pressable>
      </View>
      {cityStamps.length ? <View style={s.decorationRow}>
        {cityStamps.map(stamp => {
          const selected = composition.cityStampId === stamp.id;
          return <Pressable
            key={stamp.id}
            accessibilityRole="button"
            accessibilityLabel={`选择城市印章：${stamp.cityName}`}
            accessibilityState={{ selected, disabled: isGeneratingMessage }}
            disabled={isGeneratingMessage}
            onPress={() => setComposition(current => ({
              ...current,
              cityStampId: current.cityStampId === stamp.id ? undefined : stamp.id,
              stampPlacement: current.cityStampId !== stamp.id ? createPostcardStampPlacement() : current.stampPlacement,
            }))}
            style={[s.stampCell, selected && s.selectedCell]}
          >
            <CityStamp {...stamp} width="100%" height="100%" />
            {selected ? <View style={s.check}><Ionicons name="checkmark" size={14} color="#fff" /></View> : null}
          </Pressable>;
        })}
      </View> : <Text style={s.empty}>暂无已解锁的城市印章。</Text>}
      <Text style={s.hint}>再次点选已选印章可移除；印章只显示已解锁项目。</Text>
    </View> : null}
  </Screen>;
}

const s = StyleSheet.create({
  footer: { gap: 10, paddingHorizontal: 16, paddingTop: 10, paddingBottom: 10 },
  stepRow: { flexDirection: 'row', gap: 8 },
  stepItem: { flex: 1, paddingVertical: 6, alignItems: 'center' },
  stepText: { color: colors.textMuted, fontSize: 13 },
  activeStep: { color: colors.brandStrong, fontWeight: '600' },
  actions: { flexDirection: 'row', gap: 10, alignItems: 'center' },
  nextAction: { flex: 1 },
  sectionHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  browse: { color: colors.textSecondary, fontSize: 12, paddingVertical: 6 },
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
  summary: { color: colors.textSecondary, fontSize: 11, lineHeight: 16 },
  previewError: { color: colors.textSecondary, fontSize: 12, lineHeight: 18, textAlign: 'center' },
});
