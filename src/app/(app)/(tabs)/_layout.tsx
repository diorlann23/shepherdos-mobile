import { Tabs } from 'expo-router/tabs';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '@/lib/auth';
import { can } from '@/lib/permissions';
import { useTheme } from '@/theme';

export default function TabsLayout() {
  const { colors } = useTheme();
  const { me } = useAuth();
  // Attendance shows for churches with the feature, to people who take or see attendance.
  const attendance = !!me?.org?.modules.includes('attendance') && (can(me, 'attendance.create') || can(me, 'attendance.view'));
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.textMuted,
        tabBarStyle: { backgroundColor: colors.card, borderTopColor: colors.border },
      }}
    >
      <Tabs.Screen name="index" options={{ title: 'Home', tabBarIcon: ({ color, size }) => <Ionicons name="home-outline" color={color as string} size={size} /> }} />
      <Tabs.Screen name="members" options={{ title: 'Members', tabBarIcon: ({ color, size }) => <Ionicons name="people-outline" color={color as string} size={size} /> }} />
      <Tabs.Screen
        name="attendance"
        options={{ title: 'Attendance', href: attendance ? undefined : null, tabBarIcon: ({ color, size }) => <Ionicons name="checkmark-done-circle-outline" color={color as string} size={size} /> }}
      />
      <Tabs.Screen name="more" options={{ title: 'More', tabBarIcon: ({ color, size }) => <Ionicons name="ellipsis-horizontal-circle-outline" color={color as string} size={size} /> }} />
    </Tabs>
  );
}
