import { useRef, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Button, Input, Text, type TextInputRef } from '@/components/ui';
import { AuthShell } from '@/components/auth-shell';
import { useAuth } from '@/lib/auth';
import { ApiError, errorMessage } from '@/lib/api';
import { getServer } from '@/lib/secure';
import { radius, space, useTheme } from '@/theme';

export function SignIn() {
  const { signIn } = useAuth();
  const { colors } = useTheme();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [server, setServer] = useState(getServer());
  const [showServer, setShowServer] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const passwordRef = useRef<TextInputRef>(null);

  const submit = async () => {
    if (!email.trim() || !password) return setError('Enter your email and password.');
    setBusy(true);
    setError(null);
    try {
      await signIn({ email: email.trim(), password, server });
    } catch (e) {
      setError(e instanceof ApiError && e.status === 422 ? 'Check your email address and password.' : errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <AuthShell title="Welcome" subtitle="Sign in with your church account. Once your church’s records are on this phone, they work without internet.">
      <View style={{ gap: space.lg }}>
        <Input
          label="Email"
          value={email}
          onChangeText={setEmail}
          autoCapitalize="none"
          autoComplete="email"
          keyboardType="email-address"
          textContentType="username"
          returnKeyType="next"
          onSubmitEditing={() => passwordRef.current?.focus()}
          placeholder="you@yourchurch.org"
        />
        <Input
          ref={passwordRef}
          label="Password"
          value={password}
          onChangeText={setPassword}
          secureTextEntry
          autoComplete="current-password"
          textContentType="password"
          returnKeyType="go"
          onSubmitEditing={() => void submit()}
        />
        {error ? (
          <View style={[styles.error, { backgroundColor: colors.dangerSoft }]}>
            <Ionicons name="alert-circle" size={18} color={colors.danger} />
            <Text size="small" tone="danger" style={{ flex: 1 }}>
              {error}
            </Text>
          </View>
        ) : null}
        <Button title="Sign in" loading={busy} onPress={() => void submit()} />
      </View>
      <View style={{ gap: space.md }}>
        <Pressable accessibilityRole="button" onPress={() => setShowServer(!showServer)} style={styles.advanced}>
          <Ionicons name={showServer ? 'chevron-down' : 'chevron-forward'} size={14} color={colors.textMuted} />
          <Text size="small" tone="muted">
            Server
          </Text>
        </Pressable>
        {showServer ? (
          <Input label="Server address" value={server} onChangeText={setServer} autoCapitalize="none" autoCorrect={false} keyboardType="url" hint="Leave as it is unless your church runs its own ShepherdOS server." />
        ) : null}
      </View>
    </AuthShell>
  );
}

const styles = StyleSheet.create({
  error: { flexDirection: 'row', gap: space.sm, alignItems: 'center', padding: space.md, borderRadius: radius.md },
  advanced: { flexDirection: 'row', alignItems: 'center', gap: space.xs, alignSelf: 'center', padding: space.sm },
});
