import { useMemo, useState } from 'react';
import { Alert, KeyboardAvoidingView, Platform, ScrollView, StyleSheet, View } from 'react-native';
import { Stack, router, useLocalSearchParams } from 'expo-router';
import { Button, Card, Input, Text } from '@/components/ui';
import { DateField, Segmented, SelectField } from '@/components/fields';
import { useAuth } from '@/lib/auth';
import { allowedAt } from '@/lib/permissions';
import { listRecords } from '@/lib/db';
import { addVisitor, saveHeadcount, startService, type Headcount, type Service, type ServiceType } from '@/lib/attendance';
import { useLocalQuery } from '@/hooks/use-local-query';
import { validPhone } from '@/lib/validate';
import { GENDERS } from '@/constants';
import { space } from '@/theme';
import { localDay } from './attendance';

const MODES = [
  { value: 'both', label: 'Names and headcount' },
  { value: 'individual', label: 'Names only' },
  { value: 'headcount', label: 'Headcount only' },
];

/** Start a service: pick the kind (Sunday Service…), where, and the day. */
export function NewServiceForm() {
  const { me } = useAuth();
  const params = useLocalSearchParams<{ nodeId?: string; title?: string }>();
  const types = useLocalQuery(() => listRecords<ServiceType>('serviceTypes', { status: 'active', limit: 100 }), ['records:serviceTypes']);
  // Services can be held for a branch, a region, the whole church, or a group (a cell meeting).
  const places = useMemo(() => (me?.nodes ?? []).filter((n) => n.isActive && allowedAt(me, 'attendance.create', [n.id])).sort((a, b) => a.name.localeCompare(b.name)), [me]);
  const [typeId, setTypeId] = useState<string | null>(null);
  const [title, setTitle] = useState(params.title ?? '');
  const [nodeId, setNodeId] = useState<string | null>(params.nodeId && places.some((p) => p.id === params.nodeId) ? params.nodeId : places.length === 1 ? places[0].id : null);
  const [date, setDate] = useState<string | null>(localDay());
  const [dateOk, setDateOk] = useState(true);
  const [mode, setMode] = useState<Service['mode']>('both');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);

  const pickType = (id: string | null) => {
    setTypeId(id);
    const t = types.data?.find((x) => x.id === id);
    if (t) {
      setTitle(t.name);
      setMode(t.defaultMode);
    }
  };

  const save = async () => {
    const e: Record<string, string> = {};
    if (!title.trim()) e.title = 'Give the service a name, or choose its kind';
    if (!nodeId) e.nodeId = 'Choose where the service is held';
    if (!date || !dateOk) e.date = 'Enter the day as DD/MM/YYYY';
    setErrors(e);
    if (Object.keys(e).length) return;
    setBusy(true);
    try {
      const id = await startService(me, { title: title.trim(), nodeId: nodeId!, date: date!, mode, serviceTypeId: typeId });
      router.replace(`/service/${id}`);
    } catch (err) {
      Alert.alert('Not started', err instanceof Error ? err.message : 'Please try again.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
      <Stack.Screen options={{ title: 'Start a service' }} />
      <ScrollView contentContainerStyle={styles.wrap} keyboardShouldPersistTaps="handled">
        <Card style={{ gap: space.lg }}>
          {types.data?.length ? <SelectField label="Kind of service" choices={types.data.map((t) => ({ value: t.id, label: t.name, hint: t.startTime ?? undefined }))} value={typeId} onChange={pickType} placeholder="Choose, or type a name below" allowClear /> : null}
          <Input label="Name *" value={title} onChangeText={setTitle} error={errors.title} placeholder="Sunday Service" autoCapitalize="words" />
          <SelectField label="Held at *" choices={places.map((n) => ({ value: n.id, label: n.name, hint: n.kind === 'group' || n.kind === 'department' ? 'Group' : undefined }))} value={nodeId} onChange={setNodeId} error={errors.nodeId} />
          <DateField
            label="Day *"
            value={date}
            error={errors.date}
            hint="Today unless you’re entering an earlier service"
            onChange={(iso, ok) => {
              setDate(iso);
              setDateOk(ok);
            }}
          />
          <SelectField label="What to record" choices={MODES} value={mode} onChange={(v) => v && setMode(v as Service['mode'])} />
        </Card>
        <Button title="Start service" icon="play" loading={busy} onPress={() => void save()} />
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const COUNT_FIELDS: { key: keyof Headcount; label: string }[] = [
  { key: 'men', label: 'Men' },
  { key: 'women', label: 'Women' },
  { key: 'children', label: 'Children' },
  { key: 'firstTimers', label: 'First-timers' },
  { key: 'online', label: 'Watching online' },
];

/** Headcount: the total adds up men, women and children unless typed in directly. */
export function HeadcountForm({ service }: { service: Service }) {
  const h = service.headcount ?? { total: 0, men: 0, women: 0, children: 0, firstTimers: 0, online: 0 };
  const [v, setV] = useState<Record<keyof Headcount, string>>(() => Object.fromEntries(Object.entries(h).map(([k, n]) => [k, n ? String(n) : ''])) as Record<keyof Headcount, string>);
  const [totalTyped, setTotalTyped] = useState(!!h.total && h.total !== h.men + h.women + h.children);
  const num = (s: string) => Math.max(0, Math.min(1_000_000, parseInt(s.replace(/\D/g, '') || '0', 10)));
  const sum = num(v.men) + num(v.women) + num(v.children);
  const total = totalTyped ? num(v.total) : sum;

  const save = async () => {
    const headcount = Object.fromEntries(COUNT_FIELDS.map((f) => [f.key, num(v[f.key])])) as unknown as Headcount;
    headcount.total = total;
    await saveHeadcount(service, headcount);
    router.back();
  };

  return (
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
      <Stack.Screen options={{ title: 'Headcount' }} />
      <ScrollView contentContainerStyle={styles.wrap} keyboardShouldPersistTaps="handled">
        <Text tone="muted">{service.title}</Text>
        <Card style={{ gap: space.lg }}>
          <View style={styles.grid}>
            {COUNT_FIELDS.map((f) => (
              <View key={f.key} style={styles.cell}>
                <Input label={f.label} value={v[f.key]} onChangeText={(t) => setV({ ...v, [f.key]: t.replace(/\D/g, '') })} keyboardType="number-pad" placeholder="0" style={styles.count} />
              </View>
            ))}
          </View>
          <Input
            label="Total in the building"
            value={totalTyped ? v.total : String(sum)}
            onChangeText={(t) => {
              setTotalTyped(true);
              setV({ ...v, total: t.replace(/\D/g, '') });
            }}
            keyboardType="number-pad"
            hint={totalTyped ? 'Typed in directly' : 'Men + women + children. Type to change it.'}
            style={[styles.count, { fontWeight: '700' }]}
          />
        </Card>
        <Button title="Save headcount" icon="checkmark" onPress={() => void save()} />
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

/** Someone new at the door: register and check in, in one step. */
export function VisitorForm({ service }: { service: Service }) {
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [phone, setPhone] = useState('');
  const [gender, setGender] = useState<string | null>(null);
  const [area, setArea] = useState('');
  const [invitedBy, setInvitedBy] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);

  const save = async (another: boolean) => {
    const e: Record<string, string> = {};
    if (!firstName.trim()) e.firstName = 'First name is required';
    if (!lastName.trim()) e.lastName = 'Last name is required';
    if (!validPhone(phone)) e.phone = 'Enter a valid phone number';
    setErrors(e);
    if (Object.keys(e).length) return;
    setBusy(true);
    try {
      await addVisitor(service, {
        firstName: firstName.trim(),
        lastName: lastName.trim(),
        phone: phone.trim() || undefined,
        gender: (gender as 'male' | 'female' | null) ?? undefined,
        area: area.trim() || undefined,
        invitedBy: invitedBy.trim() || undefined,
      });
      if (another) {
        setFirstName('');
        setLastName('');
        setPhone('');
        setGender(null);
        setArea('');
        setInvitedBy('');
        Alert.alert('Checked in', `${firstName.trim()} is welcomed and checked in.`);
      } else router.back();
    } finally {
      setBusy(false);
    }
  };

  return (
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
      <Stack.Screen options={{ title: 'First-timer' }} />
      <ScrollView contentContainerStyle={styles.wrap} keyboardShouldPersistTaps="handled">
        <Text tone="muted">They’re added as a visitor, checked in to {service.title}, and put on the first-timers follow-up list.</Text>
        <Card style={{ gap: space.lg }}>
          <Input label="First name *" value={firstName} onChangeText={setFirstName} error={errors.firstName} autoCapitalize="words" autoFocus />
          <Input label="Last name *" value={lastName} onChangeText={setLastName} error={errors.lastName} autoCapitalize="words" />
          <Input label="Phone" value={phone} onChangeText={setPhone} error={errors.phone} keyboardType="phone-pad" placeholder="024 412 3456" />
          <Segmented label="Gender" choices={GENDERS} value={gender} onChange={setGender} />
          <Input label="Area" value={area} onChangeText={setArea} placeholder="e.g. Madina" autoCapitalize="words" />
          <Input label="Invited by" value={invitedBy} onChangeText={setInvitedBy} placeholder="Who brought them?" autoCapitalize="words" />
        </Card>
        <Button title="Check in" icon="checkmark" loading={busy} onPress={() => void save(false)} />
        <Button title="Check in and add another" variant="secondary" disabled={busy} onPress={() => void save(true)} />
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  wrap: { padding: space.lg, gap: space.lg, paddingBottom: space.xxl },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: space.md },
  cell: { flexBasis: '46%', flexGrow: 1 },
  count: { fontSize: 22, textAlign: 'center' },
});
