import { useState } from 'react';
import { Alert, Linking, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { Stack, router } from 'expo-router';
import { Badge, Button, Card, EmptyState, Input, Row, SectionTitle, Text } from '@/components/ui';
import { SelectField } from '@/components/fields';
import { PendingBanner } from '@/components/pending-banner';
import { useAuth } from '@/lib/auth';
import { getRecord, listRecords, recordsWithStatus } from '@/lib/db';
import { register, type ChurchEvent, type Registration } from '@/lib/ministry';
import { useLocalQuery } from '@/hooks/use-local-query';
import type { MemberRow } from '@/lib/types';
import { can } from '@/lib/permissions';
import { radius, space, useTheme } from '@/theme';

const when = (e: Pick<ChurchEvent, 'startsAt' | 'endsAt'>) => {
  const s = new Date(e.startsAt);
  const day = s.toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' });
  const time = s.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  return `${day}, ${time}`;
};
const STATUS: Record<ChurchEvent['status'], string> = { draft: 'Draft', pending_approval: 'Awaiting approval', published: 'Published', cancelled: 'Cancelled' };

export function EventList() {
  const { colors } = useTheme();
  const q = useLocalQuery(async () => (await listRecords<ChurchEvent>('events', { limit: 500 })).filter((e) => !e.hidden), ['records:events', 'records']);
  const list = q.data ?? [];
  const upcoming = list.filter((e) => new Date(e.endsAt ?? e.startsAt).getTime() >= Date.now() - 3_600_000);
  const past = list.filter((e) => !upcoming.includes(e)).reverse();
  const row = (e: ChurchEvent) => (
    <Pressable key={e.id} accessibilityRole="button" onPress={() => router.push(`/events/${e.id}`)} style={({ pressed }) => [styles.row, { backgroundColor: colors.card, borderColor: colors.border, opacity: pressed ? 0.8 : 1 }]}>
      <View style={[styles.date, { backgroundColor: colors.primarySoft }]}>
        <Text size="tiny" tone="primary" weight="700">
          {new Date(e.startsAt).toLocaleDateString(undefined, { month: 'short' }).toUpperCase()}
        </Text>
        <Text size="heading" tone="primary">
          {new Date(e.startsAt).getDate()}
        </Text>
      </View>
      <View style={{ flex: 1, gap: 2 }}>
        <Text weight="600" numberOfLines={1}>
          {e.title}
        </Text>
        <Text size="small" tone="muted" numberOfLines={1}>
          {[when(e), e.location ?? e.nodeName].join(' · ')}
        </Text>
      </View>
      {e.status !== 'published' ? <Badge label={STATUS[e.status]} tone="warning" /> : e.registrationOpen ? <Badge label={`${e.registrationCount}${e.capacity ? `/${e.capacity}` : ''}`} tone="primary" /> : null}
    </Pressable>
  );
  return (
    <ScrollView contentContainerStyle={styles.wrap}>
      <Stack.Screen options={{ title: 'Events' }} />
      {upcoming.length ? upcoming.map(row) : !q.loading ? <EmptyState icon="calendar-outline" title="No upcoming events" /> : null}
      {past.length ? <SectionTitle>Recent</SectionTitle> : null}
      {past.slice(0, 20).map(row)}
    </ScrollView>
  );
}

export function EventDetail({ id }: { id: string }) {
  const { me } = useAuth();
  const q = useLocalQuery(async () => ({ e: await getRecord<ChurchEvent>('events', id), regs: await recordsWithStatus<Registration>('registrations', id) }), ['records:events', 'records:registrations', 'records'], [id]);
  const members = useLocalQuery(() => (can(me, 'member.view') ? listRecords<MemberRow>('members', { limit: 20000 }) : Promise.resolve([])), ['records:members']);
  const [who, setWho] = useState<string | null>(null);
  const [guestName, setGuestName] = useState('');
  const [guests, setGuests] = useState('0');
  const e = q.data?.e;
  if (q.loading) return null;
  if (!e || e.hidden) return <EmptyState icon="calendar-outline" title="Event not on this phone" />;
  const regs = (q.data?.regs ?? []).filter((r) => r.status !== 'cancelled');
  const mineMemberId = me?.memberId ?? null;
  const open = e.status === 'published' && e.registrationOpen;
  const full = !!e.capacity && e.registrationCount >= e.capacity;

  const registerSelf = () =>
    Alert.alert('Register for this event?', e.title, [
      { text: 'Cancel', style: 'cancel' },
      { text: full ? 'Join waiting list' : 'Register', onPress: () => void register(e, { memberId: mineMemberId ?? undefined, name: me?.user.name ?? '', guests: 0 }) },
    ]);
  const registerOther = async () => {
    const m = members.data?.find((x) => x.id === who);
    const name = m?.fullName ?? guestName.trim();
    if (!name) return Alert.alert('Who?', 'Choose a member or type a guest’s name.');
    await register(e, { memberId: m?.id, name, guests: Math.min(20, parseInt(guests || '0', 10) || 0) });
    setWho(null);
    setGuestName('');
    setGuests('0');
  };

  return (
    <ScrollView contentContainerStyle={styles.wrap}>
      <Stack.Screen options={{ title: 'Event' }} />
      <Text size="heading">{e.title}</Text>
      {e.status !== 'published' ? <Badge label={STATUS[e.status]} tone="warning" /> : null}
      <Card style={{ padding: 0, overflow: 'hidden' }}>
        <Row icon="time-outline" title={when(e)} subtitle={e.endsAt ? `Until ${new Date(e.endsAt).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' })}` : 'Starts'} />
        <Row icon="location-outline" title={e.location ?? 'Not given'} subtitle="Where" onPress={e.location ? () => void Linking.openURL(`https://maps.google.com/?q=${encodeURIComponent(e.location!)}`) : undefined} />
        <Row icon="business-outline" title={e.nodeName} subtitle="Organised by" />
        {e.registrationOpen ? <Row icon="people-outline" title={`${e.registrationCount}${e.capacity ? ` of ${e.capacity}` : ''} registered`} subtitle={full ? 'Full: new registrations join the waiting list' : 'Registration open'} /> : null}
      </Card>
      {e.description ? (
        <Card>
          <Text>{e.description}</Text>
        </Card>
      ) : null}

      {open && mineMemberId && !e.canManage ? <Button title={full ? 'Join the waiting list' : 'Register me'} icon="checkmark-circle-outline" onPress={registerSelf} /> : null}

      {e.canManage && open ? (
        <>
          <SectionTitle>Register someone</SectionTitle>
          <Card style={{ gap: space.md }}>
            {members.data?.length ? <SelectField label="Member" choices={members.data.map((m) => ({ value: m.id, label: m.fullName, hint: m.memberNumber }))} value={who} onChange={setWho} placeholder="Search the register" allowClear /> : null}
            {!who ? <Input label="Or a guest’s name" value={guestName} onChangeText={setGuestName} autoCapitalize="words" /> : null}
            <Input label="Bringing guests" value={guests} onChangeText={(t) => setGuests(t.replace(/\D/g, '').slice(0, 2))} keyboardType="number-pad" />
            <Button title="Register" icon="add" onPress={() => void registerOther()} />
          </Card>
        </>
      ) : null}
      <PendingBanner collection="registrations" id={id} />

      {e.canManage ? (
        <>
          <SectionTitle>{`Registered (${regs.length})`}</SectionTitle>
          <Card style={{ padding: 0, overflow: 'hidden' }}>
            {regs.length ? (
              regs.map((r) => (
                <Row
                  key={r.id}
                  icon={r.status === 'waitlisted' ? 'hourglass-outline' : 'person-outline'}
                  title={r.name}
                  subtitle={[r.guests ? `+${r.guests} guests` : null, r.status === 'waitlisted' ? 'Waiting list' : null, r.phone].filter(Boolean).join(' · ') || undefined}
                  right={r.pending ? <Badge label="Not synced" tone="warning" /> : undefined}
                  onPress={r.phone ? () => void Linking.openURL(`tel:${r.phone}`) : undefined}
                />
              ))
            ) : (
              <Text tone="muted" style={{ padding: space.lg }}>
                No one yet.
              </Text>
            )}
          </Card>
        </>
      ) : null}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  wrap: { padding: space.lg, gap: space.md, paddingBottom: space.xxl },
  row: { flexDirection: 'row', alignItems: 'center', gap: space.md, padding: space.md, borderRadius: radius.lg, borderWidth: StyleSheet.hairlineWidth },
  date: { width: 52, height: 52, borderRadius: radius.md, alignItems: 'center', justifyContent: 'center' },
});
