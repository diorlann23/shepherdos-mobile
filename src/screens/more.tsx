import { Alert, ScrollView, StyleSheet, Switch, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import Constants from 'expo-constants';
import { Avatar, Card, Row, SectionTitle, Text } from '@/components/ui';
import { useAuth } from '@/lib/auth';
import { useLock } from '@/lib/lock';
import { getServer } from '@/lib/secure';
import { relativeTime, formatDate } from '@/lib/format';
import { syncNow } from '@/lib/sync';
import { useSyncStatus } from '@/hooks/use-sync-status';
import { space, useTheme } from '@/theme';

const STATE_LABEL = { none: 'No subscription', active: 'Active', expiring: 'Renewal due', grace: 'Grace period', locked: 'Locked' } as const;

export function More() {
  const { me, signOut, chooseChurch } = useAuth();
  const lock = useLock();
  const sync = useSyncStatus();
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
    <SafeAreaView edges={['top']} style={{ flex: 1 }}>
      <ScrollView contentContainerStyle={styles.wrap}>
        <Text size="title">More</Text>
        <Card style={{ flexDirection: 'row', alignItems: 'center', gap: space.md }}>
          <Avatar name={me?.user.name ?? '?'} size={52} />
          <View style={{ flex: 1 }}>
            <Text weight="600">{me?.user.name}</Text>
            <Text size="small" tone="muted">
              {me?.user.email}
            </Text>
            {me?.roles.length ? (
              <Text size="small" tone="muted">
                {me.roles.join(', ')}
              </Text>
            ) : null}
          </View>
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
          <Row icon="log-out-outline" title="Sign out" danger onPress={confirmSignOut} />
        </Card>

        <Text size="tiny" tone="muted" style={{ textAlign: 'center', marginTop: space.lg }}>
          ShepherdOS {Constants.expoConfig?.version} · {getServer().replace(/^https?:\/\//, '')}
        </Text>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  wrap: { padding: space.lg, paddingBottom: space.xxl },
  list: { padding: 0, overflow: 'hidden' },
});
