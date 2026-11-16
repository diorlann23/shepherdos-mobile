import { useMemo, useState } from 'react';
import { Alert, FlatList, Pressable, StyleSheet, TextInput, View } from 'react-native';
import { Stack, router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { Badge, Button, EmptyState, Text } from '@/components/ui';
import { PendingBanner } from '@/components/pending-banner';
import { useAuth } from '@/lib/auth';
import { allowedAt } from '@/lib/permissions';
import { getRecord, listRecords } from '@/lib/db';
import { METHOD_LABELS, canTakeCheckIns, checkIn, checkInsFor, householdOf, setServiceStatus, undoCheckIn, type CheckIn, type RosterPerson, type Service } from '@/lib/attendance';
import { useLocalQuery } from '@/hooks/use-local-query';
import { formatDate } from '@/lib/format';
import { font, radius, space, useTheme } from '@/theme';

/** One service: check people in, see who's here, scan cards, add first-timers, record the headcount. */
export function ServiceScreen({ id }: { id: string }) {
  const { me } = useAuth();
  const { colors } = useTheme();
  const [tab, setTab] = useState<'checkin' | 'here'>('checkin');
  const [q, setQ] = useState('');
  const data = useLocalQuery(
    async () => {
      const service = await getRecord<Service>('services', id);
      const checkins = await checkInsFor(id);
      return { service, checkins };
    },
    ['records:services', 'records:checkins', 'records', 'marks'],
    [id],
  );
  const roster = useLocalQuery(() => listRecords<RosterPerson>('roster', { q, limit: q ? 100 : 300 }), ['records:roster', 'records'], [q]);
  const everyone = useLocalQuery(() => listRecords<RosterPerson>('roster', { limit: 10000 }), ['records:roster', 'records']);

  const s = data.data?.service;
  const checkins = data.data?.checkins ?? [];
  const present = useMemo(() => new Map(checkins.map((c) => [c.memberId, c])), [checkins]);
  const names = useMemo(() => new Map((everyone.data ?? []).map((p) => [p.id, p])), [everyone.data]);
  if (data.loading) return null;
  if (!s) return <EmptyState icon="calendar-outline" title="Service not on this phone" text="It may be older than 60 days, or in a part of the church you can’t see." />;

  const canCheckIn = allowedAt(me, 'attendance.create', [s.nodeId]);
  const canEdit = allowedAt(me, 'attendance.edit', [s.nodeId]);
  const open = canTakeCheckIns(s);
  const takes = canCheckIn && open.ok;
  const firstTimers = checkins.filter((c) => c.firstTime).length;

  const toggle = async (p: RosterPerson) => {
    if (!takes) return;
    if (present.has(p.id)) {
      Alert.alert(`Undo ${p.name}’s check-in?`, undefined, [
        { text: 'Keep', style: 'cancel' },
        { text: 'Undo', style: 'destructive', onPress: () => void undoCheckIn(s.id, p.id, p.name) },
      ]);
      return;
    }
    void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    await checkIn(s.id, [p.id]);
  };

  const checkInHousehold = async (p: RosterPerson) => {
    const family = (await householdOf(p)).filter((m) => !present.has(m.id));
    if (!family.length) return;
    Alert.alert(`Check in ${family.length} ${family.length === 1 ? 'person' : 'people'}?`, family.map((m) => m.name).join('\n'), [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Check in',
        onPress: () => {
          void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
          void checkIn(s.id, family.map((m) => m.id));
        },
      },
    ]);
  };

  const menu = () => {
    const buttons: { text: string; style?: 'cancel' | 'destructive'; onPress?: () => void }[] = [];
    if (canCheckIn) buttons.push({ text: 'Record headcount', onPress: () => router.push(`/service/${s.id}/headcount`) });
    if (canEdit) {
      buttons.push(
        s.status === 'open'
          ? { text: 'Close service', style: 'destructive', onPress: () => void setServiceStatus(s, 'closed') }
          : { text: 'Reopen service', onPress: () => void setServiceStatus(s, 'open') },
      );
    }
    buttons.push({ text: 'Cancel', style: 'cancel' });
    Alert.alert(s.title, `${formatDate(s.date)} · ${s.nodeName}`, buttons);
  };

  const people = roster.data ?? [];
  const herePeople = checkins.map((c) => ({ c, p: names.get(c.memberId) }));

  return (
    <View style={{ flex: 1 }}>
      <Stack.Screen
        options={{
          title: s.title,
          headerRight: canCheckIn || canEdit ? () => <Pressable accessibilityRole="button" accessibilityLabel="Service options" onPress={menu} hitSlop={12}><Ionicons name="ellipsis-horizontal-circle" size={26} color={colors.primary} /></Pressable> : undefined,
        }}
      />
      <View style={{ paddingHorizontal: space.lg, paddingTop: space.md, gap: space.md }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm }}>
          <Text size="small" tone="muted" style={{ flex: 1 }}>
            {formatDate(s.date)} · {s.nodeName}
          </Text>
          {s.pending ? <Badge label="Not synced" tone="warning" /> : <Badge label={s.status === 'open' ? 'Open' : 'Closed'} tone={s.status === 'open' ? 'success' : 'muted'} />}
        </View>
        <View style={styles.stats}>
          {s.mode !== 'headcount' ? <Stat label="Checked in" value={checkins.length} /> : null}
          <Stat label="Headcount" value={s.headcount?.total ?? 0} onPress={canCheckIn ? () => router.push(`/service/${s.id}/headcount`) : undefined} />
          {s.mode !== 'headcount' ? <Stat label="First-timers" value={firstTimers} /> : null}
        </View>
        <PendingBanner collection="services" id={s.id} />
        {!open.ok && canCheckIn ? (
          <Text size="small" tone="muted">
            {open.reason}
          </Text>
        ) : null}
        {takes ? (
          <View style={{ flexDirection: 'row', gap: space.sm }}>
            <Button title="Scan card" icon="qr-code-outline" style={{ flex: 1 }} onPress={() => router.push(`/service/${s.id}/scan`)} />
            <Button title="First-timer" icon="person-add-outline" variant="secondary" style={{ flex: 1 }} onPress={() => router.push(`/service/${s.id}/visitor`)} />
          </View>
        ) : null}
        {s.mode !== 'headcount' ? (
          <View style={[styles.toggle, { backgroundColor: colors.muted }]}>
            {(['checkin', 'here'] as const).map((t) => (
              <Pressable key={t} accessibilityRole="tab" accessibilityState={{ selected: tab === t }} onPress={() => setTab(t)} style={[styles.toggleItem, tab === t && { backgroundColor: colors.card }]}>
                <Text size="small" weight="600" tone={tab === t ? 'default' : 'muted'}>
                  {t === 'checkin' ? 'Check in' : `Here (${checkins.length})`}
                </Text>
              </Pressable>
            ))}
          </View>
        ) : null}
        {s.mode !== 'headcount' && tab === 'checkin' ? (
          <View style={[styles.search, { backgroundColor: colors.muted }]}>
            <Ionicons name="search" size={18} color={colors.textMuted} />
            <TextInput value={q} onChangeText={setQ} placeholder="Name, member number or last 4 phone digits" placeholderTextColor={colors.textMuted} style={{ flex: 1, color: colors.text, fontSize: font.body }} autoCorrect={false} clearButtonMode="while-editing" accessibilityLabel="Search people to check in" />
          </View>
        ) : null}
      </View>

      {s.mode === 'headcount' ? (
        <View style={{ padding: space.lg }}>
          <Text tone="muted">This service counts heads rather than names. Tap Headcount above to record the numbers.</Text>
        </View>
      ) : tab === 'checkin' ? (
        <FlatList
          data={people}
          keyExtractor={(p) => p.id}
          keyboardDismissMode="on-drag"
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={{ paddingBottom: space.xxl }}
          ItemSeparatorComponent={() => <View style={{ height: StyleSheet.hairlineWidth, backgroundColor: colors.border, marginLeft: 64 }} />}
          ListEmptyComponent={roster.loading ? undefined : <EmptyState icon="people-outline" title={q ? 'No one found' : 'No one on this phone’s list yet'} text={q ? 'Try another spelling, or add them as a first-timer.' : 'Pull down on the Attendance tab to sync.'} />}
          renderItem={({ item }) => {
            const here = present.get(item.id);
            return (
              <Pressable accessibilityRole="checkbox" accessibilityState={{ checked: !!here, disabled: !takes }} onPress={() => void toggle(item)} style={({ pressed }) => [styles.person, pressed && takes && { backgroundColor: colors.muted }]}>
                <Ionicons name={here ? 'checkmark-circle' : 'ellipse-outline'} size={30} color={here ? colors.success : colors.border} />
                <View style={{ flex: 1 }}>
                  <Text weight={here ? '600' : '400'} numberOfLines={1}>
                    {item.name}
                  </Text>
                  <Text size="small" tone="muted" numberOfLines={1}>
                    {[item.memberNumber, item.phoneTail ? `••${item.phoneTail}` : null, item.pending ? 'not synced' : null].filter(Boolean).join(' · ') || ' '}
                  </Text>
                </View>
                {takes && item.householdId ? (
                  <Pressable accessibilityRole="button" accessibilityLabel={`Check in ${item.name}’s household`} hitSlop={8} onPress={() => void checkInHousehold(item)} style={[styles.family, { borderColor: colors.border }]}>
                    <Ionicons name="people-outline" size={16} color={colors.primary} />
                  </Pressable>
                ) : null}
              </Pressable>
            );
          }}
        />
      ) : (
        <FlatList
          data={herePeople}
          keyExtractor={(x) => x.c.id}
          contentContainerStyle={{ paddingBottom: space.xxl }}
          ItemSeparatorComponent={() => <View style={{ height: StyleSheet.hairlineWidth, backgroundColor: colors.border, marginLeft: space.lg }} />}
          ListEmptyComponent={<EmptyState icon="checkmark-done-outline" title="No one checked in yet" />}
          renderItem={({ item }) => <HereRow c={item.c} p={item.p} onUndo={takes && item.p ? () => void toggle(item.p!) : undefined} />}
        />
      )}
    </View>
  );
}

function HereRow({ c, p, onUndo }: { c: CheckIn; p: RosterPerson | undefined; onUndo?: () => void }) {
  return (
    <Pressable accessibilityRole={onUndo ? 'button' : undefined} onLongPress={onUndo} style={styles.here}>
      <View style={{ flex: 1 }}>
        <Text weight="500">{p?.name ?? 'Someone not on this phone'}</Text>
        <Text size="small" tone="muted">
          {[METHOD_LABELS[c.method] ?? c.method, new Date(c.markedAt).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }), c.firstTime ? 'first time' : null].filter(Boolean).join(' · ')}
        </Text>
      </View>
      {c.pending ? <Badge label="Not synced" tone="warning" /> : null}
    </Pressable>
  );
}

function Stat({ label, value, onPress }: { label: string; value: number; onPress?: () => void }) {
  const { colors } = useTheme();
  return (
    <Pressable accessibilityRole={onPress ? 'button' : undefined} disabled={!onPress} onPress={onPress} style={[styles.stat, { backgroundColor: colors.card, borderColor: colors.border }]}>
      <Text size="title">{value.toLocaleString()}</Text>
      <Text size="tiny" tone="muted">
        {label}
        {onPress ? ' ›' : ''}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  stats: { flexDirection: 'row', gap: space.sm },
  stat: { flex: 1, borderRadius: radius.md, borderWidth: StyleSheet.hairlineWidth, padding: space.md, alignItems: 'center' },
  toggle: { flexDirection: 'row', borderRadius: radius.md, padding: 3 },
  toggleItem: { flex: 1, alignItems: 'center', paddingVertical: 7, borderRadius: radius.sm },
  search: { flexDirection: 'row', alignItems: 'center', gap: space.sm, borderRadius: radius.md, paddingHorizontal: space.md, minHeight: 44, marginBottom: space.sm },
  person: { flexDirection: 'row', alignItems: 'center', gap: space.md, paddingHorizontal: space.lg, paddingVertical: space.md, minHeight: 60 },
  family: { width: 36, height: 36, borderRadius: 18, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  here: { flexDirection: 'row', alignItems: 'center', gap: space.md, paddingHorizontal: space.lg, paddingVertical: space.md },
});
