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
      <Stack.Screen name="member/[id]/index" options={{ title: 'Member', headerBackTitle: 'Members' }} />
      <Stack.Screen name="member/[id]/edit" options={{ title: 'Edit member', presentation: 'modal' }} />
      <Stack.Screen name="member/new" options={{ title: 'New member', presentation: 'modal' }} />
      <Stack.Screen name="household/[id]/index" options={{ title: 'Household', headerBackTitle: 'Back' }} />
      <Stack.Screen name="household/[id]/edit" options={{ title: 'Edit household', presentation: 'modal' }} />
      <Stack.Screen name="household/new" options={{ title: 'New household', presentation: 'modal' }} />
      <Stack.Screen name="service/[id]/index" options={{ title: 'Service', headerBackTitle: 'Attendance' }} />
      <Stack.Screen name="service/new" options={{ title: 'Start a service', presentation: 'modal' }} />
      <Stack.Screen name="service/[id]/headcount" options={{ title: 'Headcount', presentation: 'modal' }} />
      <Stack.Screen name="service/[id]/visitor" options={{ title: 'First-timer', presentation: 'modal' }} />
      <Stack.Screen name="service/[id]/scan" options={{ title: 'Scan cards', headerStyle: { backgroundColor: '#000' }, headerTintColor: '#fff' }} />
      <Stack.Screen name="outbox" options={{ title: 'Waiting to sync' }} />
    </Stack>
  );
}
