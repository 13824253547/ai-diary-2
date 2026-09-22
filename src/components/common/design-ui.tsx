import {Ionicons} from '@expo/vector-icons';
import type {PropsWithChildren,ReactNode} from 'react';
import {Image,Pressable,StyleSheet,Text,View} from 'react-native';
import {useRouter} from 'expo-router';
import {colors} from '../../theme/tokens';
import {art} from '../../theme/assets';
import {Button} from './button';
import {BottomSheet} from './bottom-sheet';
export function Section({title,action,onPress}: {title:string;action?:string;onPress?:()=>void}){return <View style={s.row}><Text style={s.section}>{title}</Text>{action?<Pressable onPress={onPress} accessibilityRole="button"><Text style={s.small}>{action} ›</Text></Pressable>:null}</View>}
export function Hint({children}:PropsWithChildren){return <View style={s.hint}><Image source={art.mascot} style={s.pet} resizeMode="contain"/><Text style={s.hintText}>{children}</Text></View>}
export function Empty({title='还没有内容',detail='换个条件，再看看吧',home=false}:{title?:string;detail?:string;home?:boolean}){const router=useRouter();return <View style={s.empty}><Image source={art.mascot} style={{width:100,height:110}} resizeMode="contain"/><Text style={s.section}>{title}</Text><Text style={s.small}>{detail}</Text>{home?<Button label="回到首页" onPress={()=>router.replace('/(tabs)/home')}/>:null}</View>}
export function Sheet({visible,title,onClose,children}:PropsWithChildren<{visible:boolean;title:string;onClose:()=>void}>){return <BottomSheet visible={visible} title={title} onClose={onClose} scroll>{children}</BottomSheet>}
const s=StyleSheet.create({row:{flexDirection:'row',alignItems:'center',justifyContent:'space-between',gap:8},section:{fontSize:16,fontWeight:'600',color:colors.textPrimary},small:{fontSize:12,color:colors.textSecondary,lineHeight:19},hint:{flexDirection:'row',alignItems:'center',backgroundColor:colors.surfaceAlt,borderRadius:18,borderWidth:1,borderColor:colors.border,padding:10,gap:10},pet:{width:50,height:56},hintText:{flex:1,fontSize:13,color:colors.textSecondary,lineHeight:21},empty:{padding:28,gap:16,alignItems:'center'}});
