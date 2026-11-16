/**
 * Stand-ins for the phone-only parts, so the app's own code runs in Node:
 * - expo-sqlite → real SQLite (node:sqlite), one database per simulated phone
 * - the keychain → memory
 * - the network → real fetch that can be switched off (airplane mode)
 */
import { DatabaseSync } from 'node:sqlite';

declare const vi: typeof import('vitest').vi;

type Args = unknown[];
const flat = (args: Args) => (args.length === 1 && Array.isArray(args[0]) ? (args[0] as unknown[]) : args).map((a) => (a === undefined ? null : typeof a === 'boolean' ? Number(a) : a));

function wrap(d: DatabaseSync) {
  let depth = 0;
  const tx = async <T>(fn: (t: unknown) => Promise<T>) => {
    // Nested transactions become savepoints, like SQLite on the phone.
    const name = `sp${depth++}`;
    d.exec(`SAVEPOINT ${name}`);
    try {
      const out = await fn(db);
      d.exec(`RELEASE ${name}`);
      return out;
    } catch (e) {
      d.exec(`ROLLBACK TO ${name}`);
      d.exec(`RELEASE ${name}`);
      throw e;
    } finally {
      depth--;
    }
  };
  const db = {
    execAsync: async (sql: string) => void d.exec(sql),
    getFirstAsync: async (sql: string, ...args: Args) => d.prepare(sql).get(...(flat(args) as never[])) ?? null,
    getAllAsync: async (sql: string, ...args: Args) => d.prepare(sql).all(...(flat(args) as never[])),
    runAsync: async (sql: string, ...args: Args) => {
      const r = d.prepare(sql).run(...(flat(args) as never[]));
      return { changes: Number(r.changes), lastInsertRowId: Number(r.lastInsertRowid) };
    },
    withTransactionAsync: (fn: () => Promise<void>) => tx(fn),
    withExclusiveTransactionAsync: (fn: (t: unknown) => Promise<void>) => tx(fn),
    prepareAsync: async (sql: string) => {
      const st = d.prepare(sql);
      return { executeAsync: async (...args: Args) => st.run(...(flat(args) as never[])), finalizeAsync: async () => {} };
    },
  };
  return db;
}

vi.mock('expo-sqlite', () => ({ openDatabaseAsync: async () => wrap(new DatabaseSync(':memory:')) }));

vi.mock('expo-secure-store', () => {
  const store = new Map<string, string>();
  return {
    getItemAsync: async (k: string) => store.get(`${(globalThis as { __phone?: string }).__phone}:${k}`) ?? null,
    setItemAsync: async (k: string, v: string) => void store.set(`${(globalThis as { __phone?: string }).__phone}:${k}`, v),
    deleteItemAsync: async (k: string) => void store.delete(`${(globalThis as { __phone?: string }).__phone}:${k}`),
  };
});

vi.mock('react-native', () => ({ AppState: { currentState: 'background', addEventListener: () => ({ remove() {} }) }, Platform: { OS: 'ios' } }));
vi.mock('@react-native-community/netinfo', () => ({ default: { addEventListener: () => () => {} } }));
vi.mock('expo-crypto', () => ({ randomUUID: () => crypto.randomUUID() }));
vi.mock('expo-constants', () => ({ default: { expoConfig: { version: 'test', extra: { defaultServer: process.env.E2E_SERVER ?? 'http://localhost:3100' } } } }));

// Airplane mode: every request fails the way it does on a phone with no signal.
const realFetch = globalThis.fetch;
(globalThis as { __online?: boolean }).__online = true;
globalThis.fetch = ((...args: Parameters<typeof fetch>) =>
  (globalThis as { __online?: boolean }).__online ? realFetch(...args) : Promise.reject(new TypeError('Network request failed'))) as typeof fetch;
