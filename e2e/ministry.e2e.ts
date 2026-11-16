/**
 * Phase 5 on simulated phones against a real ShepherdOS server (sample church):
 * tasks handed over and done, notices reaching members, first-timer follow-up,
 * event registration, and prayer requests whose words never stay on the phone.
 */
import { phone, setOnline } from './phone';
import type { ChurchEvent, FollowUp, Notice, PrayerRow, Task } from '@/lib/ministry';

const PASSWORD = process.env.E2E_PASSWORD ?? 'Demo-Church-2026!';
const RUN = Date.now().toString(36);

describe('ministry on the phone', () => {
  let admin: Awaited<ReturnType<typeof phone>>;
  let pastor: Awaited<ReturnType<typeof phone>>;
  let member: Awaited<ReturnType<typeof phone>>;
  beforeAll(async () => {
    admin = await phone('admin-m', 'admin@demo.church', PASSWORD);
    pastor = await phone('pastor-m', 'pastor@demo.church', PASSWORD);
    member = await phone('member-m', 'member@demo.church', PASSWORD);
  });
  afterEach(() => setOnline(true));

  it('a task given out offline is accepted, done and verified', async () => {
    const colleagues = await admin.db.listRecords<{ id: string; name: string; email: string }>('colleagues', { limit: 1000 });
    const p = colleagues.find((c) => c.email === 'pastor@demo.church')!;
    expect(p, 'the pastor is someone the admin can assign to').toBeTruthy();
    setOnline(false);
    await admin.ministry.createTask(admin.me, { title: `Visit the Mensah family ${RUN}`, assignedTo: p, nodeId: admin.me.rootNodeId!, priority: 'high' });
    setOnline(true);
    await admin.syncNow();

    await pastor.syncNow();
    const [t] = await pastor.db.listRecords<Task>('tasks', { q: `mensah family ${RUN}` });
    expect(t).toMatchObject({ isMine: true, status: 'assigned' });
    expect(pastor.ministry.taskMoves(t).map((m) => m.to)).toEqual(expect.arrayContaining(['accepted', 'done']));
    setOnline(false);
    await pastor.ministry.moveTask(pastor.me, t, 'accepted');
    const accepted = (await pastor.db.getRecord<Task>('tasks', t.id))!;
    await pastor.ministry.moveTask(pastor.me, accepted, 'done', 'Visited on Saturday');
    setOnline(true);
    await pastor.syncNow();
    expect((await pastor.sync.listOutbox()).filter((o) => o.error)).toEqual([]);

    await admin.syncNow();
    const done = (await admin.db.getRecord<Task>('tasks', t.id))!;
    expect(done.status).toBe('done');
    // The person who did it can't verify it; the one who gave it can.
    expect(pastor.ministry.taskMoves((await pastor.db.getRecord<Task>('tasks', t.id))!).map((m) => m.to)).not.toContain('verified');
    await admin.ministry.moveTask(admin.me, done, 'verified');
    await admin.syncNow();
    expect((await admin.db.getRecord<Task>('tasks', t.id))!.status).toBe('verified');
  });

  it('a notice published offline reaches a member’s phone', async () => {
    setOnline(false);
    await admin.ministry.publishNotice(admin.me, { title: `Harvest thanksgiving ${RUN}`, body: 'Bring your harvest on Sunday 30th.', nodeId: admin.me.rootNodeId!, email: false });
    setOnline(true);
    await admin.syncNow();
    await member.syncNow();
    const notices = await member.db.listRecords<Notice>('announcements', { q: `harvest thanksgiving ${RUN}` });
    expect(notices).toHaveLength(1);
    expect(notices[0].body).toContain('Sunday 30th');
  });

  it('follows up a first-timer: contacted, with a note', async () => {
    const board = await admin.db.listRecords<FollowUp>('followups', { status: 'new', limit: 50 });
    if (!board.length) return console.warn('No new first-timers in the sample church: skipped');
    const f = board[0];
    setOnline(false);
    await admin.ministry.updateFollowUp(admin.me, f, { stage: 'contacted', note: `Called ${RUN}, coming next Sunday`, assignToMe: true });
    setOnline(true);
    await admin.syncNow();
    const after = (await admin.db.getRecord<FollowUp>('followups', f.id))!;
    expect(after.stage).toBe('contacted');
    expect(after.assignedTo?.id).toBe(admin.me.user.id);
    expect(after.notes.map((n) => n.text).join(' ')).toContain(`Called ${RUN}`);
  });

  it('registers a member for an event offline', async () => {
    const created = await admin.api<{ id: string }>('/events', {
      method: 'POST',
      body: { nodeId: admin.me.rootNodeId, title: `Youth camp ${RUN}`, startsAt: new Date(Date.now() + 7 * 86_400_000).toISOString(), location: 'Aburi', registrationOpen: true, capacity: 50 },
    });
    await admin.syncNow();
    const event = (await admin.db.getRecord<ChurchEvent>('events', created.id))!;
    expect(event).toMatchObject({ canManage: true, registrationOpen: true });
    const [someone] = await admin.db.listRecords<{ id: string; fullName: string }>('members', { limit: 1 });
    setOnline(false);
    await admin.ministry.register(event, { memberId: someone.id, name: someone.fullName, guests: 2 });
    setOnline(true);
    await admin.syncNow();
    expect((await admin.db.getRecord<ChurchEvent>('events', created.id))!.registrationCount).toBe(1);
    const regs = await admin.db.recordsWithStatus<{ name: string; guests: number }>('registrations', created.id);
    expect(regs).toMatchObject([{ name: someone.fullName, guests: 2 }]);
  });

  it('keeps the words of a prayer request off the phone, readable online by the pastor', async () => {
    const words = `Healing for my mother ${RUN}`;
    setOnline(false);
    await admin.ministry.addPrayer({ requesterName: `Visitor ${RUN}`, request: words, isConfidential: true, nodeId: admin.me.rootNodeId! });
    setOnline(true);
    await admin.syncNow();
    expect((await admin.sync.listOutbox()).filter((o) => o.error)).toEqual([]);

    // Nowhere in the phone's database: not in the records, not in the outbox.
    const everywhere = JSON.stringify([await admin.db.getDb().getAllAsync('SELECT * FROM records'), await admin.db.getDb().getAllAsync('SELECT * FROM outbox')]);
    expect(everywhere).not.toContain(words);
    const [row] = (await admin.db.listRecords<PrayerRow>('prayer', { limit: 500 })).filter((p) => p.requesterName === `Visitor ${RUN}`);
    expect(row).toMatchObject({ isConfidential: true, status: 'open' });
    // Read online, one record at a time.
    expect(await admin.ministry.readPrivate('prayer', row.id)).toBe(words);
  });
});
