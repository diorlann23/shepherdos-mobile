import { useState } from 'react';
import { KeyboardAvoidingView, Platform, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Button, Card, Input, Text } from '@/components/ui';
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
    <SafeAreaView style={{ flex: 1 }}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.wrap}>
        <View style={{ gap: space.xs }}>
          <Text size="title">Two-step check</Text>
          <Text tone="muted">Enter the 6-digit code from your authenticator app{me ? ` for ${me.user.email}` : ''}, or one of your recovery codes.</Text>
        </View>
        <Card style={{ gap: space.lg }}>
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
        </Card>
        <Button title="Use a different account" variant="ghost" onPress={() => void signOut()} />
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({ wrap: { flex: 1, padding: space.xl, gap: space.xl, justifyContent: 'center' } });
