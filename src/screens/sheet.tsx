import { useState } from 'react';
import { Alert, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { Stack, router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Badge, Button, Card, EmptyState, Row, SectionTitle, Text } from '@/components/ui';
import { PendingBanner } from '@/components/pending-banner';
import { getRecord } from '@/lib/db';
import { SHEET_STATUS, entriesOf, methodLabel, removeEntry, setCashCount, sheetAction, sheetActions, totals, type Entry, type Sheet } from '@/lib/finance';
import { denominationLabel, formatMoney } from '@/lib/money';
import { formatDate } from '@/lib/format';
import { useLocalQuery } from '@/hooks/use-local-query';
import { font, radius, space, useTheme } from '@/theme';

/**
 * A counting sheet: the cash counted (notes and coins), every envelope and
 * loose offering entered, and the count → verify → post steps.
 */
export function SheetScreen({ id }: { id: string }) {
  const { colors } = useTheme();
  const q = useLocalQuery(async () => ({ sheet: await getRecord<Sheet>('batches', id), entries: await entriesOf(id) }), ['records:batches', 'records:entries', 'records'], [id]);
  const [counting, setCounting] = useState(false);
  const sheet = q.data?.sheet;
  const entries = q.data?.entries ?? [];
  if (q.loading) return null;
  if (!sheet) return <EmptyState icon="cash-outline" title="Counting sheet not on this phone" text="It may be older than 120 days, or in a part of the church you can’t see." />;

  const t = totals(sheet, entries);
  const can = sheetActions(sheet);
  const money = (n: number) => formatMoney(n, sheet.currency);

  const submit = () => {
    if (!t.entryCount) return Alert.alert('Nothing to submit', 'Add at least one entry first.');
    if (!t.cashMatches) {
      return Alert.alert('Cash doesn’t match', `The notes and coins counted (${money(t.counted)}) don’t match the cash entries (${money(t.cashEntries)}). Recount, or fix the entries.`);
    }
    Alert.alert('Submit this count?', `${t.entryCount} entries, ${money(t.entriesTotal)}. Someone else then verifies it before it’s posted.`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Submit', onPress: () => void sheetAction(sheet, 'submit') },
    ]);
  };
  const confirm = (title: string, message: string, label: string, run: () => void, destructive = false) =>
    Alert.alert(title, message, [
      { text: 'Cancel', style: 'cancel' },
      { text: label, style: destructive ? 'destructive' : 'default', onPress: run },
    ]);
  const voidSheet = () =>
    Alert.prompt
      ? Alert.prompt('Void this sheet?', 'Give a reason. The entries won’t count.', [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Void', style: 'destructive', onPress: (reason?: string) => reason && reason.trim().length >= 3 && void sheetAction(sheet, 'void', reason.trim()) },
        ])
      : confirm('Void this sheet?', 'The entries won’t count.', 'Void', () => void sheetAction(sheet, 'void', 'Voided from the mobile app'), true);

  return (
    <ScrollView contentContainerStyle={styles.wrap}>
      <Stack.Screen options={{ title: sheet.title }} />
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm }}>
        <Text size="small" tone="muted" style={{ flex: 1 }}>
          {formatDate(sheet.date)} · {sheet.nodeName}
        </Text>
        {sheet.pending ? <Badge label="Not synced" tone="warning" /> : <Badge label={SHEET_STATUS[sheet.status]} tone={sheet.status === 'posted' ? 'success' : sheet.status === 'draft' ? 'primary' : 'warning'} />}
      </View>
      <PendingBanner collection="batches" id={sheet.id} />

      <View style={styles.stats}>
        <Stat label="Total" value={money(t.entriesTotal)} />
        <Stat label="Cash counted" value={money(t.counted)} tone={t.cashMatches ? undefined : 'danger'} />
        <Stat label="Entries" value={String(t.entryCount)} />
      </View>
      {!t.cashMatches ? (
        <Text size="small" tone="danger">
          Cash entries add up to {money(t.cashEntries)}, but {money(t.counted)} was counted.
        </Text>
      ) : null}

      <Card style={{ padding: 0, overflow: 'hidden' }}>
        <Row icon="person-outline" title={sheet.countedBy ?? 'Not submitted yet'} subtitle="Counted by" />
        {sheet.requireTwoPerson ? <Row icon="shield-checkmark-outline" title={sheet.verifiedBy ?? 'Not verified yet'} subtitle="Verified by (a different person)" /> : null}
        {sheet.postedBy ? <Row icon="lock-closed-outline" title={sheet.postedBy} subtitle="Posted by: can’t be changed now" /> : null}
        {sheet.voidReason ? <Row icon="close-circle-outline" title={sheet.voidReason} subtitle="Voided" danger /> : null}
      </Card>

      {can.edit ? (
        <View style={{ flexDirection: 'row', gap: space.sm }}>
          <Button title="Add entry" icon="add" style={{ flex: 1 }} onPress={() => router.push(`/sheet/${sheet.id}/entry`)} />
          <Button title={counting ? 'Done counting' : 'Count cash'} icon="calculator-outline" variant="secondary" style={{ flex: 1 }} onPress={() => setCounting(!counting)} />
        </View>
      ) : null}
      {counting && can.edit ? <CashCount sheet={sheet} onDone={() => setCounting(false)} /> : null}

      <SectionTitle>{`Entries (${t.entryCount})`}</SectionTitle>
      {entries.length ? (
        <Card style={{ padding: 0, overflow: 'hidden' }}>
          {entries.map((e, i) => (
            <View key={e.id}>
              {i ? <View style={{ height: StyleSheet.hairlineWidth, backgroundColor: colors.border, marginLeft: space.lg }} /> : null}
              <EntryRow e={e} onRemove={can.edit ? () => confirm('Remove this entry?', `${e.giver}: ${money(e.amount)}`, 'Remove', () => void removeEntry(sheet, e), true) : undefined} />
            </View>
          ))}
        </Card>
      ) : (
        <Text tone="muted">No entries yet.</Text>
      )}

      <View style={{ gap: space.sm, marginTop: space.lg }}>
        {can.submit ? <Button title="Submit count" icon="checkmark-done" onPress={submit} /> : null}
        {can.verify ? <Button title="Verify count" icon="shield-checkmark" onPress={() => confirm('Verify this count?', `You confirm ${money(t.entriesTotal)} in ${t.entryCount} entries.`, 'Verify', () => void sheetAction(sheet, 'verify'))} /> : null}
        {can.verifyBlocked ? (
          <Text size="small" tone="muted">
            You counted or started this sheet, so a different person must verify it.
          </Text>
        ) : null}
        {can.post ? <Button title="Post" icon="lock-closed" onPress={() => confirm('Post this sheet?', 'Posted giving can’t be edited. Mistakes are fixed with a reversal on the website.', 'Post', () => void sheetAction(sheet, 'post'))} /> : null}
        {can.reopen ? <Button title="Reopen for changes" variant="secondary" onPress={() => void sheetAction(sheet, 'reopen')} /> : null}
        {can.void ? <Button title="Void sheet" variant="danger" onPress={voidSheet} /> : null}
      </View>
    </ScrollView>
  );
}

function EntryRow({ e, onRemove }: { e: Entry; onRemove?: () => void }) {
  const { colors } = useTheme();
  return (
    <View style={styles.entry}>
      <View style={{ flex: 1 }}>
        <Text weight="500" numberOfLines={1}>
          {e.giver}
        </Text>
        <Text size="small" tone="muted" numberOfLines={1}>
          {[e.fund, methodLabel(e.method), e.reference, e.receiptNumber ? `Receipt ${e.receiptNumber}` : null].filter(Boolean).join(' · ')}
        </Text>
      </View>
      <View style={{ alignItems: 'flex-end', gap: 2 }}>
        <Text weight="600">{formatMoney(e.amount, e.currency)}</Text>
        {e.pending ? <Badge label="Not synced" tone="warning" /> : null}
      </View>
      {onRemove ? <Ionicons name="trash-outline" size={20} color={colors.danger} onPress={onRemove} accessibilityLabel={`Remove ${e.giver}`} /> : null}
    </View>
  );
}

/** Count notes and coins: type how many of each; the total adds itself up. */
function CashCount({ sheet, onDone }: { sheet: Sheet; onDone: () => void }) {
  const { colors } = useTheme();
  const [counts, setCounts] = useState<Record<number, string>>(() => Object.fromEntries(sheet.denominations.map((d) => [d.value, d.count ? String(d.count) : ''])));
  const total = sheet.denominations.reduce((s, d) => s + d.value * (parseInt(counts[d.value] || '0', 10) || 0), 0);
  const save = async () => {
    await setCashCount(sheet, sheet.denominations.map((d) => ({ value: d.value, count: Math.min(1_000_000, parseInt(counts[d.value] || '0', 10) || 0) })));
    onDone();
  };
  return (
    <Card style={{ gap: space.sm }}>
      <Text weight="600">Notes and coins</Text>
      {sheet.denominations.map((d) => {
        const n = parseInt(counts[d.value] || '0', 10) || 0;
        return (
          <View key={d.value} style={styles.denom}>
            <Text style={{ width: 70 }} weight="600">
              {denominationLabel(d.value, sheet.currency)}
            </Text>
            <Text tone="muted">×</Text>
            <TextInput
              value={counts[d.value]}
              onChangeText={(v) => setCounts({ ...counts, [d.value]: v.replace(/\D/g, '').slice(0, 7) })}
              keyboardType="number-pad"
              placeholder="0"
              placeholderTextColor={colors.textMuted}
              accessibilityLabel={`Number of ${denominationLabel(d.value, sheet.currency)} notes or coins`}
              style={[styles.countInput, { color: colors.text, borderColor: colors.border, backgroundColor: colors.background }]}
            />
            <Text tone="muted" style={{ flex: 1, textAlign: 'right' }}>
              {n ? formatMoney(d.value * n, sheet.currency) : ''}
            </Text>
          </View>
        );
      })}
      <View style={[styles.denom, { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border, paddingTop: space.sm }]}>
        <Text weight="700" style={{ flex: 1 }}>
          Total cash
        </Text>
        <Text weight="700">{formatMoney(total, sheet.currency)}</Text>
      </View>
      <Button title="Save cash count" icon="checkmark" onPress={() => void save()} />
    </Card>
  );
}

function Stat({ label, value, tone }: { label: string; value: string; tone?: 'danger' }) {
  const { colors } = useTheme();
  return (
    <View style={[styles.stat, { backgroundColor: colors.card, borderColor: tone ? colors.danger : colors.border }]}>
      <Text weight="700" tone={tone} numberOfLines={1} adjustsFontSizeToFit>
        {value}
      </Text>
      <Text size="tiny" tone="muted">
        {label}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { padding: space.lg, gap: space.md, paddingBottom: space.xxl },
  stats: { flexDirection: 'row', gap: space.sm },
  stat: { flex: 1, borderRadius: radius.md, borderWidth: StyleSheet.hairlineWidth, padding: space.md, alignItems: 'center', gap: 2 },
  entry: { flexDirection: 'row', alignItems: 'center', gap: space.md, paddingHorizontal: space.lg, paddingVertical: space.md },
  denom: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  countInput: { width: 80, minHeight: 40, borderWidth: 1, borderRadius: radius.sm, paddingHorizontal: space.sm, fontSize: font.body, textAlign: 'center' },
});
