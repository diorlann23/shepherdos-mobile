import { useEffect } from 'react';
import { Stack } from 'expo-router';
import { startAutoSync } from '@/lib/sync';
import { handlePushTaps, registerForPush } from '@/lib/push';
import { useAuth } from '@/lib/auth';
import { useTheme } from '@/theme';

export default function AppLayout() {
  const { colors } = useTheme();
  // Signed in to a church: keep its data on the phone fresh.
  useEffect(() => startAutoSync(), []);
  // Notifications for this church on this phone; a tap opens the screen it's about.
  const churchId = useAuth().me?.org?.id;
  useEffect(() => {
    if (churchId) void registerForPush();
  }, [churchId]);
  useEffect(() => handlePushTaps(), []);
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
      <Stack.Screen name="sheet/[id]/index" options={{ title: 'Counting sheet', headerBackTitle: 'Finance' }} />
      <Stack.Screen name="sheet/new" options={{ title: 'New counting sheet', presentation: 'modal' }} />
      <Stack.Screen name="sheet/[id]/entry" options={{ title: 'Add entry', presentation: 'modal' }} />
      <Stack.Screen name="expense/[id]" options={{ title: 'Expense', headerBackTitle: 'Finance' }} />
      <Stack.Screen name="expense/new" options={{ title: 'Request an expense', presentation: 'modal' }} />
      <Stack.Screen name="tasks/index" options={{ title: 'Tasks', headerBackTitle: 'Back' }} />
      <Stack.Screen name="tasks/[id]" options={{ title: 'Task' }} />
      <Stack.Screen name="tasks/new" options={{ title: 'New task', presentation: 'modal' }} />
      <Stack.Screen name="events/index" options={{ title: 'Events', headerBackTitle: 'Back' }} />
      <Stack.Screen name="events/[id]" options={{ title: 'Event' }} />
      <Stack.Screen name="groups/index" options={{ title: 'Groups', headerBackTitle: 'Back' }} />
      <Stack.Screen name="groups/[id]" options={{ title: 'Group' }} />
      <Stack.Screen name="notices/index" options={{ title: 'Notices', headerBackTitle: 'Back' }} />
      <Stack.Screen name="notices/[id]" options={{ title: 'Notice' }} />
      <Stack.Screen name="notices/new" options={{ title: 'New notice', presentation: 'modal' }} />
      <Stack.Screen name="firsttimers/index" options={{ title: 'First-timers', headerBackTitle: 'Back' }} />
      <Stack.Screen name="firsttimers/[id]" options={{ title: 'First-timer' }} />
      <Stack.Screen name="pastoral/index" options={{ title: 'Prayer & visits', headerBackTitle: 'Back' }} />
      <Stack.Screen name="pastoral/prayer/[id]" options={{ title: 'Prayer request' }} />
      <Stack.Screen name="pastoral/visit/[id]" options={{ title: 'Visit' }} />
      <Stack.Screen name="pastoral/new" options={{ title: 'New', presentation: 'modal' }} />
      <Stack.Screen name="reports/index" options={{ title: 'Reports', headerBackTitle: 'Back' }} />
      <Stack.Screen name="reports/run/[key]" options={{ title: 'Report' }} />
      <Stack.Screen name="reports/saved/[index]" options={{ title: 'Report' }} />
      <Stack.Screen name="reports/branch/index" options={{ title: 'Branch reports' }} />
      <Stack.Screen name="reports/branch/[id]" options={{ title: 'Branch report' }} />
      <Stack.Screen name="reports/branch/new" options={{ title: 'Start a branch report', presentation: 'modal' }} />
      <Stack.Screen name="outbox" options={{ title: 'Waiting to sync' }} />
    </Stack>
  );
}
