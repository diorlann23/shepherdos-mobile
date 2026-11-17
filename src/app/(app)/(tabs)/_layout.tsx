import { View } from 'react-native';
import { Tabs } from 'expo-router/tabs';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '@/lib/auth';
import { can } from '@/lib/permissions';
import { useTheme } from '@/theme';

type Icon = keyof typeof Ionicons.glyphMap;

export default function TabsLayout() {
  const { colors } = useTheme();
  const { me } = useAuth();
  // Attendance shows for churches with the feature, to people who take or see attendance.
  const attendance = !!me?.org?.modules.includes('attendance') && (can(me, 'attendance.create') || can(me, 'attendance.view'));
  // Finance shows to people who handle giving or expenses, or see budgets.
  const mods = me?.org?.modules ?? [];
  const finance =
    (mods.includes('giving') && ['view', 'create', 'verify', 'post', 'summary'].some((a) => can(me, `giving.${a}`))) ||
    (mods.includes('finance') && (['view', 'create', 'approve'].some((a) => can(me, `expense.${a}`)) || can(me, 'budget.view')));
  // The selected tab: filled icon in navy with a small gold dot under it.
  const icon =
    (name: string) =>
    ({ focused, color }: { focused: boolean; color: unknown }) => (
      <View style={{ alignItems: 'center', gap: 3 }}>
        <Ionicons name={(focused ? name : `${name}-outline`) as Icon} color={color as string} size={23} />
        <View style={{ width: 5, height: 5, borderRadius: 3, backgroundColor: focused ? colors.accent : 'transparent' }} />
      </View>
    );
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.textMuted,
        tabBarLabelStyle: { fontSize: 11, fontWeight: '600' },
        tabBarStyle: { backgroundColor: colors.card, borderTopColor: colors.border },
      }}
    >
      <Tabs.Screen name="index" options={{ title: 'Home', tabBarIcon: icon('home') }} />
      <Tabs.Screen name="members" options={{ title: 'Members', tabBarIcon: icon('people') }} />
      <Tabs.Screen name="attendance" options={{ title: 'Attendance', href: attendance ? undefined : null, tabBarIcon: icon('checkmark-done-circle') }} />
      <Tabs.Screen name="finance" options={{ title: 'Finance', href: finance ? undefined : null, tabBarIcon: icon('wallet') }} />
      <Tabs.Screen name="more" options={{ title: 'More', tabBarIcon: icon('ellipsis-horizontal-circle') }} />
    </Tabs>
  );
}
