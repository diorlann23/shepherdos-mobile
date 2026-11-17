import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Alert, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Switch, View } from 'react-native';
import { Stack, router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Badge, Button, Card, EmptyState, IconTile, Input, Row, SectionTitle, Text } from '@/components/ui';
import { AiText } from '@/components/ai-text';
import { summariseReport } from '@/lib/ai';
import { DateField, SelectField } from '@/components/fields';
import { PendingBanner } from '@/components/pending-banner';
import { useAuth } from '@/lib/auth';
import { allowedAt, can } from '@/lib/permissions';
import { getRecord, listRecords } from '@/lib/db';
import { ApiError, OfflineError, errorMessage } from '@/lib/api';
import {
  SUBMISSION_STATUS,
  loadCatalog,
  moveSubmission,
  periodLabel,
  runReport,
  saveAnswers,
  savedRuns,
  shareReport,
  startSubmission,
  type CatalogEntry,
  type FieldDef,
  type ReportResult,
  type ReportTemplate,
  type SavedRun,
  type Submission,
} from '@/lib/reports';
import { formatMoney, fromMinor, parseAmount } from '@/lib/money';
import { formatDate, relativeTime } from '@/lib/format';
import { syncNow } from '@/lib/sync';
import { useLocalQuery } from '@/hooks/use-local-query';
import { radius, space, useTheme } from '@/theme';

// ---- Value formatting, as the website shows it -------------------------------------------------
function show(value: unknown, type: string | undefined, currency: string) {
  if (value === null || value === undefined || value === '') return '—';
  if (type === 'money') return formatMoney(Number(value), currency);
  if (type === 'number') return Number(value).toLocaleString();
  if (type === 'percent') return `${value}%`;
  if (type === 'date') return formatDate(String(value));
  return String(value);
}

// ---- Hub -----------------------------------------------------------------------------------
/** Reports: the branch reports to fill in or review, results kept on the phone, and every report this person may run. */
export function ReportsHub() {
  const { me } = useAuth();
  const { colors } = useTheme();
  const [catalog, setCatalog] = useState<{ entries: CatalogEntry[]; offline: boolean } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const saved = useLocalQuery(() => savedRuns(), ['reports'], []);
  const branch = useLocalQuery(async () => (await listRecords<Submission>('submissions', { limit: 500 })).filter((s) => s.canEdit || s.canReview), ['records:submissions', 'records']);
  const workflows = !!me?.org?.modules.includes('workflows') && (can(me, 'report.create') || can(me, 'report.approve'));

  useEffect(() => {
    loadCatalog()
      .then(setCatalog)
      .catch((e) => setError(errorMessage(e)));
  }, []);
  const groups = useMemo(() => {
    const by = new Map<string, CatalogEntry[]>();
    for (const r of catalog?.entries ?? []) by.set(r.category, [...(by.get(r.category) ?? []), r]);
    return [...by];
  }, [catalog]);

  return (
    <ScrollView contentContainerStyle={styles.wrap}>
      <Stack.Screen options={{ title: 'Reports' }} />
      {workflows ? (
        <Pressable accessibilityRole="button" onPress={() => router.push('/reports/branch')} style={({ pressed }) => [styles.feature, { backgroundColor: colors.primarySoft, opacity: pressed ? 0.85 : 1 }]}>
          <Ionicons name="document-text-outline" size={24} color={colors.primary} />
          <View style={{ flex: 1 }}>
            <Text weight="600">Branch reports</Text>
            <Text size="small" tone="muted">
              {branch.data?.length ? `${branch.data.length} waiting for you` : 'Fill in, submit and review'}
            </Text>
          </View>
          <Ionicons name="chevron-forward" size={18} color={colors.primary} />
        </Pressable>
      ) : null}

      {saved.data?.length ? (
        <>
          <SectionTitle>Kept on this phone</SectionTitle>
          <Card style={{ padding: 0, overflow: 'hidden' }}>
            {saved.data.slice(0, 8).map((r, i) => (
              <Row key={`${r.key}-${r.ranAt}`} icon="bookmark-outline" title={r.result.title} subtitle={`Run ${relativeTime(r.ranAt)}`} onPress={() => router.push(`/reports/saved/${i}`)} />
            ))}
          </Card>
        </>
      ) : null}

      {catalog?.offline ? (
        <Text size="small" tone="muted">
          You’re offline: reports are worked out on the server, so connect to run one. Results kept on this phone open any time.
        </Text>
      ) : null}
      {error ? <Text tone="danger">{error}</Text> : null}
      {!catalog && !error ? <ActivityIndicator style={{ marginTop: space.xl }} /> : null}
      {groups.map(([category, entries]) => (
        <View key={category} style={{ gap: space.sm }}>
          <SectionTitle>{category}</SectionTitle>
          <Card style={{ padding: 0, overflow: 'hidden' }}>
            {entries.map((r) => (
              <Row key={r.key} icon="stats-chart-outline" title={r.title} subtitle={r.description} onPress={() => router.push(`/reports/run/${r.key}`)} />
            ))}
          </Card>
        </View>
      ))}
      {catalog && !catalog.entries.length ? <EmptyState icon="stats-chart-outline" title="No reports for your role" /> : null}
    </ScrollView>
  );
}

// ---- Run a report --------------------------------------------------------------------------------
export function ReportRunScreen({ reportKey }: { reportKey: string }) {
  const { me } = useAuth();
  const [def, setDef] = useState<CatalogEntry | null>(null);
  const [values, setValues] = useState<Record<string, unknown>>({});
  const [run, setRun] = useState<SavedRun | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadCatalog()
      .then((c) => setDef(c.entries.find((e) => e.key === reportKey) ?? null))
      .catch(() => setDef(null));
    // Show the last result straight away if there is one.
    void savedRuns(reportKey).then((r) => r[0] && setRun(r[0]));
  }, [reportKey]);

  const go = async () => {
    setBusy(true);
    setError(null);
    try {
      setRun(await runReport(reportKey, values));
    } catch (e) {
      setError(e instanceof OfflineError ? 'You’re offline. Connect to run this report.' : errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <ScrollView contentContainerStyle={styles.wrap} keyboardShouldPersistTaps="handled">
      <Stack.Screen options={{ title: def?.title ?? run?.result.title ?? 'Report' }} />
      {def ? (
        <Card style={{ gap: space.lg }}>
          <Text size="small" tone="muted">
            {def.description}
          </Text>
          {def.filters.map((f) => (
            <FieldInput key={f.name} field={f} value={values[f.name]} onChange={(v) => setValues({ ...values, [f.name]: v })} currency={me?.org?.currency ?? 'GHS'} />
          ))}
          <Button title="Run report" icon="play" loading={busy} onPress={() => void go()} />
          {error ? <Text tone="danger">{error}</Text> : null}
        </Card>
      ) : null}
      {run ? <ResultView run={run} canShare={can(me, 'report.export')} category={def?.category} /> : null}
    </ScrollView>
  );
}

export function SavedRunScreen({ index }: { index: number }) {
  const { me } = useAuth();
  const q = useLocalQuery(async () => (await savedRuns())[index] ?? null, ['reports'], [index]);
  if (q.loading) return null;
  if (!q.data) return <EmptyState icon="bookmark-outline" title="Not kept any more" />;
  return (
    <ScrollView contentContainerStyle={styles.wrap}>
      <Stack.Screen options={{ title: q.data.result.title }} />
      <ResultView run={q.data} canShare={can(me, 'report.export')} />
      <Button title="Run again with today’s figures" variant="secondary" onPress={() => router.replace(`/reports/run/${q.data!.key}`)} />
    </ScrollView>
  );
}

function ResultView({ run, canShare, category }: { run: SavedRun; canShare: boolean; category?: string }) {
  const { colors } = useTheme();
  const { me } = useAuth();
  // AI summaries: the church turned them on; security reports are never summarised.
  const canSummarise = !!me?.org?.settings.aiSummaries && category !== 'Security & admin' && run.result.rows.length > 0;
  const r: ReportResult = run.result;
  const currency = r.currency ?? 'GHS';
  const [sharing, setSharing] = useState<string | null>(null);
  const share = async (format: 'pdf' | 'xlsx' | 'csv') => {
    setSharing(format);
    try {
      await shareReport(run.key, r.title, run.filters, format);
    } catch (e) {
      Alert.alert('Couldn’t share', e instanceof OfflineError ? 'Connect to the internet to export this report.' : e instanceof ApiError ? e.message : errorMessage(e));
    } finally {
      setSharing(null);
    }
  };
  return (
    <View style={{ gap: space.md }}>
      <Text size="small" tone="muted">
        {r.period ? `${formatDate(r.period.from)} to ${formatDate(r.period.to)} · ` : ''}Run {relativeTime(run.ranAt)}
      </Text>
      {r.summary?.length ? (
        <View style={styles.tiles}>
          {r.summary.map((s) => (
            <View key={s.label} style={[styles.tile, { backgroundColor: colors.card, borderColor: colors.border }]}>
              <Text size="heading" numberOfLines={1} adjustsFontSizeToFit>
                {typeof s.value === 'number' ? show(s.value, s.format ?? 'number', currency) : s.value}
              </Text>
              <Text size="tiny" tone="muted">
                {s.label}
              </Text>
            </View>
          ))}
        </View>
      ) : null}
      {r.chart && r.rows.length ? <Bars result={r} currency={currency} /> : null}
      <Card style={{ padding: 0, overflow: 'hidden' }}>
        <ScrollView horizontal>
          <View>
            <View style={[styles.tr, { backgroundColor: colors.muted }]}>
              {r.columns.map((c) => (
                <Text key={c.key} size="tiny" weight="700" style={[styles.td, ['number', 'money', 'percent'].includes(c.type ?? '') && { textAlign: 'right' }]}>
                  {c.label}
                </Text>
              ))}
            </View>
            {r.rows.slice(0, 300).map((row, i) => (
              <View key={i} style={[styles.tr, { borderTopColor: colors.border }]}>
                {r.columns.map((c) => (
                  <Text key={c.key} size="small" numberOfLines={2} style={[styles.td, ['number', 'money', 'percent'].includes(c.type ?? '') && { textAlign: 'right' }]}>
                    {show(row[c.key], c.type, currency)}
                  </Text>
                ))}
              </View>
            ))}
          </View>
        </ScrollView>
      </Card>
      {r.rows.length > 300 ? (
        <Text size="small" tone="muted">
          Showing 300 of {r.rows.length} rows. Share as Excel to see them all.
        </Text>
      ) : null}
      {!r.rows.length ? <Text tone="muted">Nothing to show for these filters.</Text> : null}
      {r.note ? (
        <Text size="small" tone="muted">
          {r.note}
        </Text>
      ) : null}
      {canSummarise ? <SummaryCard run={run} /> : null}
      {canShare ? (
        <View style={{ flexDirection: 'row', gap: space.sm }}>
          <Button title="PDF" icon="document-outline" variant="secondary" loading={sharing === 'pdf'} disabled={!!sharing} style={{ flex: 1 }} onPress={() => void share('pdf')} />
          <Button title="Excel" icon="grid-outline" variant="secondary" loading={sharing === 'xlsx'} disabled={!!sharing} style={{ flex: 1 }} onPress={() => void share('xlsx')} />
          <Button title="CSV" icon="list-outline" variant="secondary" loading={sharing === 'csv'} disabled={!!sharing} style={{ flex: 1 }} onPress={() => void share('csv')} />
        </View>
      ) : null}
    </View>
  );
}

/** A short written summary of this result, by AI on the server (needs a connection). */
function SummaryCard({ run }: { run: SavedRun }) {
  const { colors } = useTheme();
  const [state, setState] = useState<{ text?: string; error?: string; busy?: boolean }>({});
  const go = async () => {
    setState({ busy: true });
    try {
      const res = await summariseReport(run.key, run.filters);
      setState({ text: res.text });
    } catch (e) {
      setState({ error: e instanceof OfflineError ? 'You’re offline. Connect to the internet for a summary.' : errorMessage(e) });
    }
  };
  if (!state.text && !state.busy && !state.error) {
    return <Button title="Summarise this report" icon="sparkles-outline" variant="secondary" onPress={() => void go()} />;
  }
  return (
    <Card style={{ gap: space.md, borderColor: colors.accent, borderWidth: 1 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm }}>
        <IconTile icon="sparkles" tone="accent" size={30} />
        <Text weight="700" style={{ flex: 1 }}>
          Summary
        </Text>
        {!state.busy ? <Button title="Again" variant="ghost" onPress={() => void go()} style={{ minHeight: 34, paddingHorizontal: space.sm }} /> : null}
      </View>
      {state.busy ? (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm }}>
          <ActivityIndicator color={colors.primary} />
          <Text tone="muted">Reading the report and writing a summary…</Text>
        </View>
      ) : state.error ? (
        <Text tone="danger">{state.error}</Text>
      ) : (
        <AiText text={state.text!} />
      )}
      {state.text ? (
        <Text size="tiny" tone="muted">
          Written by AI from this report’s figures. Check before you share it.
        </Text>
      ) : null}
    </Card>
  );
}

/** The report's chart as horizontal bars: the clearest shape on a phone. */
function Bars({ result, currency }: { result: ReportResult; currency: string }) {
  const { colors } = useTheme();
  const chart = result.chart!;
  const series = chart.series.slice(0, 3);
  const palette = [colors.primary, colors.success, colors.warning];
  const rows = result.rows.slice(-24);
  const value = (row: Record<string, unknown>, key: string) => Number(row[key] ?? 0) || 0;
  const max = Math.max(1, ...rows.flatMap((row) => (chart.type === 'stacked' ? [series.reduce((s, x) => s + value(row, x.key), 0)] : series.map((x) => value(row, x.key)))));
  const xLabel = (v: unknown) => {
    const t = String(v ?? '');
    const m = /^(\d{4})-(\d{2})$/.exec(t);
    return m ? new Date(+m[1], +m[2] - 1, 1).toLocaleDateString(undefined, { month: 'short', year: '2-digit' }) : t.length > 14 ? `${t.slice(0, 13)}…` : t;
  };
  return (
    <Card style={{ gap: space.sm }}>
      {series.length > 1 ? (
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.md }}>
          {series.map((s, i) => (
            <View key={s.key} style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <View style={{ width: 10, height: 10, borderRadius: 2, backgroundColor: palette[i] }} />
              <Text size="tiny" tone="muted">
                {s.label}
              </Text>
            </View>
          ))}
        </View>
      ) : null}
      {rows.map((row, i) => (
        <View key={i} style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm }}>
          <Text size="tiny" tone="muted" style={{ width: 70 }} numberOfLines={1}>
            {xLabel(row[chart.x])}
          </Text>
          <View style={{ flex: 1, gap: 2 }}>
            {chart.type === 'stacked' ? (
              <View style={{ flexDirection: 'row', height: 10, borderRadius: 3, overflow: 'hidden' }}>
                {series.map((s, j) => (
                  <View key={s.key} style={{ width: `${(value(row, s.key) / max) * 100}%`, backgroundColor: palette[j] }} />
                ))}
              </View>
            ) : (
              series.map((s, j) => <View key={s.key} style={{ height: series.length > 1 ? 6 : 10, borderRadius: 3, width: `${Math.max(1, (value(row, s.key) / max) * 100)}%`, backgroundColor: palette[j] }} />)
            )}
          </View>
          <Text size="tiny" style={{ width: 72, textAlign: 'right' }} numberOfLines={1}>
            {show(chart.type === 'stacked' ? series.reduce((s, x) => s + value(row, x.key), 0) : value(row, series[0].key), chart.format ?? 'number', currency)}
          </Text>
        </View>
      ))}
    </Card>
  );
}

// ---- Fields (report filters and branch report answers) ------------------------------------------------
function FieldInput({ field, value, onChange, currency, editable = true }: { field: FieldDef; value: unknown; onChange: (v: unknown) => void; currency: string; editable?: boolean }) {
  const { me } = useAuth();
  const label = field.required ? `${field.label} *` : field.label;
  if (!editable) {
    return <Row title={value === undefined || value === null || value === '' ? '—' : field.type === 'money' ? formatMoney(Number(value), currency) : field.type === 'boolean' ? (value ? 'Yes' : 'No') : field.type === 'select' ? (field.options?.find((o) => o.value === value)?.label ?? String(value)) : field.type === 'date' ? formatDate(String(value)) : String(value)} subtitle={field.label} />;
  }
  switch (field.type) {
    case 'date':
    case 'datetime':
      return <DateField label={label} value={typeof value === 'string' ? value.slice(0, 10) : null} hint={field.help} onChange={(iso) => onChange(iso ?? undefined)} />;
    case 'select':
      return <SelectField label={label} choices={field.options ?? []} value={(value as string) ?? null} onChange={(v) => onChange(v ?? undefined)} allowClear={!field.required} hint={field.help} />;
    case 'multiselect':
      return <SelectField label={label} multiple choices={field.options ?? []} value={(value as string[]) ?? []} onChange={(v) => onChange(v)} hint={field.help} />;
    case 'node': {
      const kinds = field.nodeKinds;
      const choices = (me?.nodes ?? []).filter((n) => n.isActive && (!kinds?.length || kinds.includes(n.kind))).map((n) => ({ value: n.id, label: n.name }));
      return <SelectField label={label} choices={choices} value={(value as string) ?? null} onChange={(v) => onChange(v ?? undefined)} placeholder="Everything I can see" allowClear />;
    }
    case 'boolean':
      return (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.md }}>
          <Text style={{ flex: 1 }}>{field.label}</Text>
          <Switch value={!!value} onValueChange={(v) => onChange(v)} accessibilityLabel={field.label} />
        </View>
      );
    case 'number':
      return (
        <Input
          label={label}
          value={value === undefined || value === null ? '' : String(value)}
          onChangeText={(t) => {
            const clean = t.replace(/[^\d.-]/g, '');
            onChange(clean === '' ? undefined : Number(clean));
          }}
          keyboardType="numeric"
          hint={field.help}
        />
      );
    case 'money':
      return (
        <Input
          label={`${label} (${currency})`}
          defaultValue={typeof value === 'number' ? String(fromMinor(value, currency)) : ''}
          onChangeText={(t) => onChange(t.trim() ? (parseAmount(t, currency) ?? undefined) : undefined)}
          keyboardType="decimal-pad"
          hint={field.help}
        />
      );
    case 'textarea':
      return <Input label={label} value={(value as string) ?? ''} onChangeText={(t) => onChange(t)} multiline style={{ minHeight: 90, textAlignVertical: 'top', paddingTop: 12 }} hint={field.help} />;
    default:
      return <Input label={label} value={(value as string) ?? ''} onChangeText={(t) => onChange(t)} placeholder={field.placeholder} hint={field.help} />;
  }
}

// ---- Branch reports -------------------------------------------------------------------------------
const subTone = (s: string) => (s === 'approved' ? 'success' : s === 'returned' ? 'danger' : s === 'draft' ? 'primary' : 'warning') as 'success' | 'danger' | 'primary' | 'warning';

export function BranchReports() {
  const { me } = useAuth();
  const { colors } = useTheme();
  const q = useLocalQuery(() => listRecords<Submission>('submissions', { limit: 500 }), ['records:submissions', 'records']);
  const all = q.data ?? [];
  const toFill = all.filter((s) => s.canEdit);
  const toReview = all.filter((s) => s.canReview);
  const rest = all.filter((s) => !s.canEdit && !s.canReview);
  const row = (s: Submission) => (
    <Pressable key={s.id} accessibilityRole="button" onPress={() => router.push(`/reports/branch/${s.id}`)} style={({ pressed }) => [styles.row, { backgroundColor: colors.card, borderColor: colors.border, opacity: pressed ? 0.85 : 1 }]}>
      <View style={{ flex: 1 }}>
        <Text weight="600">{s.template}</Text>
        <Text size="small" tone="muted">
          {periodLabel(s.period)} · {s.nodeName}
        </Text>
      </View>
      {s.pending ? <Badge label="Not synced" tone="warning" /> : <Badge label={SUBMISSION_STATUS[s.status]} tone={subTone(s.status)} />}
    </Pressable>
  );
  return (
    <ScrollView contentContainerStyle={styles.wrap}>
      <Stack.Screen
        options={{
          title: 'Branch reports',
          headerRight: can(me, 'report.create') ? () => <Button title="Start" variant="ghost" onPress={() => router.push('/reports/branch/new')} style={{ minHeight: 36, paddingHorizontal: 8 }} /> : undefined,
        }}
      />
      {toFill.length ? <SectionTitle>{`To fill in (${toFill.length})`}</SectionTitle> : null}
      {toFill.map(row)}
      {toReview.length ? <SectionTitle>{`To review (${toReview.length})`}</SectionTitle> : null}
      {toReview.map(row)}
      {rest.length ? <SectionTitle>Recent</SectionTitle> : null}
      {rest.slice(0, 40).map(row)}
      {!all.length && !q.loading ? <EmptyState icon="document-text-outline" title="No branch reports yet" text="Start one with the button at the top." /> : null}
    </ScrollView>
  );
}

export function StartBranchReport() {
  const { me } = useAuth();
  const templates = useLocalQuery(() => listRecords<ReportTemplate>('reportTemplates', { limit: 100 }), ['records:reportTemplates']);
  const [templateId, setTemplateId] = useState<string | null>(null);
  const [nodeId, setNodeId] = useState<string | null>(null);
  const [period, setPeriod] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const t = templates.data?.find((x) => x.id === templateId);
  const places = (me?.nodes ?? []).filter((n) => n.isActive && t?.submitterKinds.includes(n.kind) && allowedAt(me, 'report.create', [n.id]));
  const start = async () => {
    if (!t || !nodeId || !period) return setError('Choose the report, the place and the period.');
    setBusy(true);
    setError(null);
    try {
      const id = await startSubmission(t.id, nodeId, period);
      await syncNow();
      router.replace(`/reports/branch/${id}`);
    } catch (e) {
      setError(e instanceof OfflineError ? 'Starting a report needs a connection: it’s filled in from the church’s figures for the period. You can then finish it offline.' : errorMessage(e));
    } finally {
      setBusy(false);
    }
  };
  return (
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
      <Stack.Screen options={{ title: 'Start a branch report' }} />
      <ScrollView contentContainerStyle={styles.wrap} keyboardShouldPersistTaps="handled">
        <Card style={{ gap: space.lg }}>
          <SelectField
            label="Report"
            choices={(templates.data ?? []).map((x) => ({ value: x.id, label: x.name, hint: x.frequency }))}
            value={templateId}
            onChange={(v) => {
              setTemplateId(v);
              setNodeId(null);
              setPeriod(templates.data?.find((x) => x.id === v)?.currentPeriod ?? '');
            }}
          />
          {t ? <SelectField label={`For (${t.submitterKinds.join(' / ')})`} choices={places.map((n) => ({ value: n.id, label: n.name }))} value={nodeId} onChange={setNodeId} /> : null}
          {t ? <Input label="Period" value={period} onChangeText={setPeriod} hint={`${periodLabel(period)}. Format: ${t.frequency === 'monthly' ? '2026-10' : t.frequency === 'quarterly' ? '2026-Q4' : t.frequency === 'weekly' ? '2026-W45' : '2026'}`} autoCapitalize="characters" /> : null}
        </Card>
        {error ? <Text tone="danger">{error}</Text> : null}
        <Button title="Start" icon="play" loading={busy} onPress={() => void start()} />
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

export function SubmissionScreen({ id }: { id: string }) {
  const { me } = useAuth();
  const q = useLocalQuery(async () => {
    const s = await getRecord<Submission>('submissions', id);
    return { s, t: s ? await getRecord<ReportTemplate>('reportTemplates', s.templateId) : null };
  }, ['records:submissions', 'records:reportTemplates', 'records'], [id]);
  const [data, setData] = useState<Record<string, unknown> | null>(null);
  const [note, setNote] = useState('');
  const s = q.data?.s;
  const t = q.data?.t;
  useEffect(() => {
    if (s && !data) setData(s.data ?? {});
  }, [s, data]);
  if (q.loading) return null;
  if (!s) return <EmptyState icon="document-text-outline" title="Report not on this phone" />;
  const fields = t?.fields ?? [];
  const values = data ?? s.data;
  const missing = fields.filter((f) => f.required && (values[f.name] === undefined || values[f.name] === null || values[f.name] === ''));
  const currency = me?.org?.currency ?? 'GHS';
  const confirm = (title: string, msg: string, label: string, run: () => void, destructive = false) =>
    Alert.alert(title, msg, [
      { text: 'Cancel', style: 'cancel' },
      { text: label, style: destructive ? 'destructive' : 'default', onPress: run },
    ]);

  return (
    <ScrollView contentContainerStyle={styles.wrap} keyboardShouldPersistTaps="handled">
      <Stack.Screen options={{ title: s.template }} />
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm }}>
        <Text size="small" tone="muted" style={{ flex: 1 }}>
          {periodLabel(s.period)} · {s.nodeName}
        </Text>
        <Badge label={SUBMISSION_STATUS[s.status]} tone={subTone(s.status)} />
      </View>
      <PendingBanner collection="submissions" id={s.id} />
      {s.status === 'returned' ? (
        <Card style={{ backgroundColor: 'transparent' }}>
          <Text size="small" tone="danger">
            Returned: {s.history.filter((h) => h.to === 'returned').slice(-1)[0]?.note ?? 'see the reviewer’s note'}
          </Text>
        </Card>
      ) : null}
      <Card style={s.canEdit ? { gap: space.lg } : { padding: 0, overflow: 'hidden' }}>
        {fields.map((f) => (
          <FieldInput key={f.name} field={f} value={values[f.name]} onChange={(v) => setData({ ...values, [f.name]: v })} currency={currency} editable={s.canEdit} />
        ))}
        {!fields.length ? <Text tone="muted">This report’s form isn’t on this phone yet. Pull down on Home to sync.</Text> : null}
      </Card>
      {s.canEdit ? (
        <View style={{ gap: space.sm }}>
          <Button title="Save answers" variant="secondary" icon="save-outline" onPress={() => void saveAnswers(s, values)} />
          <Button
            title="Submit"
            icon="send"
            disabled={missing.length > 0}
            onPress={() =>
              confirm('Submit this report?', 'It goes to the level above for review. You can change it again only if it’s returned.', 'Submit', async () => {
                await saveAnswers(s, values);
                await moveSubmission(me?.user.name ?? '', { ...s, data: values }, 'submitted');
              })
            }
          />
          {missing.length ? (
            <Text size="small" tone="muted">
              Still to answer: {missing.map((f) => f.label).join(', ')}
            </Text>
          ) : null}
        </View>
      ) : null}
      {s.canReview ? (
        <Card style={{ gap: space.md }}>
          <Text weight="600">Review</Text>
          <Input label="Note" value={note} onChangeText={setNote} placeholder="Required when returning it" multiline />
          <View style={{ flexDirection: 'row', gap: space.sm }}>
            <Button title="Return" variant="danger" style={{ flex: 1 }} disabled={!note.trim()} onPress={() => confirm('Return for changes?', note, 'Return', () => void moveSubmission(me?.user.name ?? '', s, 'returned', note.trim()), true)} />
            <Button title="Approve" icon="checkmark" style={{ flex: 1 }} onPress={() => confirm('Approve this report?', `${s.template}, ${periodLabel(s.period)}`, 'Approve', () => void moveSubmission(me?.user.name ?? '', s, 'approved', note.trim() || undefined))} />
          </View>
          {s.status === 'submitted' ? <Button title="Mark reviewed" variant="ghost" onPress={() => void moveSubmission(me?.user.name ?? '', s, 'reviewed', note.trim() || undefined)} /> : null}
        </Card>
      ) : null}
      {s.history.length ? (
        <>
          <SectionTitle>History</SectionTitle>
          <Card style={{ gap: space.sm }}>
            {[...s.history].reverse().map((h, i) => (
              <Text key={i} size="small" tone="muted">
                {formatDate(h.at)} · {h.byName}: {SUBMISSION_STATUS[h.to as Submission['status']] ?? h.to}
                {h.note ? `: ${h.note}` : ''}
              </Text>
            ))}
          </Card>
        </>
      ) : null}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  wrap: { padding: space.lg, gap: space.md, paddingBottom: space.xxl },
  feature: { flexDirection: 'row', alignItems: 'center', gap: space.md, padding: space.lg, borderRadius: radius.lg },
  row: { flexDirection: 'row', alignItems: 'center', gap: space.md, padding: space.lg, borderRadius: radius.lg, borderWidth: StyleSheet.hairlineWidth },
  tiles: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
  tile: { flexBasis: '47%', flexGrow: 1, borderRadius: radius.md, borderWidth: StyleSheet.hairlineWidth, padding: space.md, gap: 2 },
  tr: { flexDirection: 'row', borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: 'transparent' },
  td: { width: 130, paddingHorizontal: space.md, paddingVertical: space.sm },
});
