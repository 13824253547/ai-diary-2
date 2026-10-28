import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { BottomSheet } from '../../src/components/common/bottom-sheet';
import { EmptyResult, IconAction, SearchField } from '../../src/components/common/support-ui';
import { Photo } from '../../src/components/diary/photo';
import { Screen } from '../../src/components/layout/screen';
import { TopBar } from '../../src/components/layout/top-bar';
import { listMaterialPhotosFromBackend } from '../../src/services/material-photo-api';
import { filterMaterialPhotosByDiary } from '../../src/services/material-photo-search';
import { useAppStore } from '../../src/store/use-app-store';
import { colors } from '../../src/theme/tokens';
import type { DiaryPhoto } from '../../src/types/diary';

function getPhotoTitle(photo?: DiaryPhoto) {
  return photo?.title || '照片预览';
}

export default function MaterialPhotoWallScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ search?: string }>();
  const materialIds = useAppStore(state => state.materialPhotoIds);
  const photoCatalog = useAppStore(state => state.photos);
  const diaries = useAppStore(state => state.diaries);
  const [search, setSearch] = useState(typeof params.search === 'string' ? params.search : '');
  const [searching, setSearching] = useState(Boolean(params.search));
  const [previewPhotoId, setPreviewPhotoId] = useState<string>();
  const [materialLoadError, setMaterialLoadError] = useState(false);
  const photoById = new Map(photoCatalog.map(photo => [photo.id, photo]));
  const materialPhotos = materialIds
    .map(id => photoById.get(id))
    .filter((photo): photo is DiaryPhoto => photo !== undefined);
  const photos = filterMaterialPhotosByDiary(materialPhotos, diaries, search);
  const previewPhoto = previewPhotoId ? photoById.get(previewPhotoId) : undefined;

  useEffect(() => {
    if (process.env.JEST_WORKER_ID) return;
    let active = true;
    void listMaterialPhotosFromBackend().then(result => {
      if (!active) return;
      setMaterialLoadError(!result.ok || !useAppStore.getState().syncMaterialPhotos(result.photos));
    });
    return () => { active = false; };
  }, []);

  return (
    <Screen
      header={
        <TopBar
          title="照片墙"
          onBackPress={() => router.canGoBack() ? router.back() : router.replace('/library')}
          trailing={<IconAction
            name={searching ? 'close-outline' : 'search-outline'}
            label={searching ? '关闭搜索' : '搜索日记'}
            onPress={() => {
              setSearching(value => !value);
              setSearch('');
            }}
          />}
        />
      }
    >
      {searching ? <SearchField
        value={search}
        onChangeText={setSearch}
        placeholder="搜索日记标题、地点或正文"
      /> : null}
      {photos.length ? (
        <View style={styles.grid}>
          {photos.map(photo => (
            <Pressable
              key={photo.id}
              accessibilityRole="button"
              accessibilityLabel={`预览${photo.title}`}
              onPress={() => setPreviewPhotoId(photo.id)}
              style={styles.photo}
            >
              <Photo id={photo.id} style={styles.image} />
            </Pressable>
          ))}
        </View>
      ) : (
        <EmptyResult title={materialLoadError && !materialPhotos.length ? '素材暂时无法加载' : search ? '没有找到匹配日记的照片' : '还没有照片素材'}>
          {materialLoadError && !materialPhotos.length ? <Text style={styles.loadHint}>请稍后重新打开页面重试。</Text> : undefined}
        </EmptyResult>
      )}
      <BottomSheet
        visible={Boolean(previewPhoto)}
        onClose={() => setPreviewPhotoId(undefined)}
        title={getPhotoTitle(previewPhoto)}
        sheetStyle={styles.sheet}
      >
        {previewPhoto ? <Photo id={previewPhoto.id} style={styles.preview} /> : null}
      </BottomSheet>
    </Screen>
  );
}

const styles = StyleSheet.create({
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 7 },
  photo: { width: '31.8%', aspectRatio: 1.05, borderRadius: 8, overflow: 'hidden', backgroundColor: colors.surface },
  image: { width: '100%', height: '100%' },
  sheet: { paddingHorizontal: 20, paddingBottom: 38, borderTopLeftRadius: 24, borderTopRightRadius: 24 },
  preview: { width: '100%', height: 360, borderRadius: 12 },
  loadHint: { color: colors.textMuted, fontSize: 13 },
});
