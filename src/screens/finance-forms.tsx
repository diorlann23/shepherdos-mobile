import { useMemo, useState } from 'react';
import { Alert, KeyboardAvoidingView, Platform, ScrollView, StyleSheet, View } from 'react-native';
import { Stack, router } from 'expo-router';
import { Badge, Button, Card, EmptyState, Input, Row, SectionTitle, Text } from '@/components/ui';
import { DateField, Segmented, SelectField } from '@/components/fields';
import { PendingBanner } from '@/components/pending-banner';
import { useAuth } from '@/lib/auth';
import { allowedAt, can } from '@/lib/permissions';
import { getRecord, listRecords } from '@/lib/db';
import {
  EXPENSE_CATEGORIES,
  PAYMENT_METHODS,
  addEntry,
  categoryLabel,
  decideExpense,
  requestExpense,
  startSheet,
  type Expense,
  type Fund,
  type Sheet,
} from '@/lib/finance';
import { denominationsFor, formatMoney, parseAmount } from '@/lib/money';
import { formatDate } from '@/lib/format';
import { useLocalQuery } from '@/hooks/use-local-query';
import type { MemberRow } from '@/lib/types';
import type { Service } from '@/lib/attendance';
import { space } from '@/theme';
import { localDay } from './attendance';
import { EXPENSE_STATUS } from './finance';

/** Where this person may do something, as choices (branches, regions, the whole church; groups too if asked). */
function usePlaces(permission: string, groups = false) {
  const { me } = useAuth();
  return useMemo(
    () =>
      (me?.nodes ?? [])
        .filter((n) => n.isActive && (groups || (n.kind !== 'group' && n.kind !== 'department')) && allowedAt(me, permission, [n.id]))
        .sort((a, b) => a.name.localeCompare(b.name))
        .map((n) => ({ value: n.id, label: n.name })),
    [me, permission, groups],
  );
}

// ---- New counting sheet ------------------------------------------------------------------
export function NewSheetForm() {
  const { me } = useAuth();
  const places = usePlaces('giving.create');
  const services = useLocalQuery(() => listRecords<Service>('services', { limit: 30 }), ['records:services']);
  const [title, setTitle] = useState('Sunday offering');
  const [nodeId, setNodeId] = useState<string | null>(places.length === 1 ? places[0].value : null);
  const [date, setDate] = useState<string | null>(localDay());
  const [dateOk, setDateOk] = useState(true);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});

  const pickService = (id: string | null) => {
    setSessionId(id);
    const s = services.data?.find((x) => x.id === id);
    if (s) {
      setTitle(`${s.title} offering`);
      setNodeId(s.nodeId);
      setDate(s.date.slice(0, 10));
    }
  };

  const save = async () => {
    const e: Record<string, string> = {};
    if (!title.trim()) e.title = 'Give the sheet a name';
    if (!nodeId) e.nodeId = 'Choose where the giving was received';
    if (!date || !dateOk) e.date = 'Enter the day as DD/MM/YYYY';
    setErrors(e);
    if (Object.keys(e).length) return;
    const currency = me?.org?.currency ?? 'GHS';
    const id = await startSheet(me, { title: title.trim(), nodeId: nodeId!, date: date!, sessionId: sessionId && !sessionId.startsWith('local_') ? sessionId : null }, { currency, denominations: denominationsFor(currency) });
    router.replace(`/sheet/${id}`);
  };

  return (
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
      <Stack.Screen options={{ title: 'New counting sheet' }} />
      <ScrollView contentContainerStyle={styles.wrap} keyboardShouldPersistTaps="handled">
        <Card style={{ gap: space.lg }}>
          {services.data?.length ? <SelectField label="For a service" choices={services.data.map((s) => ({ value: s.id, label: s.title, hint: `${formatDate(s.date)} · ${s.nodeName}` }))} value={sessionId} onChange={pickService} placeholder="Optional" allowClear /> : null}
          <Input label="Name *" value={title} onChangeText={setTitle} error={errors.title} />
          <SelectField label="Received at *" choices={places} value={nodeId} onChange={setNodeId} error={errors.nodeId} />
          <DateField
            label="Day *"
            value={date}
            error={errors.date}
            onChange={(iso, ok) => {
              setDate(iso);
              setDateOk(ok);
            }}
          />
        </Card>
        <Button title="Start counting" icon="play" onPress={() => void save()} />
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

// ---- Add an entry -------------------------------------------------------------------------
export function EntryForm({ sheet }: { sheet: Sheet }) {
  const { me } = useAuth();
  const funds = useLocalQuery(() => listRecords<Fund>('funds', { status: 'active', limit: 200 }), ['records:funds']);
  // Named givers come from the register on this phone (if this person can see it).
  const members = useLocalQuery(() => (can(me, 'member.view') ? listRecords<MemberRow>('members', { limit: 20000 }) : Promise.resolve([])), ['records:members']);
  const [kind, setKind] = useState<'named' | 'loose'>('named');
  const [memberId, setMemberId] = useState<string | null>(null);
  const [giverName, setGiverName] = useState('');
  const [fundId, setFundId] = useState<string | null>(null);
  const [amount, setAmount] = useState('');
  const [method, setMethod] = useState('cash');
  const [reference, setReference] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const fund = funds.data?.find((f) => f.id === fundId) ?? (funds.data?.length === 1 ? funds.data[0] : undefined);

  const save = async (another: boolean) => {
    const e: Record<string, string> = {};
    const minor = parseAmount(amount, sheet.currency);
    if (!minor) e.amount = 'Enter an amount, e.g. 50 or 20.50';
    if (!fund) e.fundId = 'Choose a fund';
    if (kind === 'named' && !memberId && !giverName.trim()) e.memberId = 'Choose who gave, or switch to loose offering';
    setErrors(e);
    if (Object.keys(e).length) return;
    const member = members.data?.find((m) => m.id === memberId);
    const label = kind === 'loose' ? 'Loose offering' : (member?.fullName ?? giverName.trim());
    await addEntry(sheet, {
      memberId: kind === 'named' ? (memberId ?? null) : null,
      giverName: kind === 'loose' ? 'Loose offering' : memberId ? undefined : giverName.trim(),
      giverLabel: label,
      fundId: fund!.id,
      fundName: fund!.name,
      amount: minor!,
      method,
      reference: reference.trim() || undefined,
    });
    if (another) {
      setMemberId(null);
      setGiverName('');
      setAmount('');
      setReference('');
    } else router.back();
  };

  if (!funds.loading && !funds.data?.length) return <EmptyState icon="wallet-outline" title="No funds on this phone" text="Pull down on Finance to sync, or ask an administrator to set up funds." />;

  return (
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
      <Stack.Screen options={{ title: 'Add entry' }} />
      <ScrollView contentContainerStyle={styles.wrap} keyboardShouldPersistTaps="handled">
        <Text tone="muted">{sheet.title}</Text>
        <Card style={{ gap: space.lg }}>
          <Segmented
            label="Giver"
            choices={[
              { value: 'named', label: 'Named giver' },
              { value: 'loose', label: 'Loose offering' },
            ]}
            value={kind}
            onChange={(v) => v && setKind(v as 'named' | 'loose')}
          />
          {kind === 'named' ? (
            members.data?.length ? (
              <SelectField label="Who gave" choices={members.data.map((m) => ({ value: m.id, label: m.fullName, hint: [m.memberNumber, m.phone].filter(Boolean).join(' · ') }))} value={memberId} onChange={setMemberId} error={errors.memberId} placeholder="Search the register" />
            ) : (
              <Input label="Giver’s name" value={giverName} onChangeText={setGiverName} error={errors.memberId} autoCapitalize="words" />
            )
          ) : null}
          <SelectField label="Fund *" choices={(funds.data ?? []).map((f) => ({ value: f.id, label: f.name }))} value={fund?.id ?? null} onChange={setFundId} error={errors.fundId} />
          <Input label={`Amount (${sheet.currency}) *`} value={amount} onChangeText={setAmount} error={errors.amount} keyboardType="decimal-pad" placeholder="0.00" style={{ fontSize: 22, fontWeight: '700' }} />
          <SelectField label="Paid by" choices={PAYMENT_METHODS} value={method} onChange={(v) => v && setMethod(v)} />
          {method !== 'cash' ? <Input label="Reference" value={reference} onChangeText={setReference} placeholder="MoMo transaction ID, cheque number…" /> : null}
        </Card>
        <Button title="Add entry" icon="checkmark" onPress={() => void save(false)} />
        <Button title="Add and enter another" variant="secondary" onPress={() => void save(true)} />
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

// ---- Request an expense ----------------------------------------------------------------------
export function ExpenseForm() {
  const { me } = useAuth();
  const places = usePlaces('expense.create', true);
  const currency = me?.org?.currency ?? 'GHS';
  const [title, setTitle] = useState('');
  const [category, setCategory] = useState<string | null>(null);
  const [amount, setAmount] = useState('');
  const [payee, setPayee] = useState('');
  const [description, setDescription] = useState('');
  const [nodeId, setNodeId] = useState<string | null>(places.length === 1 ? places[0].value : null);
  const [date, setDate] = useState<string | null>(localDay());
  const [dateOk, setDateOk] = useState(true);
  const [errors, setErrors] = useState<Record<string, string>>({});

  const save = async (submit: boolean) => {
    const e: Record<string, string> = {};
    const minor = parseAmount(amount, currency);
    if (title.trim().length < 2) e.title = 'What is it for?';
    if (!category) e.category = 'Choose a category';
    if (!minor) e.amount = 'Enter the amount';
    if (!nodeId) e.nodeId = 'Choose which part of the church it’s for';
    if (!date || !dateOk) e.date = 'Enter the day as DD/MM/YYYY';
    setErrors(e);
    if (Object.keys(e).length) return;
    const id = await requestExpense(me, { title: title.trim(), category: category!, amount: minor!, payee: payee.trim() || undefined, description: description.trim() || undefined, nodeId: nodeId!, date: date!, submit }, currency);
    router.replace(`/expense/${id}`);
  };

  return (
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
      <Stack.Screen options={{ title: 'Request an expense' }} />
      <ScrollView contentContainerStyle={styles.wrap} keyboardShouldPersistTaps="handled">
        <Card style={{ gap: space.lg }}>
          <Input label="What is it for? *" value={title} onChangeText={setTitle} error={errors.title} placeholder="New wireless microphones" autoCapitalize="sentences" />
          <SelectField label="Category *" choices={EXPENSE_CATEGORIES} value={category} onChange={setCategory} error={errors.category} />
          <Input label={`Amount (${currency}) *`} value={amount} onChangeText={setAmount} error={errors.amount} keyboardType="decimal-pad" placeholder="0.00" style={{ fontSize: 22, fontWeight: '700' }} />
          <Input label="Pay to" value={payee} onChangeText={setPayee} placeholder="Supplier or person" autoCapitalize="words" />
          <SelectField label="For *" choices={places} value={nodeId} onChange={setNodeId} error={errors.nodeId} />
          <DateField
            label="Date *"
            value={date}
            error={errors.date}
            onChange={(iso, ok) => {
              setDate(iso);
              setDateOk(ok);
            }}
          />
          <Input label="Details" value={description} onChangeText={setDescription} multiline placeholder="Anything the approver should know" style={{ minHeight: 80, textAlignVertical: 'top', paddingTop: 12 }} />
        </Card>
        <Button title="Send for approval" icon="send" onPress={() => void save(true)} />
        <Button title="Save as draft" variant="secondary" onPress={() => void save(false)} />
        <Text size="small" tone="muted" style={{ textAlign: 'center' }}>
          You can’t approve your own request. Above a set amount, it goes to a higher approver.
        </Text>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

// ---- An expense ----------------------------------------------------------------------------
export function ExpenseDetail({ id }: { id: string }) {
  const { me } = useAuth();
  const q = useLocalQuery(() => getRecord<Expense>('expenses', id), ['records:expenses', 'records'], [id]);
  const [note, setNote] = useState('');
  const e = q.data;
  if (q.loading) return null;
  if (!e) return <EmptyState icon="receipt-outline" title="Expense not on this phone" />;
  const decide = (approve: boolean) =>
    Alert.alert(approve ? 'Approve this expense?' : 'Reject this expense?', `${e.title}: ${formatMoney(e.amount, e.currency)}`, [
      { text: 'Cancel', style: 'cancel' },
      { text: approve ? 'Approve' : 'Reject', style: approve ? 'default' : 'destructive', onPress: () => void decideExpense(me, e, approve, note.trim() || undefined) },
    ]);
  return (
    <ScrollView contentContainerStyle={styles.wrap}>
      <Stack.Screen options={{ title: 'Expense' }} />
      <View style={{ alignItems: 'center', gap: space.xs }}>
        <Text size="title">{formatMoney(e.amount, e.currency)}</Text>
        <Text weight="600" style={{ textAlign: 'center' }}>
          {e.title}
        </Text>
        {e.pending ? <Badge label="Not synced" tone="warning" /> : <Badge label={EXPENSE_STATUS[e.status] ?? e.status} tone={e.status === 'approved' || e.status === 'paid' ? 'success' : e.status === 'rejected' ? 'danger' : 'warning'} />}
      </View>
      <PendingBanner collection="expenses" id={e.id} />
      <Card style={{ padding: 0, overflow: 'hidden' }}>
        <Row icon="pricetag-outline" title={categoryLabel(e.category)} subtitle="Category" />
        <Row icon="business-outline" title={e.nodeName} subtitle="For" />
        <Row icon="person-outline" title={e.payee ?? 'Not given'} subtitle="Pay to" />
        <Row icon="calendar-outline" title={formatDate(e.date)} subtitle="Date" />
        <Row icon="create-outline" title={e.requestedBy || '—'} subtitle="Requested by" />
      </Card>
      {e.description ? (
        <Card>
          <Text>{e.description}</Text>
        </Card>
      ) : null}
      {e.approvals.length ? (
        <>
          <SectionTitle>Decisions</SectionTitle>
          <Card style={{ padding: 0, overflow: 'hidden' }}>
            {e.approvals.map((a, i) => (
              <Row key={i} icon={a.decision === 'approved' ? 'checkmark-circle-outline' : 'close-circle-outline'} title={`${a.decision === 'approved' ? 'Approved' : 'Rejected'} by ${a.name}`} subtitle={[formatDate(a.at), a.note].filter(Boolean).join(' · ')} />
            ))}
          </Card>
        </>
      ) : null}
      {e.canDecide ? (
        <Card style={{ gap: space.md }}>
          <Input label="Note (optional)" value={note} onChangeText={setNote} placeholder="Reason, conditions…" />
          <View style={{ flexDirection: 'row', gap: space.sm }}>
            <Button title="Reject" variant="danger" style={{ flex: 1 }} onPress={() => decide(false)} />
            <Button title="Approve" icon="checkmark" style={{ flex: 1 }} onPress={() => decide(true)} />
          </View>
        </Card>
      ) : null}
    </ScrollView>
  );
}

const styles = StyleSheet.create({ wrap: { padding: space.lg, gap: space.md, paddingBottom: space.xxl } });
