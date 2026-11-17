import { ActivityIndicator, Image, Pressable, StyleSheet, Text as RNText, TextInput, View, type PressableProps, type StyleProp, type TextInputProps, type TextProps, type ViewProps, type ViewStyle } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Haptics from 'expo-haptics';
import { Ionicons } from '@expo/vector-icons';
import { elevation, font, radius, space, useTheme } from '@/theme';
import { initials } from '@/lib/format';

/** The building blocks every screen uses, so the app looks the same everywhere. */

type Tone = 'default' | 'muted' | 'primary' | 'accent' | 'danger' | 'success' | 'warning';
export function Text({ tone = 'default', size = 'body', weight, style, ...props }: TextProps & { tone?: Tone; size?: keyof typeof font; weight?: '400' | '500' | '600' | '700' | '800' }) {
  const { colors } = useTheme();
  const color = { default: colors.text, muted: colors.textMuted, primary: colors.primary, accent: colors.accentText, danger: colors.danger, success: colors.success, warning: colors.warning }[tone];
  const big = size === 'title' || size === 'heading';
  return (
    <RNText
      {...props}
      style={[{ color, fontSize: font[size], fontWeight: weight ?? (big ? '700' : '400'), lineHeight: Math.round(font[size] * (big ? 1.25 : 1.4)), letterSpacing: size === 'title' ? -0.4 : 0 }, style]}
    />
  );
}

export function Card({ style, ...props }: ViewProps) {
  const { colors, dark } = useTheme();
  return <View {...props} style={[styles.card, { backgroundColor: colors.card, borderColor: dark ? colors.border : 'transparent' }, elevation(colors, dark), style]} />;
}

type Variant = 'primary' | 'accent' | 'secondary' | 'ghost' | 'danger';
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
  const { colors, dark } = useTheme();
  const bg = { primary: colors.primary, accent: colors.accent, secondary: colors.primarySoft, ghost: 'transparent', danger: colors.dangerSoft }[variant];
  const fg = { primary: colors.onPrimary, accent: colors.onAccent, secondary: colors.primary, ghost: colors.primary, danger: colors.danger }[variant];
  const off = disabled || loading;
  const lifted = variant === 'primary' || variant === 'accent';
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: !!off, busy: !!loading }}
      disabled={off}
      onPress={(e) => {
        void Haptics.selectionAsync();
        onPress?.(e);
      }}
      style={(state) => [
        styles.button,
        { backgroundColor: bg, opacity: off ? 0.5 : 1, transform: [{ scale: state.pressed && !off ? 0.98 : 1 }] },
        lifted && !off ? elevation(colors, dark) : null,
        typeof style === 'function' ? style(state) : style,
      ]}
      {...props}
    >
      {loading ? <ActivityIndicator color={fg} /> : icon ? <Ionicons name={icon} size={19} color={fg} /> : null}
      <RNText style={{ color: fg, fontSize: font.body, fontWeight: '700', letterSpacing: 0.1 }}>{title}</RNText>
    </Pressable>
  );
}

export type TextInputRef = React.ComponentRef<typeof TextInput>;
export function Input({ label, error, hint, style, ref, ...props }: TextInputProps & { label: string; error?: string | null; hint?: string; ref?: React.Ref<TextInputRef> }) {
  const { colors } = useTheme();
  return (
    <View style={{ gap: 6 }}>
      <Text size="small" weight="600">
        {label}
      </Text>
      <TextInput
        ref={ref}
        placeholderTextColor={colors.textMuted}
        accessibilityLabel={label}
        style={[styles.input, { color: colors.text, backgroundColor: colors.muted, borderColor: error ? colors.danger : 'transparent' }, style]}
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

export function Badge({ label, tone = 'muted' }: { label: string; tone?: 'muted' | 'primary' | 'accent' | 'success' | 'warning' | 'danger' }) {
  const { colors } = useTheme();
  const map = {
    muted: [colors.muted, colors.textMuted],
    primary: [colors.primarySoft, colors.primary],
    accent: [colors.accentSoft, colors.accentText],
    success: [colors.successSoft, colors.success],
    warning: [colors.warningSoft, colors.warning],
    danger: [colors.dangerSoft, colors.danger],
  }[tone];
  return (
    <View style={[styles.badge, { backgroundColor: map[0] }]}>
      <RNText style={{ color: map[1], fontSize: font.tiny, fontWeight: '700' }}>{label}</RNText>
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

/** A tinted square holding an icon, used at the start of rows and on cards. */
export function IconTile({ icon, tone = 'primary', size = 36 }: { icon: keyof typeof Ionicons.glyphMap; tone?: 'primary' | 'accent' | 'danger' | 'success' | 'warning' | 'muted'; size?: number }) {
  const { colors } = useTheme();
  const [bg, fg] = {
    primary: [colors.primarySoft, colors.primary],
    accent: [colors.accentSoft, colors.accentText],
    danger: [colors.dangerSoft, colors.danger],
    success: [colors.successSoft, colors.success],
    warning: [colors.warningSoft, colors.warning],
    muted: [colors.muted, colors.textMuted],
  }[tone];
  return (
    <View style={{ width: size, height: size, borderRadius: size * 0.3, backgroundColor: bg, alignItems: 'center', justifyContent: 'center' }}>
      <Ionicons name={icon} size={size * 0.52} color={fg} />
    </View>
  );
}

export function EmptyState({ icon, title, text, children }: { icon: keyof typeof Ionicons.glyphMap; title: string; text?: string; children?: React.ReactNode }) {
  const { colors } = useTheme();
  return (
    <View style={styles.empty}>
      <View style={[styles.emptyIcon, { backgroundColor: colors.primarySoft }]}>
        <Ionicons name={icon} size={30} color={colors.primary} />
        <View style={[styles.emptyDot, { backgroundColor: colors.accent, borderColor: colors.background }]} />
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
      {icon ? <IconTile icon={icon} tone={danger ? 'danger' : 'primary'} size={34} /> : null}
      <View style={{ flex: 1 }}>
        <Text tone={danger ? 'danger' : 'default'} weight="600">
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
    <Text size="tiny" tone="muted" weight="700" style={{ textTransform: 'uppercase', letterSpacing: 0.9, marginTop: space.lg, marginBottom: space.sm, marginHorizontal: space.xs }}>
      {children}
    </Text>
  );
}

/** Two or three choices side by side (People / Households, Giving / Expenses / Budgets). */
export function Segmented<T extends string>({ value, options, onChange, style }: { value: T; options: { value: T; label: string }[]; onChange: (v: T) => void; style?: StyleProp<ViewStyle> }) {
  const { colors, dark } = useTheme();
  return (
    <View accessibilityRole="tablist" style={[styles.segmented, { backgroundColor: colors.muted }, style]}>
      {options.map((o) => {
        const on = o.value === value;
        return (
          <Pressable
            key={o.value}
            accessibilityRole="tab"
            accessibilityState={{ selected: on }}
            onPress={() => onChange(o.value)}
            style={[styles.segment, on && [{ backgroundColor: colors.card }, elevation(colors, dark)]]}
          >
            <Text size="small" weight={on ? '700' : '600'} tone={on ? 'primary' : 'muted'}>
              {o.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const EMBLEM = require('../../assets/emblem.png');

/** The ShepherdOS emblem on its own white tile, as on the website, so it reads on navy and in dark mode. */
export function Emblem({ size = 44 }: { size?: number }) {
  return (
    <View style={{ width: size, height: size, borderRadius: size * 0.26, backgroundColor: '#FFFFFF', alignItems: 'center', justifyContent: 'center' }}>
      <Image source={EMBLEM} style={{ width: size * 0.78, height: size * 0.78 }} resizeMode="contain" accessibilityIgnoresInvertColors />
    </View>
  );
}

/** "Shepherd" in white and "OS" in gold, for the navy bands. */
export function Wordmark({ size = 22 }: { size?: number }) {
  const { colors } = useTheme();
  return (
    <RNText accessibilityRole="header" style={{ fontSize: size, fontWeight: '800', letterSpacing: -0.3, color: colors.headerText }}>
      Shepherd<RNText style={{ color: colors.accent }}>OS</RNText>
    </RNText>
  );
}

/**
 * The navy band at the top of each tab: title, an optional line above it, and
 * actions on the right. Anything passed as children sits inside the band.
 */
export function ScreenHeader({ title, eyebrow, right, children, overlap = 0 }: { title: string; eyebrow?: React.ReactNode; right?: React.ReactNode; children?: React.ReactNode; overlap?: number }) {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  return (
    <View style={[styles.header, { backgroundColor: colors.header, paddingTop: insets.top + space.md, paddingBottom: space.lg + overlap }]}>
      {/* Pulling down to refresh shows navy above the band, not a white gap. */}
      <View pointerEvents="none" style={[styles.headerOverscroll, { backgroundColor: colors.header }]} />
      <View style={styles.headerRow}>
        <View style={{ flex: 1, gap: 2 }}>
          {typeof eyebrow === 'string' ? (
            <RNText numberOfLines={1} style={{ color: colors.headerMuted, fontSize: font.small, fontWeight: '600' }}>
              {eyebrow}
            </RNText>
          ) : (
            eyebrow
          )}
          <RNText accessibilityRole="header" numberOfLines={1} style={{ color: colors.headerText, fontSize: font.title, fontWeight: '800', letterSpacing: -0.5 }}>
            {title}
          </RNText>
        </View>
        {right ? <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm }}>{right}</View> : null}
      </View>
      {children}
    </View>
  );
}

/** A round button for the navy band (add, search…). */
export function HeaderButton({ icon, label, onPress, accent }: { icon: keyof typeof Ionicons.glyphMap; label: string; onPress: () => void; accent?: boolean }) {
  const { colors } = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={() => {
        void Haptics.selectionAsync();
        onPress();
      }}
      style={({ pressed }) => [styles.headerButton, { backgroundColor: accent ? colors.accent : colors.headerSoft, opacity: pressed ? 0.8 : 1 }]}
    >
      <Ionicons name={icon} size={22} color={accent ? colors.onAccent : colors.headerText} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: { borderRadius: radius.lg, borderWidth: StyleSheet.hairlineWidth, padding: space.lg },
  button: { minHeight: 52, borderRadius: radius.md, paddingHorizontal: space.lg, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: space.sm },
  input: { minHeight: 52, borderRadius: radius.md, borderWidth: 1.5, paddingHorizontal: space.md, fontSize: font.body },
  badge: { alignSelf: 'flex-start', borderRadius: radius.pill, paddingHorizontal: space.sm + 2, paddingVertical: 3 },
  empty: { alignItems: 'center', gap: space.md, paddingHorizontal: space.xl, paddingVertical: space.xxl },
  emptyIcon: { width: 72, height: 72, borderRadius: 24, alignItems: 'center', justifyContent: 'center' },
  emptyDot: { position: 'absolute', top: -3, right: -3, width: 16, height: 16, borderRadius: 8, borderWidth: 3 },
  row: { flexDirection: 'row', alignItems: 'center', gap: space.md, paddingVertical: space.md, paddingHorizontal: space.lg, minHeight: 60 },
  segmented: { flexDirection: 'row', borderRadius: radius.md, padding: 4, gap: 4 },
  segment: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingVertical: 9, borderRadius: radius.md - 4 },
  header: { paddingHorizontal: space.lg, gap: space.md, borderBottomLeftRadius: radius.xl, borderBottomRightRadius: radius.xl },
  headerRow: { flexDirection: 'row', alignItems: 'center', gap: space.md },
  headerOverscroll: { position: 'absolute', left: 0, right: 0, top: -1000, height: 1000 },
  headerButton: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
});
