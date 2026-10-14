import {useEffect} from 'react';
import {Stack} from 'expo-router';
import {StatusBar} from 'expo-status-bar';
import {GestureHandlerRootView} from 'react-native-gesture-handler';
import {SafeAreaProvider} from 'react-native-safe-area-context';
import {ensureDeviceIdentity} from '../src/services/device-identity';
import {useAppStore} from '../src/store/use-app-store';
import {colors} from '../src/theme/tokens';
export default function RootLayout(){useEffect(()=>{void (async()=>{await ensureDeviceIdentity();await useAppStore.getState().hydratePhotoPermission();await useAppStore.getState().hydrateDrafts();await useAppStore.getState().hydrateMemories()})()},[]);return <GestureHandlerRootView style={{flex:1}}><SafeAreaProvider><StatusBar style="dark"/><Stack screenOptions={{headerShown:false,contentStyle:{backgroundColor:colors.background},gestureEnabled:false}}><Stack.Screen name="permission/photos" options={{presentation:'transparentModal',animation:'fade',contentStyle:{backgroundColor:'transparent'}}}/><Stack.Screen name="modal/more-actions" options={{presentation:'transparentModal',animation:'fade',contentStyle:{backgroundColor:'transparent'}}}/></Stack></SafeAreaProvider></GestureHandlerRootView>}
