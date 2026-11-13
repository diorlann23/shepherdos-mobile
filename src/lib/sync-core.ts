/**
 * The sync rules, free of any phone APIs so they can be tested on their own.
 *
 * Pull: ask the server for each collection's changes since the saved cursor,
 * page by page, then drop anything the server no longer lists.
 * Push: send queued offline changes in the order they were made. Stop at the
 * first network failure (try again later); park changes the server refuses
 * so one bad change never blocks the rest.
 */

export interface PullPage<R> {
  rows: R[];
  ids?: string[];
  next: { since: string; after: string } | null;
  cursor: string;
}

export interface PullAdapter<R> {
  fetchPage(query: { since?: string; after?: string; ids: boolean }): Promise<PullPage<R>>;
  save(rows: R[]): Promise<void>;
  keepOnly(ids: string[]): Promise<void>;
  setCursor(cursor: string): Promise<void>;
}

/** Pulls one collection to completion. Returns how many records arrived. */
export async function pullCollection<R>(cursor: string | null, adapter: PullAdapter<R>, maxPages = 200): Promise<number> {
  let since = cursor ?? undefined;
  let after: string | undefined;
  let received = 0;
  for (let page = 0; page < maxPages; page++) {
    // The full list of ids comes with the first page: enough to spot deletions.
    const res = await adapter.fetchPage({ since, after, ids: page === 0 });
    await adapter.save(res.rows);
    received += res.rows.length;
    if (res.ids) await adapter.keepOnly(res.ids);
    if (!res.next) {
      await adapter.setCursor(res.cursor);
      return received;
    }
    since = res.next.since;
    after = res.next.after;
  }
  throw new Error('Sync stopped: too many pages. Try again.');
}

export interface QueuedChange {
  seq: number;
  method: string;
  path: string;
  body: unknown;
  localId: string | null;
  attempts: number;
}

export type PushOutcome = 'sent' | 'offline' | 'refused' | 'retry' | 'signed-out';

/** What to do with a queued change after the server answered (or didn't). */
export function classifyPush(error: { offline?: boolean; status?: number } | null): PushOutcome {
  if (!error) return 'sent';
  if (error.offline) return 'offline';
  const s = error.status ?? 0;
  if (s === 401 || s === 402) return 'signed-out';
  // Too many requests or the server stumbled: keep it queued and try again later.
  if (s === 429 || s >= 500) return 'retry';
  // Refused for a reason a retry won't fix (validation, permission, duplicate): park it for the person to see.
  return 'refused';
}

export interface PushAdapter {
  send(change: QueuedChange): Promise<{ result: unknown } | { error: { offline?: boolean; status?: number; message: string } }>;
  done(change: QueuedChange, result: unknown): Promise<void>;
  refused(change: QueuedChange, message: string): Promise<void>;
  retryLater(change: QueuedChange, message: string): Promise<void>;
}

/** Sends queued changes in order. Returns what stopped it, if anything. */
export async function pushQueue(queue: QueuedChange[], adapter: PushAdapter): Promise<{ sent: number; stoppedBy: PushOutcome | null }> {
  let sent = 0;
  for (const change of queue) {
    const res = await adapter.send(change);
    const outcome = classifyPush('error' in res ? res.error : null);
    if (outcome === 'sent') {
      await adapter.done(change, (res as { result: unknown }).result);
      sent++;
    } else if (outcome === 'refused') {
      await adapter.refused(change, (res as { error: { message: string } }).error.message);
    } else {
      if (outcome === 'retry') await adapter.retryLater(change, (res as { error: { message: string } }).error.message);
      return { sent, stoppedBy: outcome };
    }
  }
  return { sent, stoppedBy: null };
}
