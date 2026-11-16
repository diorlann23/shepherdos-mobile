import { useMemo, useState } from 'react';
import { Alert, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { Stack, router } from 'expo-router';
import { Badge, Button, Card, EmptyState, Input, Row, SectionTitle, Text } from '@/components/ui';
import { DateField, Segmented, SelectField } from '@/components/fields';
import { PendingBanner } from '@/components/pending-banner';
import { useAuth } from '@/lib/auth';
import { allowedAt, can } from '@/lib/permissions';
import { getRecord, listRecords } from '@/lib/db';
import { OPEN_TASK, TASK_STATUS, createTask, moveTask, taskMoves, type Colleague, type Task } from '@/lib/ministry';
import { formatDate } from '@/lib/format';
import { useLocalQuery } from '@/hooks/use-local-query';
import { radius, space, useTheme } from '@/theme';

const tone = (t: Task) => (t.overdue ? 'danger' : t.status === 'done' || t.status === 'verified' ? 'success' : t.status === 'cancelled' || t.status === 'declined' ? 'muted' : 'primary') as 'danger' | 'success' | 'muted' | 'primary';
const PRIORITY = [
  { value: 'low', label: 'Low' },
  { value: 'normal', label: 'Normal' },
  { value: 'high', label: 'High' },
  { value: 'urgent', label: 'Urgent' },
];

/** My tasks first, then the ones I gave out. */
export function TaskList() {
  const { me } = useAuth();
  const [view, setView] = useState<'mine' | 'assigned'>('mine');
  const [showDone, setShowDone] = useState(false);
  const q = useLocalQuery(() => listRecords<Task>('tasks', { limit: 500 }), ['records:tasks', 'records']);
  const all = q.data ?? [];
  const list = all.filter((t) => (view === 'mine' ? t.isMine : t.iAssigned || (!t.isMine && t.canEdit))).filter((t) => showDone || OPEN_TASK.includes(t.status));
  return (
    <ScrollView contentContainerStyle={styles.wrap}>
      <Stack.Screen
        options={{
          title: 'Tasks',
          headerRight: can(me, 'task.create') ? () => <Button title="New" variant="ghost" onPress={() => router.push('/tasks/new')} style={{ minHeight: 36, paddingHorizontal: 8 }} /> : undefined,
        }}
      />
      <Segmented
        label=""
        choices={[
          { value: 'mine', label: `For me (${all.filter((t) => t.isMine && OPEN_TASK.includes(t.status)).length})` },
          { value: 'assigned', label: 'I assigned' },
        ]}
        value={view}
        onChange={(v) => v && setView(v as 'mine' | 'assigned')}
      />
      {list.map((t) => (
        <TaskRow key={t.id} t={t} who={view === 'mine' ? `From ${t.assignedBy.name}` : `To ${t.assignedTo.name}`} />
      ))}
      {!list.length && !q.loading ? <EmptyState icon="checkbox-outline" title={view === 'mine' ? 'Nothing for you right now' : 'No tasks given out'} /> : null}
      <Button title={showDone ? 'Hide finished' : 'Show finished'} variant="ghost" onPress={() => setShowDone(!showDone)} />
    </ScrollView>
  );
}

function TaskRow({ t, who }: { t: Task; who: string }) {
  const { colors } = useTheme();
  return (
    <Pressable accessibilityRole="button" onPress={() => router.push(`/tasks/${t.id}`)} style={({ pressed }) => [styles.row, { backgroundColor: colors.card, borderColor: colors.border, opacity: pressed ? 0.8 : 1 }]}>
      <View style={{ flex: 1, gap: 2 }}>
        <Text weight="600" numberOfLines={2}>
          {t.title}
        </Text>
        <Text size="small" tone={t.overdue ? 'danger' : 'muted'} numberOfLines={1}>
          {[who, t.dueDate ? `${t.overdue ? 'Overdue · ' : 'Due '}${formatDate(t.dueDate)}` : null].filter(Boolean).join(' · ')}
        </Text>
      </View>
      {t.pending ? <Badge label="Not synced" tone="warning" /> : <Badge label={TASK_STATUS[t.status]} tone={tone(t)} />}
    </Pressable>
  );
}

export function TaskDetail({ id }: { id: string }) {
  const { me } = useAuth();
  const q = useLocalQuery(() => getRecord<Task>('tasks', id), ['records:tasks', 'records'], [id]);
  const [note, setNote] = useState('');
  const t = q.data;
  if (q.loading) return null;
  if (!t) return <EmptyState icon="checkbox-outline" title="Task not on this phone" />;
  const moves = taskMoves(t);
  const go = (m: (typeof moves)[number]) =>
    Alert.alert(`${m.label}?`, t.title, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: m.label,
        style: m.destructive ? 'destructive' : 'default',
        onPress: () => {
          void moveTask(me, t, m.to, note.trim() || undefined);
          setNote('');
        },
      },
    ]);
  return (
    <ScrollView contentContainerStyle={styles.wrap}>
      <Stack.Screen options={{ title: 'Task' }} />
      <Text size="heading">{t.title}</Text>
      <View style={{ flexDirection: 'row', gap: space.sm }}>
        <Badge label={TASK_STATUS[t.status]} tone={tone(t)} />
        {t.priority !== 'normal' ? <Badge label={t.priority} tone={t.priority === 'urgent' || t.priority === 'high' ? 'warning' : 'muted'} /> : null}
      </View>
      <PendingBanner collection="tasks" id={t.id} />
      {t.description ? (
        <Card>
          <Text>{t.description}</Text>
        </Card>
      ) : null}
      <Card style={{ padding: 0, overflow: 'hidden' }}>
        <Row icon="person-outline" title={t.assignedTo.name} subtitle="For" />
        <Row icon="send-outline" title={t.assignedBy.name} subtitle="From" />
        <Row icon="calendar-outline" title={t.dueDate ? formatDate(t.dueDate) : 'No due date'} subtitle={t.overdue ? 'Overdue' : 'Due'} />
        <Row icon="business-outline" title={t.nodeName} subtitle="Part of the church" />
      </Card>
      {moves.length ? (
        <Card style={{ gap: space.md }}>
          <Input label="Note (optional)" value={note} onChangeText={setNote} placeholder="Anything they should know" />
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.sm }}>
            {moves.map((m) => (
              <Button key={m.to} title={m.label} variant={m.destructive ? 'danger' : m.to === 'done' || m.to === 'verified' ? 'primary' : 'secondary'} onPress={() => go(m)} style={{ flexGrow: 1 }} />
            ))}
          </View>
        </Card>
      ) : null}
      {t.history.length ? (
        <>
          <SectionTitle>History</SectionTitle>
          <Card style={{ gap: space.sm }}>
            {[...t.history].reverse().map((h, i) => (
              <Text key={i} size="small" tone="muted">
                {formatDate(h.at)} · {h.byName ?? ''}: {h.note ?? TASK_STATUS[h.to as Task['status']] ?? h.to}
              </Text>
            ))}
          </Card>
        </>
      ) : null}
    </ScrollView>
  );
}

export function TaskForm() {
  const { me } = useAuth();
  const people = useLocalQuery(() => listRecords<Colleague>('colleagues', { limit: 5000 }), ['records:colleagues']);
  const places = useMemo(() => (me?.nodes ?? []).filter((n) => n.isActive && allowedAt(me, 'task.create', [n.id])).sort((a, b) => a.name.localeCompare(b.name)), [me]);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [who, setWho] = useState<string | null>(null);
  const [nodeId, setNodeId] = useState<string | null>(places.length === 1 ? places[0].id : null);
  const [due, setDue] = useState<string | null>(null);
  const [dueOk, setDueOk] = useState(true);
  const [priority, setPriority] = useState<'low' | 'normal' | 'high' | 'urgent'>('normal');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const save = async () => {
    const e: Record<string, string> = {};
    if (title.trim().length < 2) e.title = 'Give the task a title';
    if (!who) e.who = 'Choose who should do it';
    if (!nodeId) e.nodeId = 'Choose which part of the church it’s for';
    if (!dueOk) e.due = 'Enter a real date as DD/MM/YYYY';
    setErrors(e);
    if (Object.keys(e).length) return;
    const assignee = people.data!.find((p) => p.id === who)!;
    const id = await createTask(me, { title: title.trim(), description: description.trim() || undefined, assignedTo: assignee, nodeId: nodeId!, dueDate: due ?? undefined, priority });
    router.replace(`/tasks/${id}`);
  };
  return (
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
      <Stack.Screen options={{ title: 'New task' }} />
      <ScrollView contentContainerStyle={styles.wrap} keyboardShouldPersistTaps="handled">
        <Card style={{ gap: space.lg }}>
          <Input label="What needs doing? *" value={title} onChangeText={setTitle} error={errors.title} placeholder="Call the new families from Sunday" autoCapitalize="sentences" />
          <SelectField label="Who should do it? *" choices={(people.data ?? []).map((p) => ({ value: p.id, label: p.name, hint: p.email }))} value={who} onChange={setWho} error={errors.who} placeholder="Search people" />
          <SelectField label="For *" choices={places.map((n) => ({ value: n.id, label: n.name }))} value={nodeId} onChange={setNodeId} error={errors.nodeId} />
          <DateField
            label="Due"
            value={due}
            error={errors.due}
            hint="Optional"
            onChange={(iso, ok) => {
              setDue(iso);
              setDueOk(ok);
            }}
          />
          <Segmented label="Priority" choices={PRIORITY} value={priority} onChange={(v) => v && setPriority(v as typeof priority)} />
          <Input label="Details" value={description} onChangeText={setDescription} multiline style={{ minHeight: 80, textAlignVertical: 'top', paddingTop: 12 }} />
        </Card>
        <Button title="Assign task" icon="send" onPress={() => void save()} />
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  wrap: { padding: space.lg, gap: space.md, paddingBottom: space.xxl },
  row: { flexDirection: 'row', alignItems: 'center', gap: space.md, padding: space.lg, borderRadius: radius.lg, borderWidth: StyleSheet.hairlineWidth },
});
