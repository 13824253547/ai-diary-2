import { useEffect, useRef, useState } from 'react';
import { Image, StyleSheet, Text, View, type ImageSourcePropType } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Screen } from '../../src/components/layout/screen';
import { TopBar } from '../../src/components/layout/top-bar';
import { Button } from '../../src/components/common/button';
import { EmptyResult, IconAction } from '../../src/components/common/support-ui';
import { CityStamp, getCityStampConfig } from '../../src/components/library/city-stamp';
import { getVisitedCityStampIds } from '../../src/components/library/city-stamp-catalog';
import { art } from '../../src/theme/assets';
import { colors } from '../../src/theme/tokens';
import { useAppStore } from '../../src/store/use-app-store';
import { capturePostcard, discardPostcard, savePostcard, sharePostcard } from '../../src/services/postcard-export';
import type { DiaryPhoto } from '../../src/types/diary';
import type { PostcardComposition } from '../../src/types/postcard';
import { createPostcardStampPlacement, getPostcardStampPosition, isPostcardStampPlacement } from '../../src/services/postcard-composition';
import { AIContentLabel, isGeneratedPhoto } from '../../src/components/common/ai-content-label';
import { requestAIConsent } from '../../src/services/ai-consent';
import { generatePostcardMessage } from '../../src/services/postcard-message-api';
import { consumePostcardMessageHandoff } from '../../src/services/postcard-message-handoff';

const stickerDecorations = ['stickerHappy', 'stickerCamera', 'mascotCamera', 'stickerCool', 'stickerCry', 'stickerLove'] as const;

function isStickerDecoration(value?: string): value is (typeof stickerDecorations)[number] {
  return stickerDecorations.includes(value as (typeof stickerDecorations)[number]);
}

function getPhotoImageSource(photo: DiaryPhoto): ImageSourcePropType | undefined {
  if (photo.localUri || photo.uri) {
    return { uri: photo.localUri ?? photo.uri, ...(!photo.localUri && photo.remoteHeaders ? { headers: photo.remoteHeaders } : {}) };
  }
  return photo.image;
}

export default function PostcardScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<PostcardComposition & { decoration?: string; messageToken?: string | string[] }>();
  const [defaultPlacement] = useState(createPostcardStampPlacement);
  const stampPlacement = isPostcardStampPlacement(params.stampPlacement) ? params.stampPlacement : defaultPlacement;
  const [photoWidth, setPhotoWidth] = useState(0);
  const registeredPhoto = useAppStore(state => state.photos.find(photo => photo.id === params.photoId));
  const diaries = useAppStore(state => state.diaries);
  const unlockedCityStampIds = getVisitedCityStampIds(diaries);
  const materialPhoto = registeredPhoto?.source === 'device' || registeredPhoto?.source === 'generated'
    ? registeredPhoto : undefined;
  const image = materialPhoto ? getPhotoImageSource(materialPhoto) : undefined;
  const aiGenerated = isGeneratedPhoto(materialPhoto);
  const legacyStickerId = isStickerDecoration(params.decoration) ? params.decoration : undefined;
  const legacyCityStampId = params.decoration && !legacyStickerId && getCityStampConfig(params.decoration)
    ? params.decoration : undefined;
  const stickerId = isStickerDecoration(params.stickerId) ? params.stickerId : legacyStickerId;
  const cityStampId = params.cityStampId
    ? unlockedCityStampIds.has(params.cityStampId) ? params.cityStampId : undefined
    : legacyCityStampId;
  const cityStamp = cityStampId ? getCityStampConfig(cityStampId) : undefined;
  const legacyDecorationTestId = params.decoration && !params.stickerId && !params.cityStampId
    ? 'postcard-decoration' : undefined;
  const cardRef = useRef<View>(null);
  const busyRef = useRef(false);
  const [busy, setBusy] = useState(false);
  const [imageReady, setImageReady] = useState(false);
  const [message, setMessage] = useState('');
  const [generatedMessage, setGeneratedMessage] = useState<{ key: string; value: string }>();
  const [messageGeneration, setMessageGeneration] = useState<{
    key: string;
    status: 'loading' | 'ready' | 'consent' | 'failed';
  }>();
  const handledHandoffsRef = useRef(new Map<string, string>());
  const location = materialPhoto?.location?.trim();
  const stampText = location && location !== '未知地点' ? location : '';
  const photoKey = `${materialPhoto?.id ?? ''}:${materialPhoto?.localUri ?? materialPhoto?.uri ?? ''}`;
  const messageInputKey = `${photoKey}:${stampText}`;
  const inputKey = `${photoKey}:${stampText}:${params.stickerId ?? stickerId ?? ''}:${params.cityStampId ?? cityStamp?.id ?? ''}:${params.decoration ?? ''}:${stampPlacement}:${photoWidth}:${aiGenerated}`;
  const inputKeyRef = useRef(inputKey);
  inputKeyRef.current = inputKey;
  useEffect(() => {
    setImageReady(false);
  }, [photoKey]);
  useEffect(() => {
    setMessage('');
  }, [inputKey]);
  useEffect(() => {
    if (!materialPhoto) return;
    const handoffToken = typeof params.messageToken === 'string' ? params.messageToken : undefined;
    if (handoffToken && handledHandoffsRef.current.get(handoffToken) === messageInputKey) return;
    if (handoffToken) {
      const handoffMessage = consumePostcardMessageHandoff(handoffToken, materialPhoto.id, stampText);
      if (handoffMessage) {
        handledHandoffsRef.current.set(handoffToken, messageInputKey);
        setGeneratedMessage({ key: messageInputKey, value: handoffMessage });
        setMessageGeneration({ key: messageInputKey, status: 'ready' });
        setMessage('');
        return;
      }
    }
    const controller = new AbortController();
    let active = true;
    const currentKey = messageInputKey;
    setMessageGeneration({ key: currentKey, status: 'loading' });
    void (async () => {
      const allowed = await requestAIConsent('postcard', controller.signal);
      if (!active || controller.signal.aborted) return;
      if (!allowed) {
        setMessageGeneration({ key: currentKey, status: 'consent' });
        setMessage('同意明信片寄语授权后，才能分享或保存。');
        return;
      }
      try {
        const value = await generatePostcardMessage(materialPhoto.id, stampText, controller.signal);
        if (!active || controller.signal.aborted) return;
        setGeneratedMessage({ key: currentKey, value });
        setMessageGeneration({ key: currentKey, status: 'ready' });
        setMessage('');
      } catch {
        if (!active || controller.signal.aborted) return;
        setMessageGeneration({ key: currentKey, status: 'failed' });
        setMessage('寄语暂时无法生成，请重新进入明信片后重试。');
      }
    })();
    return () => {
      active = false;
      controller.abort();
    };
  }, [materialPhoto?.id, messageInputKey, params.messageToken, stampText]);
  useEffect(() => () => {
    inputKeyRef.current = '';
  }, []);
  const messageStatus = messageGeneration?.key === messageInputKey ? messageGeneration.status : 'loading';
  const postcardMessage = generatedMessage?.key === messageInputKey ? generatedMessage.value : '';
  const hasPostcardMessage = messageStatus === 'ready' && Boolean(postcardMessage);

  const exportCard = async (destination: 'share' | 'save') => {
    if (busyRef.current || !materialPhoto || !imageReady || !hasPostcardMessage || (cityStamp && photoWidth <= 0)) return;
    busyRef.current = true;
    setBusy(true);
    setMessage('');
    let uri: string | undefined;
    try {
      uri = aiGenerated
        ? await capturePostcard(cardRef, `postcard${Date.now().toString(36)}${Math.random().toString(36).slice(2)}`)
        : await capturePostcard(cardRef);
      if (inputKeyRef.current !== inputKey) return;
      if (destination === 'share') {
        const result = await sharePostcard(uri);
        if (inputKeyRef.current === inputKey) {
          setMessage(result === 'opened' ? '' : '此设备暂不支持系统分享。');
        }
      } else {
        const result = await savePostcard(uri);
        if (inputKeyRef.current === inputKey) {
          setMessage(result === 'saved' ? '已保存到系统相册。' : '请允许保存图片到系统相册后重试。');
        }
      }
    } catch {
      if (inputKeyRef.current === inputKey) setMessage('明信片暂时无法导出，请确认照片可读取后重试。');
    } finally {
      await discardPostcard(uri);
      busyRef.current = false;
      if (inputKeyRef.current) setBusy(false);
    }
  };
  const stampPosition = getPostcardStampPosition(stampPlacement, photoWidth || 280, Boolean(stampText));
  const applyParams: PostcardComposition = {
    ...(materialPhoto ? { photoId: materialPhoto.id } : {}),
    ...(stickerId ? { stickerId } : {}),
    ...(cityStamp ? { cityStampId: cityStamp.id } : {}),
    stampPlacement,
  };
  return <Screen header={<TopBar title="明信片" centered onBackPress={() => router.back()} trailing={<IconAction name="images-outline" label="编辑素材" onPress={() => router.push({ pathname: '/postcard/apply', params: applyParams })} />} />}>
    {!materialPhoto ? <EmptyResult title="请选择真实照片"><Button label="应用明信片素材" onPress={() => router.replace({ pathname: '/postcard/apply', params: applyParams })} /></EmptyResult> : <>
      <View style={s.stack}><View style={[s.backCard, { transform: [{ rotate: '-6deg' }] }]} /><View style={[s.backCard, { transform: [{ rotate: '4deg' }] }]} /><View ref={cardRef} collapsable={false} style={s.card}><Image key={photoKey} testID="postcard-photo" source={image as ImageSourcePropType} style={s.image} onLayout={event => setPhotoWidth(event.nativeEvent.layout.width)} onLoad={() => setImageReady(true)} onError={() => { setImageReady(false); setMessage('照片暂时无法读取，请重新选择素材。'); }} />{stampText ? <View style={s.stamp}><Text style={s.stampText}>{stampText}</Text></View> : null}{cityStamp ? <CityStamp {...cityStamp} width={68} height={68} testID={legacyDecorationTestId ?? 'postcard-city-stamp'} style={[s.cityStampOverlay, stampPosition]} /> : null}<View testID="postcard-message-container" style={[s.wordsContainer, stickerId ? s.wordsWithSticker : s.wordsWithoutSticker]}><Text testID="postcard-message" style={s.words}>{hasPostcardMessage ? postcardMessage : messageStatus === 'loading' ? '正在生成寄语…' : messageStatus === 'consent' ? '请先授权生成寄语' : messageStatus === 'failed' ? '寄语生成失败' : ''}</Text></View>{aiGenerated ? <AIContentLabel text="图片由AI生成" testID="postcard-ai-label" style={{position:'absolute',bottom:8,left:16}} /> : null}{stickerId ? <Image testID={legacyDecorationTestId ?? 'postcard-sticker'} source={art[stickerId]} resizeMode="contain" style={s.mascot} /> : null}</View></View>
      <Text style={s.note}>{aiGenerated ? '已使用AI生成配图，导出图片保留标识' : '已使用当前选择的真实照片'}</Text>
      <Button disabled={busy || !imageReady || !hasPostcardMessage || Boolean(cityStamp && photoWidth <= 0)} label={busy ? '正在准备明信片…' : '分享明信片'} onPress={() => { void exportCard('share'); }} />
      <Button disabled={busy || !imageReady || !hasPostcardMessage || Boolean(cityStamp && photoWidth <= 0)} label="保存到相册" variant="secondary" onPress={() => { void exportCard('save'); }} />
      {message ? <Text accessibilityLiveRegion="polite" style={s.note}>{message}</Text> : null}
    </>}
  </Screen>;
}
const s = StyleSheet.create({
  stack: { height: 435, alignItems: 'center', justifyContent: 'center', marginTop: 8 }, backCard: { position: 'absolute', width: '85%', height: 388, backgroundColor: '#fff9ed', borderWidth: 1, borderColor: colors.border, borderRadius: 10, top: 24 }, card: { width: '88%', height: 397, backgroundColor: '#fffaf0', borderWidth: 1, borderColor: colors.border, borderRadius: 8, padding: 12, transform: [{ rotate: '2deg' }], shadowColor: '#785636', shadowOpacity: .13, shadowRadius: 5, shadowOffset: { width: 0, height: 3 } }, image: { width: '100%', height: 280, borderRadius: 3, resizeMode: 'cover' }, stamp: { position: 'absolute', top: 31, right: 21, borderWidth: 1, borderColor: '#9f7b5e', width: 69, height: 69, borderRadius: 36, alignItems: 'center', justifyContent: 'center', transform: [{ rotate: '-14deg' }] }, stampText: { color: '#78583f', fontSize: 8, textAlign: 'center', lineHeight: 11 }, cityStampOverlay: { position: 'absolute', top: 200, left: 18, width: 68, height: 68, transform: [{ rotate: '-7deg' }] }, wordsContainer: { alignSelf: 'stretch', marginTop: 12, marginLeft: 4 }, wordsWithoutSticker: { marginRight: 0 }, wordsWithSticker: { marginRight: 66 }, words: { fontSize: 20, lineHeight: 30, color: '#38291e', fontFamily: 'Kaiti SC' }, mascot: { width: 66, height: 72, position: 'absolute', bottom: 8, right: 9 }, note: { textAlign: 'center', color: colors.textSecondary, fontSize: 13 },
});
