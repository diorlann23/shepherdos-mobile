import { Pressable, RefreshControl, ScrollView, StyleSheet, View } from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Badge, Button, Card, EmptyState, ScreenHeader, SectionTitle, Text } from '@/components/ui';
import { SyncPill } from '@/components/sync-pill';
import { useAuth } from '@/lib/auth';
import { can } from '@/lib/permissions';
import { listRecords } from '@/lib/db';
import { checkInsFor, type Service } from '@/lib/attendance';
import { syncNow } from '@/lib/sync';
import { useLocalQuery } from '@/hooks/use-local-query';
import { useSyncStatus } from '@/hooks/use-sync-status';
import { formatDate } from '@/lib/format';
import { radius, space, useTheme } from '@/theme';

/** Today's date as YYYY-MM-DD on this phone's calendar. */
export const localDay = (d = new Date()) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
// A service is stored by the calendar day it was held (midnight UTC of that day).
const isToday = (iso: string) => iso.slice(0, 10) === localDay();

/** The Attendance tab: today's services first, then recent ones. */
export function Attendance() {
  const { me } = useAuth();
  const { colors } = useTheme();
  const sync = useSyncStatus();
  const q = useLocalQuery(
    async () => {
      const services = await listRecords<Service>('services', { limit: 200 });
      const counts = await Promise.all(services.map(async (s) => [s.id, (await checkInsFor(s.id)).length] as const));
      return { services, counts: Object.fromEntries(counts) as Record<string, number> };
    },
    ['records:services', 'records:checkins', 'records'],
  );
  const services = q.data?.services ?? [];
  const today = services.filter((s) => isToday(s.date) || (s.status === 'open' && Date.now() - new Date(s.date).getTime() < 2 * 86_400_000));
  const recent = services.filter((s) => !today.includes(s));
  const canStart = can(me, 'attendance.create');

  return (
    <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingBottom: space.xxl }} refreshControl={<RefreshControl refreshing={sync.state === 'syncing'} onRefresh={() => void syncNow()} tintColor={colors.headerText} />}>
      <ScreenHeader title="Attendance">
        <SyncPill onDark />
      </ScreenHeader>
      <View style={styles.wrap}>

        <SectionTitle>Today</SectionTitle>
        {today.length ? (
          today.map((s) => <ServiceCard key={s.id} s={s} present={q.data?.counts[s.id] ?? 0} big />)
        ) : (
          <Card>
            <Text tone="muted">{q.loading ? ' ' : 'No service started today yet.'}</Text>
          </Card>
        )}
        {canStart ? <Button title="Start a service" icon="add-circle-outline" onPress={() => router.push('/service/new')} style={{ marginTop: space.md }} /> : null}

        <SectionTitle>Recent</SectionTitle>
        {recent.length ? (
          <Card style={{ padding: 0, overflow: 'hidden' }}>
            {recent.map((s, i) => (
              <View key={s.id}>
                {i ? <View style={{ height: StyleSheet.hairlineWidth, backgroundColor: colors.border, marginLeft: space.lg }} /> : null}
                <ServiceCard s={s} present={q.data?.counts[s.id] ?? s.presentCount} />
              </View>
            ))}
          </Card>
        ) : !q.loading ? (
          <EmptyState icon="calendar-outline" title="No services yet" text="Services from the last 60 days appear here." />
        ) : null}
      </View>
    </ScrollView>
  );
}

function ServiceCard({ s, present, big }: { s: Service; present: number; big?: boolean }) {
  const { colors } = useTheme();
  const total = Math.max(present, s.presentCount);
  const body = (
    <View style={styles.row}>
      <View style={[styles.icon, { backgroundColor: s.status === 'open' ? colors.successSoft : colors.muted }]}>
        <Ionicons name={s.status === 'open' ? 'radio-button-on' : 'checkmark-done'} size={18} color={s.status === 'open' ? colors.success : colors.textMuted} />
      </View>
      <View style={{ flex: 1, gap: 2 }}>
        <Text weight="600" numberOfLines={1}>
          {s.title}
        </Text>
        <Text size="small" tone="muted" numberOfLines={1}>
          {formatDate(s.date)} · {s.nodeName}
        </Text>
      </View>
      <View style={{ alignItems: 'flex-end', gap: 2 }}>
        {s.mode !== 'headcount' ? <Text weight="700">{total}</Text> : null}
        {s.pending ? <Badge label="Not synced" tone="warning" /> : s.headcount?.total ? <Text size="tiny" tone="muted">{`Count ${s.headcount.total}`}</Text> : s.status === 'open' ? <Badge label="Open" tone="success" /> : null}
      </View>
    </View>
  );
  return (
    <Pressable accessibilityRole="button" onPress={() => router.push(`/service/${s.id}`)} style={({ pressed }) => [big && [styles.big, { backgroundColor: colors.card, borderColor: colors.border }], pressed && { opacity: 0.8 }]}>
      {body}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  wrap: { padding: space.lg, gap: space.sm, paddingBottom: space.xxl },
  row: { flexDirection: 'row', alignItems: 'center', gap: space.md, padding: space.lg },
  big: { borderRadius: radius.lg, borderWidth: StyleSheet.hairlineWidth, marginBottom: space.sm },
  icon: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
});
