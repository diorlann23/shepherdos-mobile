/**
 * Phase 2 on a simulated phone: chained offline changes (add → edit → household)
 * reach the server in order, with the real ids, and duplicates are caught.
 */
import { phone, setOnline } from './phone';
import type { MemberRow } from '@/lib/types';

const PASSWORD = process.env.E2E_PASSWORD ?? 'Demo-Church-2026!';
const RUN = Date.now().toString(36);

describe('members on the phone', () => {
  afterEach(() => setOnline(true));

  it('adds, edits and groups people offline, and the server ends up with exactly that', async () => {
    const sec = await phone('secretary', 'secretary@demo.church', PASSWORD);
    const place = sec.me.nodes.find((n) => n.kind === 'branch' && sec.me.scopes['member.create'] && (sec.me.scopes['member.create'] === 'all' || sec.me.scopes['member.create'].includes(n.id)))!;
    expect(place, 'the secretary can add people somewhere').toBeTruthy();
    const phoneNo = `020${String(Date.now()).slice(-7)}`;

    setOnline(false);
    const id = await sec.mutations.addMember(sec.me, { firstName: 'Esi', lastName: `Offline ${RUN}`, nodeId: place.id, status: 'visitor', phone: phoneNo, gender: 'female' });
    const local = (await sec.db.getRecord<MemberRow>('members', id))!;
    // An edit made before the first sync folds into the waiting add.
    await sec.mutations.updateMember(sec.me, local, { status: 'member', area: 'Madina' });
    const houseId = await sec.mutations.addHousehold(sec.me, { name: `The Offline family ${RUN}`, nodeId: place.id }, [id]);
    expect(houseId.startsWith('local_')).toBe(true);

    setOnline(true);
    await sec.syncNow();
    const refused = (await sec.sync.listOutbox()).filter((o) => o.error);
    expect(refused, JSON.stringify(refused)).toEqual([]);
    expect(sec.status()).toMatchObject({ pending: 0, refused: 0 });

    const [person] = await sec.db.listRecords<MemberRow>('members', { q: `esi offline ${RUN}` });
    expect(person.id.startsWith('local_')).toBe(false);
    expect(person.memberNumber).not.toBe('');
    const onServer = await sec.api<{ status: string; area: string | null; household: { name: string } | null; householdId?: string }>(`/members/${person.id}`);
    expect(onServer).toMatchObject({ status: 'member', area: 'Madina' });
    expect(JSON.stringify(onServer)).toContain(`The Offline family ${RUN}`);

    // The same phone number again is held as a possible duplicate, then added on purpose.
    await sec.mutations.addMember(sec.me, { firstName: 'Esi', lastName: `Twin ${RUN}`, nodeId: place.id, status: 'visitor', phone: phoneNo, gender: 'female' });
    await sec.syncNow();
    const [dup] = (await sec.sync.listOutbox()).filter((o) => o.error);
    expect(dup, dup?.error ?? '').toMatchObject({ errorCode: 'CONFLICT' });
    expect(sec.sync.canForce(dup)).toBe(true);
    await sec.sync.retryChange(dup.seq, { force: true });
    await sec.syncNow();
    expect(sec.status()).toMatchObject({ pending: 0, refused: 0 });
    expect(await sec.db.listRecords<MemberRow>('members', { q: `twin ${RUN}` })).toHaveLength(1);
  });
});
