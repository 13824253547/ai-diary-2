import { useEffect } from 'react';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { AppState, Platform } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { ensureDeviceIdentity } from '../src/services/device-identity';
import {
  flushDevDiagnostics,
  installDevDiagnosticErrorHandler,
  logDevDiagnostic,
} from '../src/services/dev-diagnostics';
import { useAppStore } from '../src/store/use-app-store';
import { colors } from '../src/theme/tokens';

async function runHydrationPhase(phase: string, task: () => Promise<unknown>) {
  const startedAt = Date.now();
  logDevDiagnostic('info', 'app.hydration.phase_started', { phase });
  try {
    await task();
    logDevDiagnostic('info', 'app.hydration.phase_completed', {
      phase,
      durationMs: Date.now() - startedAt,
    });
  } catch (error) {
    logDevDiagnostic('error', 'app.hydration.phase_failed', {
      phase,
      durationMs: Date.now() - startedAt,
      ...(error instanceof Error ? { errorName: error.name } : {}),
    });
    throw error;
  }
}

async function warmDeviceIdentity() {
  let timeout: ReturnType<typeof setTimeout> | undefined;
  try {
    await Promise.race([
      ensureDeviceIdentity(),
      new Promise<void>(resolve => {
        timeout = setTimeout(() => {
          logDevDiagnostic('warn', 'identity.warmup.timeout', {
            phase: 'identity',
            durationMs: 8_000,
          });
          resolve();
        }, 8_000);
      }),
    ]);
  } catch (error) {
    logDevDiagnostic('warn', 'identity.warmup.failed', {
      outcome: 'non_blocking',
      ...(error instanceof Error ? { errorName: error.name } : {}),
    });
  } finally {
    if (timeout) clearTimeout(timeout);
  }
}

export default function RootLayout() {
  useEffect(() => {
    installDevDiagnosticErrorHandler();
    logDevDiagnostic('info', 'app.lifecycle.started', { platform: Platform.OS });
    const appStateSubscription = AppState.addEventListener('change', state => {
      logDevDiagnostic('info', 'app.lifecycle.state', { outcome: state });
      if (state !== 'active') void flushDevDiagnostics();
    });
    void (async () => {
      await runHydrationPhase(
        'photo_permission',
        () => useAppStore.getState().hydratePhotoPermission(),
      );
      await runHydrationPhase('drafts', () => useAppStore.getState().hydrateDrafts());
      await runHydrationPhase('device_identity', warmDeviceIdentity);
      await runHydrationPhase('memories', () => useAppStore.getState().hydrateMemories());
      logDevDiagnostic('info', 'app.hydration.completed', { platform: Platform.OS });
    })();
    return () => appStateSubscription.remove();
  }, []);

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <StatusBar style="dark" />
        <Stack
          screenOptions={{
            headerShown: false,
            contentStyle: { backgroundColor: colors.background },
            gestureEnabled: false,
          }}
        >
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
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
