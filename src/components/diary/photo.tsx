import {useEffect,useMemo,useState} from 'react';
import {Image,StyleSheet,Text,View,type ImageSourcePropType,type StyleProp,type ViewStyle} from 'react-native';
import {appSelectors,useAppStore} from '../../store/use-app-store';
import {getDiaryPhotoContentUrl} from '../../services/material-photo-api';

export function Photo({id,diaryId,style,anonymous=false}:{id:string;diaryId?:string;style?:StyleProp<ViewStyle>;anonymous?:boolean}){
  useAppStore(state=>state.photoCatalogVersion);
  const photo=appSelectors.getPhotoById(id);
  const [failed,setFailed]=useState(false);
  const [size,setSize]=useState({width:0,height:0});
  const source=useMemo<ImageSourcePropType|undefined>(()=> {
    const uri=diaryId&&photo?.remoteHeaders&&/^https?:\/\//i.test(photo.uri??'')
      ?getDiaryPhotoContentUrl(diaryId,id)
      :photo?.localUri??photo?.uri;
    return uri?{uri,headers:photo?.remoteHeaders}:photo?.image;
  },[diaryId,id,photo?.image,photo?.localUri,photo?.remoteHeaders,photo?.uri]);
  const sourceSize=useMemo(()=>{
    if(photo?.image)return Image.resolveAssetSource(photo.image);
    if(photo?.width&&photo?.height)return {width:photo.width,height:photo.height};
    return undefined;
  },[photo?.height,photo?.image,photo?.width]);
  useEffect(()=>{setFailed(false);},[diaryId,id,source]);
  if(!photo||!source||failed)return <View accessibilityLabel="图片暂时不可用" style={[s.frame,s.fallback,style]}><Text style={s.fallbackText}>图片暂时不可用</Text></View>;
  const scale=sourceSize?Math.max(size.width/sourceSize.width,size.height/sourceSize.height):1;
  const dx=sourceSize?(size.width-sourceSize.width*scale)/2:0;
  const dy=sourceSize?(size.height-sourceSize.height*scale)/2:0;
  return <View onLayout={e=>setSize(e.nativeEvent.layout)} style={[s.frame,style]}><Image onError={()=>setFailed(true)} source={source} resizeMode="cover" style={s.image} testID={`diary-photo-${id}`}/>{anonymous&&sourceSize?photo.faceRects?.map((rect,index)=><View key={index} accessibilityLabel="人物已匿名遮挡" style={{position:'absolute',left:rect.x*sourceSize.width*scale+dx,top:rect.y*sourceSize.height*scale+dy,width:rect.width*sourceSize.width*scale,height:rect.height*sourceSize.height*scale,backgroundColor:'#C0B6AA',borderRadius:8,opacity:1}}/>):null}</View>}

const s=StyleSheet.create({
  frame:{overflow:'hidden',backgroundColor:'#EFE3D5'},
  image:{width:'100%',height:'100%'},
  fallback:{alignItems:'center',justifyContent:'center',paddingHorizontal:12},
  fallbackText:{fontSize:12,lineHeight:18,color:'#8B7866',textAlign:'center'},
});
