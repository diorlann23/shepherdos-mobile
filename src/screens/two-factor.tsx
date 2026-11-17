import { useState } from 'react';
import { View } from 'react-native';
import { Button, Input } from '@/components/ui';
import { AuthShell } from '@/components/auth-shell';
import { useAuth } from '@/lib/auth';
import { errorMessage } from '@/lib/api';
import { space } from '@/theme';

export function TwoFactor() {
  const { verifyTwoFactor, signOut, me } = useAuth();
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const submit = async () => {
    setBusy(true);
    setError(null);
    try {
      await verifyTwoFactor(code.replace(/\s/g, ''));
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };
  return (
    <AuthShell title="Two-step check" subtitle={`Enter the 6-digit code from your authenticator app${me ? ` for ${me.user.email}` : ''}, or one of your recovery codes.`}>
      <View style={{ gap: space.lg }}>
        <Input
          label="Code"
          value={code}
          onChangeText={setCode}
          keyboardType="number-pad"
          textContentType="oneTimeCode"
          autoComplete="one-time-code"
          autoFocus
          maxLength={20}
          error={error}
          onSubmitEditing={() => void submit()}
          style={{ fontSize: 22, letterSpacing: 6, textAlign: 'center' }}
        />
        <Button title="Continue" loading={busy} disabled={code.replace(/\s/g, '').length < 6} onPress={() => void submit()} />
      </View>
      <Button title="Use a different account" variant="ghost" onPress={() => void signOut()} />
    </AuthShell>
  );
}
