import { useEffect, useMemo, useState } from 'react';
import { Ionicons } from '@expo/vector-icons';
import { Image, Pressable, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { Screen } from '../../src/components/layout/screen';
import { Section } from '../../src/components/common/design-ui';
import { Photo } from '../../src/components/diary/photo';
import { BottomTabs } from '../../src/components/navigation/bottom-tabs';
import { listMaterialPhotosFromBackend } from '../../src/services/material-photo-api';
import { useAppStore, appSelectors } from '../../src/store/use-app-store';
import { art } from '../../src/theme/assets';
import { colors } from '../../src/theme/tokens';

export default function Home() {
  const router = useRouter();
  const diaries = useAppStore(state => state.memoriesSourceItems);
  const memoriesHydrated = useAppStore(state => state.hydratedMemories);
  const memoriesStatus = useAppStore(state => state.memoriesStatus);
  const photos = useAppStore(state => state.photos);
  const materialPhotoIds = useAppStore(state => state.materialPhotoIds);
  const [materialLoadStatus, setMaterialLoadStatus] = useState<'loading' | 'ready' | 'failed'>('loading');
  const materialPhotos = useMemo(
    () => materialPhotoIds
      .map(id => photos.find(photo => photo.id === id))
      .filter(photo => photo !== undefined)
      .slice(0, 4),
    [materialPhotoIds, photos],
  );
  const recentDiary = diaries.find(item => item.status === 'ready');

  useEffect(() => {
    let active = true;
    const startingMaterialIds = useAppStore.getState().materialPhotoIds;
    void listMaterialPhotosFromBackend().then(result => {
      if (!active) return;
      const store = useAppStore.getState();
      if (store.materialPhotoIds !== startingMaterialIds) {
        setMaterialLoadStatus('ready');
        return;
      }
      if (!result.ok || !store.syncMaterialPhotos(result.photos)) {
        setMaterialLoadStatus(store.materialPhotoIds.length ? 'ready' : 'failed');
        return;
      }
      setMaterialLoadStatus('ready');
    }).catch(() => {
      if (active) setMaterialLoadStatus(useAppStore.getState().materialPhotoIds.length ? 'ready' : 'failed');
    });
    return () => {
      active = false;
    };
  }, []);

  function create() {
    const state = useAppStore.getState();
    const id = state.beginCreation();
    router.push({ pathname: state.hasPhotoPermission ? '/album/select' : '/permission/photos', params: { draftId: id } });
  }

  const diaryEmptyMessage = memoriesStatus === 'error'
    ? '日记暂时无法加载，请稍后重试。'
    : !memoriesHydrated
      ? '正在加载日记…'
      : '还没有已保存的日记。';
  const materialEmptyMessage = materialLoadStatus === 'failed'
    ? '素材暂时无法加载，请前往素材库重试。'
    : materialLoadStatus === 'loading'
      ? '正在加载照片素材…'
      : '还没有照片素材，去素材库添加吧。';

  return (
    <Screen contentStyle={{ gap: 12 }} footer={<BottomTabs current="home" />}>
      <View style={s.row}>
        <View>
          <Text style={s.greeting}>早上好 ☀️</Text>
          <Text style={s.muted}>今天想记录什么呢？</Text>
        </View>
      </View>
      <LinearGradient colors={['#FF8610', '#FFAF23']} start={{ x: 0, y: 1 }} end={{ x: 1, y: 0 }} style={s.hero}>
        <View style={s.heroCopy}>
          <Text style={s.heroTitle}>从照片开始记录</Text>
          <Text style={s.heroSub}>选择真实相册照片，整理成一篇日记</Text>
          <Pressable onPress={create} accessibilityRole="button" style={s.start}>
            <Text style={s.startText}>选择照片 ✨</Text>
          </Pressable>
        </View>
        <View style={s.heroArt}>
          <Image source={art.mountain} style={[s.stack, { transform: [{ rotate: '-14deg' }], right: 59, top: 18 }]} />
          <Image source={art.flowers} style={[s.stack, { transform: [{ rotate: '-3deg' }], right: 32, top: 9 }]} />
          <Image source={art.sea} style={[s.stack, { transform: [{ rotate: '17deg' }], right: 4, top: 27 }]} />
          <Image source={art.mascotCamera} style={s.heroPet} resizeMode="contain" />
        </View>
      </LinearGradient>
      <Section title="排版师" action="更多" onPress={() => router.push('/create/character?mode=browse')} />
      <View style={s.characters}>
        {appSelectors.availableCharacters.map(character => (
          <Pressable key={character.id} style={s.character} onPress={() => router.push('/create/character?mode=browse')}>
            <View style={s.avatar}>
              <Image source={character.image} style={s.characterImage} resizeMode="contain" />
            </View>
            <Text style={s.name}>{character.name}</Text>
            <Text style={s.caption}>{character.roleLabel.split(' · ')[0]}</Text>
          </Pressable>
        ))}
      </View>
      <View style={s.rule} />
      <Section title="素材库 · 灵感" action="更多" onPress={() => router.push('/library')} />
      <Text style={s.small}>我的照片素材</Text>
      <View testID="home-material-photo-row" style={s.photoRow}>
        {materialPhotos.map(photo => (
          <Pressable key={photo.id} testID={`home-material-${photo.id}`} style={{ flex: 1 }} onPress={() => router.push('/library')}>
            <Photo id={photo.id} style={s.thumb} />
          </Pressable>
        ))}
        {!materialPhotos.length ? <Text style={s.emptyInline}>{materialEmptyMessage}</Text> : null}
        <Pressable accessibilityLabel="添加素材" style={s.add} onPress={() => router.push('/library')}>
          <Ionicons name="add" size={24} color={colors.textSecondary} />
        </Pressable>
      </View>
      <View style={s.tools}>
        {(['happy-outline', 'pricetag-outline', 'bulb-outline', 'image-outline'] as const).map((icon, index) => (
          <Pressable key={icon} style={s.tool} onPress={() => router.push({ pathname: '/library', params: { section: String(index) } })}>
            <Ionicons name={icon} size={22} color={colors.textPrimary} />
            <Text style={s.caption}>{['贴纸表情', '城市印章', '灵感卡', 'AI补图'][index]}</Text>
          </Pressable>
        ))}
      </View>
      <View style={s.rule} />
      <Section title="最近日记" />
      {recentDiary ? (
        <Pressable testID="home-recent-diary" accessibilityLabel={`打开最近日记${recentDiary.title}`} style={s.recent} onPress={() => router.push(`/diary/${recentDiary.id}`)}>
          {recentDiary.coverPhotoId && recentDiary.photoIds.includes(recentDiary.coverPhotoId)
            ? <Photo id={recentDiary.coverPhotoId} diaryId={recentDiary.id} style={s.recentImage} />
            : <View style={[s.recentImage, s.missingCover]}><Ionicons name="image-outline" size={24} color={colors.textMuted} /></View>}
          <View style={{ flex: 1, gap: 9 }}>
            <Text style={s.name}>{recentDiary.title}</Text>
            <Text style={s.caption}>{recentDiary.date}</Text>
          </View>
          <Ionicons name="chevron-forward" size={20} color={colors.textMuted} />
        </Pressable>
      ) : (
        <Text
          accessibilityRole={memoriesStatus === 'error' ? 'button' : undefined}
          onPress={memoriesStatus === 'error' ? () => { void useAppStore.getState().hydrateMemories(); } : undefined}
          style={s.muted}
        >
          {diaryEmptyMessage}
        </Text>
      )}
    </Screen>
  );
}
const s=StyleSheet.create({row:{flexDirection:'row',justifyContent:'space-between',alignItems:'center',paddingHorizontal:2},greeting:{fontSize:27,fontWeight:'700',color:colors.textPrimary},muted:{fontSize:13,color:colors.textSecondary,marginTop:7},hero:{height:146,borderRadius:18,overflow:'hidden',padding:17,flexDirection:'row'},heroCopy:{zIndex:2,gap:9},heroTitle:{fontSize:25,fontWeight:'700',color:'white'},heroSub:{fontSize:11,color:'white',maxWidth:190},start:{backgroundColor:'white',paddingHorizontal:15,paddingVertical:11,borderRadius:24,alignSelf:'flex-start',marginTop:9},startText:{fontSize:13,color:'#8B490C',fontWeight:'600'},heroArt:{position:'absolute',right:0,top:0,width:160,height:160},stack:{position:'absolute',width:76,height:111,borderWidth:5,borderColor:'#FFF9EB'},heroPet:{position:'absolute',width:70,height:83,bottom:3,right:12},characters:{flexDirection:'row',justifyContent:'space-around'},character:{alignItems:'center',gap:4},avatar:{width:78,height:78,borderRadius:40,backgroundColor:'#F7E9D8',overflow:'hidden',alignItems:'center'},characterImage:{width:68,height:80},name:{fontSize:15,fontWeight:'600',color:colors.textPrimary},caption:{fontSize:11,color:colors.textSecondary},rule:{height:1,backgroundColor:colors.border},small:{fontSize:13,color:colors.textPrimary,lineHeight:22},photoRow:{flexDirection:'row',gap:6,marginTop:-6},thumb:{height:72,borderRadius:9},emptyInline:{flex:1,alignSelf:'center',fontSize:11,lineHeight:16,color:colors.textMuted},add:{width:45,height:72,borderRadius:9,borderWidth:1,borderStyle:'dashed',borderColor:colors.textMuted,alignItems:'center',justifyContent:'center'},tools:{flexDirection:'row',gap:7,marginTop:-5},tool:{flex:1,height:57,alignItems:'center',justifyContent:'center',gap:5,backgroundColor:colors.surfaceAlt,borderRadius:9},recent:{flexDirection:'row',alignItems:'center',gap:15,borderRadius:14,backgroundColor:colors.surface,borderWidth:1,borderColor:colors.border,padding:8},recentImage:{width:100,height:86,borderRadius:10},missingCover:{alignItems:'center',justifyContent:'center',backgroundColor:colors.surfaceAlt}});
