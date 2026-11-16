import { useMemo, useState } from 'react';
import { Alert, KeyboardAvoidingView, Platform, ScrollView, StyleSheet, View } from 'react-native';
import { Stack, router } from 'expo-router';
import { Button, Card, Input, SectionTitle, Text } from '@/components/ui';
import { DateField, Segmented, SelectField } from '@/components/fields';
import { useAuth } from '@/lib/auth';
import { addMember, updateMember, type MemberInput } from '@/lib/mutations';
import { groupsOf, placesFor } from '@/lib/permissions';
import { clean, validEmail, validPhone } from '@/lib/validate';
import { listRecords } from '@/lib/db';
import { useLocalQuery } from '@/hooks/use-local-query';
import { GENDERS, HOUSEHOLD_ROLES, MARITAL_STATUSES, MEMBER_STATUSES } from '@/constants';
import type { HouseholdRow, MemberRow } from '@/lib/types';
import { space } from '@/theme';

interface Form {
  firstName: string;
  middleName: string;
  lastName: string;
  phone: string;
  whatsapp: string;
  secondaryPhone: string;
  email: string;
  area: string;
  occupation: string;
  gender: string | null;
  maritalStatus: string | null;
  dateOfBirth: string | null;
  dateJoined: string | null;
  nodeId: string | null;
  groupIds: string[];
  status: string;
  householdId: string | null;
  householdRole: string | null;
}

/**
 * Add or edit a member. `quick` is the first-timer form for the door: name,
 * phone and a few details, saved as a visitor.
 */
export function MemberForm({ member, quick }: { member?: MemberRow | null; quick?: boolean }) {
  const { me } = useAuth();
  const places = useMemo(() => placesFor(me, member ? 'member.edit' : 'member.create'), [me, member]);
  const groups = useMemo(() => groupsOf(me), [me]);
  const households = useLocalQuery(() => listRecords<HouseholdRow>('households', { limit: 2000 }), ['records:households']);
  const hidden = new Set(me?.org?.settings.memberFormHidden ?? []);
  const required = new Set(me?.org?.settings.memberFormRequired ?? []);

  const [f, setF] = useState<Form>(() => ({
    firstName: member?.firstName ?? '',
    middleName: member?.middleName ?? '',
    lastName: member?.lastName ?? '',
    phone: member?.phone ?? '',
    whatsapp: member?.whatsapp ?? '',
    secondaryPhone: member?.secondaryPhone ?? '',
    email: member?.email ?? '',
    area: member?.area ?? '',
    occupation: member?.occupation ?? '',
    gender: member?.gender ?? null,
    maritalStatus: member?.maritalStatus ?? null,
    dateOfBirth: member?.dateOfBirth?.slice(0, 10) ?? null,
    dateJoined: member?.dateJoined?.slice(0, 10) ?? null,
    nodeId: member?.nodeId ?? (places.length === 1 ? places[0].id : null),
    groupIds: member?.groups.map((g) => g.id) ?? [],
    status: member?.status ?? (quick ? 'visitor' : 'member'),
    householdId: member?.householdId ?? null,
    householdRole: member?.householdRole ?? null,
  }));
  const [badDates, setBadDates] = useState<Record<string, boolean>>({});
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const set = <K extends keyof Form>(k: K, v: Form[K]) => setF((x) => ({ ...x, [k]: v }));
  const show = (field: string) => !hidden.has(field) && (!quick || ['firstName', 'lastName', 'phone', 'gender', 'area', 'nodeId'].includes(field) || required.has(field));
  const label = (text: string, field: string) => (required.has(field) ? `${text} *` : text);

  const toInput = (): MemberInput => ({
    firstName: f.firstName.trim(),
    middleName: clean(f.middleName),
    lastName: f.lastName.trim(),
    gender: f.gender,
    dateOfBirth: f.dateOfBirth,
    maritalStatus: f.maritalStatus,
    phone: clean(f.phone),
    whatsapp: clean(f.whatsapp),
    secondaryPhone: clean(f.secondaryPhone),
    email: clean(f.email)?.toLowerCase() ?? null,
    area: clean(f.area),
    occupation: clean(f.occupation),
    nodeId: f.nodeId!,
    groups: f.groupIds.map((nodeId) => ({ nodeId, role: (member?.groups.find((g) => g.id === nodeId)?.role as 'member' | 'leader' | 'assistant') ?? 'member' })),
    status: f.status,
    dateJoined: f.dateJoined,
    householdId: f.householdId,
    householdRole: f.householdId ? (f.householdRole ?? 'other') : null,
  });

  const validate = () => {
    const e: Record<string, string> = {};
    if (!f.firstName.trim()) e.firstName = 'First name is required';
    if (!f.lastName.trim()) e.lastName = 'Last name is required';
    if (!f.nodeId) e.nodeId = 'Choose where they belong';
    for (const k of ['phone', 'whatsapp', 'secondaryPhone'] as const) if (!validPhone(f[k])) e[k] = 'Enter a valid phone number';
    if (!validEmail(f.email)) e.email = 'Enter a valid email';
    for (const [k, bad] of Object.entries(badDates)) if (bad) e[k] = 'Enter a real date as DD/MM/YYYY';
    for (const k of required) {
      // The church's own required fields. Ones this form doesn't have (e.g. address) are checked by the server.
      const v = k === 'groups' ? (f.groupIds.length ? 'yes' : '') : (f as unknown as Record<string, unknown>)[k];
      if (show(k) && k in f && (v === null || v === undefined || v === '')) e[k] = 'This field is required';
      if (k === 'groups' && show(k) && groups.length && !f.groupIds.length) e.groups = 'This field is required';
    }
    setErrors(e);
    return !Object.keys(e).length;
  };

  const save = async () => {
    if (!validate()) return;
    setBusy(true);
    try {
      const input = toInput();
      if (member) {
        // Send only what changed.
        const before: Record<string, unknown> = {
          ...member,
          groups: member.groups.map((g) => g.id).sort().join(','),
          dateOfBirth: member.dateOfBirth?.slice(0, 10) ?? null,
          dateJoined: member.dateJoined?.slice(0, 10) ?? null,
        };
        const changes = Object.fromEntries(
          Object.entries(input).filter(([k, v]) => {
            const now = k === 'groups' ? (v as { nodeId: string }[]).map((g) => g.nodeId).sort().join(',') : v;
            return (now ?? null) !== (before[k] ?? null);
          }),
        ) as Partial<MemberInput>;
        await updateMember(me, member, changes);
        router.back();
      } else {
        const id = await addMember(me, input);
        router.replace(`/member/${id}`);
      }
    } catch (e) {
      Alert.alert('Not saved', e instanceof Error ? e.message : 'Please try again.');
    } finally {
      setBusy(false);
    }
  };

  if (!places.length) {
    return (
      <View style={{ padding: space.xl }}>
        <Text tone="muted">You don’t have permission to {member ? 'edit' : 'add'} members anywhere in this church.</Text>
      </View>
    );
  }

  const placeChoices = places.map((n) => ({ value: n.id, label: n.name, hint: n.kind === 'root' ? 'Whole church' : n.kind === 'region' ? 'Region' : undefined }));
  // Someone you can edit through a group may belong to a branch you can't move people into: still show it.
  if (member && !placeChoices.some((c) => c.value === member.nodeId)) placeChoices.unshift({ value: member.nodeId, label: member.branchName, hint: undefined });
  const householdChoices = (households.data ?? []).map((h) => ({ value: h.id, label: h.name, hint: h.branch }));

  return (
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
      <Stack.Screen options={{ title: member ? 'Edit member' : quick ? 'New first-timer' : 'New member' }} />
      <ScrollView contentContainerStyle={styles.wrap} keyboardShouldPersistTaps="handled">
        {quick ? (
          <Text tone="muted">Quick entry for someone new at the door. They’re saved as a visitor and appear on the first-timers list.</Text>
        ) : null}

        <SectionTitle>Name</SectionTitle>
        <Card style={styles.card}>
          <Input label="First name *" value={f.firstName} onChangeText={(t) => set('firstName', t)} error={errors.firstName} autoCapitalize="words" textContentType="givenName" />
          {show('middleName') ? <Input label={label('Middle name', 'middleName')} value={f.middleName} onChangeText={(t) => set('middleName', t)} error={errors.middleName} autoCapitalize="words" /> : null}
          <Input label="Last name *" value={f.lastName} onChangeText={(t) => set('lastName', t)} error={errors.lastName} autoCapitalize="words" textContentType="familyName" />
          {show('gender') ? <Segmented label={label('Gender', 'gender')} choices={GENDERS} value={f.gender} onChange={(v) => set('gender', v)} error={errors.gender} /> : null}
          {show('dateOfBirth') ? (
            <DateField
              label={label('Date of birth', 'dateOfBirth')}
              value={f.dateOfBirth}
              error={errors.dateOfBirth}
              onChange={(iso, ok) => {
                set('dateOfBirth', iso);
                setBadDates((b) => ({ ...b, dateOfBirth: !ok }));
              }}
            />
          ) : null}
          {show('maritalStatus') ? <SelectField label={label('Marital status', 'maritalStatus')} choices={MARITAL_STATUSES} value={f.maritalStatus} onChange={(v) => set('maritalStatus', v)} error={errors.maritalStatus} allowClear /> : null}
        </Card>

        <SectionTitle>Contact</SectionTitle>
        <Card style={styles.card}>
          {show('phone') ? <Input label={label('Phone', 'phone')} value={f.phone} onChangeText={(t) => set('phone', t)} error={errors.phone} keyboardType="phone-pad" textContentType="telephoneNumber" placeholder="024 412 3456" /> : null}
          {show('whatsapp') ? <Input label={label('WhatsApp', 'whatsapp')} value={f.whatsapp} onChangeText={(t) => set('whatsapp', t)} error={errors.whatsapp} keyboardType="phone-pad" hint="Leave blank if it’s the same as the phone." /> : null}
          {show('secondaryPhone') ? <Input label={label('Other phone', 'secondaryPhone')} value={f.secondaryPhone} onChangeText={(t) => set('secondaryPhone', t)} error={errors.secondaryPhone} keyboardType="phone-pad" /> : null}
          {show('email') ? <Input label={label('Email', 'email')} value={f.email} onChangeText={(t) => set('email', t)} error={errors.email} keyboardType="email-address" autoCapitalize="none" textContentType="emailAddress" /> : null}
          {show('area') ? <Input label={label('Area', 'area')} value={f.area} onChangeText={(t) => set('area', t)} error={errors.area} placeholder="e.g. East Legon" autoCapitalize="words" /> : null}
          {show('occupation') ? <Input label={label('Occupation', 'occupation')} value={f.occupation} onChangeText={(t) => set('occupation', t)} error={errors.occupation} autoCapitalize="sentences" /> : null}
        </Card>

        <SectionTitle>Church</SectionTitle>
        <Card style={styles.card}>
          <SelectField label="Belongs to *" choices={placeChoices} value={f.nodeId} onChange={(v) => set('nodeId', v)} error={errors.nodeId} />
          {!quick ? <SelectField label="Status" choices={MEMBER_STATUSES} value={f.status} onChange={(v) => v && set('status', v)} /> : null}
          {show('groups') && groups.length ? (
            <SelectField label={label('Groups and ministries', 'groups')} multiple choices={groups.map((g) => ({ value: g.id, label: g.name }))} value={f.groupIds} onChange={(v) => set('groupIds', v)} placeholder="None" error={errors.groups} />
          ) : null}
          {show('dateJoined') ? (
            <DateField
              label={label('Date joined', 'dateJoined')}
              value={f.dateJoined}
              hint="Leave blank for today"
              error={errors.dateJoined}
              onChange={(iso, ok) => {
                set('dateJoined', iso);
                setBadDates((b) => ({ ...b, dateJoined: !ok }));
              }}
            />
          ) : null}
        </Card>

        {show('householdId') ? (
          <>
            <SectionTitle>Household</SectionTitle>
            <Card style={styles.card}>
              <SelectField label="Household" choices={householdChoices} value={f.householdId} onChange={(v) => set('householdId', v)} placeholder="None" allowClear />
              {f.householdId ? <SelectField label="Role in household" choices={HOUSEHOLD_ROLES} value={f.householdRole ?? 'other'} onChange={(v) => set('householdRole', v)} /> : null}
            </Card>
          </>
        ) : null}

        <Button title={member ? 'Save changes' : quick ? 'Add first-timer' : 'Add member'} icon="checkmark" loading={busy} onPress={() => void save()} style={{ marginTop: space.xl }} />
        <Text size="small" tone="muted" style={{ textAlign: 'center' }}>
          Saved on this phone straight away, and sent to the church records when you’re online.
        </Text>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  wrap: { padding: space.lg, gap: space.sm, paddingBottom: space.xxl * 2 },
  card: { gap: space.lg },
});
