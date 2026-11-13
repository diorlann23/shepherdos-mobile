import { useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Button, Card, EmptyState, Row, Text } from '@/components/ui';
import { useAuth } from '@/lib/auth';
import { errorMessage } from '@/lib/api';
import { space } from '@/theme';

export function ChooseChurch() {
  const { me, chooseChurch, signOut } = useAuth();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const orgs = me?.orgs ?? [];
  const pick = async (id: string) => {
    setBusy(id);
    setError(null);
    try {
      await chooseChurch(id);
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(null);
    }
  };
  return (
    <SafeAreaView style={{ flex: 1 }}>
      <ScrollView contentContainerStyle={styles.wrap}>
        {orgs.length ? (
          <>
            <View style={{ gap: space.xs }}>
              <Text size="title">Choose a church</Text>
              <Text tone="muted">You serve in more than one. You can switch later from More.</Text>
            </View>
            <Card style={{ padding: 0, overflow: 'hidden' }}>
              {orgs.map((o) => (
                <Row key={o.id} icon="business-outline" title={o.name} subtitle={busy === o.id ? 'Opening…' : o.access === 'open' ? undefined : 'Closed'} onPress={() => void pick(o.id)} />
              ))}
            </Card>
            {error ? <Text tone="danger">{error}</Text> : null}
          </>
        ) : (
          <EmptyState icon="business-outline" title="No church yet" text="Your account isn’t part of a church. Ask your church administrator to invite you, or sign up your church on the ShepherdOS website." />
        )}
        <Button title="Sign out" variant="ghost" onPress={() => void signOut()} />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({ wrap: { padding: space.xl, gap: space.xl, flexGrow: 1, justifyContent: 'center' } });
