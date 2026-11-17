import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { radius, space, useTheme } from '@/theme';
import { Emblem, Text, Wordmark } from './ui';

/**
 * Sign-in, two-step check, choosing a church: the emblem and name on navy,
 * and the form on a sheet that rises from the bottom.
 */
export function AuthShell({ title, subtitle, children }: { title: string; subtitle?: string; children: React.ReactNode }) {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  return (
    <View style={{ flex: 1, backgroundColor: colors.header }}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
        <ScrollView contentContainerStyle={{ flexGrow: 1 }} keyboardShouldPersistTaps="handled" bounces={false}>
          <View style={[styles.hero, { paddingTop: insets.top + space.xxl }]}>
            <Emblem size={84} />
            <Wordmark size={30} />
            <Text size="small" style={{ color: colors.headerMuted, textAlign: 'center' }}>
              Church management that works offline
            </Text>
          </View>
          <View style={[styles.sheet, { backgroundColor: colors.background, paddingBottom: insets.bottom + space.xl }]}>
            <View style={{ gap: space.xs }}>
              <Text size="title">{title}</Text>
              {subtitle ? <Text tone="muted">{subtitle}</Text> : null}
            </View>
            {children}
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  hero: { alignItems: 'center', gap: space.md, paddingHorizontal: space.xl, paddingBottom: space.xxl },
  sheet: { flexGrow: 1, borderTopLeftRadius: radius.xl, borderTopRightRadius: radius.xl, padding: space.xl, gap: space.xl },
});
