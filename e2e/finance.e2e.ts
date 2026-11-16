/**
 * Phase 4 on simulated phones against a real ShepherdOS server (sample church):
 * the treasurer counts the offering offline, a second person verifies and
 * posts, a re-sent entry is recorded once, and an expense is requested and approved.
 */
import { phone, setOnline } from './phone';
import type { Entry, Expense, Fund, Sheet } from '@/lib/finance';

const PASSWORD = process.env.E2E_PASSWORD ?? 'Demo-Church-2026!';
const RUN = Date.now().toString(36);
const today = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

describe('finance on the phone', () => {
  let treasurer: Awaited<ReturnType<typeof phone>>;
  let admin: Awaited<ReturnType<typeof phone>>;
  beforeAll(async () => {
    treasurer = await phone('treasurer', 'treasurer@demo.church', PASSWORD);
    admin = await phone('admin-f', 'admin@demo.church', PASSWORD);
  });
  afterEach(() => setOnline(true));

  it('counts offline, verifies with a second person, posts, and never records an entry twice', async () => {
    const t = treasurer;
    const funds = await t.db.listRecords<Fund>('funds', { status: 'active' });
    expect(funds.length).toBeGreaterThan(0);
    const offering = funds.find((f) => /offering/i.test(f.name)) ?? funds[0];
    const tithe = funds.find((f) => /tithe/i.test(f.name)) ?? funds[0];
    const place = t.me.nodes.find((n) => t.me.scopes['giving.create'] === 'all' || (t.me.scopes['giving.create'] ?? []).includes(n.id))!;
    const members = await t.db.listRecords<{ id: string; fullName: string }>('members', { limit: 5 });

    // ---- In the counting room, no signal ------------------------------------------------
    setOnline(false);
    const sheetId = await t.finance.startSheet(t.me, { title: `Phone count ${RUN}`, nodeId: place.id, date: today() }, { currency: 'GHS', denominations: [2000, 1000, 500] });
    let sheet = (await t.db.getRecord<Sheet>('batches', sheetId))!;
    // GHS 50 cash: two 20s and one 10.
    await t.finance.setCashCount(sheet, [{ value: 2000, count: 2 }, { value: 1000, count: 1 }, { value: 500, count: 0 }]);
    sheet = (await t.db.getRecord<Sheet>('batches', sheetId))!;
    await t.finance.addEntry(sheet, { memberId: null, giverName: 'Loose offering', giverLabel: 'Loose offering', fundId: offering.id, fundName: offering.name, amount: 3000, method: 'cash' });
    await t.finance.addEntry(sheet, { memberId: members[0].id, giverLabel: members[0].fullName, fundId: tithe.id, fundName: tithe.name, amount: 2000, method: 'cash' });
    await t.finance.addEntry(sheet, { memberId: members[1].id, giverLabel: members[1].fullName, fundId: tithe.id, fundName: tithe.name, amount: 10000, method: 'mobile_money', reference: `MOMO-${RUN}` });
    sheet = (await t.db.getRecord<Sheet>('batches', sheetId))!;
    expect(t.finance.totals(sheet, await t.finance.entriesOf(sheetId))).toMatchObject({ entriesTotal: 15000, cashEntries: 5000, counted: 5000, cashMatches: true });

    // ---- Back online ----------------------------------------------------------------------
    setOnline(true);
    await t.syncNow();
    const refused = (await t.sync.listOutbox()).filter((o) => o.error);
    expect(refused, JSON.stringify(refused)).toEqual([]);
    const [synced] = await t.db.listRecords<Sheet>('batches', { q: `phone count ${RUN}` });
    expect(synced.id.startsWith('local_')).toBe(false);
    expect(synced).toMatchObject({ entriesTotal: 15000, entryCount: 3, cashTotal: 5000, status: 'draft' });

    // ---- A dropped answer: the phone sent an entry, never heard back, and sends it again ----
    await t.finance.addEntry(synced, { memberId: null, giverName: 'Loose offering', giverLabel: 'Loose offering', fundId: offering.id, fundName: offering.name, amount: 700, method: 'mobile_money' });
    const queued = (await t.db.getDb().getFirstAsync<{ path: string; body: string; idem: string }>("SELECT path, body, idem FROM outbox WHERE path LIKE '%/entries' ORDER BY seq DESC"))!;
    await t.api(queued.path, { method: 'POST', body: JSON.parse(queued.body), headers: { 'idempotency-key': queued.idem } });
    await t.syncNow();
    const afterRetry = (await t.db.getRecord<Sheet>('batches', synced.id))!;
    expect(afterRetry.entryCount, 'the re-sent entry was recorded once').toBe(4);
    expect(afterRetry.entriesTotal).toBe(15700);

    // ---- Submit; the counter can't verify their own count ---------------------------------
    await t.finance.sheetAction(afterRetry, 'submit');
    await t.syncNow();
    const counted = (await t.db.getRecord<Sheet>('batches', synced.id))!;
    expect(counted.status).toBe('counted');
    expect(t.finance.sheetActions(counted)).toMatchObject({ verify: false });
    await expect(t.api(`/giving/batches/${synced.id}/action`, { method: 'POST', body: { action: 'verify' } })).rejects.toMatchObject({ status: 403 });

    // ---- A second person verifies and posts ---------------------------------------------------
    await admin.syncNow();
    const forAdmin = (await admin.db.getRecord<Sheet>('batches', synced.id))!;
    expect(admin.finance.sheetActions(forAdmin)).toMatchObject({ verify: true });
    await admin.finance.sheetAction(forAdmin, 'verify');
    await admin.syncNow();
    const verified = (await admin.db.getRecord<Sheet>('batches', synced.id))!;
    expect(verified.status).toBe('verified');
    await admin.finance.sheetAction(verified, 'post');
    await admin.syncNow();
    expect((await admin.db.getRecord<Sheet>('batches', synced.id))!.status).toBe('posted');
    const entries = await admin.finance.entriesOf(synced.id);
    expect(entries.filter((e: Entry) => e.memberId).every((e: Entry) => e.receiptNumber), 'named givers get receipt numbers').toBe(true);
  });

  it('requests an expense offline; someone else approves it', async () => {
    const t = treasurer;
    const place = t.me.nodes.find((n) => t.me.scopes['expense.create'] === 'all' || (t.me.scopes['expense.create'] ?? []).includes(n.id));
    if (!place || !t.me.org?.modules.includes('finance')) return console.warn('Expenses not available to the treasurer in this church: skipped');
    setOnline(false);
    const id = await t.finance.requestExpense(t.me, { nodeId: place.id, title: `Projector bulb ${RUN}`, category: 'equipment', amount: 45000, payee: 'Accra Electronics', date: today(), submit: true }, 'GHS');
    expect((await t.db.getRecord<Expense>('expenses', id))!.status).toBe('submitted');
    setOnline(true);
    await t.syncNow();
    const [mine] = await t.db.listRecords<Expense>('expenses', { q: `projector bulb ${RUN}` });
    expect(mine).toMatchObject({ status: 'submitted', mine: true, canDecide: false });

    await admin.syncNow();
    const forAdmin = (await admin.db.getRecord<Expense>('expenses', mine.id))!;
    expect(forAdmin.canDecide).toBe(true);
    await admin.finance.decideExpense(admin.me, forAdmin, true, 'Approved from the phone');
    await admin.syncNow();
    expect((await admin.db.getRecord<Expense>('expenses', mine.id))!.status).toBe('approved');
    await t.syncNow();
    expect((await t.db.getRecord<Expense>('expenses', mine.id))!.status).toBe('approved');
  });
});
