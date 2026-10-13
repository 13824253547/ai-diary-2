import type { PropsWithChildren, ReactNode } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { colors, layout } from '../../theme/tokens';
type ScreenProps=PropsWithChildren<{scroll?:boolean;backgroundColor?:string;header?:ReactNode;footer?:ReactNode;contentStyle?:StyleProp<ViewStyle>}>;
export function Screen({children,scroll=true,backgroundColor=colors.background,header,footer,contentStyle}:ScreenProps){
 const bottom=footer;
 return <SafeAreaView edges={['top']} style={[styles.safe,{backgroundColor}]}><KeyboardAvoidingView behavior={Platform.OS==='ios'?'padding':undefined} style={styles.shell}>
 {header?<View style={[styles.header,{backgroundColor}]}>{header}</View>:null}
 {scroll?<ScrollView keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false} contentContainerStyle={[styles.content,contentStyle]}>{children}</ScrollView>:<View style={[styles.content,{flex:1},contentStyle]}>{children}</View>}
 {bottom?<SafeAreaView edges={['bottom']} style={styles.footer}>{bottom}</SafeAreaView>:<SafeAreaView edges={['bottom']} style={[styles.bottomInset,{backgroundColor}]}/>}
 </KeyboardAvoidingView></SafeAreaView>;
}
const styles=StyleSheet.create({safe:{flex:1},shell:{flex:1,width:'100%',maxWidth:layout.maxWidth,alignSelf:'center'},header:{paddingHorizontal:layout.screenEdge,paddingTop:10},content:{paddingHorizontal:layout.screenEdge,paddingTop:10,paddingBottom:20,gap:16},footer:{backgroundColor:colors.surface},bottomInset:{width:'100%'}});
