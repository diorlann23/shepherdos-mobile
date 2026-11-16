import { useState } from 'react';
import { FlatList, Pressable, RefreshControl, StyleSheet, TextInput, View } from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Badge, EmptyState, Text } from '@/components/ui';
import { listRecords } from '@/lib/db';
import { syncNow } from '@/lib/sync';
import { useLocalQuery } from '@/hooks/use-local-query';
import { useSyncStatus } from '@/hooks/use-sync-status';
import type { HouseholdRow } from '@/lib/types';
import { font, radius, space, useTheme } from '@/theme';

/** The households list, shown under Members. */
export function HouseholdList() {
  const { colors } = useTheme();
  const sync = useSyncStatus();
  const [q, setQ] = useState('');
  const list = useLocalQuery(() => listRecords<HouseholdRow>('households', { q, limit: 500 }), ['records:households', 'records'], [q]);
  const rows = list.data ?? [];
  return (
    <View style={{ flex: 1 }}>
      <View style={{ paddingHorizontal: space.lg, paddingBottom: space.md }}>
        <View style={[styles.search, { backgroundColor: colors.muted }]}>
          <Ionicons name="search" size={18} color={colors.textMuted} />
          <TextInput value={q} onChangeText={setQ} placeholder="Household, head, phone or area" placeholderTextColor={colors.textMuted} style={{ flex: 1, color: colors.text, fontSize: font.body }} autoCorrect={false} accessibilityLabel="Search households" />
        </View>
      </View>
      <FlatList
        data={rows}
        keyExtractor={(h) => h.id}
        refreshControl={<RefreshControl refreshing={sync.state === 'syncing'} onRefresh={() => void syncNow()} tintColor={colors.primary} />}
        ItemSeparatorComponent={() => <View style={{ height: StyleSheet.hairlineWidth, backgroundColor: colors.border, marginLeft: 72 }} />}
        keyboardDismissMode="on-drag"
        renderItem={({ item }) => (
          <Pressable accessibilityRole="button" onPress={() => router.push(`/household/${item.id}`)} style={({ pressed }) => [styles.row, { backgroundColor: pressed ? colors.muted : colors.background }]}>
            <View style={[styles.icon, { backgroundColor: colors.primarySoft }]}>
              <Ionicons name="home" size={18} color={colors.primary} />
            </View>
            <View style={{ flex: 1, gap: 2 }}>
              <Text weight="600" numberOfLines={1}>
                {item.name}
              </Text>
              <Text size="small" tone="muted" numberOfLines={1}>
                {[item.headName ? `Head: ${item.headName}` : null, item.branch].filter(Boolean).join(' · ')}
              </Text>
            </View>
            {item.pending ? <Badge label="Not synced" tone="warning" /> : null}
          </Pressable>
        )}
        ListEmptyComponent={list.loading ? undefined : <EmptyState icon="home-outline" title={q ? 'No household found' : 'No households yet'} text={q ? 'Try another name.' : 'Add one with the + button.'} />}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  search: { flexDirection: 'row', alignItems: 'center', gap: space.sm, borderRadius: radius.md, paddingHorizontal: space.md, minHeight: 44 },
  row: { flexDirection: 'row', alignItems: 'center', gap: space.md, paddingHorizontal: space.lg, paddingVertical: space.md },
  icon: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
});
