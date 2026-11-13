import { useEffect } from 'react';
import { Stack } from 'expo-router';
import { startAutoSync } from '@/lib/sync';
import { useTheme } from '@/theme';

export default function AppLayout() {
  const { colors } = useTheme();
  // Signed in to a church: keep its data on the phone fresh.
  useEffect(() => startAutoSync(), []);
  return (
    <Stack screenOptions={{ headerTintColor: colors.primary, headerStyle: { backgroundColor: colors.background }, headerShadowVisible: false, contentStyle: { backgroundColor: colors.background } }}>
      <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
      <Stack.Screen name="member/[id]" options={{ title: 'Member', headerBackTitle: 'Members' }} />
      <Stack.Screen name="outbox" options={{ title: 'Waiting to sync' }} />
    </Stack>
  );
}
