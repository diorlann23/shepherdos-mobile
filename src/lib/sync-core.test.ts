import { test } from 'node:test';
import assert from 'node:assert/strict';
import { classifyPush, pullCollection, pushQueue, type PullPage, type QueuedChange } from './sync-core.ts';

test('pulls every page, asks for ids once, then saves the cursor', async () => {
  const pages: PullPage<{ id: string }>[] = [
    { rows: [{ id: 'a' }, { id: 'b' }], ids: ['a', 'b', 'c'], next: { since: 't1', after: 'b' }, cursor: 'x' },
    { rows: [{ id: 'c' }], next: null, cursor: 't0' },
  ];
  const asked: { since?: string; after?: string; ids: boolean }[] = [];
  const saved: string[] = [];
  let kept: string[] = [];
  let cursor = '';
  const n = await pullCollection('start', {
    fetchPage: async (q) => {
      asked.push(q);
      return pages[asked.length - 1];
    },
    save: async (rows) => void saved.push(...rows.map((r) => r.id)),
    keepOnly: async (ids) => void (kept = ids),
    setCursor: async (c) => void (cursor = c),
  });
  assert.equal(n, 3);
  assert.deepEqual(saved, ['a', 'b', 'c']);
  assert.deepEqual(kept, ['a', 'b', 'c']);
  assert.deepEqual(asked, [
    { since: 'start', after: undefined, ids: true },
    { since: 't1', after: 'b', ids: false },
  ]);
  assert.equal(cursor, 't0');
});

test('a failed page leaves the old cursor, so nothing is skipped', async () => {
  let cursor = 'old';
  await assert.rejects(
    pullCollection('old', {
      fetchPage: async () => {
        throw new Error('offline');
      },
      save: async () => {},
      keepOnly: async () => {},
      setCursor: async (c) => void (cursor = c),
    }),
  );
  assert.equal(cursor, 'old');
});

test('classifies server answers for queued changes', () => {
  assert.equal(classifyPush(null), 'sent');
  assert.equal(classifyPush({ offline: true }), 'offline');
  assert.equal(classifyPush({ status: 401 }), 'signed-out');
  assert.equal(classifyPush({ status: 402 }), 'signed-out');
  assert.equal(classifyPush({ status: 429 }), 'retry');
  assert.equal(classifyPush({ status: 503 }), 'retry');
  assert.equal(classifyPush({ status: 422 }), 'refused');
  assert.equal(classifyPush({ status: 403 }), 'refused');
});

test('sends in order, parks refused changes and stops when offline', async () => {
  const change = (seq: number): QueuedChange => ({ seq, method: 'POST', path: '/x', body: {}, localId: null, attempts: 0 });
  const log: string[] = [];
  const answers: Record<number, { result: unknown } | { error: { offline?: boolean; status?: number; code?: string; message: string } }> = {
    1: { result: { id: 'm1' } },
    2: { error: { status: 409, code: 'CONFLICT', message: 'May already be in the register' } },
    3: { error: { offline: true, message: 'offline' } },
    4: { result: {} },
  };
  const out = await pushQueue([1, 2, 3, 4].map(change), {
    send: async (c) => answers[c.seq],
    done: async (c) => void log.push(`done ${c.seq}`),
    refused: async (c, m, code) => void log.push(`refused ${c.seq}: ${code} ${m}`),
    retryLater: async (c) => void log.push(`retry ${c.seq}`),
  });
  assert.deepEqual(log, ['done 1', 'refused 2: CONFLICT May already be in the register']);
  assert.deepEqual(out, { sent: 1, stoppedBy: 'offline' });
});
