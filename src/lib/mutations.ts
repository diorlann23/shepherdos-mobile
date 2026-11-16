import * as Crypto from 'expo-crypto';
import { getDb, getRecord, upsertRecords } from './db';
import { emit } from './events';
import { queueChange } from './sync';
import { can, nodeName } from './permissions';
import type { HouseholdRow, Me, MemberRow } from './types';

/**
 * Changes made on the phone. Each one shows straight away and waits in the
 * outbox until the server has it; the server checks permissions, duplicates
 * and the church's form rules exactly as it does for the website.
 */

const localId = () => `local_${Crypto.randomUUID().replace(/-/g, '')}`;
export const isLocal = (id: string | null | undefined) => !!id && id.startsWith('local_');

const fullName = (m: { firstName?: string | null; middleName?: string | null; lastName?: string | null }) =>
  [m.firstName, m.middleName, m.lastName].map((s) => s?.trim()).filter(Boolean).join(' ');

export interface MemberInput {
  firstName: string;
  middleName?: string | null;
  lastName: string;
  gender?: string | null;
  dateOfBirth?: string | null;
  maritalStatus?: string | null;
  phone?: string | null;
  whatsapp?: string | null;
  secondaryPhone?: string | null;
  email?: string | null;
  area?: string | null;
  occupation?: string | null;
  nodeId: string;
  groups?: { nodeId: string; role: 'member' | 'leader' | 'assistant' }[];
  status: string;
  dateJoined?: string | null;
  householdId?: string | null;
  householdRole?: string | null;
}

/** What the phone shows for a member, worked out from what was typed. */
function rowFrom(me: Me | null, base: Partial<MemberRow>, input: Partial<MemberInput>): MemberRow {
  const merged = { ...base, ...input } as MemberRow & MemberInput;
  return {
    ...merged,
    fullName: fullName(merged),
    branchName: nodeName(me, merged.nodeId) || base.branchName || '',
    groups: input.groups ? input.groups.map((g) => ({ id: g.nodeId, name: nodeName(me, g.nodeId), role: g.role })) : (base.groups ?? []),
    age: merged.dateOfBirth ? Math.floor((Date.now() - new Date(merged.dateOfBirth).getTime()) / (365.25 * 86_400_000)) : null,
    updatedAt: new Date().toISOString(),
  } as MemberRow;
}

export async function addMember(me: Me | null, input: MemberInput) {
  const id = localId();
  const row = rowFrom(me, { id, memberNumber: '', lastAttendedAt: null, householdRole: null, householdId: null, pending: true }, input);
  await upsertRecords('members', [row as unknown as Record<string, unknown>]);
  // Ushers can check them in straight away, even before they reach the server.
  if (can(me, 'attendance.create')) {
    await upsertRecords('roster', [
      { id, name: row.fullName, memberNumber: '', householdId: input.householdId ?? null, householdRole: input.householdRole ?? null, phoneTail: input.phone ? input.phone.replace(/\D/g, '').slice(-4) : null, nodeId: input.nodeId, status: input.status, pending: true },
    ]);
  }
  await queueChange({ method: 'POST', path: '/members', body: input, label: `Add ${row.fullName}`, collection: 'members', localId: id });
  return id;
}

/** Only the fields that changed are sent, so nothing the phone doesn't hold is touched on the server. */
export async function updateMember(me: Me | null, current: MemberRow, changes: Partial<MemberInput>, label?: string) {
  if (!Object.keys(changes).length) return;
  const row = rowFrom(me, current, changes);
  await upsertRecords('members', [row as unknown as Record<string, unknown>]);
  const name = label ?? `Update ${row.fullName}`;
  if (isLocal(current.id) && (await mergeIntoQueuedCreate(current.id, changes, `Add ${row.fullName}`))) return;
  await queueChange({ method: 'PATCH', path: `/members/${current.id}`, body: changes, label: name, collection: 'members', recordId: current.id });
}

/**
 * Editing someone added offline before they reached the server: fold the edit
 * into the waiting "add", rather than sending an edit for a record that doesn't exist yet.
 */
async function mergeIntoQueuedCreate(id: string, changes: object, label: string) {
  const row = await getDb().getFirstAsync<{ seq: number; body: string | null }>("SELECT seq, body FROM outbox WHERE local_id = ? AND method = 'POST'", id);
  if (!row) return false;
  const body = { ...(row.body ? JSON.parse(row.body) : {}), ...changes };
  // An edit is a fresh attempt: clear any earlier refusal so it's sent again.
  await getDb().runAsync('UPDATE outbox SET body = ?, label = ?, error = NULL, error_code = NULL WHERE seq = ?', JSON.stringify(body), label, row.seq);
  emit('outbox');
  await queueChange.refresh();
  return true;
}

// ---- Households ----------------------------------------------------------------
export interface HouseholdInput {
  name: string;
  nodeId: string;
  address?: string;
  phone?: string;
}

export async function addHousehold(me: Me | null, input: HouseholdInput, memberIds: string[] = []) {
  const id = localId();
  const row: HouseholdRow = { id, name: input.name, nodeId: input.nodeId, branch: nodeName(me, input.nodeId), address: input.address ?? null, phone: input.phone ?? null, headName: null, pending: true };
  await upsertRecords('households', [row as unknown as Record<string, unknown>]);
  await queueChange({ method: 'POST', path: '/households', body: input, label: `Add household ${input.name}`, collection: 'households', localId: id });
  for (const memberId of memberIds) {
    const m = await getRecord<MemberRow>('members', memberId);
    if (m) await setHousehold(me, m, id, m.householdRole ?? 'other', input.name);
  }
  return id;
}

export async function updateHousehold(me: Me | null, current: HouseholdRow, changes: Partial<HouseholdInput>) {
  if (!Object.keys(changes).length) return;
  const row: HouseholdRow = { ...current, ...changes, branch: changes.nodeId ? nodeName(me, changes.nodeId) : current.branch } as HouseholdRow;
  await upsertRecords('households', [row as unknown as Record<string, unknown>]);
  if (isLocal(current.id) && (await mergeIntoQueuedCreate(current.id, changes, `Add household ${row.name}`))) return;
  await queueChange({ method: 'PATCH', path: `/households/${current.id}`, body: changes, label: `Update household ${row.name}`, collection: 'households', recordId: current.id });
}

/** Puts a member in a household (or takes them out with null), with their role in it. */
export async function setHousehold(me: Me | null, member: MemberRow, householdId: string | null, role: string | null, householdName?: string) {
  const changes = { householdId, householdRole: householdId ? role : null };
  const label = householdId ? `Add ${member.fullName} to ${householdName ?? 'household'}` : `Remove ${member.fullName} from household`;
  await updateMember(me, member, changes, label);
}

/** Makes one member the head; the previous head becomes a spouse, as on the website. */
export async function setHead(me: Me | null, household: HouseholdRow, members: MemberRow[], head: MemberRow) {
  for (const m of members) {
    if (m.id !== head.id && m.householdRole === 'head') await upsertRecords('members', [{ ...m, householdRole: 'spouse' } as unknown as Record<string, unknown>]);
  }
  await upsertRecords('members', [{ ...head, householdRole: 'head' } as unknown as Record<string, unknown>]);
  await upsertRecords('households', [{ ...household, headName: head.fullName } as unknown as Record<string, unknown>]);
  if (isLocal(household.id) || isLocal(head.id)) {
    // Can't name a head the server doesn't know yet: set it on the member instead.
    await setHousehold(me, head, household.id, 'head', household.name);
    return;
  }
  await queueChange({ method: 'PATCH', path: `/households/${household.id}`, body: { headMemberId: head.id }, label: `Make ${head.fullName} head of ${household.name}`, collection: 'households', recordId: household.id });
}
