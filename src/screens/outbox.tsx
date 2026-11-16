import { Alert, FlatList, View } from 'react-native';
import { router } from 'expo-router';
import { Badge, Card, EmptyState, Row, Text } from '@/components/ui';
import { canForce, discardChange, listOutbox, retryChange, type OutboxItem } from '@/lib/sync';
import { discardMark, refusedMarks } from '@/lib/attendance';
import { getDb, getRecord } from '@/lib/db';
import { relativeTime } from '@/lib/format';
import { useLocalQuery } from '@/hooks/use-local-query';
import { space } from '@/theme';

/** Check-ins waiting to be sent, and any the server didn't accept (named, with the reason). */
function CheckInsWaiting() {
  const q = useLocalQuery(
    async () => {
      const waiting = await getDb().getFirstAsync<{ n: number }>('SELECT COUNT(*) AS n FROM marks WHERE error IS NULL');
      const refused = await refusedMarks();
      const named = await Promise.all(refused.map(async (m) => ({ ...m, name: (await getRecord<{ name: string }>('roster', m.memberId))?.name ?? 'Someone', service: (await getRecord<{ title: string }>('services', m.sessionId))?.title ?? 'a service' })));
      return { waiting: waiting?.n ?? 0, refused: named };
    },
    ['marks', 'records'],
  );
  if (!q.data || (!q.data.waiting && !q.data.refused.length)) return null;
  return (
    <View style={{ gap: space.sm, marginBottom: space.md }}>
      {q.data.waiting ? (
        <Card style={{ padding: 0, overflow: 'hidden' }}>
          <Row icon="checkmark-done-outline" title={`${q.data.waiting} check-in${q.data.waiting === 1 ? '' : 's'}`} subtitle="Sent together when the phone is online" right={<Badge label="Waiting" />} />
        </Card>
      ) : null}
      {q.data.refused.map((m) => (
        <Card key={m.clientId} style={{ padding: 0, overflow: 'hidden' }}>
          <Row
            icon="alert-circle-outline"
            danger
            title={`Check-in: ${m.name}, ${m.service}`}
            subtitle={`Refused: ${m.error}`}
            right={<Badge label="Needs attention" tone="danger" />}
            onPress={() =>
              Alert.alert('Check-in not accepted', m.error, [
                { text: 'Keep', style: 'cancel' },
                { text: 'Discard check-in', style: 'destructive', onPress: () => void discardMark(m.clientId) },
              ])
            }
          />
        </Card>
      ))}
    </View>
  );
}

/** Changes made on this phone that haven't reached the server yet, and any it refused. */
export function Outbox() {
  const q = useLocalQuery(listOutbox, ['outbox']);
  const items = q.data ?? [];
  const act = (item: OutboxItem) =>
    Alert.alert(item.label, item.error ?? undefined, [
      { text: 'Cancel', style: 'cancel' },
      canForce(item)
        ? { text: 'Add anyway (not a duplicate)', onPress: () => void retryChange(item.seq, { force: true }) }
        : { text: 'Try again', onPress: () => void retryChange(item.seq) },
      ...(item.recordId && item.collection
        ? [{ text: 'Open record', onPress: () => router.push(item.collection === 'members' ? `/member/${item.recordId}` : `/household/${item.recordId}`) }]
        : []),
      { text: 'Discard change', style: 'destructive', onPress: () => void discardChange(item.seq) },
    ]);
  return (
    <FlatList
      data={items}
      keyExtractor={(i) => String(i.seq)}
      contentContainerStyle={{ padding: space.lg, gap: space.sm }}
      ListHeaderComponent={<CheckInsWaiting />}
      ListEmptyComponent={q.loading ? undefined : <EmptyState icon="checkmark-done-circle-outline" title="All caught up" text="Every change on this phone has reached the server." />}
      renderItem={({ item }) => (
        <Card style={{ padding: 0, overflow: 'hidden' }}>
          <Row
            icon={item.error ? 'alert-circle-outline' : 'time-outline'}
            title={item.label}
            subtitle={item.error ? `Refused: ${item.error}` : `Made ${relativeTime(item.createdAt)}`}
            danger={!!item.error}
            right={item.error ? <Badge label="Needs attention" tone="danger" /> : <Badge label="Waiting" />}
            onPress={item.error ? () => act(item) : undefined}
          />
        </Card>
      )}
      ListFooterComponent={
        items.length ? (
          <View style={{ paddingTop: space.md }}>
            <Text size="small" tone="muted">
              Waiting changes are sent by themselves when the phone is online. Tap a refused change to try again or discard it.
            </Text>
          </View>
        ) : undefined
      }
    />
  );
}
