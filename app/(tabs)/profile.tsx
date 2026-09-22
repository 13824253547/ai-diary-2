import {Ionicons} from '@expo/vector-icons';
import {Image,Pressable,StyleSheet,Text,View,ScrollView} from 'react-native';
import {useRouter} from 'expo-router';
import {LinearGradient} from 'expo-linear-gradient';
import {Screen} from '../../src/components/layout/screen';
import {Section} from '../../src/components/common/design-ui';
import {BottomTabs} from '../../src/components/navigation/bottom-tabs';
import {useAppStore,getDiaryStatistics} from '../../src/store/use-app-store';
import {art} from '../../src/theme/assets';
import {colors} from '../../src/theme/tokens';
import {GrowthEntryCard} from '../../src/components/profile/growth-entry-card';
export default function Profile(){const router=useRouter();const diaries=useAppStore(s=>s.diaries);const count=getDiaryStatistics(diaries).diaries;
return <Screen footer={<BottomTabs current="profile" />}><View style={s.icons}>{(['notifications-outline','settings-outline'] as const).map((v,i)=><View key={v} accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={s.iconShell}><Ionicons name={v} size={24} color={colors.textPrimary}/></View>)}</View><View style={s.user}><Image source={art.personSelf} style={s.avatar}/><View style={{gap:8}}><Text style={s.name}>橘子的日记本 <Text style={s.vip}>♛ VIP</Text></Text><Text style={s.small}>记录生活，遇见美好 ✨</Text></View></View>
<Pressable onPress={()=>router.push('/(tabs)/memories')}><LinearGradient colors={['#FF9D2D','#FFDDA4']} start={{x:0,y:0}} end={{x:1,y:1}} style={s.world}><View style={{zIndex:1,gap:12}}><Text style={s.white}>我的小世界</Text><Text style={{color:'white',fontSize:13}}>已积累 {count} 篇记录</Text><View style={s.pill}><Text style={s.small}>回忆足迹 ›</Text></View></View><Image source={art.world} resizeMode="contain" style={s.worldArt}/></LinearGradient></Pressable>
<GrowthEntryCard onPress={()=>router.push('/profile/insights')}/>
<Section title="月度装订" action="查看全部" onPress={()=>router.push('/profile/monthly')}/><ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{gap:10}}>{[art.bookOrange,art.bookBlue,art.bookGreen,art.bookPink].map((a,i)=><Pressable key={i} onPress={()=>router.push({pathname:'/profile/monthly',params:{month:String(8-i)}})}><Image source={a} style={{width:87,height:128,borderRadius:7}} resizeMode="cover"/></Pressable>)}</ScrollView></Screen>}
const s=StyleSheet.create({icons:{flexDirection:'row',justifyContent:'flex-end',gap:20,paddingVertical:5},iconShell:{width:24,height:24,alignItems:'center',justifyContent:'center'},user:{flexDirection:'row',gap:14,alignItems:'center',marginBottom:8},avatar:{width:67,height:67,borderRadius:40},name:{fontSize:19,fontWeight:'600',color:colors.textPrimary},vip:{fontSize:11,color:'#D79540'},small:{fontSize:13,color:colors.textSecondary,lineHeight:22},world:{height:213,borderRadius:22,padding:20,overflow:'hidden'},worldArt:{position:'absolute',width:230,height:230,right:-8,bottom:-22},white:{fontSize:28,fontWeight:'700',color:'white'},pill:{alignSelf:'flex-start',backgroundColor:'#FFF9EE',borderRadius:25,paddingHorizontal:15,paddingVertical:7,marginTop:35},insight:{flexDirection:'row',borderWidth:1,borderColor:colors.border,borderRadius:22,padding:18,alignItems:'center',gap:5},title:{fontSize:22,fontWeight:'600',color:colors.textPrimary}});
