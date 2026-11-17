import { Pressable, StyleSheet, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSyncStatus } from '@/hooks/use-sync-status';
import { relativeTime } from '@/lib/format';
import { syncNow } from '@/lib/sync';
import { radius, space, useTheme } from '@/theme';
import { Text } from './ui';

/**
 * Always tells the person whether what they see is up to date. Tap to sync now.
 * On the navy header band it's a translucent pill with a coloured dot.
 */
export function SyncPill({ onDark }: { onDark?: boolean }) {
  const s = useSyncStatus();
  const { colors } = useTheme();
  const look = {
    syncing: { icon: 'sync' as const, color: colors.primary, bg: colors.primarySoft, label: 'Syncing…' },
    offline: { icon: 'cloud-offline-outline' as const, color: colors.warning, bg: colors.warningSoft, label: s.pending ? `Offline · ${s.pending} waiting` : 'Offline' },
    error: { icon: 'alert-circle-outline' as const, color: colors.danger, bg: colors.dangerSoft, label: 'Sync problem' },
    idle: {
      icon: s.refused ? ('alert-circle-outline' as const) : ('checkmark-circle-outline' as const),
      color: s.refused ? colors.danger : colors.success,
      bg: s.refused ? colors.dangerSoft : colors.successSoft,
      label: s.refused ? `${s.refused} change${s.refused === 1 ? '' : 's'} need attention` : s.pending ? `${s.pending} waiting to sync` : `Up to date · ${relativeTime(s.lastSyncedAt)}`,
    },
  }[s.state];
  if (onDark) {
    const dot = { syncing: colors.accent, offline: colors.warning, error: '#FF8A80', idle: s.refused ? '#FF8A80' : '#4ADE9B' }[s.state];
    return (
      <Pressable accessibilityRole="button" accessibilityLabel={`${look.label}. Tap to sync now.`} onPress={() => void syncNow()} style={[styles.pill, { backgroundColor: colors.headerSoft }]}>
        <View style={[styles.dot, { backgroundColor: dot }]} />
        <Text size="tiny" weight="600" numberOfLines={1} style={{ color: colors.headerText }}>
          {look.label}
        </Text>
      </Pressable>
    );
  }
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={`${look.label}. Tap to sync now.`} onPress={() => void syncNow()} style={[styles.pill, { backgroundColor: look.bg }]}>
      <Ionicons name={look.icon} size={14} color={look.color} />
      <Text size="tiny" weight="600" style={{ color: look.color }}>
        {look.label}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  dot: { width: 7, height: 7, borderRadius: 4 },
  pill: { flexDirection: 'row', alignItems: 'center', gap: space.xs, alignSelf: 'flex-start', borderRadius: radius.pill, paddingHorizontal: space.md, paddingVertical: 6 },
});
