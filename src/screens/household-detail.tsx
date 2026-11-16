import { useState } from 'react';
import { Alert, Linking, Modal, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Stack, router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Avatar, Badge, Button, Card, EmptyState, Row, SectionTitle, Text } from '@/components/ui';
import { SelectField } from '@/components/fields';
import { PendingBanner } from '@/components/pending-banner';
import { useAuth } from '@/lib/auth';
import { getRecord, listRecords, membersOfHousehold } from '@/lib/db';
import { setHead, setHousehold } from '@/lib/mutations';
import { allowedAt, can } from '@/lib/permissions';
import { useLocalQuery } from '@/hooks/use-local-query';
import { HOUSEHOLD_ROLES, householdRoleLabel } from '@/constants';
import type { HouseholdRow, MemberRow } from '@/lib/types';
import { space, useTheme } from '@/theme';

export function HouseholdDetail({ id }: { id: string }) {
  const { me } = useAuth();
  const { colors } = useTheme();
  const q = useLocalQuery(
    async () => ({ h: await getRecord<HouseholdRow>('households', id), people: await membersOfHousehold<MemberRow>(id) }),
    ['records:households', 'records:members', 'records'],
    [id],
  );
  const [adding, setAdding] = useState(false);
  const h = q.data?.h;
  const people = q.data?.people ?? [];
  if (q.loading) return null;
  if (!h) return <EmptyState icon="home-outline" title="Not on this phone" text="This household may have been removed, or is in a part of the church you can’t see." />;

  const canEdit = allowedAt(me, 'household.edit', [h.nodeId]);
  const canEditMembers = can(me, 'member.edit');
  const phone = h.phone?.replace(/[^\d+]/g, '');

  const memberActions = (m: MemberRow) => {
    const buttons: { text: string; style?: 'cancel' | 'destructive'; onPress?: () => void }[] = [{ text: 'Open profile', onPress: () => router.push(`/member/${m.id}`) }];
    if (canEdit && m.householdRole !== 'head') buttons.push({ text: 'Make household head', onPress: () => void setHead(me, h, people, m) });
    if (canEditMembers)
      buttons.push({
        text: 'Remove from household',
        style: 'destructive',
        onPress: () => void setHousehold(me, m, null, null),
      });
    buttons.push({ text: 'Cancel', style: 'cancel' });
    Alert.alert(m.fullName, householdRoleLabel(m.householdRole), buttons);
  };

  return (
    <ScrollView contentContainerStyle={styles.wrap}>
      <Stack.Screen
        options={{
          title: 'Household',
          headerRight: canEdit ? () => <Button title="Edit" variant="ghost" onPress={() => router.push(`/household/${id}/edit`)} style={{ minHeight: 36, paddingHorizontal: space.sm }} /> : undefined,
        }}
      />
      <View style={styles.head}>
        <View style={[styles.homeIcon, { backgroundColor: colors.primarySoft }]}>
          <Ionicons name="home" size={32} color={colors.primary} />
        </View>
        <Text size="heading" style={{ textAlign: 'center' }}>
          {h.name}
        </Text>
        <Text size="small" tone="muted">
          {h.branch}
          {h.pending ? ' · not synced yet' : ''}
        </Text>
      </View>
      <PendingBanner collection="households" id={id} onFix={canEdit ? () => router.push(`/household/${id}/edit`) : undefined} />

      <SectionTitle>{`People (${people.length})`}</SectionTitle>
      <Card style={styles.list}>
        {people.length ? (
          people.map((m) => (
            <Pressable key={m.id} accessibilityRole="button" onPress={() => memberActions(m)} style={({ pressed }) => [styles.person, pressed && { backgroundColor: colors.muted }]}>
              <Avatar name={m.fullName} size={36} />
              <View style={{ flex: 1 }}>
                <Text weight="500">{m.fullName}</Text>
                <Text size="small" tone="muted">
                  {householdRoleLabel(m.householdRole)}
                </Text>
              </View>
              {m.householdRole === 'head' ? <Badge label="Head" tone="primary" /> : null}
            </Pressable>
          ))
        ) : (
          <Text tone="muted" style={{ padding: space.lg }}>
            No one in this household yet.
          </Text>
        )}
      </Card>
      {canEditMembers ? <Button title="Add someone to this household" icon="person-add-outline" variant="secondary" onPress={() => setAdding(true)} style={{ marginTop: space.md }} /> : null}

      <SectionTitle>Contact</SectionTitle>
      <Card style={styles.list}>
        <Row icon="location-outline" title={h.address ?? 'No address'} subtitle="Address" />
        <Row icon="call-outline" title={h.phone ?? 'No phone'} subtitle="Home phone" onPress={phone ? () => void Linking.openURL(`tel:${phone}`) : undefined} />
      </Card>

      <AddPersonSheet open={adding} onClose={() => setAdding(false)} household={h} exclude={people.map((p) => p.id)} />
    </ScrollView>
  );
}

function AddPersonSheet({ open, onClose, household, exclude }: { open: boolean; onClose: () => void; household: HouseholdRow; exclude: string[] }) {
  const { me } = useAuth();
  const { colors } = useTheme();
  const [memberId, setMemberId] = useState<string | null>(null);
  const [role, setRole] = useState<string>('child');
  const all = useLocalQuery(() => listRecords<MemberRow>('members', { limit: 5000 }), ['records:members'], [open]);
  const choices = (all.data ?? []).filter((m) => !exclude.includes(m.id)).map((m) => ({ value: m.id, label: m.fullName, hint: [m.memberNumber, m.phone].filter(Boolean).join(' · ') + (m.householdId ? ' · in another household' : '') }));
  const save = async () => {
    const m = (all.data ?? []).find((x) => x.id === memberId);
    if (!m) return;
    await setHousehold(me, m, household.id, role, household.name);
    setMemberId(null);
    onClose();
  };
  return (
    <Modal visible={open} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }}>
        <View style={{ padding: space.lg, gap: space.lg }}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
            <Text size="heading">Add to {household.name}</Text>
            <Button title="Cancel" variant="ghost" onPress={onClose} style={{ minHeight: 36 }} />
          </View>
          <SelectField label="Person" choices={choices} value={memberId} onChange={setMemberId} placeholder="Search the register" />
          <SelectField label="Role in household" choices={HOUSEHOLD_ROLES} value={role} onChange={(v) => v && setRole(v)} />
          <Button title="Add to household" icon="checkmark" disabled={!memberId} onPress={() => void save()} />
        </View>
      </SafeAreaView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  wrap: { padding: space.lg, gap: space.sm, paddingBottom: space.xxl },
  head: { alignItems: 'center', gap: space.xs, marginBottom: space.md },
  homeIcon: { width: 72, height: 72, borderRadius: 36, alignItems: 'center', justifyContent: 'center' },
  list: { padding: 0, overflow: 'hidden' },
  person: { flexDirection: 'row', alignItems: 'center', gap: space.md, paddingHorizontal: space.lg, paddingVertical: space.md },
});
