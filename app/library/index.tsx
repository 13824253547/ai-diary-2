import { useEffect, useMemo, useRef, useState } from 'react';
import { Alert, Image, Pressable, StyleSheet, Text, TextInput, View, type ImageSourcePropType, type NativeScrollEvent, type NativeSyntheticEvent } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import { Screen } from '../../src/components/layout/screen';
import { BottomSheet } from '../../src/components/common/bottom-sheet';
import { TopBar } from '../../src/components/layout/top-bar';
import { Button } from '../../src/components/common/button';
import { EmptyResult, IconAction, SearchField, SectionTitle, supportStyles as u } from '../../src/components/common/support-ui';
import { Photo } from '../../src/components/diary/photo';
import { CityStamp, type CityStampConfig } from '../../src/components/library/city-stamp';
import { getCityStampConfig, getVisitedCityStampIds } from '../../src/components/library/city-stamp-catalog';
import { useAppStore } from '../../src/store/use-app-store';
import { art } from '../../src/theme/assets';
import { colors } from '../../src/theme/tokens';
import type { DiaryPhoto } from '../../src/types/diary';
import type { PostcardComposition } from '../../src/types/postcard';
import {
  ALL_PHOTOS_ALBUM_ID,
  DEVICE_PHOTO_PAGE_SIZE,
  listDevicePhotoAlbums,
  listDevicePhotos,
  type DevicePhotoAlbum,
} from '../../src/services/photo-library';
import { getPhotoPermissionStatus } from '../../src/services/photo-permission';
import {
  MAX_MATERIAL_LIBRARY_PHOTOS,
  MAX_MATERIAL_PHOTOS_PER_UPLOAD,
  MATERIAL_PHOTO_PREVIEW_LIMIT,
} from '../../src/contracts/material-photo-contract';
import { filterMaterialPhotosByDiary } from '../../src/services/material-photo-search';
import { saveGeneratedImageToLibrary } from '../../src/services/save-generated-image';
import {
  deleteMaterialPhotosFromBackend,
  listMaterialPhotosFromBackend,
  listSavedDiaryPhotoAssets,
  uploadMaterialPhotosToBackend,
  type DiaryPhotoCopy,
} from '../../src/services/material-photo-api';

type Preview = { title: string; image?: ImageSourcePropType; photoId?: string; generated?: boolean; artKey?: keyof typeof art; stamp?: CityStampConfig; stampUnlocked?: boolean };
const stickerItems = [
  { title: '开心的小橘', image: art.stickerHappy, artKey: 'stickerHappy' },
  { title: '一起记录', image: art.mascotCamera, artKey: 'mascotCamera' },
  { title: '酷酷的小橘', image: art.stickerCool, artKey: 'stickerCool' },
  { title: '抱抱小橘', image: art.stickerCry, artKey: 'stickerCry' },
  { title: '喜欢你', image: art.stickerLove, artKey: 'stickerLove' },
] as const;
type PostcardStickerId = (typeof stickerItems)[number]['artKey'];
const inspirationCards = ['今天阳光正好，发生了什么小确幸？', '如果用一个颜色形容今天，你会选什么？', '最近有没有什么让你心动的瞬间？'];

function isPostcardStickerId(value?: string): value is PostcardStickerId {
  return stickerItems.some(item => item.artKey === value);
}

function getPhotoImageSource(photo: DiaryPhoto): ImageSourcePropType | undefined {
  if (photo.localUri || photo.uri) {
    return { uri: photo.localUri ?? photo.uri, headers: photo.remoteHeaders };
  }
  return photo.image;
}

function mergeDevicePhotos(current: DiaryPhoto[], incoming: DiaryPhoto[]) {
  const byId = new Map(current.map(photo => [photo.id, photo]));
  for (const photo of incoming) byId.set(photo.id, photo);
  return [...byId.values()];
}

export default function LibraryScreen() {
  const router = useRouter();
  const material = useAppStore(s => s.materialPhotoIds);
  const photoCatalog = useAppStore(s => s.photos);
  const diaries = useAppStore(s => s.diaries);
  const importPhotos = useAppStore(s => s.importDevicePhotosToMaterials);
  const generateMaterialImage = useAppStore(s => s.generateMaterialImage);
  const [search, setSearch] = useState('');
  const [searching, setSearching] = useState(false);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [sheet, setSheet] = useState<'upload' | 'upload-albums' | 'diary' | 'ai' | 'inspiration' | null>(null);
  const [prompt, setPrompt] = useState('');
  const [answer, setAnswer] = useState('');
  const [generating, setGenerating] = useState(false);
  const [aiGenerationRequestId, setAiGenerationRequestId] = useState<string>();
  const [aiGenerationError, setAiGenerationError] = useState<string>();
  const [savingGeneratedImage, setSavingGeneratedImage] = useState(false);
  const [saveGeneratedImageMessage, setSaveGeneratedImageMessage] = useState<string>();
  const [devicePhotos, setDevicePhotos] = useState<DiaryPhoto[]>([]);
  const [deviceAlbums, setDeviceAlbums] = useState<DevicePhotoAlbum[]>([]);
  const [activeDeviceAlbumId, setActiveDeviceAlbumId] = useState(ALL_PHOTOS_ALBUM_ID);
  const [devicePhotoCursor, setDevicePhotoCursor] = useState<string>();
  const [hasMoreDevicePhotos, setHasMoreDevicePhotos] = useState(false);
  const [selectedUploadIds, setSelectedUploadIds] = useState<string[]>([]);
  const [selectedDeleteIds, setSelectedDeleteIds] = useState<string[]>([]);
  const [uploadLoading, setUploadLoading] = useState(false);
  const [loadingMoreDevicePhotos, setLoadingMoreDevicePhotos] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteMode, setDeleteMode] = useState(false);
  const [uploadError, setUploadError] = useState<string>();
  const [materialLoadError, setMaterialLoadError] = useState(false);
  const materialSyncRevision = useRef(0);
  const unlockedCityStampIds = useMemo(() => getVisitedCityStampIds(diaries), [diaries]);
  const ownedCityStamps = useMemo(() => [...unlockedCityStampIds]
    .map(id => getCityStampConfig(id))
    .filter((stamp): stamp is CityStampConfig => stamp !== undefined)
    .slice(0, 3), [unlockedCityStampIds]);
  const uploadAlbumRequestVersion = useRef(0);
  const loadingMoreDevicePhotosRef = useRef(false);
  const activeDeviceAlbum = deviceAlbums.find(album => album.id === activeDeviceAlbumId);
  const photoById = new Map(photoCatalog.map(photo => [photo.id, photo]));
  const materialPhotos = material
    .map(id => photoById.get(id))
    .filter((photo): photo is DiaryPhoto => photo !== undefined);
  const photos = filterMaterialPhotosByDiary(materialPhotos, diaries, search);
  const visiblePhotos = deleteMode ? photos : photos.slice(0, MATERIAL_PHOTO_PREVIEW_LIMIT);
  const close = () => {
    if (sheet === 'ai' && generating && aiGenerationRequestId) {
      useAppStore.getState().cancelMaterialImageGeneration(aiGenerationRequestId);
    }
    uploadAlbumRequestVersion.current += 1;
    loadingMoreDevicePhotosRef.current = false;
    setLoadingMoreDevicePhotos(false);
    setSheet(null);
    setPreview(null);
  };
  const submitAIImage = async () => {
    const description = prompt.trim();
    if (!description || generating) return;
    setGenerating(true);
    setAiGenerationError(undefined);
    setAiGenerationRequestId(undefined);
    const operation = generateMaterialImage(description);
    const pendingRequest = useAppStore.getState().aiImageGenerationRequests
      .find(item => item.status === 'pending' && item.description === description);
    if (pendingRequest) setAiGenerationRequestId(pendingRequest.id);
    try {
      const result = await operation;
      if (!result.ok) {
        if (result.reason !== 'cancelled') setAiGenerationError(result.message);
        return;
      }
      const photo = useAppStore.getState().photos.find(item => item.id === result.photoId);
      if (!photo || result.source !== 'provider') {
        setAiGenerationError('没有收到已保存的真实配图，请重试。');
        return;
      }
      materialSyncRevision.current += 1;
      setMaterialLoadError(false);
      setSheet(null);
      setPreview({ title: photo.title, image: getPhotoImageSource(photo), photoId: photo.id, generated: true });
    } catch {
      setAiGenerationError('配图暂时无法生成，请稍后重试。');
    } finally {
      setGenerating(false);
      setAiGenerationRequestId(undefined);
    }
  };
  const cancelAIImage = () => {
    if (aiGenerationRequestId) {
      useAppStore.getState().cancelMaterialImageGeneration(aiGenerationRequestId);
    }
    setGenerating(false);
    setAiGenerationError('本次配图生成已取消，可以调整描述后重新生成。');
  };
  const savePreviewToLibrary = async () => {
    if (!preview?.photoId || savingGeneratedImage) return;
    const photo = useAppStore.getState().photos.find(item => item.id === preview.photoId);
    if (!photo) {
      setSaveGeneratedImageMessage('这张配图当前无法读取，请重新生成后再试。');
      return;
    }
    setSavingGeneratedImage(true);
    setSaveGeneratedImageMessage(undefined);
    try {
      const result = await saveGeneratedImageToLibrary(photo);
      setSaveGeneratedImageMessage(result.ok ? '已保存到系统相册。' : result.message);
    } finally {
      setSavingGeneratedImage(false);
    }
  };
  const usePreviewForPostcard = () => {
    if (!preview || (preview.stamp && !preview.stampUnlocked)) return;
    const composition: PostcardComposition = {};
    if (preview.photoId) {
      const current = useAppStore.getState();
      if (!current.materialPhotoIds.includes(preview.photoId)
        || !current.photos.some(photo => photo.id === preview.photoId
          && (photo.source === 'device' || photo.source === 'generated'))) {
        Alert.alert('无法添加这张照片', '这张照片当前不在素材库，请重新打开预览后重试。');
        return;
      }
      composition.photoId = preview.photoId;
    } else if (preview.stamp) {
      if (!unlockedCityStampIds.has(preview.stamp.id)) return;
      composition.cityStampId = preview.stamp.id;
    } else if (preview.artKey && isPostcardStickerId(preview.artKey)) {
      composition.stickerId = preview.artKey;
    } else {
      return;
    }
    close();
    router.push({ pathname: '/postcard/apply', params: composition });
  };
  const startDiaryFromGeneratedPhoto = () => {
    if (!preview?.generated || !preview.photoId) return;
    const store = useAppStore.getState();
    if (!store.materialPhotoIds.includes(preview.photoId)
      || !store.photos.some(photo => photo.id === preview.photoId)) {
      Alert.alert('暂时无法生成日记', '这张配图当前不在素材库，请重新打开预览后重试。');
      return;
    }
    const draftId = store.beginCreation();
    store.setDraftPhotos(draftId, [preview.photoId]);
    store.setCurrentStep('album');
    close();
    router.push({ pathname: '/album/select', params: { draftId, source: 'materials' } });
  };
  useEffect(() => {
    if (process.env.JEST_WORKER_ID) return;
    let active = true;
    const revision = materialSyncRevision.current;
    void listMaterialPhotosFromBackend().then(result => {
      if (!active || revision !== materialSyncRevision.current) return;
      setMaterialLoadError(!result.ok || !useAppStore.getState().syncMaterialPhotos(result.photos));
    });
    return () => { active = false; };
  }, []);
  const loadDeviceAlbum = async (albumId: string, append = false) => {
    if (append) {
      if (loadingMoreDevicePhotosRef.current) return;
      loadingMoreDevicePhotosRef.current = true;
      setLoadingMoreDevicePhotos(true);
    } else {
      uploadAlbumRequestVersion.current += 1;
      loadingMoreDevicePhotosRef.current = false;
      setLoadingMoreDevicePhotos(false);
      setUploadLoading(true);
      setDevicePhotos([]);
      setDevicePhotoCursor(undefined);
      setHasMoreDevicePhotos(false);
      setActiveDeviceAlbumId(albumId);
      setUploadError(undefined);
    }
    const requestVersion = uploadAlbumRequestVersion.current;
    try {
      const page = await listDevicePhotos({
        albumId,
        first: DEVICE_PHOTO_PAGE_SIZE,
        ...(append && devicePhotoCursor ? { after: devicePhotoCursor } : {}),
      });
      if (requestVersion !== uploadAlbumRequestVersion.current) return;
      useAppStore.getState().registerPhotos(page.photos);
      setDevicePhotos(current => append ? mergeDevicePhotos(current, page.photos) : page.photos);
      setActiveDeviceAlbumId(page.album.id);
      setDevicePhotoCursor(page.endCursor);
      setHasMoreDevicePhotos(page.hasNextPage);
      setUploadError(undefined);
    } catch {
      if (requestVersion === uploadAlbumRequestVersion.current) {
        setUploadError(append
          ? '加载更多照片失败了，已保留当前选择，请稍后重试。'
          : '设备相册暂时无法读取，请检查权限后重试。');
      }
    } finally {
      if (requestVersion === uploadAlbumRequestVersion.current) {
        if (append) {
          loadingMoreDevicePhotosRef.current = false;
          setLoadingMoreDevicePhotos(false);
        } else {
          setUploadLoading(false);
        }
      }
    }
  };
  const openUpload = async () => {
    setSheet('upload');
    setDevicePhotos([]);
    setDeviceAlbums([]);
    setActiveDeviceAlbumId(ALL_PHOTOS_ALBUM_ID);
    setDevicePhotoCursor(undefined);
    setHasMoreDevicePhotos(false);
    setSelectedUploadIds([]);
    setUploadError(undefined);
    loadingMoreDevicePhotosRef.current = false;
    setLoadingMoreDevicePhotos(false);
    setUploadLoading(true);
    const requestVersion = ++uploadAlbumRequestVersion.current;
    try {
      const permission = await getPhotoPermissionStatus();
      useAppStore.getState().setPhotoPermissionStatus(permission.status);
      if (!permission.granted) {
        setUploadError('请先允许访问设备相册，再添加真实照片。');
        return;
      }
      const albums = await listDevicePhotoAlbums();
      if (requestVersion !== uploadAlbumRequestVersion.current) return;
      setDeviceAlbums(albums);
      const initialAlbum = albums.find(album => album.id === ALL_PHOTOS_ALBUM_ID) ?? albums[0];
      if (!initialAlbum) {
        setUploadError('设备相册中还没有可添加的照片。');
        return;
      }
      await loadDeviceAlbum(initialAlbum.id);
    } catch {
      if (requestVersion === uploadAlbumRequestVersion.current) {
        setUploadError('设备相册暂时无法读取，请检查权限后重试。');
      }
    } finally {
      if (requestVersion === uploadAlbumRequestVersion.current) setUploadLoading(false);
    }
  };
  const handleUploadScroll = (event: NativeSyntheticEvent<NativeScrollEvent>) => {
    if (sheet !== 'upload' || uploadLoading || loadingMoreDevicePhotos || uploading || !hasMoreDevicePhotos) return;
    const { contentOffset, contentSize, layoutMeasurement } = event.nativeEvent;
    if (contentSize.height - (contentOffset.y + layoutMeasurement.height) < 180) {
      void loadDeviceAlbum(activeDeviceAlbumId, true);
    }
  };
  const toggleUploadPhoto = (photo: DiaryPhoto) => {
    setSelectedUploadIds(current => {
      if (current.includes(photo.id)) return current.filter(id => id !== photo.id);
      if (current.length >= MAX_MATERIAL_PHOTOS_PER_UPLOAD
        || material.length + current.length >= MAX_MATERIAL_LIBRARY_PHOTOS) return current;
      return [...current, photo.id];
    });
  };
  const submitUpload = async () => {
    if (uploading || selectedUploadIds.length < 1 || selectedUploadIds.length > MAX_MATERIAL_PHOTOS_PER_UPLOAD
      || material.length + selectedUploadIds.length > MAX_MATERIAL_LIBRARY_PHOTOS) return;
    setUploading(true);
    const selectedIds = [...selectedUploadIds];
    const result = await importPhotos(selectedIds);
    if (!result.ok) {
      setUploading(false);
      Alert.alert('添加失败', result.message);
      return;
    }
    const imported = useAppStore.getState().photos.filter(photo => selectedIds.includes(photo.id));
    const uploaded = await uploadMaterialPhotosToBackend(imported);
    if (!uploaded.ok) {
      useAppStore.getState().removeMaterialPhotos(selectedIds);
      setUploading(false);
      Alert.alert('上传失败', uploaded.message);
      return;
    }
    const store = useAppStore.getState();
    const previousMaterials = store.materialPhotoIds
      .filter(id => !selectedIds.includes(id))
      .map(id => store.photos.find(photo => photo.id === id))
      .filter((photo): photo is DiaryPhoto => photo !== undefined);
    materialSyncRevision.current += 1;
    if (!store.syncMaterialPhotos([...previousMaterials, ...uploaded.photos])) {
      useAppStore.getState().removeMaterialPhotos(selectedIds);
      setUploading(false);
      Alert.alert('上传失败', '素材库没有收到完整的照片结果，请重试。');
      return;
    }
    setMaterialLoadError(false);
    setUploading(false);
    setSelectedUploadIds([]);
    close();
    Alert.alert('已上传', `${uploaded.photos.length} 张照片已保存到素材库。`);
  };
  const toggleDeletePhoto = (photoId: string) => {
    setSelectedDeleteIds(current => current.includes(photoId)
      ? current.filter(id => id !== photoId)
      : [...current, photoId]);
  };
  const confirmDelete = async () => {
    if (deleting || !selectedDeleteIds.length) return;
    setDeleting(true);
    const photoIds = [...selectedDeleteIds];
    const current = useAppStore.getState();
    const referencedDiaries = current.diaries.filter(diary => diary.photoIds.some(id => photoIds.includes(id)));
    let diaryCopies: DiaryPhotoCopy[] = [];
    if (referencedDiaries.length) {
      try {
        diaryCopies = await listSavedDiaryPhotoAssets(referencedDiaries.map(diary => diary.id));
      } catch {
        setDeleting(false);
        Alert.alert('暂时无法删除', '日记照片副本尚未确认，素材暂时保留。请稍后重试。');
        return;
      }
      const expectedCopies = new Set(referencedDiaries.flatMap(diary =>
        diary.photoIds
          .filter(id => photoIds.includes(id))
          .map(photoId => `${diary.id}\u0000${photoId}`),
      ));
      const availableCopies = new Set(diaryCopies
        .filter(photo => typeof photo.diaryId === 'string')
        .map(photo => `${photo.diaryId}\u0000${photo.id}`));
      if ([...expectedCopies].some(key => !availableCopies.has(key))) {
        setDeleting(false);
        Alert.alert('暂时无法删除', '部分日记还没有可读取的独立照片副本，素材暂时保留。');
        return;
      }
    }
    const result = await deleteMaterialPhotosFromBackend(photoIds);
    setDeleting(false);
    if (!result.ok) {
      Alert.alert('删除失败', result.message);
      return;
    }
    materialSyncRevision.current += 1;
    useAppStore.getState().registerPhotos(diaryCopies.filter(photo => photoIds.includes(photo.id)));
    useAppStore.getState().removeMaterialPhotos(photoIds);
    setSelectedDeleteIds([]);
    setDeleteMode(false);
    Alert.alert('已删除', `${photoIds.length} 张素材已删除；已保存日记中的独立照片副本不会受影响。`);
  };
  const applyPhoto = (diaryId: string) => {
    if (!preview?.photoId) return;
    const store = useAppStore.getState();
    if (!store.photos.some(photo => photo.id === preview.photoId)) return;
    const savedDiary = store.diaries.find(item => item.id === diaryId);
    if (!savedDiary) return;
    const existingDraft = Object.values(store.drafts)
      .find(draft => draft.sourceDiaryId === diaryId && !draft.savedDiaryId);
    const sourceBlocks = existingDraft?.diary.blocks ?? savedDiary.blocks;
    if (!sourceBlocks.some(item => item.type === 'text')) return;
    const id = store.beginEdit(diaryId);
    if (!id) return;
      const currentStore = useAppStore.getState();
      const draft = currentStore.drafts[id];
    const block = draft?.diary.blocks.find(item => item.type === 'text');
    if (!draft || !block || block.type !== 'text') return;
    currentStore.setDraftBlockPhotos(id, block.id, [preview.photoId]);
    close();
    router.push({ pathname: '/diary/[id]/edit', params: { id: diaryId, draftId: id } });
  };
  return <Screen header={<TopBar title="素材库 · 灵感" centered onBackPress={() => router.canGoBack() ? router.back() : router.replace('/(tabs)/home')} trailing={<View style={s.toolbarActions}><IconAction name={deleteMode ? 'close-outline' : 'trash-outline'} label={deleteMode ? '取消删除' : '删除素材'} onPress={() => { setDeleteMode(!deleteMode); setSelectedDeleteIds([]); }} /><IconAction name="search-outline" label="搜索素材" onPress={() => setSearching(!searching)} /></View>} />}>
    {searching ? <SearchField value={search} onChangeText={setSearch} placeholder="搜索日记标题、地点或正文" /> : null}
    <View style={s.photoSectionHeader}>
      <Text style={u.heading}>我的照片素材</Text>
      <View style={s.photoSectionActions}>
        {photos.length > MATERIAL_PHOTO_PREVIEW_LIMIT && !deleteMode ? <Pressable accessibilityRole="button" accessibilityLabel="展开照片墙" onPress={() => router.push({
          pathname: '/library/wall',
          params: search.trim() ? { search: search.trim() } : {},
        })}><Text style={s.sectionAction}>展开 ›</Text></Pressable> : null}
        <Pressable accessibilityRole="button" accessibilityLabel="添加照片" onPress={() => { void openUpload(); }}><Text style={s.sectionAction}>上传 ›</Text></Pressable>
      </View>
    </View>
    <View style={s.grid}>{visiblePhotos.map(p => <Pressable accessibilityRole="button" accessibilityLabel={deleteMode ? `选择删除${p.title}` : `预览${p.title}`} key={p.id} onPress={() => { if (deleteMode) toggleDeletePhoto(p.id); else setPreview({ title: p.title, image: getPhotoImageSource(p), photoId: p.id, generated: p.source === 'generated' }); }} style={s.photo}><Image testID={`material-photo-${p.id}`} source={getPhotoImageSource(p)} style={s.image} />{deleteMode ? <View style={[s.selectionMark, selectedDeleteIds.includes(p.id) && s.selectedMark]}><Ionicons name={selectedDeleteIds.includes(p.id) ? 'checkmark' : 'ellipse-outline'} size={15} color={selectedDeleteIds.includes(p.id) ? '#fff' : colors.textSecondary} /></View> : !diaries.some(d => d.photoIds.includes(p.id) || d.blocks.some(block => block.type === 'photo' ? block.photoId === p.id : block.photoIds?.includes(p.id))) ? <Text style={s.badge}>未生成日记</Text> : null}</Pressable>)}</View>
    {deleteMode ? <Button disabled={!selectedDeleteIds.length || deleting} label={deleting ? '正在删除…' : `删除所选（${selectedDeleteIds.length}）`} onPress={() => Alert.alert('删除素材', `确定删除选中的 ${selectedDeleteIds.length} 张照片吗？已保存日记中的照片副本会保留。`, [{ text: '取消', style: 'cancel' }, { text: '删除', style: 'destructive', onPress: () => { void confirmDelete(); } }])} /> : null}
    {photos.length === 0 ? <EmptyResult
      title={materialLoadError && !materialPhotos.length ? '素材暂时无法加载' : search ? '没有找到匹配日记的照片' : '还没有照片素材'}
    >{materialLoadError && !materialPhotos.length ? <Text style={u.muted}>请稍后重新打开页面重试。</Text> : undefined}</EmptyResult> : null}
    <View style={s.divider} />
    <SectionTitle title="贴纸表情" />
    <View style={s.stickers}>{stickerItems.map(item => <Pressable accessibilityLabel={`预览${item.title}`} key={item.title} onPress={() => setPreview(item)}><Image source={item.image} style={s.stickerImage} resizeMode="contain" /></Pressable>)}</View>
    <SectionTitle title="城市印章" action="按地区浏览" onPress={() => router.push('/library/cities')} />
    {ownedCityStamps.length ? (
      <View style={s.stampRow} testID="owned-city-stamps">
        {ownedCityStamps.map(item => (
          <Pressable
            key={item.id}
            style={s.stampButton}
            accessibilityRole="button"
            accessibilityLabel={`预览${item.cityName}印章`}
            onPress={() => setPreview({ title: item.cityName, stamp: item, stampUnlocked: true })}
          >
            <CityStamp {...item} width="100%" height="100%" />
          </Pressable>
        ))}
      </View>
    ) : (
      <View style={s.stampEmpty} testID="city-stamp-empty">
        <Ionicons name="location-outline" size={24} color={colors.textMuted} />
        <View style={s.stampEmptyCopy}>
          <Text style={s.stampEmptyTitle}>暂无城市印章</Text>
          <Text style={s.stampEmptyDetail}>保存一篇地点可识别的日记后，这里会展示对应印章</Text>
        </View>
      </View>
    )}
    <SectionTitle title="灵感卡" />
    <View style={s.inspirations}>{inspirationCards.map(q => <Pressable key={q} style={s.inspirationCard} onPress={() => { setPrompt(q); setAnswer(''); setSheet('inspiration'); }}><Text style={s.inspirationText}>{q}</Text></Pressable>)}</View>
    <SectionTitle title="AI补图" />
    <LinearGradient colors={['#ff841a', '#ffb054']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={s.inspiration}><View style={s.inspirationCopy}><Text style={s.inspirationTitle}>为没拍照的时刻{`\n`}配一张图</Text><Pressable onPress={() => { setPrompt(''); setAiGenerationError(undefined); setSaveGeneratedImageMessage(undefined); setSheet('ai'); }} style={s.try}><Text style={s.tryText}>去试试</Text></Pressable></View><Image source={art.night} style={s.inspirationImage} /></LinearGradient>
    <BottomSheet
      visible={Boolean(preview || sheet)}
      onClose={close}
      title={sheet === 'upload' ? '添加照片' : sheet === 'upload-albums' ? '选择相册' : sheet === 'diary' ? '添加到哪篇日记？' : sheet === 'ai' ? '让想象成为一张照片' : sheet === 'inspiration' ? '留住这个小瞬间' : preview?.title}
      scroll
      maxHeight="85%"
      sheetStyle={s.sheet}
      contentContainerStyle={{ gap: 15 }}
      onScroll={handleUploadScroll}
      scrollEventThrottle={16}
      footer={sheet === 'upload' ? <Button disabled={uploading || selectedUploadIds.length < 1 || selectedUploadIds.length > MAX_MATERIAL_PHOTOS_PER_UPLOAD || material.length + selectedUploadIds.length > MAX_MATERIAL_LIBRARY_PHOTOS} label={uploading ? '正在上传…' : `上传所选照片（${selectedUploadIds.length}）`} onPress={() => { void submitUpload(); }} /> : undefined}
      footerContainerStyle={sheet === 'upload' ? { paddingTop: 15 } : undefined}
    >
          {sheet === 'upload' ? <>
            {uploadLoading ? <Text style={u.muted}>正在读取设备相册…</Text> : null}
            {uploadError ? <Text style={u.muted}>{uploadError}</Text> : null}
            {activeDeviceAlbum ? <Pressable accessibilityRole="button" accessibilityLabel="选择相册" onPress={() => setSheet('upload-albums')} style={s.albumSelector}><Text style={s.albumSelectorText}>{activeDeviceAlbum.title} · {activeDeviceAlbum.assetCount} 张</Text><Ionicons name="chevron-down" size={17} color={colors.textSecondary} /></Pressable> : null}
            <Text style={u.muted}>已选 {selectedUploadIds.length} 张 · 素材库 {material.length}/{MAX_MATERIAL_LIBRARY_PHOTOS}</Text>
            {material.length >= MAX_MATERIAL_LIBRARY_PHOTOS ? <Text style={u.muted}>素材库已满，请先删除部分照片。</Text> : null}
            <View style={s.grid}>{devicePhotos.map(photo => {
            const selected = selectedUploadIds.includes(photo.id);
            return <Pressable key={photo.id} accessibilityRole="button" accessibilityLabel={`添加${photo.title}`} accessibilityState={{ disabled: uploading }} disabled={uploading} onPress={() => toggleUploadPhoto(photo)} style={s.photo}><Photo id={photo.id} style={s.photoImage} />{selected ? <View style={[s.added, s.selectedMark]}><Ionicons name="checkmark" size={15} color="#fff" /></View> : null}</Pressable>;
          })}</View>
            {!devicePhotos.length && !uploadLoading && !uploadError ? <Text style={u.muted}>这个相册里还没有可添加的照片。</Text> : null}
            {loadingMoreDevicePhotos ? <Text style={u.muted}>正在加载更多照片…</Text> : null}
          </> : null}
          {sheet === 'upload-albums' ? <View style={s.albumOptions}>{deviceAlbums.map(album => <Pressable key={album.id} accessibilityRole="button" accessibilityLabel={`选择相册${album.title}`} onPress={() => { setSheet('upload'); void loadDeviceAlbum(album.id); }} style={s.albumOption}><Text style={s.albumOptionText}>{album.id === activeDeviceAlbumId ? '✓ ' : ''}{album.title} · {album.assetCount} 张</Text></Pressable>)}</View> : null}
          {sheet === 'diary' ? diaries.map(d => <Pressable key={d.id} style={s.diaryOption} onPress={() => applyPhoto(d.id)}><Text style={u.body}>{d.title}</Text><Ionicons name="chevron-forward" size={18} color={colors.textMuted} /></Pressable>) : null}
          {sheet === 'ai' ? <>
            <Text style={u.body}>描述你想留下的画面</Text>
            <TextInput
              accessibilityLabel="画面描述"
              editable={!generating}
              value={prompt}
              onChangeText={setPrompt}
              placeholder="比如：日落时分，老街亮起温柔的灯"
              multiline
              style={s.textInput}
            />
            {aiGenerationError ? <Text accessibilityRole="alert" style={s.aiError}>{aiGenerationError}</Text> : null}
            <Button
              disabled={!prompt.trim() || generating || material.length >= MAX_MATERIAL_LIBRARY_PHOTOS}
              loading={generating}
              label={generating ? '正在为你描绘画面，请稍候…' : material.length >= MAX_MATERIAL_LIBRARY_PHOTOS ? '素材库已满，请先删除部分照片' : aiGenerationError ? '重新生成' : '生成配图'}
              onPress={() => { void submitAIImage(); }}
            />
            {generating ? <Button variant="secondary" label="取消生成" onPress={cancelAIImage} /> : null}
          </> : null}
          {sheet === 'inspiration' ? <><Text style={u.body}>{prompt}</Text><TextInput accessibilityLabel="记录灵感" value={answer} onChangeText={setAnswer} multiline placeholder="慢慢写，把心情留在这里…" style={s.textInput} /><Button disabled={!answer.trim()} label="和小橘聊聊" onPress={() => { useAppStore.getState().sendChat(answer.trim()); close(); router.push('/(tabs)/pet'); }} /></> : null}
          {preview && !sheet ? <>{preview.stamp ? <><CityStamp {...preview.stamp} width="100%" height={270} testID="city-stamp-preview" /><Text style={u.muted}>{preview.stampUnlocked ? '已解锁，可用于明信片。' : '记录地点与城市名称精确匹配的已保存日记后解锁应用。'}</Text></> : <Image testID="material-photo-preview" source={preview.image} style={s.preview} resizeMode="contain" />}{preview.photoId ? preview.generated ? <><Button label={savingGeneratedImage ? '正在保存…' : '保存到相册'} disabled={savingGeneratedImage} onPress={() => { void savePreviewToLibrary(); }} />{saveGeneratedImageMessage ? <Text accessibilityLiveRegion="polite" style={saveGeneratedImageMessage.startsWith('已保存') ? s.savedMessage : s.aiError}>{saveGeneratedImageMessage}</Text> : null}<Button label="用于明信片" variant="secondary" onPress={usePreviewForPostcard} /><Button label="生成日记" variant="secondary" onPress={startDiaryFromGeneratedPhoto} /></> : <><Button label="用于日记" onPress={() => setSheet('diary')} /><Button label="用于明信片" variant="secondary" onPress={usePreviewForPostcard} /></> : <Button label="用于明信片" onPress={usePreviewForPostcard} />}</> : null}
    </BottomSheet>
  </Screen>;
}

const s = StyleSheet.create({
  toolbarActions: { flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end', marginRight: -7 },
  photoSectionHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  photoSectionActions: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  sectionAction: { color: colors.textSecondary, fontSize: 12, paddingVertical: 6 },
  albumSelector: { flexDirection: 'row', alignItems: 'center', alignSelf: 'flex-start', gap: 7, paddingVertical: 4 }, albumSelectorText: { fontSize: 16, fontWeight: '600', color: colors.textPrimary }, albumOptions: { gap: 2 }, albumOption: { paddingVertical: 12, borderBottomWidth: 1, borderColor: colors.border }, albumOptionText: { fontSize: 15, color: colors.textPrimary },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 7 }, photo: { width: '31.8%', aspectRatio: 1.05, borderRadius: 8, overflow: 'hidden', backgroundColor: colors.surface }, photoImage: { width: '100%', height: '100%' }, image: { width: '100%', height: '100%', resizeMode: 'cover' }, badge: { position: 'absolute', right: 4, bottom: 4, borderRadius: 9, backgroundColor: '#fff9ec', fontSize: 9, paddingVertical: 3, paddingHorizontal: 6, color: colors.textSecondary },
  divider: { height: 1, backgroundColor: colors.border, marginTop: -4 }, stickers: { flexDirection: 'row', justifyContent: 'space-between', marginTop: -8 }, stickerImage: { width: 47, height: 49 }, stampRow: { flexDirection: 'row', justifyContent: 'space-between', marginTop: -10 }, stampButton: { flex: 1, height: 83, alignItems: 'center', justifyContent: 'center' }, stampEmpty: { minHeight: 83, marginTop: -10, paddingHorizontal: 14, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10, borderRadius: 12, backgroundColor: colors.surfaceAlt }, stampEmptyCopy: { flex: 1, gap: 2 }, stampEmptyTitle: { fontSize: 13, fontWeight: '600', color: colors.textSecondary }, stampEmptyDetail: { fontSize: 11, lineHeight: 16, color: colors.textMuted }, inspirations: { flexDirection: 'row', gap: 8, marginTop: -7 }, inspirationCard: { flex: 1, borderWidth: 1, borderColor: colors.border, backgroundColor: '#fff0dc', borderRadius: 8, padding: 10, minHeight: 70, justifyContent: 'center' }, inspirationText: { color: colors.textPrimary, fontSize: 11, lineHeight: 18 },
  inspiration: { borderRadius: 13, height: 86, overflow: 'hidden', flexDirection: 'row', marginTop: -9 }, inspirationCopy: { flex: 1, padding: 10, gap: 5 }, inspirationTitle: { color: '#fff', fontSize: 13, fontWeight: '600', lineHeight: 20 }, inspirationImage: { width: '43%', height: '100%', resizeMode: 'cover', borderRadius: 12 }, try: { borderRadius: 13, alignSelf: 'flex-start', backgroundColor: '#fff', paddingHorizontal: 13, paddingVertical: 4 }, tryText: { color: colors.brandStrong, fontSize: 11, fontWeight: '600' },
  sheet: { paddingHorizontal: 20, paddingBottom: 38, borderTopLeftRadius: 24, borderTopRightRadius: 24 }, preview: { width: '100%', height: 300, borderRadius: 12 }, aiError: { color: colors.danger, fontSize: 13, lineHeight: 19 }, savedMessage: { color: colors.textSecondary, fontSize: 13, textAlign: 'center' }, added: { position: 'absolute', right: 5, top: 5, width: 21, height: 21, borderRadius: 11, backgroundColor: colors.brand, alignItems: 'center', justifyContent: 'center' }, selectionMark: { position: 'absolute', right: 5, top: 5, width: 22, height: 22, borderRadius: 11, backgroundColor: '#fff', alignItems: 'center', justifyContent: 'center' }, selectedMark: { backgroundColor: colors.brand }, diaryOption: { flexDirection: 'row', justifyContent: 'space-between', borderBottomWidth: 1, borderColor: colors.border, paddingVertical: 15 }, textInput: { minHeight: 100, borderWidth: 1, borderColor: colors.border, borderRadius: 12, padding: 14, color: colors.textPrimary, fontSize: 14, textAlignVertical: 'top', backgroundColor: colors.surface },
});
