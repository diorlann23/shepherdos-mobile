import { useMemo, useState } from 'react';
import { FlatList, Modal, Pressable, StyleSheet, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { font, radius, space, useTheme } from '@/theme';
import { Button, Text } from './ui';
import { displayToIso, isoToDisplay } from '@/lib/validate';

/** Form controls beyond plain text: pickers, dates and segmented choices. */

export interface Choice {
  value: string;
  label: string;
  hint?: string;
}

function FieldShell({ label, error, hint, children }: { label: string; error?: string | null; hint?: string; children: React.ReactNode }) {
  return (
    <View style={{ gap: space.xs }}>
      <Text size="small" weight="600">
        {label}
      </Text>
      {children}
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

/** Tap to choose from a list, with search for long lists. Pass `multiple` to pick several. */
export function SelectField({
  label,
  choices,
  value,
  onChange,
  placeholder = 'Choose…',
  error,
  hint,
  multiple,
  allowClear,
}: {
  label: string;
  choices: Choice[];
  placeholder?: string;
  error?: string | null;
  hint?: string;
  allowClear?: boolean;
} & ({ multiple?: false; value: string | null | undefined; onChange: (v: string | null) => void } | { multiple: true; value: string[]; onChange: (v: string[]) => void })) {
  const { colors } = useTheme();
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const selected = multiple ? (value as string[]) : value ? [value as string] : [];
  const summary = choices.filter((c) => selected.includes(c.value)).map((c) => c.label).join(', ');
  const shown = useMemo(() => (q ? choices.filter((c) => c.label.toLowerCase().includes(q.toLowerCase())) : choices), [choices, q]);

  const pick = (v: string) => {
    if (multiple) {
      const list = value as string[];
      (onChange as (v: string[]) => void)(list.includes(v) ? list.filter((x) => x !== v) : [...list, v]);
    } else {
      (onChange as (v: string | null) => void)(v);
      setOpen(false);
    }
  };

  return (
    <FieldShell label={label} error={error} hint={hint}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${label}: ${summary || 'not chosen'}`}
        onPress={() => setOpen(true)}
        style={[styles.box, { backgroundColor: colors.card, borderColor: error ? colors.danger : colors.border }]}
      >
        <Text numberOfLines={1} style={{ flex: 1, color: summary ? colors.text : colors.textMuted }}>
          {summary || placeholder}
        </Text>
        <Ionicons name="chevron-down" size={18} color={colors.textMuted} />
      </Pressable>
      <Modal visible={open} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setOpen(false)}>
        <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }}>
          <View style={styles.sheetHead}>
            <Text size="heading">{label}</Text>
            <Button title={multiple ? 'Done' : 'Close'} variant="ghost" onPress={() => setOpen(false)} style={{ minHeight: 40 }} />
          </View>
          {choices.length > 8 ? (
            <View style={[styles.search, { backgroundColor: colors.muted }]}>
              <Ionicons name="search" size={18} color={colors.textMuted} />
              <TextInput value={q} onChangeText={setQ} placeholder="Search" placeholderTextColor={colors.textMuted} style={{ flex: 1, color: colors.text, fontSize: font.body }} autoCorrect={false} />
            </View>
          ) : null}
          <FlatList
            data={shown}
            keyExtractor={(c) => c.value}
            keyboardShouldPersistTaps="handled"
            ItemSeparatorComponent={() => <View style={{ height: StyleSheet.hairlineWidth, backgroundColor: colors.border, marginLeft: space.lg }} />}
            ListHeaderComponent={
              allowClear && !multiple && value ? (
                <Pressable
                  onPress={() => {
                    (onChange as (v: string | null) => void)(null);
                    setOpen(false);
                  }}
                  style={styles.option}
                >
                  <Text tone="danger">Clear</Text>
                </Pressable>
              ) : undefined
            }
            renderItem={({ item }) => {
              const on = selected.includes(item.value);
              return (
                <Pressable accessibilityRole="button" accessibilityState={{ selected: on }} onPress={() => pick(item.value)} style={({ pressed }) => [styles.option, pressed && { backgroundColor: colors.muted }]}>
                  <View style={{ flex: 1 }}>
                    <Text weight={on ? '600' : '400'}>{item.label}</Text>
                    {item.hint ? (
                      <Text size="small" tone="muted">
                        {item.hint}
                      </Text>
                    ) : null}
                  </View>
                  {on ? <Ionicons name={multiple ? 'checkbox' : 'checkmark'} size={22} color={colors.primary} /> : multiple ? <Ionicons name="square-outline" size={22} color={colors.textMuted} /> : null}
                </Pressable>
              );
            }}
          />
        </SafeAreaView>
      </Modal>
    </FieldShell>
  );
}

/** A row of buttons for a short list of choices (gender, status). */
export function Segmented({ label, choices, value, onChange, error }: { label: string; choices: Choice[]; value: string | null | undefined; onChange: (v: string | null) => void; error?: string | null }) {
  const { colors } = useTheme();
  return (
    <FieldShell label={label} error={error}>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.sm }}>
        {choices.map((c) => {
          const on = value === c.value;
          return (
            <Pressable
              key={c.value}
              accessibilityRole="button"
              accessibilityState={{ selected: on }}
              onPress={() => onChange(on ? null : c.value)}
              style={[styles.seg, { backgroundColor: on ? colors.primary : colors.card, borderColor: on ? colors.primary : colors.border }]}
            >
              <Text size="small" weight="600" style={{ color: on ? colors.onPrimary : colors.text }}>
                {c.label}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </FieldShell>
  );
}

/** Dates typed as DD/MM/YYYY (slashes added as you type). Stored as YYYY-MM-DD. */
export function DateField({ label, value, onChange, error, hint }: { label: string; value: string | null | undefined; onChange: (iso: string | null, valid: boolean) => void; error?: string | null; hint?: string }) {
  const { colors } = useTheme();
  const [text, setText] = useState(() => (value ? isoToDisplay(value) : ''));
  return (
    <FieldShell label={label} error={error} hint={hint ?? 'Day / month / year'}>
      <TextInput
        value={text}
        accessibilityLabel={label}
        onChangeText={(t) => {
          const digits = t.replace(/\D/g, '').slice(0, 8);
          const shown = [digits.slice(0, 2), digits.slice(2, 4), digits.slice(4, 8)].filter(Boolean).join('/');
          setText(shown);
          if (!digits) return onChange(null, true);
          const iso = displayToIso(shown);
          onChange(iso, !!iso);
        }}
        placeholder="DD/MM/YYYY"
        placeholderTextColor={colors.textMuted}
        keyboardType="number-pad"
        maxLength={10}
        style={[styles.box, { color: colors.text, backgroundColor: colors.card, borderColor: error ? colors.danger : colors.border, fontSize: font.body }]}
      />
    </FieldShell>
  );
}

const styles = StyleSheet.create({
  box: { minHeight: 50, borderRadius: radius.md, borderWidth: 1, paddingHorizontal: space.md, flexDirection: 'row', alignItems: 'center', gap: space.sm },
  sheetHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: space.lg, paddingVertical: space.md },
  search: { flexDirection: 'row', alignItems: 'center', gap: space.sm, borderRadius: radius.md, paddingHorizontal: space.md, minHeight: 44, marginHorizontal: space.lg, marginBottom: space.sm },
  option: { flexDirection: 'row', alignItems: 'center', gap: space.md, paddingHorizontal: space.lg, paddingVertical: space.md, minHeight: 52 },
  seg: { borderRadius: radius.pill, borderWidth: 1, paddingHorizontal: space.md, paddingVertical: 8 },
});
