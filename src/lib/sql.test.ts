import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { DROP_SYNCED_PLACEHOLDERS, MIGRATIONS, REPOINT, SENDABLE_MARKS } from './sql.ts';

/** The phone's database, built by the same migrations, in memory. */
function phoneDb() {
  const db = new DatabaseSync(':memory:');
  for (const m of MIGRATIONS) db.exec(m);
  return db;
}
const put = (db: DatabaseSync, collection: string, id: string, data: object, status: string | null = null) =>
  db.prepare('INSERT INTO records (collection, id, data, status) VALUES (?, ?, ?, ?)').run(collection, id, JSON.stringify({ id, ...data }), status);
const ids = (db: DatabaseSync, collection: string) => (db.prepare('SELECT id FROM records WHERE collection = ? ORDER BY id').all(collection) as { id: string }[]).map((r) => r.id);

test('a service started offline keeps its check-ins once it gets its real id', () => {
  const db = phoneDb();
  put(db, 'services', 'local_svc', { title: 'Sunday Service' }, 'open');
  put(db, 'checkins', 'local_c1', { sessionId: 'local_svc', memberId: 'm1' }, 'local_svc');
  db.prepare('INSERT INTO marks (client_id, session_id, member_id, method, marked_at) VALUES (?, ?, ?, ?, ?)').run('local_c1', 'local_svc', 'm1', 'assisted', '2026-11-16T09:00:00Z');
  db.prepare("INSERT INTO outbox (method, path, body, label, created_at, record_id, collection) VALUES ('PATCH', '/attendance/sessions/local_svc', '{}', 'Headcount', 'now', 'local_svc', 'services')").run();

  // Not sendable while the service only exists on the phone.
  assert.equal(db.prepare(SENDABLE_MARKS).all(500).length, 0);

  for (const step of REPOINT) db.prepare(step.sql).run(...step.args('local_svc', '65a1b2c3d4e5f6a7b8c9d0e1'));

  assert.deepEqual(ids(db, 'services'), ['65a1b2c3d4e5f6a7b8c9d0e1']);
  const checkin = db.prepare("SELECT status, data FROM records WHERE collection = 'checkins'").get() as { status: string; data: string };
  assert.equal(checkin.status, '65a1b2c3d4e5f6a7b8c9d0e1', 'still listed under the service');
  assert.equal(JSON.parse(checkin.data).sessionId, '65a1b2c3d4e5f6a7b8c9d0e1');
  assert.equal((db.prepare('SELECT path FROM outbox').get() as { path: string }).path, '/attendance/sessions/65a1b2c3d4e5f6a7b8c9d0e1');
  // Now it can be sent.
  assert.equal(db.prepare(SENDABLE_MARKS).all(500).length, 1);
});

test('a first-timer added at the door keeps their check-in and household links', () => {
  const db = phoneDb();
  put(db, 'roster', 'local_p', { name: 'Kofi Boateng' });
  put(db, 'members', 'local_p', { fullName: 'Kofi Boateng' });
  put(db, 'checkins', 'local_c', { sessionId: 's1', memberId: 'local_p' }, 's1');
  for (const step of REPOINT) db.prepare(step.sql).run(...step.args('local_p', 'realP'));
  assert.deepEqual(ids(db, 'roster'), ['realP']);
  assert.deepEqual(ids(db, 'members'), ['realP'], 'copies in every collection follow');
  assert.equal(JSON.parse((db.prepare("SELECT data FROM records WHERE collection = 'checkins'").get() as { data: string }).data).memberId, 'realP');
});

test('if the server copy already arrived, the real id wins without an error', () => {
  const db = phoneDb();
  put(db, 'roster', 'local_p', { name: 'From the phone' });
  put(db, 'roster', 'realP', { name: 'From the server' });
  for (const step of REPOINT) db.prepare(step.sql).run(...step.args('local_p', 'realP'));
  assert.deepEqual(ids(db, 'roster'), ['realP']);
});

test("a phone's placeholder check-in goes once the server's copy is here, and only then", () => {
  const db = phoneDb();
  put(db, 'checkins', 'local_a', { sessionId: 's1', memberId: 'm1' }, 's1');
  put(db, 'checkins', 'local_b', { sessionId: 's1', memberId: 'm2' }, 's1');
  put(db, 'checkins', 'server1', { sessionId: 's1', memberId: 'm1' }, 's1');
  // The same person at another service doesn't count.
  put(db, 'checkins', 'server2', { sessionId: 's2', memberId: 'm2' }, 's2');
  db.exec(DROP_SYNCED_PLACEHOLDERS);
  assert.deepEqual(ids(db, 'checkins'), ['local_b', 'server1', 'server2']);
});
