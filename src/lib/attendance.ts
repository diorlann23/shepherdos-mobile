import * as Crypto from 'expo-crypto';
import { api, ApiError, OfflineError } from './api';
import { getDb, getRecord, recordsWithStatus, removeRecord, upsertRecords } from './db';
import { emit } from './events';
import { readCard } from './card-token';
import { changedLocally, queueChange } from './sync';
import { nodeName } from './permissions';
import type { Me } from './types';

/**
 * Attendance on the phone. Check-ins are saved here first and shown at once,
 * then sent in batches; the server ignores repeats, so a check-in sent twice,
 * or the same person checked in by two ushers, is only ever counted once.
 */

export interface Service {
  id: string;
  title: string;
  date: string;
  nodeId: string;
  nodeName: string;
  serviceTypeId: string | null;
  mode: 'individual' | 'headcount' | 'both';
  status: 'open' | 'closed';
  headcount: Headcount;
  presentCount: number;
  pending?: boolean;
}
export interface Headcount {
  total: number;
  men: number;
  women: number;
  children: number;
  firstTimers: number;
  online: number;
}
export interface CheckIn {
  id: string;
  sessionId: string;
  memberId: string;
  method: string;
  markedAt: string;
  firstTime?: boolean;
  pending?: boolean;
}
export interface RosterPerson {
  id: string;
  name: string;
  memberNumber: string;
  householdId: string | null;
  householdRole: string | null;
  phoneTail: string | null;
  nodeId: string;
  status: string;
  pending?: boolean;
}
export interface ServiceType {
  id: string;
  name: string;
  dayOfWeek: number | null;
  startTime: string | null;
  defaultMode: Service['mode'];
  isActive: boolean;
}

/** How each check-in was taken, as the website labels them. */
export const METHOD_LABELS: Record<string, string> = {
  assisted: 'Usher',
  qr: 'Card scan',
  desk: 'Entrance desk',
  sheet: 'Printed sheet',
  leader: 'Group leader',
  household: 'Household',
  self: 'Self',
  ussd: 'USSD',
};

/** The server accepts check-ins up to 7 days after a service. */
const LATE_ENTRY_DAYS = 7;
export function canTakeCheckIns(s: Service): { ok: true } | { ok: false; reason: string } {
  const ageDays = (Date.now() - new Date(s.date).getTime()) / 86_400_000;
  if (s.mode === 'headcount') return { ok: false, reason: 'This service records a headcount only.' };
  if (ageDays > LATE_ENTRY_DAYS + 1) return { ok: false, reason: `Check-ins can only be added within ${LATE_ENTRY_DAYS} days of a service.` };
  if (s.status === 'closed' && ageDays > LATE_ENTRY_DAYS) return { ok: false, reason: 'This service is closed.' };
  if (ageDays < -1) return { ok: false, reason: 'This service hasn’t happened yet.' };
  return { ok: true };
}

const newId = () => `local_${Crypto.randomUUID().replace(/-/g, '')}`;

/** Everyone checked in to a service: the server's list plus what this phone hasn't sent yet. One entry per person. */
export async function checkInsFor(sessionId: string): Promise<CheckIn[]> {
  const rows = await recordsWithStatus<CheckIn>('checkins', sessionId);
  const seen = new Set<string>();
  return rows.filter((r) => (seen.has(r.memberId) ? false : (seen.add(r.memberId), true)));
}

// ---- Check in / undo --------------------------------------------------------------
export async function checkIn(sessionId: string, memberIds: string[], method = 'assisted') {
  const present = new Set((await checkInsFor(sessionId)).map((c) => c.memberId));
  const fresh = [...new Set(memberIds)].filter((id) => !present.has(id));
  if (!fresh.length) return 0;
  const markedAt = new Date().toISOString();
  const d = getDb();
  const placeholders: CheckIn[] = [];
  await d.withExclusiveTransactionAsync(async (tx) => {
    for (const memberId of fresh) {
      const id = newId();
      await tx.runAsync('INSERT INTO marks (client_id, session_id, member_id, method, marked_at) VALUES (?, ?, ?, ?, ?)', id, sessionId, memberId, method, markedAt);
      placeholders.push({ id, sessionId, memberId, method, markedAt, pending: true });
    }
  });
  await upsertRecords('checkins', placeholders as unknown as Record<string, unknown>[]);
  emit('marks');
  await changedLocally();
  return fresh.length;
}

/** Fixes a mis-tap. Not sent yet: simply dropped. Already on the server: an undo is sent. */
export async function undoCheckIn(sessionId: string, memberId: string, label: string) {
  const d = getDb();
  const unsent = await d.getAllAsync<{ client_id: string }>('SELECT client_id FROM marks WHERE session_id = ? AND member_id = ?', sessionId, memberId);
  for (const m of unsent) {
    await d.runAsync('DELETE FROM marks WHERE client_id = ?', m.client_id);
    await removeRecord('checkins', m.client_id);
  }
  const onServer = (await recordsWithStatus<CheckIn>('checkins', sessionId)).filter((c) => c.memberId === memberId && !c.id.startsWith('local_'));
  for (const c of onServer) {
    await removeRecord('checkins', c.id);
    await queueChange({ method: 'DELETE', path: `/attendance/sessions/${sessionId}/records`, body: { memberIds: [memberId] }, label: `Undo check-in: ${label}`, collection: 'checkins', recordId: c.id });
  }
  emit('marks');
  await changedLocally();
}

/** Everyone in the person's household who is on this phone's roster. */
export async function householdOf(person: RosterPerson): Promise<RosterPerson[]> {
  if (!person.householdId) return [person];
  return recordsWithStatus<RosterPerson>('roster', person.householdId);
}

// ---- QR cards ---------------------------------------------------------------------
export type ScanResult =
  | { kind: 'checked-in'; name: string; already: boolean; verified: boolean }
  | { kind: 'error'; message: string };

/**
 * Online: the server checks the card (forged or replaced cards are refused).
 * Offline: the phone reads the member from the card and checks them in; the
 * check-in is sent when back online.
 */
export async function scanCard(sessionId: string, data: string): Promise<ScanResult> {
  const card = readCard(data);
  if (!card) return { kind: 'error', message: 'This isn’t a ShepherdOS member card.' };
  const person = await getRecord<RosterPerson>('roster', card.memberId);
  if (!sessionId.startsWith('local_')) {
    try {
      const res = await api<{ memberId: string; name: string; alreadyMarked: boolean }>('/attendance/scan', { method: 'POST', body: { sessionId, token: data.trim() } });
      // Show the tick straight away; the server's own record arrives with the next sync.
      const present = new Set((await checkInsFor(sessionId)).map((c) => c.memberId));
      if (!present.has(res.memberId)) {
        await upsertRecords('checkins', [{ id: newId(), sessionId, memberId: res.memberId, method: 'qr', markedAt: new Date().toISOString(), pending: true }]);
      }
      return { kind: 'checked-in', name: res.name, already: res.alreadyMarked, verified: true };
    } catch (e) {
      if (e instanceof ApiError) return { kind: 'error', message: e.message };
      if (!(e instanceof OfflineError)) return { kind: 'error', message: 'The card couldn’t be checked. Try again.' };
    }
  }
  if (!person) return { kind: 'error', message: 'This card isn’t for anyone on this phone’s list. Connect to the internet to check it.' };
  const added = await checkIn(sessionId, [person.id], 'qr');
  return { kind: 'checked-in', name: person.name, already: added === 0, verified: false };
}

// ---- First-timers at the door -------------------------------------------------------
export interface VisitorInput {
  firstName: string;
  lastName: string;
  phone?: string;
  gender?: 'male' | 'female';
  area?: string;
  invitedBy?: string;
}

/** Registers someone new and checks them in, in one step, as the website's door form does. */
export async function addVisitor(service: Service, input: VisitorInput) {
  const id = newId();
  const name = `${input.firstName} ${input.lastName}`.trim();
  await upsertRecords('roster', [{ id, name, memberNumber: '', householdId: null, householdRole: null, phoneTail: input.phone ? input.phone.replace(/\D/g, '').slice(-4) : null, nodeId: service.nodeId, status: 'visitor', pending: true }]);
  await upsertRecords('checkins', [{ id: newId(), sessionId: service.id, memberId: id, method: 'desk', markedAt: new Date().toISOString(), firstTime: true, pending: true }]);
  const body = Object.fromEntries(Object.entries(input).filter(([, v]) => v !== undefined && v !== ''));
  await queueChange({ method: 'POST', path: `/attendance/sessions/${service.id}/visitor`, body, label: `First-timer: ${name}`, collection: 'roster', localId: id });
}

// ---- Services ---------------------------------------------------------------------
export interface NewService {
  title: string;
  nodeId: string;
  date: string;
  mode: Service['mode'];
  serviceTypeId: string | null;
}

export async function startService(me: Me | null, input: NewService) {
  const id = newId();
  const row: Service = {
    id,
    ...input,
    nodeName: nodeName(me, input.nodeId),
    status: 'open',
    headcount: { total: 0, men: 0, women: 0, children: 0, firstTimers: 0, online: 0 },
    presentCount: 0,
    pending: true,
  };
  await upsertRecords('services', [row as unknown as Record<string, unknown>]);
  await queueChange({ method: 'POST', path: '/attendance/sessions', body: input, label: `Start ${input.title}`, collection: 'services', localId: id });
  return id;
}

export async function saveHeadcount(service: Service, headcount: Headcount) {
  await upsertRecords('services', [{ ...service, headcount } as unknown as Record<string, unknown>]);
  await queueChange({ method: 'PATCH', path: `/attendance/sessions/${service.id}`, body: { headcount }, label: `Headcount for ${service.title}`, collection: 'services', recordId: service.id });
}

export async function setServiceStatus(service: Service, status: Service['status']) {
  await upsertRecords('services', [{ ...service, status } as unknown as Record<string, unknown>]);
  await queueChange({ method: 'PATCH', path: `/attendance/sessions/${service.id}`, body: { status }, label: `${status === 'closed' ? 'Close' : 'Reopen'} ${service.title}`, collection: 'services', recordId: service.id });
}

// ---- Check-ins the server refused -----------------------------------------------------
export async function refusedMarks(): Promise<{ clientId: string; sessionId: string; memberId: string; error: string }[]> {
  return getDb().getAllAsync('SELECT client_id AS clientId, session_id AS sessionId, member_id AS memberId, error FROM marks WHERE error IS NOT NULL');
}
export async function discardMark(clientId: string) {
  await getDb().runAsync('DELETE FROM marks WHERE client_id = ?', clientId);
  await removeRecord('checkins', clientId);
  emit('marks');
  await changedLocally();
}
