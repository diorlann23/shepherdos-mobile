/**
 * The phone database's tables and the trickier statements, kept free of phone
 * APIs so they can be tested against real SQLite.
 */
export const MIGRATIONS = [
  `CREATE TABLE IF NOT EXISTS records (
     collection TEXT NOT NULL,
     id TEXT NOT NULL,
     data TEXT NOT NULL,
     search TEXT NOT NULL DEFAULT '',
     sort TEXT NOT NULL DEFAULT '',
     status TEXT,
     updated_at TEXT,
     PRIMARY KEY (collection, id)
   );
   CREATE INDEX IF NOT EXISTS records_sort ON records (collection, sort);
   CREATE TABLE IF NOT EXISTS sync_state (collection TEXT PRIMARY KEY, cursor TEXT, synced_at TEXT);
   CREATE TABLE IF NOT EXISTS outbox (
     seq INTEGER PRIMARY KEY AUTOINCREMENT,
     method TEXT NOT NULL,
     path TEXT NOT NULL,
     body TEXT,
     collection TEXT,
     local_id TEXT,
     label TEXT NOT NULL,
     created_at TEXT NOT NULL,
     attempts INTEGER NOT NULL DEFAULT 0,
     error TEXT
   );
   CREATE TABLE IF NOT EXISTS kv (key TEXT PRIMARY KEY, value TEXT NOT NULL);`,
  // 2: why a change was refused (e.g. CONFLICT for a possible duplicate), and which record it changes.
  `ALTER TABLE outbox ADD COLUMN error_code TEXT;
   ALTER TABLE outbox ADD COLUMN record_id TEXT;
   CREATE INDEX IF NOT EXISTS outbox_record ON outbox (collection, record_id);`,
  // 3: check-ins taken on this phone, sent in batches (a busy Sunday is hundreds of them).
  `CREATE TABLE IF NOT EXISTS marks (
     client_id TEXT PRIMARY KEY,
     session_id TEXT NOT NULL,
     member_id TEXT NOT NULL,
     method TEXT NOT NULL,
     marked_at TEXT NOT NULL,
     error TEXT
   );
   CREATE INDEX IF NOT EXISTS records_status ON records (collection, status);`,
];

/** Once the server's own copy of a check-in has arrived, the phone's placeholder for it goes. */
export const DROP_SYNCED_PLACEHOLDERS = `DELETE FROM records WHERE collection = 'checkins' AND id LIKE 'local_%' AND EXISTS (
  SELECT 1 FROM records s WHERE s.collection = 'checkins' AND s.id NOT LIKE 'local_%' AND s.status = records.status
    AND json_extract(s.data, '$.memberId') = json_extract(records.data, '$.memberId'))`;

/** Check-ins ready to send: not refused, and not pointing at a service or person the server doesn't know yet. */
export const SENDABLE_MARKS = "SELECT * FROM marks WHERE error IS NULL AND session_id NOT LIKE 'local_%' AND member_id NOT LIKE 'local_%' ORDER BY marked_at LIMIT ?";

/**
 * A record made on the phone has its server id: each statement takes
 * (localId, realId) and points everything at the real id.
 */
export const REPOINT: { sql: string; args: (localId: string, real: string) => string[] }[] = [
  {
    sql: 'UPDATE outbox SET path = REPLACE(path, ?, ?), body = REPLACE(body, ?, ?), record_id = REPLACE(record_id, ?, ?) WHERE path LIKE ? OR body LIKE ? OR record_id LIKE ?',
    args: (l, r) => [l, r, l, r, l, r, `%${l}%`, `%${l}%`, `%${l}%`],
  },
  {
    sql: 'UPDATE marks SET session_id = REPLACE(session_id, ?, ?), member_id = REPLACE(member_id, ?, ?) WHERE session_id = ? OR member_id = ?',
    args: (l, r) => [l, r, l, r, l, l],
  },
  { sql: 'UPDATE OR REPLACE records SET id = ? WHERE id = ?', args: (l, r) => [r, l] },
  // References inside records (a check-in's memberId, a member's householdId) and the
  // status column, which holds the service id for check-ins and the household for the roster.
  { sql: 'UPDATE records SET data = REPLACE(data, ?, ?), status = REPLACE(status, ?, ?) WHERE data LIKE ? OR status = ?', args: (l, r) => [l, r, l, r, `%${l}%`, l] },
];
