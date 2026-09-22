import {Stack} from 'expo-router';
import {StatusBar} from 'expo-status-bar';
import {GestureHandlerRootView} from 'react-native-gesture-handler';
import {SafeAreaProvider} from 'react-native-safe-area-context';
import {colors} from '../src/theme/tokens';
export default function RootLayout(){return <GestureHandlerRootView style={{flex:1}}><SafeAreaProvider><StatusBar style="dark"/><Stack screenOptions={{headerShown:false,contentStyle:{backgroundColor:colors.background},gestureEnabled:false}}><Stack.Screen name="permission/photos" options={{presentation:'transparentModal',animation:'fade',contentStyle:{backgroundColor:'transparent'}}}/><Stack.Screen name="modal/more-actions" options={{presentation:'transparentModal',animation:'fade',contentStyle:{backgroundColor:'transparent'}}}/></Stack></SafeAreaProvider></GestureHandlerRootView>}
