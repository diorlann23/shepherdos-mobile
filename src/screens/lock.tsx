import { useEffect } from 'react';
import { StyleSheet, View } from 'react-native';
import { Button, EmptyState } from '@/components/ui';
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
    <View style={[StyleSheet.absoluteFill, styles.wrap, { backgroundColor: colors.background }]}>
      <EmptyState icon="lock-closed" title="ShepherdOS is locked" text={me?.org ? `${me.org.name}’s records are protected on this phone.` : undefined} />
      <Button title="Unlock" icon="finger-print" onPress={() => void unlock()} />
    </View>
  );
}

const styles = StyleSheet.create({ wrap: { justifyContent: 'center', padding: space.xl, gap: space.lg, zIndex: 100 } });
