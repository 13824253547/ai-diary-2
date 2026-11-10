import { useEffect } from 'react';
import { Redirect, Stack, useSegments } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { AppState, Platform } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { AccountSessionProvider, useAccountSession } from '../src/components/auth/account-session-context';
import {
  flushDevDiagnostics,
  installDevDiagnosticErrorHandler,
  logDevDiagnostic,
} from '../src/services/dev-diagnostics';
import { colors } from '../src/theme/tokens';

export default function RootLayout() {
  useEffect(() => {
    installDevDiagnosticErrorHandler();
    logDevDiagnostic('info', 'app.lifecycle.started', { platform: Platform.OS });
    const appStateSubscription = AppState.addEventListener('change', state => {
      logDevDiagnostic('info', 'app.lifecycle.state', { outcome: state });
      if (state !== 'active') void flushDevDiagnostics();
    });
    return () => appStateSubscription.remove();
  }, []);

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <StatusBar style="dark" />
        <AccountSessionProvider>
          <AuthenticatedStack />
        </AccountSessionProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

function AuthenticatedStack() {
  const { ready, session } = useAccountSession();
  const segments = useSegments();

  if (!ready) return null;
  if (!session && segments[0] !== 'auth') return <Redirect href="/auth/login" />;
  if (session && segments[0] === 'auth') return <Redirect href="/(tabs)/home" />;

  return (
    <Stack
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: colors.background },
        gestureEnabled: false,
      }}
    >
      <Stack.Screen name="auth/login" />
      <Stack.Screen name="auth/register" />
      <Stack.Screen
        name="permission/photos"
        options={{
          presentation: 'transparentModal',
          animation: 'fade',
          contentStyle: { backgroundColor: 'transparent' },
        }}
      />
      <Stack.Screen
        name="modal/more-actions"
        options={{
          presentation: 'transparentModal',
          animation: 'fade',
          contentStyle: { backgroundColor: 'transparent' },
        }}
      />
    </Stack>
  );
}
