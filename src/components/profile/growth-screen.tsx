import type { PropsWithChildren } from 'react';
import { LinearGradient } from 'expo-linear-gradient';
import { StyleSheet, type StyleProp, type ViewStyle } from 'react-native';
import { Screen } from '../layout/screen';
import { BottomTabs } from '../navigation/bottom-tabs';

/** The growth collection has its own warm paper, independent of other modules. */
export function GrowthScreen({ children, scroll = true, contentStyle }: PropsWithChildren<{ scroll?: boolean; contentStyle?: StyleProp<ViewStyle> }>) {
  return <LinearGradient colors={['#FFF4E5', '#FFF1E2', '#FFF6EA']} locations={[0, 0.55, 1]} style={s.fill}>
    <Screen backgroundColor="transparent" scroll={scroll} contentStyle={contentStyle} footer={<BottomTabs current="profile" variant="warm" />}>
      {children}
    </Screen>
  </LinearGradient>;
}
const s = StyleSheet.create({ fill: { flex: 1 } });
