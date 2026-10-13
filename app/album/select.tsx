import {Ionicons} from '@expo/vector-icons';
import {useEffect,useState} from 'react';
import {Pressable,ScrollView,StyleSheet,Text,View} from 'react-native';
import {Screen} from '../../src/components/layout/screen';
import {Button} from '../../src/components/common/button';
import {Empty,Sheet} from '../../src/components/common/design-ui';
import {Photo} from '../../src/components/diary/photo';
import {useDraftRoute,leaveDraft} from '../../src/hooks/use-diary-flow';
import {useAppStore,appSelectors} from '../../src/store/use-app-store';
import {colors} from '../../src/theme/tokens';
export default function Album(){const {draft,params,router}=useDraftRoute();const [selected,setSelected]=useState<string[]>(draft?.selectedPhotoIds??[]);const [group,setGroup]=useState(false);useEffect(()=>{setSelected(draft?.selectedPhotoIds??[])},[draft?.id]);
if(!draft)return <Screen><Empty title="这段旅程还没有开始" detail="回到首页，选择想记录的照片。" home/></Screen>;
function toggle(id:string){setSelected(v=>v.includes(id)?v.filter(x=>x!==id):[...v,id])}
function cancel(){if(params.mode==='replace')router.back();else leaveDraft(draft!.id,()=>router.replace('/(tabs)/home'))}
const photos=appSelectors.photos.slice(0,20);
return <Screen
  scroll={false}
  contentStyle={s.page}
  header={<View style={s.header}><View style={s.bar}><Pressable onPress={cancel}><Text style={s.cancel}>取消</Text></Pressable><Text style={s.count}>已选 <Text style={{color:colors.brandStrong}}>{selected.length}</Text> 张</Text><View style={{width:28}}/></View><Pressable style={s.group} onPress={()=>setGroup(true)}><Text style={s.title}>2024年9月 · 台南慢游</Text><Ionicons name="chevron-down" size={17}/></Pressable></View>}
  footer={<View style={s.footer}><Text style={s.note}>{selected.length<3?'至少选择 3 张照片，让回忆更完整':'照片会按旅程顺序整理进日记'}</Text><Button disabled={selected.length<3} label={params.mode==='replace'?'使用这些照片':'生成日记'} onPress={()=>{useAppStore.getState().setDraftPhotos(draft.id,selected);if(params.mode==='replace')router.back();else router.push({pathname:'/create/template',params:{draftId:draft.id}})}}/></View>}
><ScrollView style={s.list} contentContainerStyle={s.listContent} showsVerticalScrollIndicator={false}><View style={s.grid}>{photos.map(p=><Pressable key={p.id} accessibilityLabel={p.title} accessibilityRole="checkbox" accessibilityState={{checked:selected.includes(p.id)}} style={s.cell} onPress={()=>toggle(p.id)}><Photo id={p.id} style={s.photo}/><View style={[s.check,selected.includes(p.id)&&s.checked]}>{selected.includes(p.id)?<Ionicons name="checkmark" color="white" size={16}/>:null}</View></Pressable>)}</View></ScrollView><Sheet visible={group} title="选择相册" onClose={()=>setGroup(false)}><Pressable onPress={()=>setGroup(false)}><Text style={s.title}>✓ 2024年9月 · 台南慢游 · 20 张</Text></Pressable></Sheet></Screen>}
const s=StyleSheet.create({page:{flex:1,paddingBottom:12,gap:0},header:{paddingTop:9,paddingBottom:10,gap:8,backgroundColor:colors.background},bar:{flexDirection:'row',justifyContent:'space-between',alignItems:'center'},cancel:{fontSize:14,color:colors.textPrimary},count:{fontSize:17,fontWeight:'600',color:colors.textPrimary},group:{flexDirection:'row',gap:8,alignItems:'center',paddingVertical:4},title:{fontSize:17,fontWeight:'600',color:colors.textPrimary},list:{flex:1},listContent:{paddingTop:6,paddingBottom:14},grid:{flexDirection:'row',flexWrap:'wrap',gap:8},cell:{width:'31.85%',aspectRatio:0.89},photo:{height:'100%',width:'100%',borderRadius:10},check:{position:'absolute',top:6,right:6,width:23,height:23,borderRadius:13,borderWidth:1.5,borderColor:'white',backgroundColor:'rgba(0,0,0,0.12)',alignItems:'center',justifyContent:'center'},checked:{backgroundColor:colors.brandStrong},footer:{gap:12,paddingTop:8,backgroundColor:colors.background},note:{fontSize:11,textAlign:'center',color:colors.textMuted}});
