import * as Crypto from 'expo-crypto';
import { getRecord, recordsWithStatus, removeRecord, upsertRecords } from './db';
import { queueChange } from './sync';
import { nodeName } from './permissions';
import type { Me } from './types';

/**
 * Giving and expenses on the phone. Every change waits in the outbox with its
 * own key, so the server records it once however often it's re-sent. The
 * server keeps all the rules: two different people count and verify, posted
 * sheets can't be changed, approval limits, no approving your own request.
 */

export type SheetStatus = 'draft' | 'counted' | 'verified' | 'posted' | 'void';
export interface Sheet {
  id: string;
  title: string;
  date: string;
  nodeId: string;
  nodeName: string;
  status: SheetStatus;
  currency: string;
  denominations: { value: number; count: number }[];
  cashTotal: number;
  entriesTotal: number;
  entryCount: number;
  countedBy: string | null;
  verifiedBy: string | null;
  postedBy: string | null;
  voidReason: string | null;
  requireTwoPerson: boolean;
  you: { counted: boolean; created: boolean; canEdit: boolean; canVerify: boolean; canPost: boolean; canVoid: boolean };
  pending?: boolean;
}
export interface Entry {
  id: string;
  batchId: string;
  memberId: string | null;
  giver: string;
  memberNumber: string | null;
  fundId: string;
  fund: string;
  amount: number;
  currency: string;
  method: string;
  reference: string | null;
  status: string;
  receiptNumber: string | null;
  createdAt?: string;
  pending?: boolean;
}
export interface Fund {
  id: string;
  name: string;
  type: string;
  isActive: boolean;
}
export interface Expense {
  id: string;
  title: string;
  category: string;
  description: string | null;
  amount: number;
  currency: string;
  payee: string | null;
  date: string;
  status: 'draft' | 'submitted' | 'approved' | 'rejected' | 'paid' | 'void';
  nodeId: string;
  nodeName: string;
  requestedBy: string;
  mine: boolean;
  approvals: { name: string; decision: string; note: string | null; at: string }[];
  canDecide?: boolean;
  pending?: boolean;
}
export interface Budget {
  id: string;
  name: string;
  nodeName: string;
  startDate: string;
  endDate: string;
  currency: string;
  status: string;
  total: number;
  spent: number;
  lines: { category: string; amount: number }[];
}

export const SHEET_STATUS: Record<SheetStatus, string> = { draft: 'Counting', counted: 'Awaiting verification', verified: 'Verified', posted: 'Posted', void: 'Void' };
export const PAYMENT_METHODS = [
  { value: 'cash', label: 'Cash' },
  { value: 'mobile_money', label: 'Mobile money' },
  { value: 'bank_transfer', label: 'Bank transfer' },
  { value: 'card', label: 'Card' },
  { value: 'cheque', label: 'Cheque' },
  { value: 'other', label: 'Other' },
];
export const methodLabel = (v: string) => PAYMENT_METHODS.find((m) => m.value === v)?.label ?? v;
export const EXPENSE_CATEGORIES = [
  { value: 'utilities', label: 'Utilities' },
  { value: 'rent', label: 'Rent & facilities' },
  { value: 'salaries', label: 'Salaries & allowances' },
  { value: 'ministry', label: 'Ministry programs' },
  { value: 'missions', label: 'Missions & outreach' },
  { value: 'welfare', label: 'Welfare & benevolence' },
  { value: 'maintenance', label: 'Repairs & maintenance' },
  { value: 'equipment', label: 'Equipment' },
  { value: 'transport', label: 'Transport' },
  { value: 'events', label: 'Events' },
  { value: 'admin', label: 'Administration' },
  { value: 'remittance', label: 'Remittance to HQ' },
  { value: 'other', label: 'Other' },
];
export const categoryLabel = (v: string) => EXPENSE_CATEGORIES.find((c) => c.value === v)?.label ?? v;

const newId = () => `local_${Crypto.randomUUID().replace(/-/g, '')}`;

// ---- Counting sheets -----------------------------------------------------------------
export const entriesOf = (sheetId: string) => recordsWithStatus<Entry>('entries', sheetId);

/** Totals worked out from the entries on the phone, so they're right before the server answers. */
export function totals(sheet: Sheet, entries: Entry[]) {
  const live = entries.filter((e) => e.status !== 'void');
  const entriesTotal = live.reduce((s, e) => s + e.amount, 0);
  const cashEntries = live.filter((e) => e.method === 'cash').reduce((s, e) => s + e.amount, 0);
  const counted = sheet.denominations.reduce((s, d) => s + d.value * d.count, 0);
  return { entriesTotal, cashEntries, counted, entryCount: live.length, cashMatches: counted === 0 || counted === cashEntries };
}

/** What this person can do with a sheet right now (the server checks again). */
export function sheetActions(s: Sheet) {
  const separate = !s.you.counted && !s.you.created;
  return {
    edit: s.status === 'draft' && s.you.canEdit,
    submit: s.status === 'draft' && s.you.canEdit,
    verify: s.status === 'counted' && s.you.canVerify && separate,
    verifyBlocked: s.status === 'counted' && s.you.canVerify && !separate,
    post: s.you.canPost && (s.status === 'verified' || (!s.requireTwoPerson && s.status === 'counted')),
    reopen: (s.status === 'counted' || s.status === 'verified') && s.you.canEdit,
    void: s.status !== 'posted' && s.status !== 'void' && s.you.canVoid,
  };
}

export async function startSheet(me: Me | null, input: { title: string; nodeId: string; date: string; sessionId?: string | null }, defaults: { currency: string; denominations: number[] }) {
  const id = newId();
  const sheet: Sheet = {
    id,
    title: input.title,
    date: input.date,
    nodeId: input.nodeId,
    nodeName: nodeName(me, input.nodeId),
    status: 'draft',
    currency: defaults.currency,
    denominations: defaults.denominations.map((value) => ({ value, count: 0 })),
    cashTotal: 0,
    entriesTotal: 0,
    entryCount: 0,
    countedBy: null,
    verifiedBy: null,
    postedBy: null,
    voidReason: null,
    requireTwoPerson: true,
    you: { counted: false, created: true, canEdit: true, canVerify: false, canPost: false, canVoid: false },
    pending: true,
  };
  await upsertRecords('batches', [sheet as unknown as Record<string, unknown>]);
  await queueChange({ method: 'POST', path: '/giving/batches', body: input, label: `Start counting sheet: ${input.title}`, collection: 'batches', localId: id });
  return id;
}

async function refreshSheet(sheetId: string, patch: Partial<Sheet> = {}) {
  const sheet = await getRecord<Sheet>('batches', sheetId);
  if (!sheet) return;
  const next = { ...sheet, ...patch };
  const t = totals(next, await entriesOf(sheetId));
  await upsertRecords('batches', [{ ...next, entriesTotal: t.entriesTotal, entryCount: t.entryCount, cashTotal: t.counted } as unknown as Record<string, unknown>]);
}

export async function setCashCount(sheet: Sheet, denominations: { value: number; count: number }[]) {
  await refreshSheet(sheet.id, { denominations });
  await queueChange({ method: 'PATCH', path: `/giving/batches/${sheet.id}`, body: { denominations }, label: `Cash count: ${sheet.title}`, collection: 'batches', recordId: sheet.id });
}

export interface EntryInput {
  memberId: string | null;
  giverName?: string;
  giverLabel: string;
  fundId: string;
  fundName: string;
  amount: number;
  method: string;
  reference?: string;
}

export async function addEntry(sheet: Sheet, input: EntryInput) {
  const id = newId();
  const entry: Entry = {
    id,
    batchId: sheet.id,
    memberId: input.memberId,
    giver: input.giverLabel,
    memberNumber: null,
    fundId: input.fundId,
    fund: input.fundName,
    amount: input.amount,
    currency: sheet.currency,
    method: input.method,
    reference: input.reference ?? null,
    status: 'pending',
    receiptNumber: null,
    createdAt: new Date().toISOString(),
    pending: true,
  };
  await upsertRecords('entries', [entry as unknown as Record<string, unknown>]);
  await refreshSheet(sheet.id);
  const body = { memberId: input.memberId, fundId: input.fundId, amount: input.amount, method: input.method, ...(input.giverName ? { giverName: input.giverName } : {}), ...(input.reference ? { reference: input.reference } : {}) };
  await queueChange({ method: 'POST', path: `/giving/batches/${sheet.id}/entries`, body, label: `Entry: ${input.giverLabel}, ${input.fundName}`, collection: 'entries', localId: id });
}

export async function removeEntry(sheet: Sheet, entry: Entry) {
  await removeRecord('entries', entry.id);
  await refreshSheet(sheet.id);
  await queueChange({ method: 'DELETE', path: `/giving/batches/${sheet.id}/entries/${entry.id}`, label: `Remove entry: ${entry.giver}`, collection: 'entries', recordId: entry.id });
}

const NEXT: Record<'submit' | 'verify' | 'post' | 'reopen' | 'void', SheetStatus> = { submit: 'counted', verify: 'verified', post: 'posted', reopen: 'draft', void: 'void' };
const ACTION_LABEL = { submit: 'Submit count', verify: 'Verify', post: 'Post', reopen: 'Reopen', void: 'Void' } as const;

export async function sheetAction(sheet: Sheet, action: keyof typeof NEXT, reason?: string) {
  const you = { ...sheet.you, ...(action === 'submit' ? { counted: true } : {}) };
  await refreshSheet(sheet.id, { status: NEXT[action], you, ...(action === 'void' ? { voidReason: reason ?? null } : {}) });
  await queueChange({ method: 'POST', path: `/giving/batches/${sheet.id}/action`, body: { action, ...(reason ? { reason } : {}) }, label: `${ACTION_LABEL[action]}: ${sheet.title}`, collection: 'batches', recordId: sheet.id });
}

// ---- Expenses ------------------------------------------------------------------------
export interface ExpenseInput {
  nodeId: string;
  title: string;
  category: string;
  description?: string;
  amount: number;
  payee?: string;
  date: string;
  submit: boolean;
}

export async function requestExpense(me: Me | null, input: ExpenseInput, currency: string) {
  const id = newId();
  const row: Expense = {
    id,
    title: input.title,
    category: input.category,
    description: input.description ?? null,
    amount: input.amount,
    currency,
    payee: input.payee ?? null,
    date: input.date,
    status: input.submit ? 'submitted' : 'draft',
    nodeId: input.nodeId,
    nodeName: nodeName(me, input.nodeId),
    requestedBy: me?.user.name ?? '',
    mine: true,
    approvals: [],
    pending: true,
  };
  await upsertRecords('expenses', [row as unknown as Record<string, unknown>]);
  await queueChange({ method: 'POST', path: '/expenses', body: input, label: `Expense: ${input.title}`, collection: 'expenses', localId: id });
  return id;
}

export async function decideExpense(me: Me | null, expense: Expense, approve: boolean, note?: string) {
  const decision = { name: me?.user.name ?? '', decision: approve ? 'approved' : 'rejected', note: note ?? null, at: new Date().toISOString() };
  // Shown as decided straight away; above this person's limit, the server passes it up instead and the next sync says so.
  await upsertRecords('expenses', [{ ...expense, status: approve ? 'approved' : 'rejected', canDecide: false, approvals: [...expense.approvals, decision] } as unknown as Record<string, unknown>]);
  await queueChange({ method: 'POST', path: `/expenses/${expense.id}/decide`, body: { approve, ...(note ? { note } : {}) }, label: `${approve ? 'Approve' : 'Reject'}: ${expense.title}`, collection: 'expenses', recordId: expense.id });
}
