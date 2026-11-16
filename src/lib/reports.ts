import { File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import { api, ApiError, OfflineError } from './api';
import { getToken, getServer } from './secure';
import { kvGet, kvSet, upsertRecords } from './db';
import { emit } from './events';
import { queueChange } from './sync';

/**
 * Reports. The built-in ones are worked out on the server from the whole
 * church's records, so running one needs a connection; the last results of
 * each are kept so they can be read offline. Branch reports (filled in by a
 * level and sent up for review) work offline once started.
 */

// ---- Built-in reports ----------------------------------------------------------------------
export type FieldType = 'text' | 'textarea' | 'email' | 'phone' | 'url' | 'number' | 'money' | 'date' | 'datetime' | 'select' | 'multiselect' | 'boolean' | 'tags' | 'member' | 'node' | 'ref';
export interface FieldDef {
  name: string;
  label: string;
  type: FieldType;
  required?: boolean;
  help?: string;
  placeholder?: string;
  options?: { value: string; label: string }[];
  min?: number;
  max?: number;
  nodeKinds?: string[];
  defaultValue?: unknown;
}
export interface CatalogEntry {
  key: string;
  title: string;
  description: string;
  category: string;
  filters: FieldDef[];
}
export interface ReportColumn {
  key: string;
  label: string;
  type?: 'text' | 'number' | 'money' | 'date' | 'percent';
}
export interface ReportResult {
  title: string;
  columns: ReportColumn[];
  rows: Record<string, unknown>[];
  chart?: { type: 'trend' | 'column' | 'bar' | 'stacked'; x: string; series: { key: string; label: string }[]; format?: 'number' | 'money' | 'percent' };
  summary?: { label: string; value: number | string; format?: 'number' | 'money' | 'percent' }[];
  currency?: string;
  note?: string;
  period?: { from: string; to: string };
  filters: Record<string, unknown>;
}
export interface SavedRun {
  key: string;
  ranAt: string;
  filters: Record<string, unknown>;
  result: ReportResult;
}

const CATALOG = 'reports-catalog';
const RUNS = 'reports-runs';
const MAX_RUNS = 30;

/** The reports this person may run: from the server when online, the last list otherwise. */
export async function loadCatalog(): Promise<{ entries: CatalogEntry[]; offline: boolean }> {
  try {
    const entries = await api<CatalogEntry[]>('/reports');
    await kvSet(CATALOG, entries);
    return { entries, offline: false };
  } catch (e) {
    if (!(e instanceof OfflineError)) throw e;
    return { entries: (await kvGet<CatalogEntry[]>(CATALOG)) ?? [], offline: true };
  }
}

export async function savedRuns(key?: string): Promise<SavedRun[]> {
  const all = (await kvGet<SavedRun[]>(RUNS)) ?? [];
  return key ? all.filter((r) => r.key === key) : all;
}

/** Runs a report on the server and keeps the result on the phone for reading offline. */
export async function runReport(key: string, filters: Record<string, unknown>): Promise<SavedRun> {
  const result = await api<ReportResult>(`/reports/${key}`, { method: 'POST', body: { filters } });
  const run: SavedRun = { key, ranAt: new Date().toISOString(), filters, result };
  const runs = (await savedRuns()).filter((r) => !(r.key === key && JSON.stringify(r.filters) === JSON.stringify(filters)));
  await kvSet(RUNS, [run, ...runs].slice(0, MAX_RUNS));
  emit('reports');
  return run;
}

export async function forgetRun(run: SavedRun) {
  await kvSet(
    RUNS,
    (await savedRuns()).filter((r) => r !== run && !(r.key === run.key && r.ranAt === run.ranAt)),
  );
  emit('reports');
}

const MIME = { pdf: 'application/pdf', xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', csv: 'text/csv' } as const;

/**
 * Exports a report as PDF, Excel or CSV (made by the server, with the church's
 * letterhead on PDFs), saves it in the phone's cache and opens the share sheet.
 */
export async function shareReport(key: string, title: string, filters: Record<string, unknown>, format: keyof typeof MIME) {
  let res: Response;
  try {
    res = await fetch(`${getServer()}/api/v1/reports/${key}/export`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-shepherdos-client': 'mobile', authorization: `Session ${getToken() ?? ''}` },
      body: JSON.stringify({ filters, format }),
      credentials: 'omit',
    });
  } catch {
    throw new OfflineError();
  }
  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as { error?: { code: string; message: string } } | null;
    throw new ApiError(res.status, body?.error?.code ?? 'ERROR', body?.error?.message ?? 'The report couldn’t be exported.');
  }
  const safe = title.replace(/[^\w\- ]+/g, '').trim().replace(/\s+/g, '-').slice(0, 60) || 'report';
  const file = new File(Paths.cache, `${safe}-${new Date().toISOString().slice(0, 10)}.${format}`);
  if (file.exists) file.delete();
  file.create();
  await file.write(new Uint8Array(await res.arrayBuffer()));
  if (!(await Sharing.isAvailableAsync())) throw new Error('Sharing isn’t available on this phone.');
  await Sharing.shareAsync(file.uri, { mimeType: MIME[format], dialogTitle: title });
}

// ---- Branch reports ---------------------------------------------------------------------------
export interface ReportTemplate {
  id: string;
  name: string;
  description: string | null;
  frequency: 'weekly' | 'monthly' | 'quarterly' | 'annually';
  submitterKinds: string[];
  dueDays: number;
  fields: FieldDef[];
  currentPeriod: string;
}
export type SubmissionStatus = 'draft' | 'submitted' | 'reviewed' | 'approved' | 'returned';
export interface Submission {
  id: string;
  templateId: string;
  template: string;
  nodeId: string;
  nodeName: string;
  period: string;
  status: SubmissionStatus;
  data: Record<string, unknown>;
  history: { at: string; byName: string; to: string; note: string | null }[];
  submittedAt: string | null;
  canEdit: boolean;
  canReview: boolean;
  pending?: boolean;
}
export const SUBMISSION_STATUS: Record<SubmissionStatus, string> = { draft: 'Draft', submitted: 'Submitted', reviewed: 'Reviewed', approved: 'Approved', returned: 'Returned for changes' };

/** "2026-10" → "October 2026", "2026-Q4" → "Oct–Dec 2026", "2026-W45" → "Week 45, 2026". */
export function periodLabel(period: string) {
  let m = /^(\d{4})-(\d{2})$/.exec(period);
  if (m) return new Date(+m[1], +m[2] - 1, 1).toLocaleDateString(undefined, { month: 'long', year: 'numeric' });
  m = /^(\d{4})-Q([1-4])$/.exec(period);
  if (m) return `${['Jan–Mar', 'Apr–Jun', 'Jul–Sep', 'Oct–Dec'][+m[2] - 1]} ${m[1]}`;
  m = /^(\d{4})-W(\d{2})$/.exec(period);
  if (m) return `Week ${+m[2]}, ${m[1]}`;
  return period;
}

/**
 * Starting a report needs a connection: the server fills it in from the
 * church's live figures (attendance, giving…) for the period.
 */
export async function startSubmission(templateId: string, nodeId: string, period: string): Promise<string> {
  const res = await api<{ id: string; existing?: boolean }>('/report-submissions', { method: 'POST', body: { templateId, nodeId, period } });
  return res.id;
}

/** Saves answers (offline is fine): only drafts and returned reports can be changed. */
export async function saveAnswers(s: Submission, data: Record<string, unknown>) {
  await upsertRecords('submissions', [{ ...s, data } as unknown as Record<string, unknown>]);
  await queueChange({ method: 'PATCH', path: `/report-submissions/${s.id}`, body: { data }, label: `Answers: ${s.template}, ${periodLabel(s.period)}`, collection: 'submissions', recordId: s.id });
}

export async function moveSubmission(meName: string, s: Submission, to: 'submitted' | 'reviewed' | 'approved' | 'returned', note?: string) {
  const history = [...s.history, { at: new Date().toISOString(), byName: meName, to, note: note ?? null }];
  await upsertRecords('submissions', [{ ...s, status: to, history, canEdit: false, canReview: false } as unknown as Record<string, unknown>]);
  const label = { submitted: 'Submit', reviewed: 'Mark reviewed', approved: 'Approve', returned: 'Return' }[to];
  await queueChange({ method: 'POST', path: `/report-submissions/${s.id}/transition`, body: { to, ...(note ? { note } : {}) }, label: `${label}: ${s.template}, ${periodLabel(s.period)}`, collection: 'submissions', recordId: s.id });
}
