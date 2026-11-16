import { Alert, Linking, ScrollView, StyleSheet, View } from 'react-native';
import { Stack, router } from 'expo-router';
import { Avatar, Badge, Button, Card, EmptyState, Row, SectionTitle, Text } from '@/components/ui';
import { PendingBanner } from '@/components/pending-banner';
import { useAuth } from '@/lib/auth';
import { allowedAt } from '@/lib/permissions';
import { updateMember } from '@/lib/mutations';
import { getRecord } from '@/lib/db';
import { formatDate, relativeTime } from '@/lib/format';
import { useLocalQuery } from '@/hooks/use-local-query';
import { MEMBER_STATUSES, householdRoleLabel, statusLabel } from '@/constants';
import type { HouseholdRow, MemberRow } from '@/lib/types';
import { space } from '@/theme';
import { statusTone } from './members';

export function MemberDetail({ id }: { id: string }) {
  const { me } = useAuth();
  const q = useLocalQuery(
    async () => {
      const m = await getRecord<MemberRow>('members', id);
      const household = m?.householdId ? await getRecord<HouseholdRow>('households', m.householdId) : null;
      return { m, household };
    },
    ['records:members', 'records:households', 'records'],
    [id],
  );
  const m = q.data?.m;
  if (q.loading) return null;
  if (!m) return <EmptyState icon="person-outline" title="Not on this phone" text="This person may have been removed, or moved to a part of the church you can’t see." />;
  const phone = m.phone?.replace(/[^\d+]/g, '');
  const canEdit = allowedAt(me, 'member.edit', [m.nodeId, ...m.groups.map((g) => g.id)]);
  const edit = () => router.push(`/member/${m.id}/edit`);
  const changeStatus = () =>
    Alert.alert(
      'Change status',
      `${m.fullName} is now: ${statusLabel(m.status)}`,
      [
        ...MEMBER_STATUSES.filter((s) => s.value !== m.status && ['visitor', 'new_convert', 'member', 'worker', 'leader', 'inactive'].includes(s.value)).map((s) => ({
          text: s.label,
          onPress: () => void updateMember(me, m, { status: s.value }, `${m.fullName}: ${s.label}`),
        })),
        { text: 'Cancel', style: 'cancel' as const },
      ],
    );

  return (
    <ScrollView contentContainerStyle={styles.wrap}>
      <Stack.Screen
        options={{
          title: m.firstName,
          headerRight: canEdit ? () => <Button title="Edit" variant="ghost" onPress={edit} style={{ minHeight: 36, paddingHorizontal: 8 }} /> : undefined,
        }}
      />
      <View style={styles.head}>
        <Avatar name={m.fullName} size={72} />
        <Text size="heading" style={{ textAlign: 'center' }}>
          {m.fullName}
        </Text>
        <View style={{ flexDirection: 'row', gap: space.sm, alignItems: 'center' }}>
          <Badge label={statusLabel(m.status)} tone={statusTone(m.status)} />
          <Text size="small" tone="muted">
            {m.memberNumber || 'Number given when synced'}
          </Text>
        </View>
      </View>
      <PendingBanner collection="members" id={m.id} onFix={canEdit ? edit : undefined} />

      {phone ? (
        <View style={styles.actions}>
          <Button title="Call" icon="call-outline" variant="secondary" style={{ flex: 1 }} onPress={() => void Linking.openURL(`tel:${phone}`)} />
          <Button title="SMS" icon="chatbubble-outline" variant="secondary" style={{ flex: 1 }} onPress={() => void Linking.openURL(`sms:${phone}`)} />
          <Button title="WhatsApp" icon="logo-whatsapp" variant="secondary" style={{ flex: 1 }} onPress={() => void Linking.openURL(`https://wa.me/${phone.replace(/\D/g, '')}`)} />
        </View>
      ) : null}

      <SectionTitle>Contact</SectionTitle>
      <Card style={styles.list}>
        <Row icon="call-outline" title={m.phone ?? 'No phone'} subtitle="Phone" />
        <Row icon="mail-outline" title={m.email ?? 'No email'} subtitle="Email" onPress={m.email ? () => void Linking.openURL(`mailto:${m.email}`) : undefined} />
        <Row icon="location-outline" title={m.area ?? 'Not recorded'} subtitle="Area" />
      </Card>

      <SectionTitle>Church</SectionTitle>
      <Card style={styles.list}>
        <Row icon="business-outline" title={m.branchName} subtitle="Branch" />
        <Row icon="people-outline" title={m.groups.length ? m.groups.map((g) => g.name).join(', ') : 'None'} subtitle="Groups and ministries" />
        <Row
          icon="home-outline"
          title={q.data?.household?.name ?? (m.householdId ? 'Household' : 'None')}
          subtitle={m.householdId ? `Household · ${householdRoleLabel(m.householdRole)}` : 'Household'}
          onPress={m.householdId ? () => router.push(`/household/${m.householdId}`) : canEdit ? () => router.push(`/household/new?member=${m.id}`) : undefined}
          right={!m.householdId && canEdit ? <Text size="small" tone="primary">Create</Text> : undefined}
        />
      </Card>
      {canEdit ? <Button title="Change status" icon="swap-horizontal-outline" variant="secondary" onPress={changeStatus} style={{ marginTop: space.lg }} /> : null}

      <SectionTitle>Dates</SectionTitle>
      <Card style={styles.list}>
        <Row icon="gift-outline" title={m.dateOfBirth ? `${formatDate(m.dateOfBirth)}${m.age !== null ? ` (${m.age})` : ''}` : 'Not recorded'} subtitle="Birthday" />
        <Row icon="calendar-outline" title={formatDate(m.dateJoined)} subtitle="Joined" />
        <Row icon="checkmark-done-outline" title={m.lastAttendedAt ? relativeTime(m.lastAttendedAt) : 'No attendance yet'} subtitle="Last attended" />
      </Card>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  wrap: { padding: space.lg, paddingBottom: space.xxl },
  head: { alignItems: 'center', gap: space.sm, marginBottom: space.lg },
  actions: { flexDirection: 'row', gap: space.sm },
  list: { padding: 0, overflow: 'hidden' },
});
