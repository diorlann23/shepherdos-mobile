import { useCallback, useState } from 'react';
import { ActionSheetIOS, Alert, FlatList, Platform, Pressable, RefreshControl, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Avatar, Badge, EmptyState, Text } from '@/components/ui';
import { SyncPill } from '@/components/sync-pill';
import { useAuth } from '@/lib/auth';
import { can } from '@/lib/permissions';
import { HouseholdList } from './households';
import { listRecords } from '@/lib/db';
import { syncNow } from '@/lib/sync';
import { useLocalQuery } from '@/hooks/use-local-query';
import { useSyncStatus } from '@/hooks/use-sync-status';
import { MEMBER_STATUSES, statusLabel } from '@/constants';
import type { MemberRow } from '@/lib/types';
import { font, radius, space, useTheme } from '@/theme';

const PAGE = 60;
export const statusTone = (s: string) => (s === 'visitor' ? 'warning' : s === 'new_convert' ? 'primary' : s === 'inactive' || s === 'deceased' || s === 'transferred' ? 'muted' : 'success') as 'warning' | 'primary' | 'muted' | 'success';

/** The + button: what this person may add. */
function useAddMenu() {
  const { me } = useAuth();
  const options: { label: string; go: () => void }[] = [];
  if (can(me, 'member.create')) {
    options.push({ label: 'New first-timer', go: () => router.push('/member/new?quick=1') });
    options.push({ label: 'New member', go: () => router.push('/member/new') });
  }
  if (can(me, 'household.create')) options.push({ label: 'New household', go: () => router.push('/household/new') });
  const open = () => {
    if (Platform.OS === 'ios') {
      ActionSheetIOS.showActionSheetWithOptions({ options: [...options.map((o) => o.label), 'Cancel'], cancelButtonIndex: options.length }, (i) => options[i]?.go());
    } else {
      Alert.alert('Add', undefined, [...options.map((o) => ({ text: o.label, onPress: o.go })), { text: 'Cancel', style: 'cancel' as const }]);
    }
  };
  return options.length ? open : null;
}

export function Members() {
  const [tab, setTab] = useState<'people' | 'households'>('people');
  const { colors } = useTheme();
  const add = useAddMenu();
  return (
    <SafeAreaView edges={['top']} style={{ flex: 1 }}>
      <View style={[styles.header, { paddingBottom: 0 }]}>
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
          <Text size="title">Members</Text>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm }}>
            <SyncPill />
            {add ? (
              <Pressable accessibilityRole="button" accessibilityLabel="Add" onPress={add} style={[styles.addBtn, { backgroundColor: colors.primary }]}>
                <Ionicons name="add" size={24} color={colors.onPrimary} />
              </Pressable>
            ) : null}
          </View>
        </View>
        <View style={[styles.toggle, { backgroundColor: colors.muted }]}>
          {(['people', 'households'] as const).map((t) => (
            <Pressable key={t} accessibilityRole="tab" accessibilityState={{ selected: tab === t }} onPress={() => setTab(t)} style={[styles.toggleItem, tab === t && { backgroundColor: colors.card }]}>
              <Text size="small" weight="600" tone={tab === t ? 'default' : 'muted'}>
                {t === 'people' ? 'People' : 'Households'}
              </Text>
            </Pressable>
          ))}
        </View>
      </View>
      {tab === 'people' ? <People /> : <View style={{ flex: 1, paddingTop: space.md }}><HouseholdList /></View>}
    </SafeAreaView>
  );
}

function People() {
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
        {item.pending ? <Badge label="Not synced" tone="warning" /> : <Badge label={statusLabel(item.status)} tone={statusTone(item.status)} />}
      </Pressable>
    ),
    [colors],
  );

  return (
    <View style={{ flex: 1 }}>
      <View style={styles.header}>
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
    </View>
  );
}

const styles = StyleSheet.create({
  header: { paddingHorizontal: space.lg, paddingTop: space.sm, paddingBottom: space.md, gap: space.md },
  search: { flexDirection: 'row', alignItems: 'center', gap: space.sm, borderRadius: radius.md, paddingHorizontal: space.md, minHeight: 44 },
  chip: { borderRadius: radius.pill, borderWidth: 1, paddingHorizontal: space.md, paddingVertical: 6 },
  row: { flexDirection: 'row', alignItems: 'center', gap: space.md, paddingHorizontal: space.lg, paddingVertical: space.md },
  addBtn: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  toggle: { flexDirection: 'row', borderRadius: radius.md, padding: 3, marginTop: space.md },
  toggleItem: { flex: 1, alignItems: 'center', paddingVertical: 7, borderRadius: radius.sm },
});
