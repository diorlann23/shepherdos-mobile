/**
 * A simulated phone: its own database, keychain and copy of the app's code,
 * signed in to a running ShepherdOS server.
 */
declare const vi: typeof import('vitest').vi;

export const SERVER = process.env.E2E_SERVER ?? 'http://localhost:3100';
export const setOnline = (on: boolean) => void ((globalThis as { __online?: boolean }).__online = on);

export async function phone(name: string, email: string, password: string) {
  (globalThis as { __phone?: string }).__phone = name;
  vi.resetModules();
  const secure = await import('@/lib/secure');
  await secure.loadSecure();
  await secure.setServer(SERVER);
  const db = await import('@/lib/db');
  await db.openDb();
  const { api } = await import('@/lib/api');
  await api('/auth/login', { method: 'POST', body: { email, password } });
  const me = await api<import('@/lib/types').Me>('/auth/me');
  const sync = await import('@/lib/sync');
  sync.setSyncEnabled(true);
  await sync.syncNow();
  const p = {
    name,
    me,
    api,
    db,
    sync,
    attendance: await import('@/lib/attendance'),
    mutations: await import('@/lib/mutations'),
    /** Switches the shared keychain to this phone and syncs (push, then pull). */
    async syncNow() {
      (globalThis as { __phone?: string }).__phone = name;
      await sync.syncNow();
      // The app starts another sync when changes arrived during one: wait until it has all settled.
      for (let i = 0; i < 100 && sync.getSyncStatus().state === 'syncing'; i++) await new Promise((r) => setTimeout(r, 50));
    },
    status: () => sync.getSyncStatus(),
  };
  return p;
}
