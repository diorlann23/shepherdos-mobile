import * as Crypto from 'expo-crypto';
import { api } from './api';
import { upsertRecords } from './db';
import { queueChange } from './sync';
import { nodeName } from './permissions';
import type { Me } from './types';

/**
 * Tasks, events, notices, first-timer follow-up and pastoral care on the phone.
 * Changes wait in the outbox and go through the website's own endpoints, so
 * the same rules apply. Prayer requests and visit notes are private: the phone
 * keeps only who, when and status; the words themselves are read online, one
 * record at a time, and never stored.
 */

const newId = () => `local_${Crypto.randomUUID().replace(/-/g, '')}`;
const nowIso = () => new Date().toISOString();

// ---- Tasks ------------------------------------------------------------------------------
export type TaskStatus = 'assigned' | 'accepted' | 'declined' | 'in_progress' | 'done' | 'verified' | 'cancelled';
export interface Task {
  id: string;
  title: string;
  description: string | null;
  status: TaskStatus;
  priority: string;
  dueDate: string | null;
  nodeId: string;
  nodeName: string;
  assignedBy: { id: string; name: string };
  assignedTo: { id: string; name: string };
  history: { at: string; byName?: string; from?: string; to: string; note?: string }[];
  overdue: boolean;
  isMine: boolean;
  iAssigned: boolean;
  canEdit?: boolean;
  pending?: boolean;
}
export interface Colleague {
  id: string;
  name: string;
  email: string;
}
export const TASK_STATUS: Record<TaskStatus, string> = {
  assigned: 'Assigned',
  accepted: 'Accepted',
  declined: 'Declined',
  in_progress: 'In progress',
  done: 'Done',
  verified: 'Verified',
  cancelled: 'Cancelled',
};
export const OPEN_TASK: TaskStatus[] = ['assigned', 'accepted', 'in_progress', 'done'];

/** The moves this person can make, as the website allows them. */
export function taskMoves(t: Task): { to: TaskStatus; label: string; destructive?: boolean }[] {
  const moves: { to: TaskStatus; label: string; destructive?: boolean }[] = [];
  if (t.isMine) {
    if (t.status === 'assigned') moves.push({ to: 'accepted', label: 'Accept' }, { to: 'declined', label: 'Decline', destructive: true });
    if (t.status === 'assigned' || t.status === 'accepted') moves.push({ to: 'in_progress', label: 'Start' });
    if (t.status === 'assigned' || t.status === 'accepted' || t.status === 'in_progress') moves.push({ to: 'done', label: 'Mark done' });
  }
  if (t.iAssigned || t.canEdit) {
    // Someone else must check work you did yourself.
    if (t.status === 'done' && !t.isMine) moves.push({ to: 'verified', label: 'Verify' }, { to: 'in_progress', label: 'Send back' });
    if (['assigned', 'accepted', 'in_progress', 'declined'].includes(t.status)) moves.push({ to: 'cancelled', label: 'Cancel task', destructive: true });
  }
  return moves;
}

export async function moveTask(me: Me | null, t: Task, to: TaskStatus, note?: string) {
  await upsertRecords('tasks', [{ ...t, status: to, history: [...t.history, { at: nowIso(), byName: me?.user.name, from: t.status, to, note }] } as unknown as Record<string, unknown>]);
  await queueChange({ method: 'POST', path: `/tasks/${t.id}/transition`, body: { to, ...(note ? { note } : {}) }, label: `${TASK_STATUS[to]}: ${t.title}`, collection: 'tasks', recordId: t.id });
}

export interface TaskInput {
  title: string;
  description?: string;
  assignedTo: Colleague;
  nodeId: string;
  dueDate?: string;
  priority: 'low' | 'normal' | 'high' | 'urgent';
}

export async function createTask(me: Me | null, input: TaskInput) {
  const id = newId();
  const task: Task = {
    id,
    title: input.title,
    description: input.description ?? null,
    status: 'assigned',
    priority: input.priority,
    dueDate: input.dueDate ?? null,
    nodeId: input.nodeId,
    nodeName: nodeName(me, input.nodeId),
    assignedBy: { id: me?.user.id ?? '', name: me?.user.name ?? '' },
    assignedTo: { id: input.assignedTo.id, name: input.assignedTo.name },
    history: [],
    overdue: false,
    isMine: input.assignedTo.id === me?.user.id,
    iAssigned: true,
    pending: true,
  };
  await upsertRecords('tasks', [task as unknown as Record<string, unknown>]);
  const body = { title: input.title, assignedTo: input.assignedTo.id, nodeId: input.nodeId, priority: input.priority, ...(input.description ? { description: input.description } : {}), ...(input.dueDate ? { dueDate: input.dueDate } : {}) };
  await queueChange({ method: 'POST', path: '/tasks', body, label: `Task for ${input.assignedTo.name}: ${input.title}`, collection: 'tasks', localId: id });
  return id;
}

// ---- Events ------------------------------------------------------------------------------
export interface ChurchEvent {
  id: string;
  title: string;
  description: string | null;
  category: string;
  startsAt: string;
  endsAt: string | null;
  location: string | null;
  nodeId: string;
  nodeName: string;
  status: 'draft' | 'pending_approval' | 'published' | 'cancelled';
  registrationOpen: boolean;
  registrationCount: number;
  capacity: number | null;
  canManage: boolean;
  hidden?: boolean;
}
export interface Registration {
  id: string;
  eventId: string;
  name: string;
  phone: string | null;
  memberId: string | null;
  guests: number;
  status: 'registered' | 'waitlisted' | 'cancelled' | 'attended';
  checkedInAt: string | null;
  pending?: boolean;
}

/** Registers someone: yourself, or (for organisers) a member or guest. A full event puts them on the waiting list. */
export async function register(event: ChurchEvent, who: { memberId?: string; name: string; phone?: string; guests: number }) {
  const id = newId();
  if (event.canManage) {
    await upsertRecords('registrations', [{ id, eventId: event.id, name: who.name, phone: who.phone ?? null, memberId: who.memberId ?? null, guests: who.guests, status: 'registered', checkedInAt: null, pending: true }]);
  }
  await upsertRecords('events', [{ ...event, registrationCount: event.registrationCount + 1 } as unknown as Record<string, unknown>]);
  const body = { ...(who.memberId ? { memberId: who.memberId } : { name: who.name }), ...(who.phone ? { phone: who.phone } : {}), guests: who.guests };
  await queueChange({ method: 'POST', path: `/events/${event.id}/registrations`, body, label: `Register ${who.name} for ${event.title}`, collection: 'registrations', localId: id });
}

// ---- Notices --------------------------------------------------------------------------------
export interface Notice {
  id: string;
  title: string;
  body: string;
  nodeId: string;
  nodeName: string;
  status: 'draft' | 'scheduled' | 'published';
  publishAt: string;
  createdBy: string;
  pending?: boolean;
}

export async function publishNotice(me: Me | null, input: { title: string; body: string; nodeId: string; email: boolean }) {
  const id = newId();
  const notice: Notice = { id, title: input.title, body: input.body, nodeId: input.nodeId, nodeName: nodeName(me, input.nodeId), status: 'published', publishAt: nowIso(), createdBy: me?.user.name ?? '', pending: true };
  await upsertRecords('announcements', [notice as unknown as Record<string, unknown>]);
  await queueChange({
    method: 'POST',
    path: '/announcements',
    body: { title: input.title, body: input.body, nodeId: input.nodeId, channels: input.email ? ['in_app', 'email'] : ['in_app'] },
    label: `Notice: ${input.title}`,
    collection: 'announcements',
    localId: id,
  });
  return id;
}

// ---- First-timer follow-up ---------------------------------------------------------------------
export type Stage = 'new' | 'contacted' | 'visited' | 'attending' | 'joined' | 'closed';
export const STAGES: { value: Stage; label: string }[] = [
  { value: 'new', label: 'New' },
  { value: 'contacted', label: 'Contacted' },
  { value: 'visited', label: 'Visited' },
  { value: 'attending', label: 'Attending' },
  { value: 'joined', label: 'Joined' },
  { value: 'closed', label: 'Closed' },
];
export const stageLabel = (s: string) => STAGES.find((x) => x.value === s)?.label ?? s;
export interface FollowUp {
  id: string;
  memberId: string;
  name: string;
  phone: string | null;
  area: string | null;
  stage: Stage;
  source: string;
  firstVisitDate: string;
  assignedTo: { id: string; name: string } | null;
  nextActionAt: string | null;
  notes: { at: string; byName: string; text: string }[];
  branch: string;
  canEdit: boolean;
}

export async function updateFollowUp(me: Me | null, f: FollowUp, change: { stage?: Stage; note?: string; assignToMe?: boolean }) {
  const notes = [...f.notes];
  if (change.note) notes.push({ at: nowIso(), byName: me?.user.name ?? '', text: change.note });
  if (change.stage && change.stage !== f.stage) notes.push({ at: nowIso(), byName: me?.user.name ?? '', text: `Moved from ${f.stage} to ${change.stage}` });
  const next: FollowUp = { ...f, notes, stage: change.stage ?? f.stage, assignedTo: change.assignToMe ? { id: me?.user.id ?? '', name: me?.user.name ?? '' } : f.assignedTo };
  await upsertRecords('followups', [next as unknown as Record<string, unknown>]);
  const body = { ...(change.stage ? { stage: change.stage } : {}), ...(change.note ? { note: change.note } : {}), ...(change.assignToMe ? { assignedTo: me?.user.id } : {}) };
  const label = change.stage ? `${f.name}: ${stageLabel(change.stage)}` : change.assignToMe ? `Take on ${f.name}` : `Note on ${f.name}`;
  await queueChange({ method: 'PATCH', path: `/follow-ups/${f.id}`, body, label, collection: 'followups', recordId: f.id });
}

// ---- Prayer requests and pastoral visits -----------------------------------------------------------
export interface PrayerRow {
  id: string;
  member: string | null;
  requesterName: string | null;
  status: 'open' | 'praying' | 'answered' | 'closed';
  isConfidential: boolean;
  nodeId: string | null;
  createdAt: string;
  _labels?: Record<string, string>;
  _restricted?: string[];
  canEdit?: boolean;
  pending?: boolean;
}
export interface VisitRow {
  id: string;
  member: string;
  type: string;
  date: string;
  visitedBy: string | null;
  followUpNeeded: boolean;
  nodeId: string | null;
  createdAt: string;
  _labels?: Record<string, string>;
  _restricted?: string[];
  canEdit?: boolean;
  pending?: boolean;
}
export const PRAYER_STATUS = [
  { value: 'open', label: 'Open' },
  { value: 'praying', label: 'Praying' },
  { value: 'answered', label: 'Answered' },
  { value: 'closed', label: 'Closed' },
];
export const VISIT_TYPES = [
  { value: 'hospital', label: 'Hospital' },
  { value: 'home', label: 'Home' },
  { value: 'bereavement', label: 'Bereavement' },
  { value: 'prison', label: 'Prison' },
  { value: 'new_baby', label: 'New baby' },
  { value: 'other', label: 'Other' },
];
export const personOf = (r: { member?: string | null; requesterName?: string | null; _labels?: Record<string, string> }) =>
  (r.member && r._labels?.[r.member]) || r.requesterName || 'Someone';

/**
 * The request's words go only into the outbox (sent, then deleted). The list
 * on the phone shows who and when, never the words, exactly like the synced list.
 */
export async function addPrayer(input: { memberId?: string; memberName?: string; requesterName?: string; request: string; isConfidential: boolean; nodeId: string }) {
  const id = newId();
  const row: PrayerRow = {
    id,
    member: input.memberId ?? null,
    requesterName: input.requesterName ?? null,
    status: 'open',
    isConfidential: input.isConfidential,
    nodeId: input.nodeId,
    createdAt: nowIso(),
    _labels: input.memberId && input.memberName ? { [input.memberId]: input.memberName } : {},
    _restricted: ['request'],
    pending: true,
  };
  await upsertRecords('prayer', [row as unknown as Record<string, unknown>]);
  const body = { request: input.request, status: 'open', isConfidential: input.isConfidential, nodeId: input.nodeId, ...(input.memberId ? { member: input.memberId } : { requesterName: input.requesterName }) };
  await queueChange({ method: 'POST', path: '/r/prayer', body, label: `Prayer request: ${personOf(row)}`, collection: 'prayer', localId: id });
}

export async function setPrayerStatus(row: PrayerRow, status: PrayerRow['status']) {
  await upsertRecords('prayer', [{ ...row, status } as unknown as Record<string, unknown>]);
  await queueChange({ method: 'PATCH', path: `/r/prayer/${row.id}`, body: { status }, label: `Prayer request ${status}: ${personOf(row)}`, collection: 'prayer', recordId: row.id });
}

export async function logVisit(input: { memberId: string; memberName: string; type: string; date: string; visitedBy?: string; followUpNeeded: boolean; notes?: string; nodeId: string }) {
  const id = newId();
  const row: VisitRow = {
    id,
    member: input.memberId,
    type: input.type,
    date: input.date,
    visitedBy: input.visitedBy ?? null,
    followUpNeeded: input.followUpNeeded,
    nodeId: input.nodeId,
    createdAt: nowIso(),
    _labels: { [input.memberId]: input.memberName },
    _restricted: input.notes ? ['notes'] : [],
    pending: true,
  };
  await upsertRecords('visits', [row as unknown as Record<string, unknown>]);
  const body = { member: input.memberId, type: input.type, date: input.date, followUpNeeded: input.followUpNeeded, nodeId: input.nodeId, ...(input.visitedBy ? { visitedBy: input.visitedBy } : {}), ...(input.notes ? { notes: input.notes } : {}) };
  await queueChange({ method: 'POST', path: '/r/visits', body, label: `Visit: ${input.memberName}`, collection: 'visits', localId: id });
}

/** Reads the private words of one record, online only. Never saved on the phone. */
export async function readPrivate(kind: 'prayer' | 'visits', id: string): Promise<string | null> {
  const r = await api<{ request?: string; notes?: string; _restricted?: string[] }>(`/r/${kind}/${id}`);
  return (kind === 'prayer' ? r.request : r.notes) ?? null;
}
