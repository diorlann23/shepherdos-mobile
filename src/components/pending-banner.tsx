import { Alert, StyleSheet, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useLocalQuery } from '@/hooks/use-local-query';
import { canForce, changesFor, discardChange, retryChange } from '@/lib/sync';
import type { CollectionName } from '@/constants';
import { radius, space, useTheme } from '@/theme';
import { Button, Text } from './ui';

/** On a record's page: changes not on the server yet, and what to do about any it refused. */
export function PendingBanner({ collection, id, onFix }: { collection: CollectionName; id: string; onFix?: () => void }) {
  const { colors } = useTheme();
  const q = useLocalQuery(() => changesFor(collection, id), ['outbox'], [collection, id]);
  const items = q.data ?? [];
  if (!items.length) return null;
  const refused = items.filter((i) => i.error);
  if (!refused.length) {
    return (
      <View style={[styles.box, { backgroundColor: colors.warningSoft }]}>
        <Ionicons name="time-outline" size={18} color={colors.warning} />
        <Text size="small" style={{ flex: 1, color: colors.warning }}>
          {items.length === 1 ? 'This change is' : `${items.length} changes are`} saved on this phone and will reach the church records when you’re online.
        </Text>
      </View>
    );
  }
  return (
    <View style={{ gap: space.sm }}>
      {refused.map((item) => (
        <View key={item.seq} style={[styles.box, { backgroundColor: colors.dangerSoft, flexDirection: 'column', alignItems: 'stretch' }]}>
          <View style={{ flexDirection: 'row', gap: space.sm }}>
            <Ionicons name="alert-circle" size={18} color={colors.danger} />
            <View style={{ flex: 1 }}>
              <Text size="small" weight="600" tone="danger">
                {item.label}: not accepted
              </Text>
              <Text size="small" tone="danger">
                {item.error}
              </Text>
            </View>
          </View>
          <View style={styles.actions}>
            {canForce(item) ? (
              <Button
                title="Add anyway"
                variant="secondary"
                style={styles.btn}
                onPress={() =>
                  Alert.alert('Add anyway?', 'Only if you’ve checked this is a different person from the one already in the register.', [
                    { text: 'Cancel', style: 'cancel' },
                    { text: 'Add anyway', onPress: () => void retryChange(item.seq, { force: true }) },
                  ])
                }
              />
            ) : onFix ? (
              <Button title="Fix" variant="secondary" style={styles.btn} onPress={onFix} />
            ) : (
              <Button title="Try again" variant="secondary" style={styles.btn} onPress={() => void retryChange(item.seq)} />
            )}
            <Button
              title="Discard"
              variant="danger"
              style={styles.btn}
              onPress={() =>
                Alert.alert('Discard this change?', item.method === 'POST' ? 'It will be removed from this phone.' : 'The record goes back to what the church records hold.', [
                  { text: 'Cancel', style: 'cancel' },
                  { text: 'Discard', style: 'destructive', onPress: () => void discardChange(item.seq) },
                ])
              }
            />
          </View>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  box: { flexDirection: 'row', gap: space.sm, alignItems: 'center', padding: space.md, borderRadius: radius.md },
  actions: { flexDirection: 'row', gap: space.sm, marginTop: space.sm },
  btn: { flex: 1, minHeight: 40 },
});
