import { useMemo, useState } from 'react';
import { ActivityIndicator, Alert, KeyboardAvoidingView, Linking, Platform, Pressable, ScrollView, StyleSheet, Switch, View } from 'react-native';
import { Stack, router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Avatar, Badge, Button, Card, EmptyState, Input, Row, SectionTitle, Text } from '@/components/ui';
import { DateField, Segmented, SelectField } from '@/components/fields';
import { PendingBanner } from '@/components/pending-banner';
import { useAuth } from '@/lib/auth';
import { allowedAt, can, groupsOf } from '@/lib/permissions';
import { getRecord, listRecords } from '@/lib/db';
import {
  PRAYER_STATUS,
  STAGES,
  VISIT_TYPES,
  addPrayer,
  logVisit,
  personOf,
  publishNotice,
  readPrivate,
  setPrayerStatus,
  stageLabel,
  updateFollowUp,
  type FollowUp,
  type Notice,
  type PrayerRow,
  type Stage,
  type VisitRow,
} from '@/lib/ministry';
import type { RosterPerson } from '@/lib/attendance';
import type { MemberRow } from '@/lib/types';
import { formatDate, relativeTime } from '@/lib/format';
import { useLocalQuery } from '@/hooks/use-local-query';
import { ApiError, OfflineError } from '@/lib/api';
import { radius, space, useTheme } from '@/theme';
import { localDay } from './attendance';

const rowStyle = (colors: ReturnType<typeof useTheme>['colors'], pressed: boolean) => [styles.row, { backgroundColor: colors.card, borderColor: colors.border, opacity: pressed ? 0.8 : 1 }];

// ---- Groups -----------------------------------------------------------------------------------
/** Groups, cells and departments, with who's in them. Leaders take the group's attendance from here. */
export function GroupList() {
  const { me } = useAuth();
  const { colors } = useTheme();
  const groups = groupsOf(me);
  const counts = useLocalQuery(async () => {
    const people = can(me, 'member.view') ? await listRecords<MemberRow>('members', { limit: 20000 }) : [];
    const n: Record<string, number> = {};
    for (const m of people) for (const g of m.groups) n[g.id] = (n[g.id] ?? 0) + 1;
    return n;
  }, ['records:members']);
  return (
    <ScrollView contentContainerStyle={styles.wrap}>
      <Stack.Screen options={{ title: 'Groups' }} />
      {groups.length ? (
        groups.map((g) => (
          <Pressable key={g.id} accessibilityRole="button" onPress={() => router.push(`/groups/${g.id}`)} style={({ pressed }) => rowStyle(colors, pressed)}>
            <View style={[styles.icon, { backgroundColor: colors.primarySoft }]}>
              <Ionicons name={g.kind === 'department' ? 'briefcase-outline' : 'people-outline'} size={18} color={colors.primary} />
            </View>
            <View style={{ flex: 1 }}>
              <Text weight="600">{g.name}</Text>
              <Text size="small" tone="muted">
                {g.kind === 'department' ? 'Department' : (g.category ?? 'Group')}
                {counts.data?.[g.id] ? ` · ${counts.data[g.id]} people` : ''}
              </Text>
            </View>
            <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
          </Pressable>
        ))
      ) : (
        <EmptyState icon="people-outline" title="No groups" text="Groups, cells and departments in your part of the church appear here." />
      )}
    </ScrollView>
  );
}

export function GroupDetail({ id }: { id: string }) {
  const { me } = useAuth();
  const group = me?.nodes.find((n) => n.id === id);
  const q = useLocalQuery(async () => {
    // Full records if this person can see the register; otherwise the check-in list (names only).
    if (can(me, 'member.view')) return (await listRecords<MemberRow>('members', { limit: 20000 })).filter((m) => m.groups.some((g) => g.id === id)).map((m) => ({ id: m.id, name: m.fullName, sub: [m.groups.find((g) => g.id === id)?.role, m.phone].filter(Boolean).join(' · '), link: true }));
    return [] as { id: string; name: string; sub: string; link: boolean }[];
  }, ['records:members'], [id]);
  if (!group) return <EmptyState icon="people-outline" title="Group not found" />;
  const canTake = allowedAt(me, 'attendance.create', [id]);
  const people = q.data ?? [];
  return (
    <ScrollView contentContainerStyle={styles.wrap}>
      <Stack.Screen options={{ title: group.name }} />
      {canTake ? <Button title="Take attendance" icon="checkmark-done-outline" onPress={() => router.push(`/service/new?nodeId=${id}&title=${encodeURIComponent(`${group.name} meeting`)}`)} /> : null}
      <SectionTitle>{`People (${people.length})`}</SectionTitle>
      <Card style={{ padding: 0, overflow: 'hidden' }}>
        {people.length ? (
          people.map((p) => (
            <Pressable key={p.id} onPress={p.link ? () => router.push(`/member/${p.id}`) : undefined} style={styles.person}>
              <Avatar name={p.name} size={36} />
              <View style={{ flex: 1 }}>
                <Text weight="500">{p.name}</Text>
                {p.sub ? (
                  <Text size="small" tone="muted">
                    {p.sub}
                  </Text>
                ) : null}
              </View>
            </Pressable>
          ))
        ) : (
          <Text tone="muted" style={{ padding: space.lg }}>
            {can(me, 'member.view') ? 'No one in this group yet.' : 'Your role doesn’t include the member register.'}
          </Text>
        )}
      </Card>
    </ScrollView>
  );
}

// ---- Notices --------------------------------------------------------------------------------
export function NoticeList() {
  const { me } = useAuth();
  const { colors } = useTheme();
  const q = useLocalQuery(() => listRecords<Notice>('announcements', { limit: 300 }), ['records:announcements', 'records']);
  const list = q.data ?? [];
  return (
    <ScrollView contentContainerStyle={styles.wrap}>
      <Stack.Screen
        options={{
          title: 'Notices',
          headerRight: can(me, 'message.create') ? () => <Button title="New" variant="ghost" onPress={() => router.push('/notices/new')} style={{ minHeight: 36, paddingHorizontal: 8 }} /> : undefined,
        }}
      />
      {list.map((n) => (
        <Pressable key={n.id} accessibilityRole="button" onPress={() => router.push(`/notices/${n.id}`)} style={({ pressed }) => [rowStyle(colors, pressed), { alignItems: 'flex-start' }]}>
          <View style={{ flex: 1, gap: 4 }}>
            <Text weight="600">{n.title}</Text>
            <Text size="small" tone="muted" numberOfLines={2}>
              {n.body}
            </Text>
            <Text size="tiny" tone="muted">
              {relativeTime(n.publishAt)} · {n.nodeName}
            </Text>
          </View>
          {n.pending ? <Badge label="Not synced" tone="warning" /> : n.status !== 'published' ? <Badge label={n.status === 'scheduled' ? 'Scheduled' : 'Draft'} tone="muted" /> : null}
        </Pressable>
      ))}
      {!list.length && !q.loading ? <EmptyState icon="megaphone-outline" title="No notices" text="Announcements for your church appear here." /> : null}
    </ScrollView>
  );
}

export function NoticeDetail({ id }: { id: string }) {
  const q = useLocalQuery(() => getRecord<Notice>('announcements', id), ['records:announcements', 'records'], [id]);
  const n = q.data;
  if (q.loading) return null;
  if (!n) return <EmptyState icon="megaphone-outline" title="Notice not on this phone" />;
  return (
    <ScrollView contentContainerStyle={styles.wrap}>
      <Stack.Screen options={{ title: 'Notice' }} />
      <Text size="heading">{n.title}</Text>
      <Text size="small" tone="muted">
        {formatDate(n.publishAt)} · {n.nodeName}
        {n.createdBy ? ` · ${n.createdBy}` : ''}
      </Text>
      <PendingBanner collection="announcements" id={n.id} />
      <Card>
        <Text>{n.body}</Text>
      </Card>
    </ScrollView>
  );
}

export function NoticeForm() {
  const { me } = useAuth();
  const places = useMemo(() => (me?.nodes ?? []).filter((n) => n.isActive && allowedAt(me, 'message.create', [n.id])).sort((a, b) => a.name.localeCompare(b.name)), [me]);
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [nodeId, setNodeId] = useState<string | null>(places.length === 1 ? places[0].id : null);
  const [email, setEmail] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const save = () => {
    const e: Record<string, string> = {};
    if (title.trim().length < 2) e.title = 'Give it a title';
    if (body.trim().length < 2) e.body = 'Write the notice';
    if (!nodeId) e.nodeId = 'Choose who it’s for';
    setErrors(e);
    if (Object.keys(e).length) return;
    Alert.alert('Publish this notice?', `Everyone in ${places.find((p) => p.id === nodeId)?.name} will see it${email ? ' and get an email' : ''}.`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Publish',
        onPress: async () => {
          const id = await publishNotice(me, { title: title.trim(), body: body.trim(), nodeId: nodeId!, email });
          router.replace(`/notices/${id}`);
        },
      },
    ]);
  };
  return (
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
      <Stack.Screen options={{ title: 'New notice' }} />
      <ScrollView contentContainerStyle={styles.wrap} keyboardShouldPersistTaps="handled">
        <Card style={{ gap: space.lg }}>
          <Input label="Title *" value={title} onChangeText={setTitle} error={errors.title} placeholder="Youth camp registration" autoCapitalize="sentences" />
          <Input label="Notice *" value={body} onChangeText={setBody} error={errors.body} multiline style={{ minHeight: 140, textAlignVertical: 'top', paddingTop: 12 }} />
          <SelectField label="For *" choices={places.map((n) => ({ value: n.id, label: n.name }))} value={nodeId} onChange={setNodeId} error={errors.nodeId} />
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.md }}>
            <Text style={{ flex: 1 }}>Also send by email</Text>
            <Switch value={email} onValueChange={setEmail} accessibilityLabel="Also send by email" />
          </View>
        </Card>
        <Button title="Publish" icon="megaphone-outline" onPress={save} />
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

// ---- First-timer follow-up ------------------------------------------------------------------------
export function FollowUpBoard() {
  const { me } = useAuth();
  const { colors } = useTheme();
  const [mine, setMine] = useState(false);
  const q = useLocalQuery(() => listRecords<FollowUp>('followups', { limit: 2000 }), ['records:followups', 'records']);
  const list = (q.data ?? []).filter((f) => !mine || f.assignedTo?.id === me?.user.id);
  const stages = STAGES.filter((s) => s.value !== 'closed');
  return (
    <ScrollView contentContainerStyle={styles.wrap}>
      <Stack.Screen options={{ title: 'First-timers' }} />
      <Segmented
        label=""
        choices={[
          { value: 'all', label: `All (${(q.data ?? []).filter((f) => f.stage !== 'closed').length})` },
          { value: 'mine', label: 'Assigned to me' },
        ]}
        value={mine ? 'mine' : 'all'}
        onChange={(v) => setMine(v === 'mine')}
      />
      {stages.map((st) => {
        const inStage = list.filter((f) => f.stage === st.value);
        if (!inStage.length) return null;
        return (
          <View key={st.value} style={{ gap: space.sm }}>
            <SectionTitle>{`${st.label} (${inStage.length})`}</SectionTitle>
            {inStage.map((f) => (
              <Pressable key={f.id} accessibilityRole="button" onPress={() => router.push(`/firsttimers/${f.id}`)} style={({ pressed }) => rowStyle(colors, pressed)}>
                <Avatar name={f.name} size={36} />
                <View style={{ flex: 1 }}>
                  <Text weight="600">{f.name}</Text>
                  <Text size="small" tone="muted" numberOfLines={1}>
                    {[`First visit ${formatDate(f.firstVisitDate)}`, f.assignedTo ? f.assignedTo.name : 'Not assigned'].join(' · ')}
                  </Text>
                </View>
              </Pressable>
            ))}
          </View>
        );
      })}
      {!list.length && !q.loading ? <EmptyState icon="person-add-outline" title={mine ? 'No one assigned to you' : 'No first-timers to follow up'} /> : null}
    </ScrollView>
  );
}

export function FollowUpDetail({ id }: { id: string }) {
  const { me } = useAuth();
  const q = useLocalQuery(() => getRecord<FollowUp>('followups', id), ['records:followups', 'records'], [id]);
  const [note, setNote] = useState('');
  const f = q.data;
  if (q.loading) return null;
  if (!f) return <EmptyState icon="person-add-outline" title="Not on this phone" />;
  const phone = f.phone?.replace(/[^\d+]/g, '');
  const next = STAGES[STAGES.findIndex((s) => s.value === f.stage) + 1];
  const move = (stage: Stage) => void updateFollowUp(me, f, { stage, note: note.trim() || undefined }).then(() => setNote(''));
  return (
    <ScrollView contentContainerStyle={styles.wrap}>
      <Stack.Screen options={{ title: f.name }} />
      <View style={{ alignItems: 'center', gap: space.xs }}>
        <Avatar name={f.name} size={64} />
        <Text size="heading">{f.name}</Text>
        <Badge label={stageLabel(f.stage)} tone={f.stage === 'joined' ? 'success' : f.stage === 'closed' ? 'muted' : 'primary'} />
      </View>
      <PendingBanner collection="followups" id={f.id} />
      {phone ? (
        <View style={{ flexDirection: 'row', gap: space.sm }}>
          <Button title="Call" icon="call-outline" variant="secondary" style={{ flex: 1 }} onPress={() => void Linking.openURL(`tel:${phone}`)} />
          <Button title="WhatsApp" icon="logo-whatsapp" variant="secondary" style={{ flex: 1 }} onPress={() => void Linking.openURL(`https://wa.me/${phone.replace(/\D/g, '')}`)} />
        </View>
      ) : null}
      <Card style={{ padding: 0, overflow: 'hidden' }}>
        <Row icon="calendar-outline" title={formatDate(f.firstVisitDate)} subtitle="First visit" />
        <Row icon="location-outline" title={f.area ?? 'Not recorded'} subtitle="Area" />
        <Row icon="person-outline" title={f.assignedTo?.name ?? 'No one yet'} subtitle="Following up" />
        <Row icon="open-outline" title="Open member record" onPress={() => router.push(`/member/${f.memberId}`)} />
      </Card>
      {f.canEdit ? (
        <Card style={{ gap: space.md }}>
          <Input label="Note" value={note} onChangeText={setNote} placeholder="Called, will come next Sunday…" multiline />
          {next && f.stage !== 'closed' ? <Button title={`Move to ${next.label}`} icon="arrow-forward" onPress={() => move(next.value)} /> : null}
          <View style={{ flexDirection: 'row', gap: space.sm }}>
            <Button title="Save note" variant="secondary" style={{ flex: 1 }} disabled={!note.trim()} onPress={() => void updateFollowUp(me, f, { note: note.trim() }).then(() => setNote(''))} />
            {f.assignedTo?.id !== me?.user.id ? <Button title="Assign to me" variant="secondary" style={{ flex: 1 }} onPress={() => void updateFollowUp(me, f, { assignToMe: true })} /> : null}
          </View>
          {f.stage !== 'closed' ? (
            <Button
              title="Close"
              variant="ghost"
              onPress={() =>
                Alert.alert('Close this follow-up?', 'Use this when they won’t be coming back.', [
                  { text: 'Cancel', style: 'cancel' },
                  { text: 'Close', style: 'destructive', onPress: () => move('closed') },
                ])
              }
            />
          ) : null}
        </Card>
      ) : null}
      {f.notes.length ? (
        <>
          <SectionTitle>Notes</SectionTitle>
          <Card style={{ gap: space.md }}>
            {[...f.notes].reverse().map((n, i) => (
              <View key={i}>
                <Text>{n.text}</Text>
                <Text size="tiny" tone="muted">
                  {formatDate(n.at)} · {n.byName}
                </Text>
              </View>
            ))}
          </Card>
        </>
      ) : null}
    </ScrollView>
  );
}

// ---- Prayer requests and pastoral visits -------------------------------------------------------------
export function PastoralList() {
  const { me } = useAuth();
  const { colors } = useTheme();
  const showPrayer = can(me, 'prayer.view');
  const showVisits = can(me, 'visit.view');
  const [tab, setTab] = useState<'prayer' | 'visits'>(showPrayer ? 'prayer' : 'visits');
  const prayer = useLocalQuery(() => listRecords<PrayerRow>('prayer', { limit: 1000 }), ['records:prayer', 'records']);
  const visits = useLocalQuery(() => listRecords<VisitRow>('visits', { limit: 1000 }), ['records:visits', 'records']);
  const canAdd = tab === 'prayer' ? can(me, 'prayer.create') : can(me, 'visit.create');
  return (
    <ScrollView contentContainerStyle={styles.wrap}>
      <Stack.Screen
        options={{
          title: 'Prayer & visits',
          headerRight: canAdd ? () => <Button title="New" variant="ghost" onPress={() => router.push(`/pastoral/new?kind=${tab}`)} style={{ minHeight: 36, paddingHorizontal: 8 }} /> : undefined,
        }}
      />
      {showPrayer && showVisits ? (
        <Segmented
          label=""
          choices={[
            { value: 'prayer', label: 'Prayer requests' },
            { value: 'visits', label: 'Visits' },
          ]}
          value={tab}
          onChange={(v) => v && setTab(v as 'prayer' | 'visits')}
        />
      ) : null}
      <Card style={{ flexDirection: 'row', gap: space.sm, alignItems: 'center' }}>
        <Ionicons name="lock-closed-outline" size={18} color={colors.primary} />
        <Text size="small" tone="muted" style={{ flex: 1 }}>
          The words of requests and visit notes are never stored on this phone. Open one while online to read it.
        </Text>
      </Card>
      {tab === 'prayer'
        ? (prayer.data ?? []).map((p) => (
            <Pressable key={p.id} accessibilityRole="button" onPress={() => router.push(`/pastoral/prayer/${p.id}`)} style={({ pressed }) => rowStyle(colors, pressed)}>
              <View style={{ flex: 1 }}>
                <Text weight="600">{personOf(p)}</Text>
                <Text size="small" tone="muted">
                  {formatDate(p.createdAt)}
                  {p.isConfidential ? ' · confidential' : ''}
                </Text>
              </View>
              {p.pending ? <Badge label="Not synced" tone="warning" /> : <Badge label={PRAYER_STATUS.find((s) => s.value === p.status)?.label ?? p.status} tone={p.status === 'answered' ? 'success' : p.status === 'closed' ? 'muted' : 'primary'} />}
            </Pressable>
          ))
        : (visits.data ?? []).map((v) => (
            <Pressable key={v.id} accessibilityRole="button" onPress={() => router.push(`/pastoral/visit/${v.id}`)} style={({ pressed }) => rowStyle(colors, pressed)}>
              <View style={{ flex: 1 }}>
                <Text weight="600">{personOf(v)}</Text>
                <Text size="small" tone="muted">
                  {[VISIT_TYPES.find((t) => t.value === v.type)?.label, formatDate(v.date), v.visitedBy].filter(Boolean).join(' · ')}
                </Text>
              </View>
              {v.pending ? <Badge label="Not synced" tone="warning" /> : v.followUpNeeded ? <Badge label="Follow-up" tone="warning" /> : null}
            </Pressable>
          ))}
      {tab === 'prayer' && !prayer.loading && !prayer.data?.length ? <EmptyState icon="heart-outline" title="No prayer requests" /> : null}
      {tab === 'visits' && !visits.loading && !visits.data?.length ? <EmptyState icon="home-outline" title="No visits logged" /> : null}
    </ScrollView>
  );
}

/** Reads the private words online, keeps them only on screen. */
function PrivateText({ kind, id, restricted, pending }: { kind: 'prayer' | 'visits'; id: string; restricted: boolean; pending?: boolean }) {
  const [state, setState] = useState<{ loading: boolean; text?: string | null; error?: string }>({ loading: false });
  if (pending) return <Text tone="muted">Saved, waiting to be sent. Once it reaches the server it can be read online by the people allowed to.</Text>;
  if (!restricted) return <Text tone="muted">No {kind === 'prayer' ? 'request text' : 'notes'}.</Text>;
  const load = async () => {
    setState({ loading: true });
    try {
      setState({ loading: false, text: await readPrivate(kind, id) });
    } catch (e) {
      setState({ loading: false, error: e instanceof OfflineError ? 'You’re offline. Connect to read it.' : e instanceof ApiError ? e.message : 'Couldn’t open it.' });
    }
  };
  if (state.loading) return <ActivityIndicator />;
  if (state.text) return <Text>{state.text}</Text>;
  if (state.text === null) return <Text tone="muted">Only the pastors who manage these can read the words.</Text>;
  return (
    <View style={{ gap: space.sm }}>
      {state.error ? (
        <Text size="small" tone="danger">
          {state.error}
        </Text>
      ) : null}
      <Button title={kind === 'prayer' ? 'Read the request' : 'Read the notes'} icon="lock-open-outline" variant="secondary" onPress={() => void load()} />
    </View>
  );
}

export function PrayerDetail({ id }: { id: string }) {
  const q = useLocalQuery(() => getRecord<PrayerRow>('prayer', id), ['records:prayer', 'records'], [id]);
  const p = q.data;
  if (q.loading) return null;
  if (!p) return <EmptyState icon="heart-outline" title="Not on this phone" />;
  return (
    <ScrollView contentContainerStyle={styles.wrap}>
      <Stack.Screen options={{ title: 'Prayer request' }} />
      <Text size="heading">{personOf(p)}</Text>
      <Text size="small" tone="muted">
        {formatDate(p.createdAt)}
        {p.isConfidential ? ' · confidential (pastors only)' : ''}
      </Text>
      <PendingBanner collection="prayer" id={p.id} />
      <Card>
        <PrivateText kind="prayer" id={p.id} restricted={(p._restricted ?? []).includes('request')} pending={p.pending} />
      </Card>
      {p.canEdit && !p.pending ? (
        <Card style={{ gap: space.sm }}>
          <Text weight="600">Status</Text>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.sm }}>
            {PRAYER_STATUS.map((s) => (
              <Button key={s.value} title={s.label} variant={p.status === s.value ? 'primary' : 'secondary'} onPress={() => void setPrayerStatus(p, s.value as PrayerRow['status'])} style={{ flexGrow: 1 }} />
            ))}
          </View>
        </Card>
      ) : null}
    </ScrollView>
  );
}

export function VisitDetail({ id }: { id: string }) {
  const q = useLocalQuery(() => getRecord<VisitRow>('visits', id), ['records:visits', 'records'], [id]);
  const v = q.data;
  if (q.loading) return null;
  if (!v) return <EmptyState icon="home-outline" title="Not on this phone" />;
  return (
    <ScrollView contentContainerStyle={styles.wrap}>
      <Stack.Screen options={{ title: 'Visit' }} />
      <Text size="heading">{personOf(v)}</Text>
      <PendingBanner collection="visits" id={v.id} />
      <Card style={{ padding: 0, overflow: 'hidden' }}>
        <Row icon="home-outline" title={VISIT_TYPES.find((t) => t.value === v.type)?.label ?? v.type} subtitle="Visit" />
        <Row icon="calendar-outline" title={formatDate(v.date)} subtitle="Date" />
        <Row icon="person-outline" title={v.visitedBy ?? 'Not recorded'} subtitle="Visited by" />
        <Row icon="flag-outline" title={v.followUpNeeded ? 'Yes' : 'No'} subtitle="Follow-up needed" />
      </Card>
      <Card>
        <PrivateText kind="visits" id={v.id} restricted={(v._restricted ?? []).includes('notes')} pending={v.pending} />
      </Card>
    </ScrollView>
  );
}

export function PastoralForm({ kind }: { kind: 'prayer' | 'visits' }) {
  const { me } = useAuth();
  const people = useLocalQuery(async () => {
    if (can(me, 'member.view')) return (await listRecords<MemberRow>('members', { limit: 20000 })).map((m) => ({ id: m.id, name: m.fullName, nodeId: m.nodeId }));
    return (await listRecords<RosterPerson>('roster', { limit: 20000 })).map((r) => ({ id: r.id, name: r.name, nodeId: r.nodeId }));
  }, ['records:members', 'records:roster']);
  const permission = kind === 'prayer' ? 'prayer.create' : 'visit.create';
  const places = useMemo(() => (me?.nodes ?? []).filter((n) => n.isActive && allowedAt(me, permission, [n.id])).sort((a, b) => a.name.localeCompare(b.name)), [me, permission]);
  const [memberId, setMemberId] = useState<string | null>(null);
  const [requesterName, setRequesterName] = useState('');
  const [text, setText] = useState('');
  const [confidential, setConfidential] = useState(true);
  const [type, setType] = useState<string | null>('home');
  const [date, setDate] = useState<string | null>(localDay());
  const [dateOk, setDateOk] = useState(true);
  const [visitedBy, setVisitedBy] = useState(me?.user.name ?? '');
  const [followUp, setFollowUp] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});

  const save = async () => {
    const e: Record<string, string> = {};
    const person = people.data?.find((p) => p.id === memberId);
    const nodeId = person && places.some((p) => p.id === person.nodeId) ? person.nodeId : places[0]?.id;
    if (!nodeId) e.memberId = 'You can’t add these here.';
    if (kind === 'prayer') {
      if (!memberId && !requesterName.trim()) e.memberId = 'Choose who it’s for, or type a name';
      if (text.trim().length < 2) e.text = 'Write the request';
    } else {
      if (!person) e.memberId = 'Choose who was visited';
      if (!date || !dateOk) e.date = 'Enter the day as DD/MM/YYYY';
    }
    setErrors(e);
    if (Object.keys(e).length) return;
    if (kind === 'prayer') {
      await addPrayer({ memberId: person?.id, memberName: person?.name, requesterName: person ? undefined : requesterName.trim(), request: text.trim(), isConfidential: confidential, nodeId: nodeId! });
    } else {
      await logVisit({ memberId: person!.id, memberName: person!.name, type: type ?? 'other', date: date!, visitedBy: visitedBy.trim() || undefined, followUpNeeded: followUp, notes: text.trim() || undefined, nodeId: nodeId! });
    }
    router.back();
  };

  return (
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
      <Stack.Screen options={{ title: kind === 'prayer' ? 'New prayer request' : 'Log a visit' }} />
      <ScrollView contentContainerStyle={styles.wrap} keyboardShouldPersistTaps="handled">
        <Card style={{ gap: space.lg }}>
          <SelectField label={kind === 'prayer' ? 'For a member' : 'Who was visited *'} choices={(people.data ?? []).map((p) => ({ value: p.id, label: p.name }))} value={memberId} onChange={setMemberId} error={errors.memberId} placeholder="Search" allowClear />
          {kind === 'prayer' && !memberId ? <Input label="Or their name" value={requesterName} onChangeText={setRequesterName} autoCapitalize="words" /> : null}
          {kind === 'visits' ? (
            <>
              <SelectField label="Kind of visit" choices={VISIT_TYPES} value={type} onChange={setType} />
              <DateField
                label="Date *"
                value={date}
                error={errors.date}
                onChange={(iso, ok) => {
                  setDate(iso);
                  setDateOk(ok);
                }}
              />
              <Input label="Visited by" value={visitedBy} onChangeText={setVisitedBy} autoCapitalize="words" />
            </>
          ) : null}
          <Input
            label={kind === 'prayer' ? 'Request *' : 'Notes'}
            value={text}
            onChangeText={setText}
            error={errors.text}
            multiline
            style={{ minHeight: 120, textAlignVertical: 'top', paddingTop: 12 }}
            hint="Sent encrypted, and removed from this phone once it reaches the server."
          />
          {kind === 'prayer' ? (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.md }}>
              <Text style={{ flex: 1 }}>Confidential (pastors only)</Text>
              <Switch value={confidential} onValueChange={setConfidential} accessibilityLabel="Confidential" />
            </View>
          ) : (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.md }}>
              <Text style={{ flex: 1 }}>Follow-up needed</Text>
              <Switch value={followUp} onValueChange={setFollowUp} accessibilityLabel="Follow-up needed" />
            </View>
          )}
        </Card>
        <Button title="Save" icon="checkmark" onPress={() => void save()} />
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  wrap: { padding: space.lg, gap: space.md, paddingBottom: space.xxl },
  row: { flexDirection: 'row', alignItems: 'center', gap: space.md, padding: space.md, borderRadius: radius.lg, borderWidth: StyleSheet.hairlineWidth },
  icon: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  person: { flexDirection: 'row', alignItems: 'center', gap: space.md, paddingHorizontal: space.lg, paddingVertical: space.md },
});
