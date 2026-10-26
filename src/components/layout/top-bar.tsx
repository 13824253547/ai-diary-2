import { Ionicons } from '@expo/vector-icons';
import type {ReactNode} from 'react';
import {Pressable,StyleSheet,Text,View} from 'react-native';
import {colors} from '../../theme/tokens';
type Props={title?:string;subtitle?:string;onBackPress?:()=>void;backDisabled?:boolean;trailing?:ReactNode;centered?:boolean};
export function TopBar({title,subtitle,onBackPress,backDisabled=false,trailing,centered=true}:Props){return <View style={s.wrap}><View style={s.row}>
 <View style={s.side}>{onBackPress?<Pressable accessibilityRole="button" accessibilityLabel="返回" accessibilityState={backDisabled?{disabled:true}:undefined} disabled={backDisabled||undefined} hitSlop={10} onPress={onBackPress} style={backDisabled?[s.back,s.backDisabled]:s.back}><Ionicons name="chevron-back" size={25} color={colors.textPrimary}/></Pressable>:null}</View>
 <Text style={[s.title,!centered&&{textAlign:'left'}]}>{title}</Text><View style={[s.side,{alignItems:'flex-end'}]}>{trailing}</View></View>{subtitle?<Text style={s.subtitle}>{subtitle}</Text>:null}</View>}
const s=StyleSheet.create({wrap:{gap:9},row:{flexDirection:'row',alignItems:'center',minHeight:40},side:{width:44},back:{height:40,justifyContent:'center'},backDisabled:{opacity:0.45},title:{flex:1,textAlign:'center',fontSize:20,fontWeight:'700',color:colors.textPrimary},subtitle:{fontSize:12,color:colors.textMuted,lineHeight:19,textAlign:'center'}});
