import {Ionicons} from '@expo/vector-icons';
import {usePathname,useRouter} from 'expo-router';
import {Alert,Image,Pressable,StyleSheet,Text,View} from 'react-native';
import {colors} from '../../theme/tokens';
import {art} from '../../theme/assets';
import {useAppStore} from '../../store/use-app-store';
type Key='home'|'memories'|'pet'|'discover'|'profile';
const tabs=[{key:'home',label:'首页',icon:'home-outline'},{key:'memories',label:'回忆',icon:'book-outline'},{key:'pet',label:'萌宠',icon:'heart-outline'},{key:'discover',label:'发现',icon:'compass-outline'},{key:'profile',label:'我的',icon:'person-outline'}] as const;
export function moduleForPath(p:string):Key{if(/memories|diaries|postcard/.test(p))return 'memories';if(/profile/.test(p))return 'profile';if(/discover/.test(p))return 'discover';if(/pet|create|companion|diary|share/.test(p))return 'pet';return 'home'}
export function BottomTabs({current,variant='default'}:{current?:Key|'diaries';variant?:'default'|'warm'}={}){
 const path=usePathname(),router=useRouter();const active=current==='diaries'?'memories':current??moduleForPath(path);
 function go(key:Key){const run=()=>router.replace(`/(tabs)/${key}` as never);const store=useAppStore.getState();const draft=store.activeDraftId?store.drafts[store.activeDraftId]:undefined;
 if(draft&&!draft.savedDiaryId&&/album|create|companion|edit|replace-photos/.test(path)) Alert.alert('离开这篇日记？','尚未保存的内容将被放弃。',[{text:'继续编辑',style:'cancel'},{text:'放弃',style:'destructive',onPress:()=>{store.discardDraft(draft.id);run()}}]);else run();}
 return <View style={[s.bar,variant==='warm'&&s.warmBar]}>{tabs.map(t=><Pressable key={t.key} accessibilityRole="tab" accessibilityLabel={t.label} accessibilityState={{selected:active===t.key}} onPress={()=>go(t.key)} style={[s.item,variant==='warm'&&s.warmItem]}>
 {t.key==='pet'?<View style={[s.pet,variant==='warm'&&s.warmPet]}><Image source={art.mascot} resizeMode="contain" style={[s.mascot,variant==='warm'&&s.warmMascot]}/></View>:<Ionicons name={variant==='warm'?(t.key==='profile'&&active==='profile'?'person':t.key==='memories'?'mail-open-outline':t.icon):t.icon} size={variant==='warm'?26:25} color={active===t.key?'#FF9400':variant==='warm'?'#967E66':colors.textSecondary}/>}
 <Text style={[s.label,variant==='warm'&&s.warmLabel,active===t.key&&{color:variant==='warm'?'#FF9400':colors.brandStrong}]}>{t.label}</Text></Pressable>)}</View>;
}
const s=StyleSheet.create({bar:{height:68,flexDirection:'row',borderTopWidth:1,borderTopColor:colors.border,borderTopLeftRadius:20,borderTopRightRadius:20,backgroundColor:colors.surface,alignItems:'center'},item:{flex:1,alignItems:'center',justifyContent:'flex-end',gap:4,height:58,paddingBottom:3},label:{fontSize:10,color:colors.textSecondary},pet:{width:60,height:60,borderRadius:32,backgroundColor:colors.surface,marginTop:-20,alignItems:'center',justifyContent:'center',borderWidth:1,borderColor:colors.border},mascot:{width:53,height:54},warmBar:{height:72,borderTopWidth:0,borderTopLeftRadius:26,borderTopRightRadius:26,backgroundColor:'#FFFCF7'},warmItem:{height:64,paddingBottom:5},warmLabel:{fontSize:12,color:'#917B65'},warmPet:{width:68,height:65,marginTop:-24,borderWidth:0,backgroundColor:'transparent'},warmMascot:{width:68,height:69}});
