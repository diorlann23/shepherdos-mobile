import { Alert, FlatList, View } from 'react-native';
import { router } from 'expo-router';
import { Badge, Card, EmptyState, Row, Text } from '@/components/ui';
import { canForce, discardChange, listOutbox, retryChange, type OutboxItem } from '@/lib/sync';
import { relativeTime } from '@/lib/format';
import { useLocalQuery } from '@/hooks/use-local-query';
import { space } from '@/theme';

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
