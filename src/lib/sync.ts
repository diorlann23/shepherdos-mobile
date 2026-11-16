import { AppState } from 'react-native';
import NetInfo from '@react-native-community/netinfo';
import { SYNC_COLLECTIONS, SYNC_INTERVAL_MS, type CollectionName } from '@/constants';
import { api, ApiError, OfflineError } from './api';
import { getCursor, getDb, keepOnly, removeRecord, setCursor, upsertRecords } from './db';
import { emit, subscribe } from './events';
import { pullCollection, pushQueue, type QueuedChange } from './sync-core';

export type SyncState = 'idle' | 'syncing' | 'offline' | 'error';
export interface SyncStatus {
  state: SyncState;
  lastSyncedAt: string | null;
  pending: number;
  refused: number;
  message: string | null;
}

let status: SyncStatus = { state: 'idle', lastSyncedAt: null, pending: 0, refused: 0, message: null };
let running: Promise<void> | null = null;
let again = false;
/** Only while fully signed in to a church: a sync before the 2FA code is in would be refused. */
let enabled = false;
export function setSyncEnabled(on: boolean) {
  const was = enabled;
  enabled = on;
  // The signed-in screens may have asked for a sync a moment before this was turned on.
  if (on && !was) void syncNow();
}

export const getSyncStatus = () => status;
export const onSyncStatus = (listener: () => void) => subscribe('sync', listener);
function setStatus(patch: Partial<SyncStatus>) {
  status = { ...status, ...patch };
  emit('sync');
}

async function refreshCounts() {
  const row = await getDb().getFirstAsync<{ pending: number; refused: number }>(
    'SELECT SUM(error IS NULL) AS pending, SUM(error IS NOT NULL) AS refused FROM outbox',
  );
  setStatus({ pending: row?.pending ?? 0, refused: row?.refused ?? 0 });
}

// ---- Outbox: changes made offline ------------------------------------------------
export interface QueueInput {
  method: 'POST' | 'PATCH' | 'PUT' | 'DELETE';
  path: string;
  body?: unknown;
  /** Shown in the "waiting to sync" list, e.g. "Add Ama Mensah". */
  label: string;
  collection?: CollectionName;
  /** A record created offline, shown with this id until the server gives it a real one. */
  localId?: string;
}

export async function queueChange(change: QueueInput) {
  await getDb().runAsync(
    'INSERT INTO outbox (method, path, body, collection, local_id, label, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
    change.method,
    change.path,
    change.body === undefined ? null : JSON.stringify(change.body),
    change.collection ?? null,
    change.localId ?? null,
    change.label,
    new Date().toISOString(),
  );
  emit('outbox');
  await refreshCounts();
  void syncNow();
}

export interface OutboxItem {
  seq: number;
  label: string;
  createdAt: string;
  error: string | null;
}
export async function listOutbox(): Promise<OutboxItem[]> {
  return getDb().getAllAsync<OutboxItem>('SELECT seq, label, created_at AS createdAt, error FROM outbox ORDER BY seq');
}
/** The person gave up on a change the server refused. */
export async function discardChange(seq: number) {
  await getDb().runAsync('DELETE FROM outbox WHERE seq = ?', seq);
  emit('outbox');
  await refreshCounts();
}
export async function retryChange(seq: number) {
  await getDb().runAsync('UPDATE outbox SET error = NULL WHERE seq = ?', seq);
  emit('outbox');
  await refreshCounts();
  void syncNow();
}

async function push() {
  const rows = await getDb().getAllAsync<{ seq: number; method: string; path: string; body: string | null; collection: string | null; local_id: string | null; attempts: number }>(
    'SELECT * FROM outbox WHERE error IS NULL ORDER BY seq',
  );
  const collections = new Map(rows.map((r) => [r.seq, r.collection as CollectionName | null]));
  const queue: QueuedChange[] = rows.map((r) => ({ seq: r.seq, method: r.method, path: r.path, body: r.body ? JSON.parse(r.body) : undefined, localId: r.local_id, attempts: r.attempts }));
  const result = await pushQueue(queue, {
    send: async (c) => {
      try {
        // Later changes to a record created offline must point at its real id once it has one.
        return { result: await api(c.path, { method: c.method, body: c.body }) };
      } catch (e) {
        if (e instanceof OfflineError) return { error: { offline: true, message: e.message } };
        if (e instanceof ApiError) return { error: { status: e.status, message: e.message } };
        return { error: { status: 0, message: e instanceof Error ? e.message : 'Unknown error' } };
      }
    },
    done: async (c, result) => {
      await getDb().runAsync('DELETE FROM outbox WHERE seq = ?', c.seq);
      const collection = collections.get(c.seq);
      const real = (result as { id?: string } | null)?.id;
      if (collection && c.localId && real) {
        await removeRecord(collection, c.localId);
        await upsertRecords(collection, [result as Record<string, unknown>]);
        // Repoint queued follow-up changes (an edit made after an offline add).
        await getDb().runAsync('UPDATE outbox SET path = REPLACE(path, ?, ?) WHERE path LIKE ?', c.localId, real, `%${c.localId}%`);
      } else if (collection && real) {
        await upsertRecords(collection, [result as Record<string, unknown>]);
      }
    },
    refused: async (c, message) => {
      await getDb().runAsync('UPDATE outbox SET error = ?, attempts = attempts + 1 WHERE seq = ?', message, c.seq);
    },
    retryLater: async (c) => {
      await getDb().runAsync('UPDATE outbox SET attempts = attempts + 1 WHERE seq = ?', c.seq);
    },
  });
  emit('outbox');
  await refreshCounts();
  return result;
}

async function pull() {
  for (const collection of SYNC_COLLECTIONS) {
    const saved = await getCursor(collection);
    await pullCollection<Record<string, unknown>>(saved?.cursor ?? null, {
      fetchPage: ({ since, after, ids }) => {
        const q = new URLSearchParams();
        if (since) q.set('since', since);
        if (after) q.set('after', after);
        if (ids) q.set('ids', '1');
        return api(`/sync/${collection}?${q}`);
      },
      save: (rows) => upsertRecords(collection, rows),
      keepOnly: (ids) => keepOnly(collection, ids),
      setCursor: (cursor) => setCursor(collection, cursor),
    }).catch((e) => {
      // A feature the church doesn't have, or the person can't see: skip it, keep going.
      if (e instanceof ApiError && e.status === 403) return 0;
      throw e;
    });
  }
}

/** Push queued changes first (so the server has them), then pull what changed. Safe to call any time. */
export function syncNow(): Promise<void> {
  if (!enabled) return Promise.resolve();
  if (running) {
    again = true;
    return running;
  }
  running = (async () => {
    setStatus({ state: 'syncing', message: null });
    try {
      await refreshCounts();
      const pushed = await push();
      if (pushed.stoppedBy === 'offline') throw new OfflineError();
      await pull();
      setStatus({ state: 'idle', lastSyncedAt: new Date().toISOString(), message: null });
    } catch (e) {
      if (e instanceof OfflineError) setStatus({ state: 'offline', message: null });
      else setStatus({ state: 'error', message: e instanceof Error ? e.message : 'Sync failed.' });
    } finally {
      running = null;
      if (again) {
        again = false;
        void syncNow();
      }
    }
  })();
  return running;
}

/** Sync when the app opens, comes back to the front, gets signal back, and every few minutes. */
export function startAutoSync() {
  void refreshCounts();
  void syncNow();
  let wasOffline = false;
  const net = NetInfo.addEventListener((s) => {
    const online = !!s.isConnected && s.isInternetReachable !== false;
    if (online && wasOffline) void syncNow();
    wasOffline = !online;
    if (!online) setStatus({ state: 'offline' });
  });
  const app = AppState.addEventListener('change', (s) => {
    if (s === 'active') void syncNow();
  });
  const timer = setInterval(() => {
    if (AppState.currentState === 'active') void syncNow();
  }, SYNC_INTERVAL_MS);
  return () => {
    net();
    app.remove();
    clearInterval(timer);
  };
}

export async function resetSyncStatus() {
  status = { state: 'idle', lastSyncedAt: null, pending: 0, refused: 0, message: null };
  emit('sync');
}
