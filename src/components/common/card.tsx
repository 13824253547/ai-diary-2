import type {PropsWithChildren} from 'react';
import {View,type StyleProp,type ViewStyle} from 'react-native';
import {colors,shadow} from '../../theme/tokens';
export function Card({children,style,muted=false}:PropsWithChildren<{style?:StyleProp<ViewStyle>;muted?:boolean}>){return <View style={[{padding:16,borderRadius:16,borderWidth:1,borderColor:colors.border,backgroundColor:muted?colors.surfaceAlt:colors.surface,gap:12},shadow.soft,style]}>{children}</View>}
