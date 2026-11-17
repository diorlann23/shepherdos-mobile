import { useEffect, useState } from 'react';
import { View } from 'react-native';
import { SplashScreen, Stack, ThemeProvider, DarkTheme, DefaultTheme } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { AuthProvider, useAuth } from '@/lib/auth';
import { LockProvider, useLock } from '@/lib/lock';
import { openDb } from '@/lib/db';
import { loadSecure } from '@/lib/secure';
import { LockScreen } from '@/screens/lock';
import { useTheme } from '@/theme';

void SplashScreen.preventAutoHideAsync();

export default function RootLayout() {
  const [ready, setReady] = useState(false);
  useEffect(() => {
    // The keychain and the database must be open before anything reads them.
    Promise.all([loadSecure(), openDb()]).finally(() => setReady(true));
  }, []);
  if (!ready) return null;
  return (
    <SafeAreaProvider>
      <AuthProvider>
        <Root />
      </AuthProvider>
    </SafeAreaProvider>
  );
}

function Root() {
  const { state } = useAuth();
  const { colors, dark } = useTheme();
  useEffect(() => {
    if (state !== 'loading') void SplashScreen.hideAsync();
  }, [state]);
  if (state === 'loading') return null;
  const base = dark ? DarkTheme : DefaultTheme;
  return (
    <ThemeProvider value={{ ...base, colors: { ...base.colors, background: colors.background, card: colors.card, text: colors.text, border: colors.border, primary: colors.primary } }}>
      {/* Every screen starts with a navy band, so the clock and battery are always white. */}
      <StatusBar style="light" />
      <LockProvider active={state === 'ready'}>
        <View style={{ flex: 1, backgroundColor: colors.background }}>
          <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.background } }}>
            <Stack.Protected guard={state === 'signed-out'}>
              <Stack.Screen name="sign-in" />
            </Stack.Protected>
            <Stack.Protected guard={state === 'two-factor'}>
              <Stack.Screen name="two-factor" />
            </Stack.Protected>
            <Stack.Protected guard={state === 'choose-church'}>
              <Stack.Screen name="choose-church" />
            </Stack.Protected>
            <Stack.Protected guard={state === 'closed'}>
              <Stack.Screen name="closed" />
            </Stack.Protected>
            <Stack.Protected guard={state === 'ready'}>
              <Stack.Screen name="(app)" />
            </Stack.Protected>
          </Stack>
          <LockOverlay />
        </View>
      </LockProvider>
    </ThemeProvider>
  );
}

function LockOverlay() {
  const { locked } = useLock();
  return locked ? <LockScreen /> : null;
}
