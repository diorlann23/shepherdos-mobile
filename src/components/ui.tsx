import { ActivityIndicator, Pressable, StyleSheet, Text as RNText, TextInput, View, type PressableProps, type TextInputProps, type TextProps, type ViewProps } from 'react-native';
import * as Haptics from 'expo-haptics';
import { Ionicons } from '@expo/vector-icons';
import { font, radius, space, useTheme } from '@/theme';
import { initials } from '@/lib/format';

/** The building blocks every screen uses, so the app looks the same everywhere. */

type Tone = 'default' | 'muted' | 'primary' | 'danger' | 'success' | 'warning';
export function Text({ tone = 'default', size = 'body', weight, style, ...props }: TextProps & { tone?: Tone; size?: keyof typeof font; weight?: '400' | '500' | '600' | '700' }) {
  const { colors } = useTheme();
  const color = { default: colors.text, muted: colors.textMuted, primary: colors.primary, danger: colors.danger, success: colors.success, warning: colors.warning }[tone];
  return <RNText {...props} style={[{ color, fontSize: font[size], fontWeight: weight ?? (size === 'title' || size === 'heading' ? '700' : '400'), lineHeight: Math.round(font[size] * 1.35) }, style]} />;
}

export function Card({ style, ...props }: ViewProps) {
  const { colors } = useTheme();
  return <View {...props} style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }, style]} />;
}

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger';
export function Button({
  title,
  icon,
  variant = 'primary',
  loading,
  disabled,
  onPress,
  style,
  ...props
}: Omit<PressableProps, 'children'> & { title: string; icon?: keyof typeof Ionicons.glyphMap; variant?: Variant; loading?: boolean }) {
  const { colors } = useTheme();
  const bg = { primary: colors.primary, secondary: colors.muted, ghost: 'transparent', danger: colors.dangerSoft }[variant];
  const fg = { primary: colors.onPrimary, secondary: colors.text, ghost: colors.primary, danger: colors.danger }[variant];
  const off = disabled || loading;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: !!off, busy: !!loading }}
      disabled={off}
      onPress={(e) => {
        void Haptics.selectionAsync();
        onPress?.(e);
      }}
      style={(state) => [styles.button, { backgroundColor: bg, opacity: off ? 0.55 : state.pressed ? 0.85 : 1 }, typeof style === 'function' ? style(state) : style]}
      {...props}
    >
      {loading ? <ActivityIndicator color={fg} /> : icon ? <Ionicons name={icon} size={18} color={fg} /> : null}
      <RNText style={{ color: fg, fontSize: font.body, fontWeight: '600' }}>{title}</RNText>
    </Pressable>
  );
}

export type TextInputRef = React.ComponentRef<typeof TextInput>;
export function Input({ label, error, hint, style, ref, ...props }: TextInputProps & { label: string; error?: string | null; hint?: string; ref?: React.Ref<TextInputRef> }) {
  const { colors } = useTheme();
  return (
    <View style={{ gap: space.xs }}>
      <Text size="small" weight="600">
        {label}
      </Text>
      <TextInput
        ref={ref}
        placeholderTextColor={colors.textMuted}
        accessibilityLabel={label}
        style={[styles.input, { color: colors.text, backgroundColor: colors.card, borderColor: error ? colors.danger : colors.border }, style]}
        {...props}
      />
      {error ? (
        <Text size="small" tone="danger">
          {error}
        </Text>
      ) : hint ? (
        <Text size="small" tone="muted">
          {hint}
        </Text>
      ) : null}
    </View>
  );
}

export function Badge({ label, tone = 'muted' }: { label: string; tone?: 'muted' | 'primary' | 'success' | 'warning' | 'danger' }) {
  const { colors } = useTheme();
  const map = {
    muted: [colors.muted, colors.textMuted],
    primary: [colors.primarySoft, colors.primary],
    success: [colors.successSoft, colors.success],
    warning: [colors.warningSoft, colors.warning],
    danger: [colors.dangerSoft, colors.danger],
  }[tone];
  return (
    <View style={[styles.badge, { backgroundColor: map[0] }]}>
      <RNText style={{ color: map[1], fontSize: font.tiny, fontWeight: '600' }}>{label}</RNText>
    </View>
  );
}

export function Avatar({ name, size = 40 }: { name: string; size?: number }) {
  const { colors } = useTheme();
  return (
    <View style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: colors.primarySoft, alignItems: 'center', justifyContent: 'center' }}>
      <RNText style={{ color: colors.primary, fontWeight: '700', fontSize: size * 0.38 }}>{initials(name)}</RNText>
    </View>
  );
}

export function EmptyState({ icon, title, text, children }: { icon: keyof typeof Ionicons.glyphMap; title: string; text?: string; children?: React.ReactNode }) {
  const { colors } = useTheme();
  return (
    <View style={styles.empty}>
      <View style={[styles.emptyIcon, { backgroundColor: colors.primarySoft }]}>
        <Ionicons name={icon} size={28} color={colors.primary} />
      </View>
      <Text size="heading" style={{ textAlign: 'center' }}>
        {title}
      </Text>
      {text ? (
        <Text tone="muted" style={{ textAlign: 'center' }}>
          {text}
        </Text>
      ) : null}
      {children}
    </View>
  );
}

export function Row({ icon, title, subtitle, right, onPress, danger }: { icon?: keyof typeof Ionicons.glyphMap; title: string; subtitle?: string; right?: React.ReactNode; onPress?: () => void; danger?: boolean }) {
  const { colors } = useTheme();
  return (
    <Pressable accessibilityRole={onPress ? 'button' : undefined} onPress={onPress} disabled={!onPress} style={({ pressed }) => [styles.row, { backgroundColor: pressed ? colors.muted : 'transparent' }]}>
      {icon ? <Ionicons name={icon} size={20} color={danger ? colors.danger : colors.textMuted} /> : null}
      <View style={{ flex: 1 }}>
        <Text tone={danger ? 'danger' : 'default'} weight="500">
          {title}
        </Text>
        {subtitle ? (
          <Text size="small" tone="muted">
            {subtitle}
          </Text>
        ) : null}
      </View>
      {right ?? (onPress ? <Ionicons name="chevron-forward" size={18} color={colors.textMuted} /> : null)}
    </Pressable>
  );
}

export function SectionTitle({ children }: { children: string }) {
  return (
    <Text size="tiny" tone="muted" weight="600" style={{ textTransform: 'uppercase', letterSpacing: 0.6, marginTop: space.lg, marginBottom: space.sm, marginHorizontal: space.xs }}>
      {children}
    </Text>
  );
}

const styles = StyleSheet.create({
  card: { borderRadius: radius.lg, borderWidth: StyleSheet.hairlineWidth, padding: space.lg },
  button: { minHeight: 50, borderRadius: radius.md, paddingHorizontal: space.lg, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: space.sm },
  input: { minHeight: 50, borderRadius: radius.md, borderWidth: 1, paddingHorizontal: space.md, fontSize: font.body },
  badge: { alignSelf: 'flex-start', borderRadius: radius.pill, paddingHorizontal: space.sm, paddingVertical: 2 },
  empty: { alignItems: 'center', gap: space.md, paddingHorizontal: space.xl, paddingVertical: space.xxl },
  emptyIcon: { width: 64, height: 64, borderRadius: 32, alignItems: 'center', justifyContent: 'center' },
  row: { flexDirection: 'row', alignItems: 'center', gap: space.md, paddingVertical: space.md, paddingHorizontal: space.lg, minHeight: 56 },
});
