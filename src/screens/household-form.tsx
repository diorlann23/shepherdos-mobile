import { useMemo, useState } from 'react';
import { Alert, KeyboardAvoidingView, Platform, ScrollView, StyleSheet, View } from 'react-native';
import { Stack, router } from 'expo-router';
import { Button, Card, Input, Text } from '@/components/ui';
import { SelectField } from '@/components/fields';
import { useAuth } from '@/lib/auth';
import { addHousehold, updateHousehold, type HouseholdInput } from '@/lib/mutations';
import { placesFor } from '@/lib/permissions';
import { validPhone } from '@/lib/validate';
import type { HouseholdRow } from '@/lib/types';
import { space } from '@/theme';

export function HouseholdForm({ household, firstMemberId }: { household?: HouseholdRow | null; firstMemberId?: string }) {
  const { me } = useAuth();
  const places = useMemo(() => placesFor(me, household ? 'household.edit' : 'household.create'), [me, household]);
  const [name, setName] = useState(household?.name ?? '');
  const [nodeId, setNodeId] = useState<string | null>(household?.nodeId ?? (places.length === 1 ? places[0].id : null));
  const [address, setAddress] = useState(household?.address ?? '');
  const [phone, setPhone] = useState(household?.phone ?? '');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);

  const save = async () => {
    const e: Record<string, string> = {};
    if (!name.trim()) e.name = 'Give the household a name, e.g. “The Mensah family”';
    if (!nodeId) e.nodeId = 'Choose where it belongs';
    if (!validPhone(phone)) e.phone = 'Enter a valid phone number';
    setErrors(e);
    if (Object.keys(e).length) return;
    setBusy(true);
    try {
      const input: HouseholdInput = { name: name.trim(), nodeId: nodeId!, ...(address.trim() ? { address: address.trim() } : {}), ...(phone.trim() ? { phone: phone.trim() } : {}) };
      if (household) {
        const changes = Object.fromEntries(Object.entries(input).filter(([k, v]) => v !== (household as unknown as Record<string, unknown>)[k])) as Partial<HouseholdInput>;
        await updateHousehold(me, household, changes);
        router.back();
      } else {
        const id = await addHousehold(me, input, firstMemberId ? [firstMemberId] : []);
        router.replace(`/household/${id}`);
      }
    } catch (err) {
      Alert.alert('Not saved', err instanceof Error ? err.message : 'Please try again.');
    } finally {
      setBusy(false);
    }
  };

  if (!places.length) {
    return (
      <View style={{ padding: space.xl }}>
        <Text tone="muted">You don’t have permission to {household ? 'edit' : 'add'} households.</Text>
      </View>
    );
  }
  const choices = places.map((n) => ({ value: n.id, label: n.name }));
  if (household && !choices.some((c) => c.value === household.nodeId)) choices.unshift({ value: household.nodeId, label: household.branch });

  return (
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
      <Stack.Screen options={{ title: household ? 'Edit household' : 'New household' }} />
      <ScrollView contentContainerStyle={styles.wrap} keyboardShouldPersistTaps="handled">
        <Card style={{ gap: space.lg }}>
          <Input label="Household name *" value={name} onChangeText={setName} error={errors.name} placeholder="The Mensah family" autoCapitalize="words" />
          <SelectField label="Belongs to *" choices={choices} value={nodeId} onChange={setNodeId} error={errors.nodeId} />
          <Input label="Address" value={address} onChangeText={setAddress} placeholder="House number, street, area" multiline />
          <Input label="Home phone" value={phone} onChangeText={setPhone} error={errors.phone} keyboardType="phone-pad" />
        </Card>
        <Button title={household ? 'Save changes' : 'Add household'} icon="checkmark" loading={busy} onPress={() => void save()} />
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({ wrap: { padding: space.lg, gap: space.lg, paddingBottom: space.xxl } });
