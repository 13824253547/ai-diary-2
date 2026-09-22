import {useCallback} from 'react';
import {Image,StyleSheet,Text,View} from 'react-native';
import {useFocusEffect} from 'expo-router';
import {Ionicons} from '@expo/vector-icons';
import {LinearGradient} from 'expo-linear-gradient';
import {Screen} from '../../src/components/layout/screen';
import {TopBar} from '../../src/components/layout/top-bar';
import {Empty} from '../../src/components/common/design-ui';
import {useDraftRoute} from '../../src/hooks/use-diary-flow';
import {useAppStore} from '../../src/store/use-app-store';
import {art} from '../../src/theme/assets';
import {colors} from '../../src/theme/tokens';
export default function Generating(){const {draft,router}=useDraftRoute();const id=draft?.id;
useFocusEffect(useCallback(()=>{if(!id)return;const st=useAppStore.getState();let done=false;const next=()=>{if(done)return;done=true;const d=useAppStore.getState().drafts[id];if(d)router.replace({pathname:d.people.length?'/companion/naming':'/diary/[id]/edit',params:d.people.length?{draftId:id}:{id:'new',draftId:id}})};if(st.drafts[id].generation.status==='complete'){next();return}const round=st.startGeneration(id);if(round===undefined)return;let p=0;const timer=setInterval(()=>{p+=13;if(p>=100){clearInterval(timer);st.finishGeneration(id,round);next()}else st.advanceDraftGeneration(id,round,p)},450);return()=>{clearInterval(timer);useAppStore.getState().pauseGeneration(id,round)}},[id,router]));
if(!draft)return <Screen><Empty title="没有待生成的日记" home/></Screen>;const p=draft.generation.progress;return <Screen scroll={false}><TopBar onBackPress={()=>router.back()}/><View style={s.content}><Image source={art.generationHero} style={s.hero} resizeMode="contain"/><Text style={s.title}>小橘正在帮你{'\n'}生成回忆日记中…</Text><View style={s.track}><LinearGradient colors={[colors.brandDeep,colors.brand]} start={{x:0,y:0}} end={{x:1,y:0}} style={[s.fill,{width:`${Math.max(p,9)}%`}]}/><Text style={s.percent}>{p}%</Text></View>{['正在分析照片内容','正在整理这次旅程','正在将美好串成文字…'].map((t,i)=>{const ready=p>=(i+1)*30;return <View style={s.phase} key={t}><Ionicons name={ready?'checkmark-circle':'ellipse-outline'} size={18} color={ready?colors.success:colors.brand}/><Ionicons name={(['images-outline','location-outline','create-outline'] as const)[i]} size={18} color={colors.brand}/><Text style={[s.phaseText,{opacity:ready?1:0.65}]}>{t}</Text>{ready?<Ionicons name="checkmark" size={16} color={colors.success}/>:null}</View>})}<Text style={s.note}>找到了 3 个地点 · {draft.selectedPhotoIds.length} 张照片 · 让回忆有温度</Text></View></Screen>}
const s=StyleSheet.create({content:{flex:1,alignItems:'center',justifyContent:'center',paddingBottom:55,gap:16},hero:{width:290,height:292},title:{fontSize:24,lineHeight:32,fontWeight:'700',color:colors.brandStrong,textAlign:'center'},track:{width:'80%',height:19,borderRadius:12,backgroundColor:'#F2E8D7',overflow:'hidden'},fill:{height:'100%',borderRadius:12},percent:{position:'absolute',alignSelf:'center',top:2,fontSize:11,color:'white',fontWeight:'600'},phase:{flexDirection:'row',gap:12,alignItems:'center',width:'79%'},phaseText:{flex:1,fontSize:12,color:colors.textSecondary},note:{fontSize:10,color:colors.textMuted,marginTop:7}});
