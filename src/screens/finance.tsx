import { useEffect, useState } from 'react';
import { Pressable, RefreshControl, ScrollView, StyleSheet, View } from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Badge, Button, Card, EmptyState, ScreenHeader, SectionTitle, Segmented, Text } from '@/components/ui';
import { SyncPill } from '@/components/sync-pill';
import { useAuth } from '@/lib/auth';
import { useLock } from '@/lib/lock';
import { can } from '@/lib/permissions';
import { kvGet, kvSet, listRecords } from '@/lib/db';
import { api } from '@/lib/api';
import { syncNow } from '@/lib/sync';
import { SHEET_STATUS, categoryLabel, type Budget, type Expense, type Sheet } from '@/lib/finance';
import { formatMoney } from '@/lib/money';
import { formatDate } from '@/lib/format';
import { useLocalQuery } from '@/hooks/use-local-query';
import { useSyncStatus } from '@/hooks/use-sync-status';
import { radius, space, useTheme } from '@/theme';

type Tab = 'giving' | 'expenses' | 'budgets';
const sheetTone = (s: string) => (s === 'posted' ? 'success' : s === 'void' ? 'muted' : s === 'draft' ? 'primary' : 'warning') as 'success' | 'muted' | 'primary' | 'warning';
const expenseTone = (s: string) => (s === 'approved' || s === 'paid' ? 'success' : s === 'rejected' || s === 'void' ? 'danger' : s === 'submitted' ? 'warning' : 'muted') as 'success' | 'danger' | 'warning' | 'muted';
export const EXPENSE_STATUS: Record<string, string> = { draft: 'Draft', submitted: 'Awaiting approval', approved: 'Approved', rejected: 'Rejected', paid: 'Paid', void: 'Void' };

/** The Finance tab: giving, expenses and budgets, each shown only to people whose role allows it. */
export function Finance() {
  const { me } = useAuth();
  const giving = !!me?.org?.modules.includes('giving') && ['view', 'create', 'verify', 'post', 'summary'].some((a) => can(me, `giving.${a}`));
  const expenses = !!me?.org?.modules.includes('finance') && ['view', 'create', 'approve'].some((a) => can(me, `expense.${a}`));
  const budgets = !!me?.org?.modules.includes('finance') && can(me, 'budget.view');
  const tabs = ([['giving', giving], ['expenses', expenses], ['budgets', budgets]] as [Tab, boolean][]).filter(([, on]) => on).map(([t]) => t);
  const [tab, setTab] = useState<Tab>(tabs[0] ?? 'giving');
  const { colors } = useTheme();
  const sync = useSyncStatus();

  return (
    <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingBottom: space.xxl }} refreshControl={<RefreshControl refreshing={sync.state === 'syncing'} onRefresh={() => void syncNow()} tintColor={colors.headerText} />}>
      <ScreenHeader title="Finance">
        <SyncPill onDark />
      </ScreenHeader>
      <View style={styles.wrap}>
        <LockReminder />
        {tabs.length > 1 ? (
          <Segmented value={tab} onChange={setTab} options={tabs.map((t) => ({ value: t, label: t === 'giving' ? 'Giving' : t === 'expenses' ? 'Expenses' : 'Budgets' }))} />
        ) : null}
        {tab === 'giving' ? <Giving /> : tab === 'expenses' ? <Expenses /> : <Budgets />}
      </View>
    </ScrollView>
  );
}

/** Giving records are on this phone: suggest the Face ID / fingerprint lock if it's off. */
function LockReminder() {
  const lock = useLock();
  const { colors } = useTheme();
  if (lock.enabled || !lock.available) return null;
  return (
    <Card style={{ flexDirection: 'row', gap: space.md, alignItems: 'center', backgroundColor: colors.warningSoft, borderColor: 'transparent' }}>
      <Ionicons name="finger-print" size={24} color={colors.warning} />
      <View style={{ flex: 1 }}>
        <Text weight="600">Protect giving records on this phone</Text>
        <Text size="small" tone="muted">
          Turn on the Face ID / fingerprint lock, so no one else can open them.
        </Text>
      </View>
      <Button title="Turn on" variant="secondary" onPress={() => void lock.setEnabled(true)} style={{ minHeight: 38 }} />
    </Card>
  );
}

// ---- Giving -----------------------------------------------------------------------------
interface Summary {
  currency: string;
  total: number;
  namedGivers: number;
  byFund: { fund: string; total: number }[];
  fetchedAt: string;
}

function Giving() {
  const { me } = useAuth();
  const { colors } = useTheme();
  const sync = useSyncStatus();
  const [summary, setSummary] = useState<Summary | null>(null);
  const sheets = useLocalQuery(() => listRecords<Sheet>('batches', { limit: 200 }), ['records:batches', 'records']);
  const canCount = can(me, 'giving.create');

  // This month's totals come from the server when online; the last ones fetched show otherwise.
  useEffect(() => {
    void kvGet<Summary>('giving-summary').then((s) => s && setSummary(s));
  }, []);
  useEffect(() => {
    if (sync.state !== 'idle') return;
    api<Omit<Summary, 'fetchedAt'>>('/giving/summary')
      .then(async (s) => {
        const next = { ...s, fetchedAt: new Date().toISOString() };
        setSummary(next);
        await kvSet('giving-summary', next);
      })
      .catch(() => undefined);
  }, [sync.state, sync.lastSyncedAt]);

  const list = sheets.data ?? [];
  const open = list.filter((s) => s.status !== 'posted' && s.status !== 'void');
  const done = list.filter((s) => !open.includes(s));

  return (
    <View style={{ gap: space.sm }}>
      {summary ? (
        <Card style={{ gap: space.md }}>
          <View>
            <Text size="small" tone="muted">
              Giving this month
            </Text>
            <Text size="title">{formatMoney(summary.total, summary.currency)}</Text>
            <Text size="tiny" tone="muted">
              {summary.namedGivers} named givers · updated {formatDate(summary.fetchedAt)}
            </Text>
          </View>
          {summary.byFund.slice(0, 5).map((f) => (
            <View key={f.fund} style={{ gap: 4 }}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                <Text size="small">{f.fund}</Text>
                <Text size="small" tone="muted">
                  {formatMoney(f.total, summary.currency)}
                </Text>
              </View>
              <View style={[styles.track, { backgroundColor: colors.muted }]}>
                <View style={[styles.bar, { backgroundColor: colors.primary, width: `${summary.total ? Math.max(2, (f.total / summary.total) * 100) : 0}%` }]} />
              </View>
            </View>
          ))}
        </Card>
      ) : null}

      {canCount ? <Button title="New counting sheet" icon="add-circle-outline" onPress={() => router.push('/sheet/new')} style={{ marginTop: space.sm }} /> : null}

      {list.length ? (
        <>
          {open.length ? <SectionTitle>In progress</SectionTitle> : null}
          {open.map((s) => (
            <SheetRow key={s.id} s={s} />
          ))}
          {done.length ? <SectionTitle>Posted</SectionTitle> : null}
          {done.map((s) => (
            <SheetRow key={s.id} s={s} />
          ))}
        </>
      ) : !sheets.loading ? (
        <EmptyState icon="cash-outline" title="No counting sheets" text="Counting sheets from the last 120 days appear here." />
      ) : null}
    </View>
  );
}

function SheetRow({ s }: { s: Sheet }) {
  const { colors } = useTheme();
  return (
    <Pressable accessibilityRole="button" onPress={() => router.push(`/sheet/${s.id}`)} style={({ pressed }) => [styles.row, { backgroundColor: colors.card, borderColor: colors.border, opacity: pressed ? 0.8 : 1 }]}>
      <View style={{ flex: 1, gap: 2 }}>
        <Text weight="600" numberOfLines={1}>
          {s.title}
        </Text>
        <Text size="small" tone="muted" numberOfLines={1}>
          {formatDate(s.date)} · {s.nodeName} · {s.entryCount} {s.entryCount === 1 ? 'entry' : 'entries'}
        </Text>
      </View>
      <View style={{ alignItems: 'flex-end', gap: 4 }}>
        <Text weight="700">{formatMoney(s.entriesTotal, s.currency)}</Text>
        {s.pending ? <Badge label="Not synced" tone="warning" /> : <Badge label={SHEET_STATUS[s.status]} tone={sheetTone(s.status)} />}
      </View>
    </Pressable>
  );
}

// ---- Expenses ---------------------------------------------------------------------------
function Expenses() {
  const { me } = useAuth();
  const q = useLocalQuery(() => listRecords<Expense>('expenses', { limit: 300 }), ['records:expenses', 'records']);
  const list = q.data ?? [];
  const toDecide = list.filter((e) => e.canDecide);
  const mine = list.filter((e) => e.mine && !toDecide.includes(e));
  const others = list.filter((e) => !e.mine && !toDecide.includes(e));
  return (
    <View style={{ gap: space.sm }}>
      {can(me, 'expense.create') ? <Button title="Request an expense" icon="add-circle-outline" onPress={() => router.push('/expense/new')} /> : null}
      {toDecide.length ? <SectionTitle>{`Waiting for you (${toDecide.length})`}</SectionTitle> : null}
      {toDecide.map((e) => (
        <ExpenseRow key={e.id} e={e} />
      ))}
      {mine.length ? <SectionTitle>Your requests</SectionTitle> : null}
      {mine.map((e) => (
        <ExpenseRow key={e.id} e={e} />
      ))}
      {others.length ? <SectionTitle>Others</SectionTitle> : null}
      {others.map((e) => (
        <ExpenseRow key={e.id} e={e} />
      ))}
      {!list.length && !q.loading ? <EmptyState icon="receipt-outline" title="No expenses" text="Your requests, and ones you can see or approve, appear here." /> : null}
    </View>
  );
}

function ExpenseRow({ e }: { e: Expense }) {
  const { colors } = useTheme();
  return (
    <Pressable accessibilityRole="button" onPress={() => router.push(`/expense/${e.id}`)} style={({ pressed }) => [styles.row, { backgroundColor: colors.card, borderColor: colors.border, opacity: pressed ? 0.8 : 1 }]}>
      <View style={{ flex: 1, gap: 2 }}>
        <Text weight="600" numberOfLines={1}>
          {e.title}
        </Text>
        <Text size="small" tone="muted" numberOfLines={1}>
          {formatDate(e.date)} · {categoryLabel(e.category)} · {e.requestedBy}
        </Text>
      </View>
      <View style={{ alignItems: 'flex-end', gap: 4 }}>
        <Text weight="700">{formatMoney(e.amount, e.currency)}</Text>
        {e.pending ? <Badge label="Not synced" tone="warning" /> : <Badge label={EXPENSE_STATUS[e.status] ?? e.status} tone={expenseTone(e.status)} />}
      </View>
    </Pressable>
  );
}

// ---- Budgets ----------------------------------------------------------------------------
function Budgets() {
  const { colors } = useTheme();
  const q = useLocalQuery(() => listRecords<Budget>('budgets', { limit: 100 }), ['records:budgets', 'records']);
  const list = q.data ?? [];
  if (!list.length && !q.loading) return <EmptyState icon="pie-chart-outline" title="No budgets" text="Budgets for your part of the church appear here." />;
  return (
    <View style={{ gap: space.sm }}>
      {list.map((b) => {
        const used = b.total ? b.spent / b.total : 0;
        const over = used > 1;
        return (
          <Card key={b.id} style={{ gap: space.sm }}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: space.sm }}>
              <View style={{ flex: 1 }}>
                <Text weight="600">{b.name}</Text>
                <Text size="small" tone="muted">
                  {b.nodeName} · {formatDate(b.startDate)} to {formatDate(b.endDate)}
                </Text>
              </View>
              <Badge label={b.status === 'approved' ? 'Approved' : b.status} tone={b.status === 'approved' ? 'success' : 'muted'} />
            </View>
            <View style={[styles.track, { backgroundColor: colors.muted, height: 10, borderRadius: 5 }]}>
              <View style={[styles.bar, { height: 10, borderRadius: 5, backgroundColor: over ? colors.danger : used > 0.85 ? colors.warning : colors.success, width: `${Math.min(100, Math.max(2, used * 100))}%` }]} />
            </View>
            <Text size="small" tone={over ? 'danger' : 'muted'}>
              {formatMoney(b.spent, b.currency)} spent of {formatMoney(b.total, b.currency)} ({Math.round(used * 100)}%)
            </Text>
          </Card>
        );
      })}
      <Text size="small" tone="muted">
        Spending counts approved and paid expenses.
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { padding: space.lg, gap: space.md, paddingBottom: space.xxl },
  row: { flexDirection: 'row', alignItems: 'center', gap: space.md, padding: space.lg, borderRadius: radius.lg, borderWidth: StyleSheet.hairlineWidth },
  track: { height: 6, borderRadius: 3, overflow: 'hidden' },
  bar: { height: 6, borderRadius: 3 },
});
