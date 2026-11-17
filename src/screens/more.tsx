import { Alert, Linking, ScrollView, StyleSheet, Switch, View } from 'react-native';
import { router } from 'expo-router';
import Constants from 'expo-constants';
import { Avatar, Badge, Card, Emblem, Row, ScreenHeader, SectionTitle, Text } from '@/components/ui';
import { can, groupsOf } from '@/lib/permissions';
import { listRecords } from '@/lib/db';
import { OPEN_TASK, type FollowUp, type Task } from '@/lib/ministry';
import { useLocalQuery } from '@/hooks/use-local-query';
import { useAuth } from '@/lib/auth';
import { useLock } from '@/lib/lock';
import { getServer } from '@/lib/secure';
import { relativeTime, formatDate } from '@/lib/format';
import { syncNow } from '@/lib/sync';
import { useSyncStatus } from '@/hooks/use-sync-status';
import { usePushState } from '@/hooks/use-push-state';
import { registerForPush } from '@/lib/push';
import { useUpdates } from 'expo-updates';
import { restartToUpdate } from '@/lib/app-updates';
import { space, useTheme } from '@/theme';

/** Everything for the week's work, shown only where the church has the feature and the role allows it. */
function MinistryLinks() {
  const { me } = useAuth();
  const mods = me?.org?.modules ?? [];
  const open = useLocalQuery(async () => ({
    tasks: (await listRecords<Task>('tasks', { limit: 1000 })).filter((t) => t.isMine && OPEN_TASK.includes(t.status) && t.status !== 'done').length,
    firstTimers: (await listRecords<FollowUp>('followups', { limit: 2000 })).filter((f) => f.stage === 'new').length,
  }), ['records:tasks', 'records:followups', 'records']);
  const links = [
    mods.includes('tasks') && { icon: 'checkbox-outline' as const, title: 'Tasks', badge: open.data?.tasks, href: '/tasks' as const },
    mods.includes('events') && can(me, 'event.view') && { icon: 'calendar-outline' as const, title: 'Events', href: '/events' as const },
    groupsOf(me).length > 0 && { icon: 'people-circle-outline' as const, title: 'Groups', href: '/groups' as const },
    mods.includes('communication') && { icon: 'megaphone-outline' as const, title: 'Notices', href: '/notices' as const },
    mods.includes('visitors') && can(me, 'followup.view') && { icon: 'person-add-outline' as const, title: 'First-timers', badge: open.data?.firstTimers, href: '/firsttimers' as const },
    mods.includes('pastoral') && (can(me, 'prayer.view') || can(me, 'visit.view')) && { icon: 'heart-outline' as const, title: 'Prayer & visits', href: '/pastoral' as const },
    (can(me, 'report.view') || (mods.includes('workflows') && (can(me, 'report.create') || can(me, 'report.approve')))) && { icon: 'stats-chart-outline' as const, title: 'Reports', href: '/reports' as const },
  ].filter(Boolean) as { icon: 'checkbox-outline'; title: string; badge?: number; href: string }[];
  if (!links.length) return null;
  return (
    <>
      <SectionTitle>Ministry</SectionTitle>
      <Card style={styles.list}>
        {links.map((l) => (
          <Row key={l.title} icon={l.icon} title={l.title} onPress={() => router.push(l.href as never)} right={l.badge ? <Badge label={String(l.badge)} tone="accent" /> : undefined} />
        ))}
      </Card>
    </>
  );
}

const PUSH_LABEL = {
  on: 'On: tasks, approvals, first-timers and reports',
  denied: 'Turned off for ShepherdOS. Tap to open Settings',
  unavailable: 'Not available in this version of the app',
  'not-set-up': 'Not set up for this build yet',
} as const;

const STATE_LABEL = { none: 'No subscription', active: 'Active', expiring: 'Renewal due', grace: 'Grace period', locked: 'Locked' } as const;

export function More() {
  const { me, signOut, chooseChurch } = useAuth();
  const lock = useLock();
  const sync = useSyncStatus();
  const push = usePushState();
  const { isUpdatePending } = useUpdates();
  const { colors } = useTheme();
  const sub = me?.org?.subscription;
  const others = (me?.orgs ?? []).filter((o) => o.id !== me?.org?.id);

  const confirmSignOut = () => {
    const waiting = sync.pending + sync.refused;
    Alert.alert(
      'Sign out?',
      waiting
        ? `${waiting} change${waiting === 1 ? ' hasn’t' : 's haven’t'} reached the server yet and will be lost. Sync first if you can.`
        : 'Your church’s records will be removed from this phone.',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Sign out', style: 'destructive', onPress: () => void signOut() },
      ],
    );
  };

  const switchTo = (id: string, name: string) =>
    Alert.alert(`Switch to ${name}?`, 'This phone will download that church’s records instead.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Switch', onPress: () => void chooseChurch(id).catch((e: Error) => Alert.alert('Couldn’t switch', e.message)) },
    ]);

  return (
    <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingBottom: space.xxl }}>
      <ScreenHeader title="More" overlap={40} />
      <View style={[styles.wrap, { marginTop: -40 }]}>
        <Card style={{ flexDirection: 'row', alignItems: 'center', gap: space.md }}>
          <Avatar name={me?.user.name ?? '?'} size={52} />
          <View style={{ flex: 1 }}>
            <Text weight="700">{me?.user.name}</Text>
            <Text size="small" tone="muted">
              {me?.user.email}
            </Text>
            {me?.roles.length ? (
              <View style={{ marginTop: space.xs }}>
                <Badge label={me.roles.join(', ')} tone="accent" />
              </View>
            ) : null}
          </View>
        </Card>

        {isUpdatePending ? (
          <Card style={styles.list}>
            <Row icon="arrow-up-circle-outline" title="Restart to update" subtitle="A new version of ShepherdOS is ready. Nothing waiting to sync is lost." onPress={() => void restartToUpdate()} />
          </Card>
        ) : null}

        <MinistryLinks />

        <SectionTitle>Help</SectionTitle>
        <Card style={styles.list}>
          {me?.ai?.assistant ? <Row icon="sparkles-outline" title="Ask a question" subtitle="Answers from the user guide, by AI" onPress={() => router.push('/ask')} /> : null}
          <Row icon="book-outline" title="User guide" subtitle="Opens on the ShepherdOS website" onPress={() => void Linking.openURL(`${getServer().replace(/\/+$/, '')}/help#29-the-shepherdos-mobile-app`)} />
        </Card>

        <SectionTitle>Church</SectionTitle>
        <Card style={styles.list}>
          <Row icon="business-outline" title={me?.org?.name ?? ''} subtitle="Signed in to" />
          <Row
            icon="card-outline"
            title={sub ? `${sub.planName} · ${STATE_LABEL[sub.state]}` : 'No subscription'}
            subtitle={sub ? `Paid until ${formatDate(sub.endsAt)}` : 'Subscriptions are managed by the ShepherdOS team'}
          />
          {others.map((o) => (
            <Row key={o.id} icon="swap-horizontal-outline" title={`Switch to ${o.name}`} onPress={() => switchTo(o.id, o.name)} />
          ))}
        </Card>

        <SectionTitle>Sync</SectionTitle>
        <Card style={styles.list}>
          <Row icon="sync-outline" title="Sync now" subtitle={sync.state === 'syncing' ? 'Syncing…' : `Last synced ${relativeTime(sync.lastSyncedAt)}`} onPress={() => void syncNow()} />
          <Row
            icon="cloud-upload-outline"
            title="Waiting to sync"
            subtitle={sync.refused ? `${sync.refused} need attention` : sync.pending ? `${sync.pending} change${sync.pending === 1 ? '' : 's'}` : 'Nothing waiting'}
            onPress={() => router.push('/outbox')}
          />
          {sync.state === 'error' && sync.message ? <Row icon="alert-circle-outline" title={sync.message} danger /> : null}
        </Card>

        <SectionTitle>Security</SectionTitle>
        <Card style={styles.list}>
          <Row
            icon="finger-print-outline"
            title="Lock with Face ID or fingerprint"
            subtitle={lock.available ? 'Asks again after a minute in the background' : 'Set up Face ID, fingerprint or a passcode on this phone first'}
            right={
              <Switch
                value={lock.enabled}
                disabled={!lock.available}
                trackColor={{ true: colors.primary }}
                onValueChange={(on) => void lock.setEnabled(on)}
                accessibilityLabel="Lock with Face ID or fingerprint"
              />
            }
          />
          <Row
            icon="notifications-outline"
            title="Notifications"
            subtitle={push ? PUSH_LABEL[push] : 'Checking…'}
            onPress={push === 'denied' ? () => void Linking.openSettings() : push !== 'on' ? () => void registerForPush() : undefined}
          />
          <Row icon="log-out-outline" title="Sign out" danger onPress={confirmSignOut} />
        </Card>

        <View style={{ alignItems: 'center', gap: space.sm, marginTop: space.xl }}>
          <Emblem size={36} />
          <Text size="tiny" tone="muted" style={{ textAlign: 'center' }}>
            ShepherdOS {Constants.expoConfig?.version} · {getServer().replace(/^https?:\/\//, '')}
          </Text>
        </View>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  wrap: { padding: space.lg, paddingBottom: space.xxl },
  list: { padding: 0, overflow: 'hidden' },
});
