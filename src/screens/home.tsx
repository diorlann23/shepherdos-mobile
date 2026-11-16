import { Pressable, RefreshControl, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Card, Text } from '@/components/ui';
import { SyncPill } from '@/components/sync-pill';
import { useAuth } from '@/lib/auth';
import { countByStatus, countRecords, listRecords } from '@/lib/db';
import type { ChurchEvent, FollowUp, Notice, Task } from '@/lib/ministry';
import { formatDate, greeting } from '@/lib/format';
import { syncNow } from '@/lib/sync';
import { useLocalQuery } from '@/hooks/use-local-query';
import { useSyncStatus } from '@/hooks/use-sync-status';
import { MEMBER_STATUSES } from '@/constants';
import { radius, space, useTheme } from '@/theme';

export function Home() {
  const { me } = useAuth();
  const { colors } = useTheme();
  const sync = useSyncStatus();
  const stats = useLocalQuery(
    async () => ({ members: await countRecords('members'), households: await countRecords('households'), byStatus: await countByStatus('members') }),
    ['records:members', 'records:households', 'records'],
  );
  const s = stats.data;
  const sub = me?.org?.subscription;
  const firstName = me?.user.name.split(' ')[0] ?? '';

  return (
    <SafeAreaView edges={['top']} style={{ flex: 1 }}>
      <ScrollView contentContainerStyle={styles.wrap} refreshControl={<RefreshControl refreshing={sync.state === 'syncing'} onRefresh={() => void syncNow()} tintColor={colors.primary} />}>
        <View style={{ gap: space.xs }}>
          <Text tone="muted">{me?.org?.name}</Text>
          <Text size="title">
            {greeting()}
            {firstName ? `, ${firstName}` : ''}
          </Text>
          <SyncPill />
        </View>

        {sub && (sub.state === 'expiring' || sub.state === 'grace') ? (
          <Card style={{ backgroundColor: sub.state === 'grace' ? colors.dangerSoft : colors.warningSoft, borderColor: 'transparent', flexDirection: 'row', gap: space.md }}>
            <Ionicons name="alert-circle" size={22} color={sub.state === 'grace' ? colors.danger : colors.warning} />
            <View style={{ flex: 1, gap: 2 }}>
              <Text weight="600">{sub.state === 'grace' ? 'Subscription ended: grace period' : 'Subscription renewal due'}</Text>
              <Text size="small" tone="muted">
                {sub.state === 'grace'
                  ? `The church locks on ${formatDate(sub.graceEndsAt)} unless it’s renewed.`
                  : `Your ${sub.planName} plan ends on ${formatDate(sub.endsAt)}. Contact the ShepherdOS team to renew.`}
              </Text>
            </View>
          </Card>
        ) : null}

        <View style={styles.grid}>
          <Stat icon="people" label="Members" value={s?.members} onPress={() => router.navigate('/members')} />
          <Stat icon="person-add" label="First-timers" value={s?.byStatus.visitor ?? (s ? 0 : undefined)} />
          <Stat icon="sparkles" label="New converts" value={s?.byStatus.new_convert ?? (s ? 0 : undefined)} />
          <Stat icon="home" label="Households" value={s?.households} />
        </View>

        <ThisWeek />

        <Card style={{ gap: space.md }}>
          <Text weight="600">People by status</Text>
          {s && s.members ? (
            MEMBER_STATUSES.filter((st) => s.byStatus[st.value]).map((st) => {
              const n = s.byStatus[st.value] ?? 0;
              return (
                <View key={st.value} style={{ gap: 6 }}>
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                    <Text size="small">{st.label}</Text>
                    <Text size="small" tone="muted">
                      {n}
                    </Text>
                  </View>
                  <View style={[styles.track, { backgroundColor: colors.muted }]}>
                    <View style={[styles.bar, { backgroundColor: colors.primary, width: `${Math.max(2, (n / s.members) * 100)}%` }]} />
                  </View>
                </View>
              );
            })
          ) : (
            <Text size="small" tone="muted">
              {sync.state === 'syncing' ? 'Bringing your church’s records onto this phone…' : 'No members on this phone yet. Pull down to sync.'}
            </Text>
          )}
        </Card>

        <Card style={{ flexDirection: 'row', gap: space.md, alignItems: 'center' }}>
          <Ionicons name="cloud-offline-outline" size={22} color={colors.primary} />
          <Text size="small" tone="muted" style={{ flex: 1 }}>
            Everything here is saved on this phone and works without internet. Changes sync by themselves when you’re back online.
          </Text>
        </Card>
      </ScrollView>
    </SafeAreaView>
  );
}

/** The week at a glance: my tasks, the next event, the newest notice, first-timers waiting. */
function ThisWeek() {
  const { colors } = useTheme();
  const q = useLocalQuery(async () => {
    const tasks = (await listRecords<Task>('tasks', { limit: 1000 })).filter((t) => t.isMine && ['assigned', 'accepted', 'in_progress'].includes(t.status));
    const events = (await listRecords<ChurchEvent>('events', { limit: 200 })).filter((e) => !e.hidden && e.status === 'published' && new Date(e.startsAt).getTime() > Date.now() - 3_600_000);
    const notices = await listRecords<Notice>('announcements', { status: 'published', limit: 1 });
    const firstTimers = (await listRecords<FollowUp>('followups', { status: 'new', limit: 500 })).length;
    return { tasks, next: events[0], notice: notices[0], firstTimers };
  }, ['records:tasks', 'records:events', 'records:announcements', 'records:followups', 'records']);
  const d = q.data;
  if (!d || (!d.tasks.length && !d.next && !d.notice && !d.firstTimers)) return null;
  const item = (icon: keyof typeof Ionicons.glyphMap, title: string, sub: string, href: string, alert?: boolean) => (
    <Pressable key={title} accessibilityRole="button" onPress={() => router.push(href as never)} style={({ pressed }) => [styles.weekRow, pressed && { backgroundColor: colors.muted }]}>
      <Ionicons name={icon} size={20} color={alert ? colors.danger : colors.primary} />
      <View style={{ flex: 1 }}>
        <Text weight="600" numberOfLines={1}>
          {title}
        </Text>
        <Text size="small" tone="muted" numberOfLines={1}>
          {sub}
        </Text>
      </View>
      <Ionicons name="chevron-forward" size={16} color={colors.textMuted} />
    </Pressable>
  );
  const overdue = d.tasks.filter((t) => t.overdue).length;
  return (
    <Card style={{ padding: 0, overflow: 'hidden' }}>
      <Text weight="600" style={{ paddingHorizontal: space.lg, paddingTop: space.lg }}>
        This week
      </Text>
      {d.tasks.length ? item('checkbox-outline', `${d.tasks.length} task${d.tasks.length === 1 ? '' : 's'} for you`, overdue ? `${overdue} overdue` : d.tasks[0].title, '/tasks', overdue > 0) : null}
      {d.next ? item('calendar-outline', d.next.title, `${formatDate(d.next.startsAt)} · ${d.next.location ?? d.next.nodeName}`, `/events/${d.next.id}`) : null}
      {d.firstTimers ? item('person-add-outline', `${d.firstTimers} first-timer${d.firstTimers === 1 ? '' : 's'} to contact`, 'Waiting for a first call', '/firsttimers') : null}
      {d.notice ? item('megaphone-outline', d.notice.title, d.notice.body, `/notices/${d.notice.id}`) : null}
    </Card>
  );
}

function Stat({ icon, label, value, onPress }: { icon: keyof typeof Ionicons.glyphMap; label: string; value: number | undefined; onPress?: () => void }) {
  const { colors } = useTheme();
  return (
    <Card style={styles.stat} onTouchEnd={onPress}>
      <View style={[styles.statIcon, { backgroundColor: colors.primarySoft }]}>
        <Ionicons name={icon} size={18} color={colors.primary} />
      </View>
      <Text size="title">{value === undefined ? '—' : value.toLocaleString()}</Text>
      <Text size="small" tone="muted">
        {label}
      </Text>
    </Card>
  );
}

const styles = StyleSheet.create({
  wrap: { padding: space.lg, gap: space.lg, paddingBottom: space.xxl },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: space.md },
  stat: { flexBasis: '47%', flexGrow: 1, gap: space.xs },
  weekRow: { flexDirection: 'row', alignItems: 'center', gap: space.md, paddingHorizontal: space.lg, paddingVertical: space.md },
  statIcon: { width: 32, height: 32, borderRadius: radius.sm, alignItems: 'center', justifyContent: 'center', marginBottom: space.xs },
  track: { height: 6, borderRadius: 3, overflow: 'hidden' },
  bar: { height: 6, borderRadius: 3 },
});
