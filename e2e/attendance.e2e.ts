/**
 * Phase 3 on simulated phones against a real ShepherdOS server seeded with
 * the sample church (`pnpm seed`): an usher works offline at the door while
 * the church admin's phone watches.
 */
import { createHmac } from 'node:crypto';
import { phone, setOnline } from './phone';
import type { RosterPerson, Service } from '@/lib/attendance';

const PASSWORD = process.env.E2E_PASSWORD ?? 'Demo-Church-2026!';
// Unique per run, so earlier runs against the same server don't get in the way.
const RUN = Date.now().toString(36);
const today = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

describe('attendance on the phone', () => {
  // Each phone signs in once: the server limits sign-ins per account.
  let usher: Awaited<ReturnType<typeof phone>>;
  let admin: Awaited<ReturnType<typeof phone>>;
  beforeAll(async () => {
    usher = await phone('usher', 'usher@demo.church', PASSWORD);
    admin = await phone('admin', 'admin@demo.church', PASSWORD);
  });
  afterEach(() => setOnline(true));

  it('an usher checks people in with no signal, and the church gets each of them exactly once', async () => {
    // The first sync brought the usher's list down: names and numbers only.
    const roster = await usher.db.listRecords<RosterPerson>('roster', { limit: 10000 });
    expect(roster.length).toBeGreaterThan(20);
    expect(roster.every((r) => !('phone' in r) && (r.phoneTail === null || r.phoneTail.length <= 4))).toBe(true);

    // ---- Airplane mode: start the service and check people in ----------------
    setOnline(false);
    const branch = usher.me.nodes.find((n) => n.kind === 'branch' && roster.some((r) => r.nodeId === n.id))!;
    const serviceId = await usher.attendance.startService(usher.me, { title: `Phone test ${RUN}`, nodeId: branch.id, date: today(), mode: 'both', serviceTypeId: null });
    expect(serviceId.startsWith('local_')).toBe(true);

    const withHousehold = roster.find((r) => r.householdId && roster.filter((x) => x.householdId === r.householdId).length >= 2)!;
    const family = await usher.attendance.householdOf(withHousehold);
    const singles = roster.filter((r) => !r.householdId).slice(0, 3);
    await usher.attendance.checkIn(serviceId, singles.map((r) => r.id));
    await usher.attendance.checkIn(serviceId, family.map((r) => r.id));
    // A double tap, and the same person again: still one each.
    await usher.attendance.checkIn(serviceId, [singles[0].id, singles[0].id]);
    await usher.attendance.addVisitor({ id: serviceId, nodeId: branch.id } as Service, { firstName: 'Phone', lastName: `Visitor ${Date.now()}`, phone: '0201234567', gender: 'male' });
    const expected = singles.length + family.length + 1;

    expect((await usher.attendance.checkInsFor(serviceId)).length).toBe(expected);
    await usher.syncNow();
    expect(usher.status().state).toBe('offline');
    expect(usher.status().pending).toBeGreaterThan(0);

    // ---- Signal back --------------------------------------------------------------
    setOnline(true);
    await usher.syncNow();
    const refused = [...(await usher.sync.listOutbox()).filter((o) => o.error), ...(await usher.attendance.refusedMarks())];
    expect(refused, JSON.stringify(refused)).toEqual([]);
    expect(usher.status()).toMatchObject({ state: 'idle', pending: 0, refused: 0 });

    // The service now has its real id on the phone, with every check-in under it.
    const services = await usher.db.listRecords<Service>('services', { q: `phone test ${RUN}` });
    expect(services).toHaveLength(1);
    const realId = services[0].id;
    expect(realId.startsWith('local_')).toBe(false);
    const onPhone = await usher.attendance.checkInsFor(realId);
    expect(onPhone).toHaveLength(expected);
    expect(onPhone.every((c) => !c.id.startsWith('local_')), 'placeholders replaced by the server’s records').toBe(true);

    // The server counted each person once, and the first-timer is in the register.
    const summary = await admin.api<{ presentCount: number; firstTimers: number }>(`/attendance/sessions/${realId}`);
    expect(summary.presentCount).toBe(expected);
    expect(summary.firstTimers).toBe(1);

    // ---- The admin's phone sees it all, and can undo a mis-tap -----------------------
    await admin.syncNow();
    expect(await admin.attendance.checkInsFor(realId)).toHaveLength(expected);
    const who = singles[1];
    await admin.attendance.undoCheckIn(realId, who.id, who.name);
    await admin.syncNow();
    expect((await admin.api<{ presentCount: number }>(`/attendance/sessions/${realId}`)).presentCount).toBe(expected - 1);
    await usher.syncNow();
    expect((await usher.attendance.checkInsFor(realId)).map((c) => c.memberId)).not.toContain(who.id);

    // ---- Headcount and closing --------------------------------------------------------
    const svc = (await admin.db.getRecord<Service>('services', realId))!;
    await admin.attendance.saveHeadcount(svc, { total: 120, men: 40, women: 55, children: 25, firstTimers: 1, online: 30 });
    await admin.attendance.setServiceStatus({ ...svc, headcount: { total: 120, men: 40, women: 55, children: 25, firstTimers: 1, online: 30 } }, 'closed');
    await admin.syncNow();
    const closed = await admin.api<{ status: string; headcount: { total: number } }>(`/attendance/sessions/${realId}`);
    expect(closed).toMatchObject({ status: 'closed', headcount: { total: 120 } });
  });

  it('scans member cards: checked by the server online, read on the phone offline', async () => {
    const secret = process.env.E2E_HMAC_SECRET;
    if (!secret) return console.warn('E2E_HMAC_SECRET not set: card scanning skipped');
    const roster = await usher.db.listRecords<RosterPerson>('roster', { limit: 10000 });
    const branch = usher.me.nodes.find((n) => n.kind === 'branch' && roster.some((r) => r.nodeId === n.id))!;
    await usher.attendance.startService(usher.me, { title: `Scan test ${RUN}`, nodeId: branch.id, date: today(), mode: 'both', serviceTypeId: null });
    await usher.syncNow();
    const svc = (await usher.db.listRecords<Service>('services', { q: `scan test ${RUN}` }))[0];
    const card = (memberId: string, version = 1) => `CM1.${memberId}.${version}.${createHmac('sha256', secret).update(`card:${usher.me.org!.id}:${memberId}:${version}`).digest('base64url').slice(0, 16)}`;

    const [a, b] = roster;
    expect(await usher.attendance.scanCard(svc.id, card(a.id))).toMatchObject({ kind: 'checked-in', name: a.name, already: false, verified: true });
    expect(await usher.attendance.scanCard(svc.id, card(a.id))).toMatchObject({ kind: 'checked-in', already: true });
    // A forged card is refused by the server.
    expect(await usher.attendance.scanCard(svc.id, `CM1.${b.id}.1.AAAAAAAAAAAAAAAA`)).toMatchObject({ kind: 'error' });
    expect(await usher.attendance.scanCard(svc.id, 'https://example.com')).toMatchObject({ kind: 'error' });

    // Offline: read from the card, checked in on the phone, sent later.
    setOnline(false);
    expect(await usher.attendance.scanCard(svc.id, card(b.id))).toMatchObject({ kind: 'checked-in', name: b.name, verified: false });
    setOnline(true);
    await usher.syncNow();
    const summary = await usher.api<{ presentCount: number; byMethod: Record<string, number> }>(`/attendance/sessions/${svc.id}`);
    expect(summary.presentCount).toBe(2);
    expect(summary.byMethod.qr).toBe(2);
  });
});
