import {Ionicons} from '@expo/vector-icons';
import {useCallback,useEffect,useMemo,useRef,useState} from 'react';
import {Pressable,ScrollView,StyleSheet,Text,View,type NativeScrollEvent,type NativeSyntheticEvent} from 'react-native';
import {Button} from '../../src/components/common/button';
import {Empty,Sheet} from '../../src/components/common/design-ui';
import {Photo} from '../../src/components/diary/photo';
import {Screen} from '../../src/components/layout/screen';
import {useDraftRoute,leaveDraft} from '../../src/hooks/use-diary-flow';
import {logDevDiagnostic} from '../../src/services/dev-diagnostics';
import {ALL_PHOTOS_ALBUM_ID,listDevicePhotoAlbums,listDevicePhotos,type DevicePhotoAlbum,validateReadableDevicePhotoIds} from '../../src/services/photo-library';
import {getPhotoPermissionStatus} from '../../src/services/photo-permission';
import {canGenerate,sanitizePhotoIds} from '../../src/store/diary-domain';
import {appSelectors,useAppStore} from '../../src/store/use-app-store';
import type {DiaryPhoto} from '../../src/types/diary';
import {colors} from '../../src/theme/tokens';

function mergeById(current: DiaryPhoto[], incoming: DiaryPhoto[]) {
  const byId = new Map(current.map(photo => [photo.id, photo]));
  for (const photo of incoming) byId.set(photo.id, photo);
  return [...byId.values()];
}

function getSessionSelectedPhotoIds(draft: { selectedPhotoIds: string[]; sourceDiaryId?: string } | undefined, mode?: string) {
  if (!draft) return [];
  if (mode === 'replace' && !draft.sourceDiaryId) return [];
  return draft.selectedPhotoIds;
}

export default function Album(){
  const {draft,params,router}=useDraftRoute();
  const photoPermissionStatus=useAppStore(state=>state.photoPermissionStatus);
  const photoCatalogVersion=useAppStore(state=>state.photoCatalogVersion);
  const [selected,setSelected]=useState<string[]>(getSessionSelectedPhotoIds(draft,params.mode));
  const [group,setGroup]=useState(false);
  const [albums,setAlbums]=useState<DevicePhotoAlbum[]>([]);
  const [activeAlbumId,setActiveAlbumId]=useState<string>(ALL_PHOTOS_ALBUM_ID);
  const [photos,setPhotos]=useState<DiaryPhoto[]>([]);
  const [loading,setLoading]=useState(false);
  const [loadingMore,setLoadingMore]=useState(false);
  const [confirming,setConfirming]=useState(false);
  const [error,setError]=useState<string>();
  const [confirmationError,setConfirmationError]=useState<string>();
  const [endCursor,setEndCursor]=useState<string>();
  const [hasNextPage,setHasNextPage]=useState(false);
  const requestVersionRef=useRef(0);

  const validSelected=useMemo(()=>sanitizePhotoIds(selected,appSelectors.photos),[photoCatalogVersion,selected]);
  const selectedSet=useMemo(()=>new Set(validSelected),[validSelected]);
  const canContinue=canGenerate(validSelected);
  const currentAlbum=albums.find(album=>album.id===activeAlbumId)??albums[0];
  const hasPhotoPermission=photoPermissionStatus==='full'||photoPermissionStatus==='limited';

  useEffect(()=>{setSelected(getSessionSelectedPhotoIds(draft,params.mode))},[draft?.id,draft?.selectedPhotoIds,params.mode]);

  const loadAlbum=useCallback(async (targetAlbumId?: string, append = false)=>{
    if(!draft)return;
    const startedAt=Date.now();
    const requestVersion=append?requestVersionRef.current:requestVersionRef.current+1;
    if(!append)requestVersionRef.current=requestVersion;
    if(append)setLoadingMore(true);else{setLoading(true);setError(undefined);}
    try{
      const permission=await getPhotoPermissionStatus();
      useAppStore.getState().setPhotoPermissionStatus(permission.status);
      if(!permission.granted)throw new Error('E_NO_PERMISSIONS');
      const deviceAlbums=await listDevicePhotoAlbums();
      if(!append){
        setAlbums(deviceAlbums);
      }
      const fallbackAlbumId=targetAlbumId??currentAlbum?.id??deviceAlbums[0]?.id??ALL_PHOTOS_ALBUM_ID;
      const page=await listDevicePhotos({albumId:fallbackAlbumId,after:append?endCursor:undefined});
      if(requestVersion!==requestVersionRef.current)return;
      useAppStore.getState().registerPhotos(page.photos);
      setActiveAlbumId(page.album.id);
      setPhotos(current=>append?mergeById(current,page.photos):page.photos);
      setHasNextPage(page.hasNextPage);
      setEndCursor(page.endCursor);
      if(!append)setError(undefined);
    }catch(loadError){
      if(requestVersion!==requestVersionRef.current)return;
      const errorCode=loadError instanceof Error&&/^[A-Za-z0-9_.:-]{1,80}$/.test(loadError.message)
        ? loadError.message
        : undefined;
      logDevDiagnostic('warn','photos.album.read.failed',{
        phase:'load_album',
        outcome:append?'next_page':'initial_page',
        durationMs:Date.now()-startedAt,
        ...(errorCode?{errorCode}:{}),
        ...(loadError instanceof Error?{errorName:loadError.name}:{}),
      });
      useAppStore.getState().logIssue(`照片读取失败：${loadError instanceof Error ? loadError.message : 'unknown error'}`);
      setError(loadError instanceof Error?loadError.message:'unknown error');
      if(!append)setPhotos([]);
    }finally{
      if(requestVersion===requestVersionRef.current){
        setLoading(false);
        setLoadingMore(false);
      }
    }
  },[activeAlbumId,draft,endCursor]);

  useEffect(()=>{
    if(!draft)return;
    requestVersionRef.current+=1;
    setAlbums([]);
    setActiveAlbumId(ALL_PHOTOS_ALBUM_ID);
    setPhotos([]);
    setError(undefined);
    setEndCursor(undefined);
    setHasNextPage(false);
    void loadAlbum(undefined,false);
  },[draft?.id]);

  if(!draft)return <Screen><Empty title="这段旅程还没有开始" detail="回到首页，选择想记录的照片。" home/></Screen>;
  const draftId=draft.id;

  function toggle(id:string){
    setConfirmationError(undefined);
    setSelected(current=>current.includes(id)?current.filter(item=>item!==id):[...current,id]);
  }
  function cancel(){if(params.mode==='replace')router.back();else leaveDraft(draftId,()=>router.replace('/(tabs)/home'))}
  async function handleConfirm(){
    if(confirming)return;
    setConfirmationError(undefined);
    const nextSelected=sanitizePhotoIds(selected,appSelectors.photos);
    if(!canGenerate(nextSelected))return;
    setConfirming(true);
    try{
      const validation=await validateReadableDevicePhotoIds(nextSelected);
      if(validation.invalidIds.length){
        setSelected(validation.validIds);
        setConfirmationError(`有${validation.invalidIds.length}张照片已不可用，已从当前选择中移除。`);
        return;
      }
      useAppStore.getState().setDraftPhotos(draftId,validation.validIds);
      if(params.mode==='replace'){router.back();return;}
      router.push({pathname:'/create/template',params:{draftId,...(params.characterSelected==='true'?{characterSelected:params.characterSelected}:{})}});
    }catch{
      setConfirmationError('当前无法确认这些照片，请重新加载相册后再试。');
    }finally{
      setConfirming(false);
    }
  }
  function handleScroll(event: NativeSyntheticEvent<NativeScrollEvent>){
    if(!hasNextPage||loadingMore||loading)return;
    const {contentOffset,contentSize,layoutMeasurement}=event.nativeEvent;
    const distanceToBottom=contentSize.height-(contentOffset.y+layoutMeasurement.height);
    if(distanceToBottom<180)void loadAlbum(activeAlbumId,true);
  }
  function renderContent(){
    if(loading&&!photos.length)return <View style={s.state}><Text style={s.stateTitle}>正在读取相册</Text><Text style={s.stateBody}>稍等一下，照片会按拍摄时间排好。</Text></View>;
    if(!hasPhotoPermission&&!photos.length)return <View style={s.state}><Text style={s.stateTitle}>需要相册权限</Text><Text style={s.stateBody}>请先允许访问相册，再继续选择照片。</Text><Button label="返回授权说明" onPress={()=>router.replace({pathname:'/permission/photos',params:{draftId,...(params.characterSelected==='true'?{characterSelected:params.characterSelected}:{})}})}/></View>;
    if(error&&!photos.length)return <View style={s.state}><Text style={s.stateTitle}>照片读取失败</Text><Text style={s.stateBody}>这次没有把相册读出来，请再试一次。</Text><Button label="重新加载" onPress={()=>void loadAlbum(activeAlbumId,false)}/></View>;
    if(!photos.length)return <View style={s.state}><Text style={s.stateTitle}>相册里还没有可用照片</Text><Text style={s.stateBody}>等你拍下新的回忆，我们再来继续。</Text></View>;
    return <ScrollView testID="album-photo-scroll" style={s.list} contentContainerStyle={s.listContent} onScroll={handleScroll} scrollEventThrottle={16} showsVerticalScrollIndicator={false}><View style={s.grid}>{photos.map(photo=><Pressable key={photo.id} accessibilityLabel={photo.title} accessibilityRole="checkbox" accessibilityState={{checked:selectedSet.has(photo.id)}} style={s.cell} onPress={()=>toggle(photo.id)}><Photo id={photo.id} style={s.photo}/><View style={[s.check,selectedSet.has(photo.id)&&s.checked]}>{selectedSet.has(photo.id)?<Ionicons name="checkmark" color="white" size={16}/>:null}</View></Pressable>)}</View>{error?<Text style={s.inlineFeedback}>加载更多失败了，已保留当前选择，可继续下拉重试。</Text>:null}{loadingMore?<Text style={s.inlineFeedback}>正在加载更多照片…</Text>:null}</ScrollView>;
  }

  return <Screen
    scroll={false}
    contentStyle={s.page}
    header={<View style={s.header}><View style={s.bar}><Pressable onPress={cancel}><Text style={s.cancel}>取消</Text></Pressable><Text style={s.count}>已选 <Text style={{color:colors.brandStrong}}>{validSelected.length}</Text> 张</Text><View style={{width:28}}/></View><Pressable style={s.group} onPress={()=>setGroup(true)}><Text style={s.title}>{currentAlbum?.title??'全部照片'}</Text><Ionicons name="chevron-down" size={17}/></Pressable></View>}
    footer={<View style={s.footer}>{confirmationError?<Text style={s.errorNote}>{confirmationError}</Text>:null}<Text style={s.note}>{canContinue?'照片会按旅程顺序整理进日记':'至少选择 3 张照片，让回忆更完整'}</Text><Button disabled={!canContinue||confirming} label={params.mode==='replace'?'使用这些照片':'生成日记'} onPress={()=>{void handleConfirm();}}/></View>}
  >{renderContent()}<Sheet visible={group} title="选择相册" onClose={()=>setGroup(false)}>{albums.map(album=><Pressable key={album.id} onPress={()=>{setGroup(false);void loadAlbum(album.id,false);}} style={s.albumOption}><Text style={s.albumOptionText}>{album.id===activeAlbumId?'✓ ':''}{album.title} · {album.assetCount} 张</Text></Pressable>)}</Sheet></Screen>}

const s=StyleSheet.create({page:{flex:1,paddingBottom:12,gap:0},header:{paddingTop:9,paddingBottom:10,gap:8,backgroundColor:colors.background},bar:{flexDirection:'row',justifyContent:'space-between',alignItems:'center'},cancel:{fontSize:14,color:colors.textPrimary},count:{fontSize:17,fontWeight:'600',color:colors.textPrimary},group:{flexDirection:'row',gap:8,alignItems:'center',paddingVertical:4},title:{fontSize:17,fontWeight:'600',color:colors.textPrimary},list:{flex:1},listContent:{paddingTop:6,paddingBottom:14},grid:{flexDirection:'row',flexWrap:'wrap',gap:8},cell:{width:'31.85%',aspectRatio:0.89},photo:{height:'100%',width:'100%',borderRadius:10},check:{position:'absolute',top:6,right:6,width:23,height:23,borderRadius:13,borderWidth:1.5,borderColor:'white',backgroundColor:'rgba(0,0,0,0.12)',alignItems:'center',justifyContent:'center'},checked:{backgroundColor:colors.brandStrong},footer:{gap:12,paddingTop:8,backgroundColor:colors.background},note:{fontSize:11,textAlign:'center',color:colors.textMuted},errorNote:{fontSize:12,lineHeight:18,textAlign:'center',color:colors.brandStrong},state:{flex:1,alignItems:'center',justifyContent:'center',gap:10,paddingHorizontal:24},stateTitle:{fontSize:17,fontWeight:'600',color:colors.textPrimary},stateBody:{fontSize:13,lineHeight:20,textAlign:'center',color:colors.textMuted},inlineFeedback:{paddingTop:14,fontSize:12,lineHeight:18,textAlign:'center',color:colors.textMuted},albumOption:{paddingVertical:8},albumOptionText:{fontSize:16,color:colors.textPrimary}});
