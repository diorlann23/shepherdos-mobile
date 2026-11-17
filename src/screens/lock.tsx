import { useEffect } from 'react';
import { StyleSheet, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Button, Emblem, Text, Wordmark } from '@/components/ui';
import { useLock } from '@/lib/lock';
import { useAuth } from '@/lib/auth';
import { space, useTheme } from '@/theme';

/** Covers everything until Face ID / fingerprint succeeds. */
export function LockScreen() {
  const { unlock } = useLock();
  const { me } = useAuth();
  const { colors } = useTheme();
  useEffect(() => {
    void unlock();
  }, [unlock]);
  return (
    <View style={[StyleSheet.absoluteFill, styles.wrap, { backgroundColor: colors.header }]}>
      <Emblem size={84} />
      <Wordmark size={28} />
      <View style={{ alignItems: 'center', gap: space.xs, marginBottom: space.lg }}>
        <Ionicons name="lock-closed" size={22} color={colors.accent} />
        <Text size="heading" style={{ color: colors.headerText, textAlign: 'center' }}>
          Locked
        </Text>
        {me?.org ? (
          <Text style={{ color: colors.headerMuted, textAlign: 'center' }}>{`${me.org.name}’s records are protected on this phone.`}</Text>
        ) : null}
      </View>
      <Button title="Unlock" icon="finger-print" variant="accent" onPress={() => void unlock()} style={{ alignSelf: 'stretch' }} />
    </View>
  );
}

const styles = StyleSheet.create({ wrap: { alignItems: 'center', justifyContent: 'center', padding: space.xl, gap: space.lg, zIndex: 100 } });
