import { useState } from 'react';
import { Button, Card, EmptyState, Row, Text } from '@/components/ui';
import { AuthShell } from '@/components/auth-shell';
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
    <AuthShell title={orgs.length ? 'Choose a church' : 'No church yet'} subtitle={orgs.length ? 'You serve in more than one. You can switch later from More.' : undefined}>
      {orgs.length ? (
        <>
          <Card style={{ padding: 0, overflow: 'hidden' }}>
            {orgs.map((o) => (
              <Row key={o.id} icon="business-outline" title={o.name} subtitle={busy === o.id ? 'Opening…' : o.access === 'open' ? undefined : 'Closed'} onPress={() => void pick(o.id)} />
            ))}
          </Card>
          {error ? <Text tone="danger">{error}</Text> : null}
        </>
      ) : (
        <EmptyState icon="business-outline" title="Not part of a church" text="Ask your church administrator to invite you, or sign up your church on the ShepherdOS website." />
      )}
      <Button title="Sign out" variant="ghost" onPress={() => void signOut()} />
    </AuthShell>
  );
}
