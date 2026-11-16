import * as SQLite from 'expo-sqlite';
import type { CollectionName } from '@/constants';
import { emit } from './events';

/**
 * The church's data on this phone. Each synced record is kept as JSON with a
 * few columns for searching and sorting; changes made offline wait in the
 * outbox until they reach the server.
 */
let db: SQLite.SQLiteDatabase | null = null;

import { MIGRATIONS } from './sql';

export async function openDb() {
  if (db) return db;
  db = await SQLite.openDatabaseAsync('shepherdos.db');
  await db.execAsync('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;');
  const row = await db.getFirstAsync<{ user_version: number }>('PRAGMA user_version');
  for (let v = row?.user_version ?? 0; v < MIGRATIONS.length; v++) {
    await db.execAsync(MIGRATIONS[v]);
    await db.execAsync(`PRAGMA user_version = ${v + 1}`);
  }
  return db;
}

export function getDb() {
  if (!db) throw new Error('Database not opened yet.');
  return db;
}

/** Wipes everything from the last church: used on sign-out and when switching church. */
export async function clearChurchData() {
  await getDb().execAsync('DELETE FROM records; DELETE FROM sync_state; DELETE FROM outbox; DELETE FROM kv;');
  emit('records');
  emit('outbox');
}

// ---- Key/value (the cached profile, settings) ------------------------------
export async function kvGet<T>(key: string): Promise<T | null> {
  const row = await getDb().getFirstAsync<{ value: string }>('SELECT value FROM kv WHERE key = ?', key);
  return row ? (JSON.parse(row.value) as T) : null;
}
export async function kvSet(key: string, value: unknown) {
  await getDb().runAsync('INSERT INTO kv (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value', key, JSON.stringify(value));
}

// ---- Records -----------------------------------------------------------------
export interface Indexed {
  search: string;
  sort: string;
  status?: string | null;
}
type Indexer = (row: Record<string, unknown>) => Indexed;

const str = (v: unknown) => (typeof v === 'string' ? v : '');
/** A sort key that puts later dates first. */
const newestFirst = (date: unknown) => String(9_999_999_999_999 - new Date(str(date) || 0).getTime()).padStart(13, '0');
/** What each collection is searched and sorted by. */
export const INDEXERS: Record<CollectionName, Indexer> = {
  members: (m) => ({
    search: [m.fullName, m.memberNumber, m.phone, m.email, m.area, m.branchName].map(str).join(' ').toLowerCase(),
    sort: `${str(m.lastName)} ${str(m.firstName)}`.toLowerCase(),
    status: str(m.status) || null,
  }),
  households: (h) => ({
    search: [h.name, h.headName, h.phone, h.address, h.branch].map(str).join(' ').toLowerCase(),
    sort: str(h.name).toLowerCase(),
  }),
  // Newest first: the sort key counts down as dates go up.
  services: (s) => ({
    search: [s.title, s.nodeName].map(str).join(' ').toLowerCase(),
    sort: String(9_999_999_999_999 - new Date(str(s.date)).getTime()).padStart(13, '0'),
    status: str(s.status) || null,
  }),
  // Grouped by service (status holds the service id), newest first.
  checkins: (c) => ({
    search: '',
    sort: String(9_999_999_999_999 - new Date(str(c.markedAt)).getTime()).padStart(13, '0'),
    status: str(c.sessionId) || null,
  }),
  roster: (r) => ({
    search: [r.name, r.memberNumber, r.phoneTail].map(str).join(' ').toLowerCase(),
    sort: str(r.name).toLowerCase(),
    status: str(r.householdId) || null,
  }),
  serviceTypes: (t) => ({ search: str(t.name).toLowerCase(), sort: str(t.name).toLowerCase(), status: t.isActive === false ? 'inactive' : 'active' }),
  funds: (f) => ({ search: str(f.name).toLowerCase(), sort: str(f.name).toLowerCase(), status: f.isActive === false ? 'inactive' : 'active' }),
  // Newest first, like services.
  batches: (b) => ({ search: [b.title, b.nodeName].map(str).join(' ').toLowerCase(), sort: newestFirst(b.date), status: str(b.status) || null }),
  // Grouped by counting sheet (status holds the sheet id), in the order they were entered.
  entries: (e) => ({ search: [e.giver, e.fund, e.reference].map(str).join(' ').toLowerCase(), sort: str(e.createdAt) || str(e.updatedAt), status: str(e.batchId) || null }),
  expenses: (e) => ({ search: [e.title, e.payee, e.category, e.nodeName, e.requestedBy].map(str).join(' ').toLowerCase(), sort: newestFirst(e.date), status: str(e.status) || null }),
  budgets: (b) => ({ search: [b.name, b.nodeName].map(str).join(' ').toLowerCase(), sort: newestFirst(b.startDate), status: str(b.status) || null }),
};

export async function upsertRecords(collection: CollectionName, rows: Record<string, unknown>[]) {
  if (!rows.length) return;
  const d = getDb();
  await d.withExclusiveTransactionAsync(async (tx) => {
    const stmt = await tx.prepareAsync(
      `INSERT INTO records (collection, id, data, search, sort, status, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(collection, id) DO UPDATE SET data = excluded.data, search = excluded.search, sort = excluded.sort, status = excluded.status, updated_at = excluded.updated_at`,
    );
    try {
      for (const row of rows) {
        const ix = INDEXERS[collection](row);
        await stmt.executeAsync(collection, String(row.id), JSON.stringify(row), ix.search, ix.sort, ix.status ?? null, str(row.updatedAt) || null);
      }
    } finally {
      await stmt.finalizeAsync();
    }
  });
  emit(`records:${collection}`);
}

/** Removes records the server no longer lets this person see (deleted, moved branch, role changed). Local drafts stay. */
export async function keepOnly(collection: CollectionName, ids: string[]) {
  const d = getDb();
  const keep = new Set(ids);
  const local = await d.getAllAsync<{ id: string }>('SELECT id FROM records WHERE collection = ?', collection);
  const gone = local.map((r) => r.id).filter((id) => !keep.has(id) && !id.startsWith('local_'));
  if (!gone.length) return;
  await d.withExclusiveTransactionAsync(async (tx) => {
    for (const id of gone) await tx.runAsync('DELETE FROM records WHERE collection = ? AND id = ?', collection, id);
  });
  emit(`records:${collection}`);
}

export async function removeRecord(collection: CollectionName, id: string) {
  await getDb().runAsync('DELETE FROM records WHERE collection = ? AND id = ?', collection, id);
  emit(`records:${collection}`);
}

export async function getRecord<T>(collection: CollectionName, id: string): Promise<T | null> {
  const row = await getDb().getFirstAsync<{ data: string }>('SELECT data FROM records WHERE collection = ? AND id = ?', collection, id);
  return row ? (JSON.parse(row.data) as T) : null;
}

export interface ListQuery {
  q?: string;
  status?: string | null;
  limit?: number;
  offset?: number;
}

export async function listRecords<T>(collection: CollectionName, query: ListQuery = {}): Promise<T[]> {
  const where = ['collection = ?'];
  const args: (string | number)[] = [collection];
  for (const token of (query.q ?? '').toLowerCase().split(/\s+/).filter(Boolean).slice(0, 5)) {
    where.push(`search LIKE ? ESCAPE '\\'`);
    args.push(`%${token.replace(/[\\%_]/g, (c) => `\\${c}`)}%`);
  }
  if (query.status) {
    where.push('status = ?');
    args.push(query.status);
  }
  args.push(query.limit ?? 50, query.offset ?? 0);
  const rows = await getDb().getAllAsync<{ data: string }>(`SELECT data FROM records WHERE ${where.join(' AND ')} ORDER BY sort LIMIT ? OFFSET ?`, ...args);
  return rows.map((r) => JSON.parse(r.data) as T);
}

/** Members of one household, head first. */
/** Records of one collection with this status column value (service id for check-ins, household for the roster). */
export async function recordsWithStatus<T>(collection: CollectionName, status: string): Promise<T[]> {
  const rows = await getDb().getAllAsync<{ data: string }>('SELECT data FROM records WHERE collection = ? AND status = ? ORDER BY sort', collection, status);
  return rows.map((r) => JSON.parse(r.data) as T);
}

export async function membersOfHousehold<T>(householdId: string): Promise<T[]> {
  const rows = await getDb().getAllAsync<{ data: string }>(
    `SELECT data FROM records WHERE collection = 'members' AND json_extract(data, '$.householdId') = ?
     ORDER BY CASE json_extract(data, '$.householdRole') WHEN 'head' THEN 0 WHEN 'spouse' THEN 1 WHEN 'child' THEN 2 ELSE 3 END, sort`,
    householdId,
  );
  return rows.map((r) => JSON.parse(r.data) as T);
}

export async function countRecords(collection: CollectionName, status?: string): Promise<number> {
  const row = status
    ? await getDb().getFirstAsync<{ n: number }>('SELECT COUNT(*) AS n FROM records WHERE collection = ? AND status = ?', collection, status)
    : await getDb().getFirstAsync<{ n: number }>('SELECT COUNT(*) AS n FROM records WHERE collection = ?', collection);
  return row?.n ?? 0;
}

export async function countByStatus(collection: CollectionName): Promise<Record<string, number>> {
  const rows = await getDb().getAllAsync<{ status: string | null; n: number }>(
    'SELECT status, COUNT(*) AS n FROM records WHERE collection = ? GROUP BY status',
    collection,
  );
  return Object.fromEntries(rows.filter((r) => r.status).map((r) => [r.status!, r.n]));
}

// ---- Sync cursors ------------------------------------------------------------
export async function getCursor(collection: CollectionName) {
  return getDb().getFirstAsync<{ cursor: string | null; synced_at: string | null }>('SELECT cursor, synced_at FROM sync_state WHERE collection = ?', collection);
}
export async function setCursor(collection: CollectionName, cursor: string) {
  await getDb().runAsync(
    `INSERT INTO sync_state (collection, cursor, synced_at) VALUES (?, ?, ?)
     ON CONFLICT(collection) DO UPDATE SET cursor = excluded.cursor, synced_at = excluded.synced_at`,
    collection,
    cursor,
    new Date().toISOString(),
  );
}
