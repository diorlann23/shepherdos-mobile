import { useCallback, useState } from 'react';
import { FlatList, Pressable, RefreshControl, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Avatar, Badge, EmptyState, Text } from '@/components/ui';
import { SyncPill } from '@/components/sync-pill';
import { listRecords } from '@/lib/db';
import { syncNow } from '@/lib/sync';
import { useLocalQuery } from '@/hooks/use-local-query';
import { useSyncStatus } from '@/hooks/use-sync-status';
import { MEMBER_STATUSES, statusLabel } from '@/constants';
import type { MemberRow } from '@/lib/types';
import { font, radius, space, useTheme } from '@/theme';

const PAGE = 60;
export const statusTone = (s: string) => (s === 'visitor' ? 'warning' : s === 'new_convert' ? 'primary' : s === 'inactive' || s === 'deceased' || s === 'transferred' ? 'muted' : 'success') as 'warning' | 'primary' | 'muted' | 'success';

export function Members() {
  const { colors } = useTheme();
  const sync = useSyncStatus();
  const [q, setQ] = useState('');
  const [status, setStatus] = useState<string | null>(null);
  const [limit, setLimit] = useState(PAGE);
  const list = useLocalQuery(() => listRecords<MemberRow>('members', { q, status, limit }), ['records:members', 'records'], [q, status, limit]);
  const rows = list.data ?? [];

  const renderItem = useCallback(
    ({ item }: { item: MemberRow }) => (
      <Pressable accessibilityRole="button" onPress={() => router.push(`/member/${item.id}`)} style={({ pressed }) => [styles.row, { backgroundColor: pressed ? colors.muted : colors.background }]}>
        <Avatar name={item.fullName} />
        <View style={{ flex: 1, gap: 2 }}>
          <Text weight="600" numberOfLines={1}>
            {item.fullName}
          </Text>
          <Text size="small" tone="muted" numberOfLines={1}>
            {[item.memberNumber, item.phone, item.branchName].filter(Boolean).join(' · ')}
          </Text>
        </View>
        <Badge label={statusLabel(item.status)} tone={statusTone(item.status)} />
      </Pressable>
    ),
    [colors],
  );

  return (
    <SafeAreaView edges={['top']} style={{ flex: 1 }}>
      <View style={styles.header}>
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
          <Text size="title">Members</Text>
          <SyncPill />
        </View>
        <View style={[styles.search, { backgroundColor: colors.muted }]}>
          <Ionicons name="search" size={18} color={colors.textMuted} />
          <TextInput
            value={q}
            onChangeText={(t) => {
              setQ(t);
              setLimit(PAGE);
            }}
            placeholder="Name, phone, number or area"
            placeholderTextColor={colors.textMuted}
            style={{ flex: 1, color: colors.text, fontSize: font.body }}
            autoCorrect={false}
            clearButtonMode="while-editing"
            accessibilityLabel="Search members"
          />
        </View>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: space.sm }}>
          {[{ value: null, label: 'All' } as { value: string | null; label: string }, ...MEMBER_STATUSES].map((s) => {
            const on = status === s.value;
            return (
              <Pressable
                key={s.label}
                accessibilityRole="button"
                accessibilityState={{ selected: on }}
                onPress={() => {
                  setStatus(s.value);
                  setLimit(PAGE);
                }}
                style={[styles.chip, { backgroundColor: on ? colors.primary : colors.card, borderColor: on ? colors.primary : colors.border }]}
              >
                <Text size="small" weight="600" style={{ color: on ? colors.onPrimary : colors.text }}>
                  {s.label}
                </Text>
              </Pressable>
            );
          })}
        </ScrollView>
      </View>
      <FlatList
        data={rows}
        keyExtractor={(m) => m.id}
        renderItem={renderItem}
        onEndReachedThreshold={0.5}
        onEndReached={() => rows.length >= limit && setLimit(limit + PAGE)}
        ItemSeparatorComponent={() => <View style={{ height: StyleSheet.hairlineWidth, backgroundColor: colors.border, marginLeft: 72 }} />}
        refreshControl={<RefreshControl refreshing={sync.state === 'syncing'} onRefresh={() => void syncNow()} tintColor={colors.primary} />}
        keyboardDismissMode="on-drag"
        ListEmptyComponent={
          list.loading ? undefined : q || status ? (
            <EmptyState icon="search" title="No one found" text="Try another name, or clear the filter." />
          ) : (
            <EmptyState icon="people-outline" title="No members on this phone yet" text={sync.state === 'offline' ? 'Connect to the internet once to bring your church’s records here.' : 'Pull down to sync.'} />
          )
        }
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  header: { paddingHorizontal: space.lg, paddingTop: space.sm, paddingBottom: space.md, gap: space.md },
  search: { flexDirection: 'row', alignItems: 'center', gap: space.sm, borderRadius: radius.md, paddingHorizontal: space.md, minHeight: 44 },
  chip: { borderRadius: radius.pill, borderWidth: 1, paddingHorizontal: space.md, paddingVertical: 6 },
  row: { flexDirection: 'row', alignItems: 'center', gap: space.md, paddingHorizontal: space.lg, paddingVertical: space.md },
});
