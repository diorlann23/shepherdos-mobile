/**
 * Phase 6 on simulated phones against a real ShepherdOS server (sample church):
 * reports run online, kept for offline reading and shared as a real PDF; a
 * branch report finished and submitted offline, then approved by the region.
 */
import { readFileSync } from 'node:fs';
import { phone, setOnline } from './phone';
import type { ReportTemplate, Submission } from '@/lib/reports';

const PASSWORD = process.env.E2E_PASSWORD ?? 'Demo-Church-2026!';

describe('reports on the phone', () => {
  let admin: Awaited<ReturnType<typeof phone>>;
  beforeAll(async () => {
    admin = await phone('admin-r', 'admin@demo.church', PASSWORD);
  });
  afterEach(() => setOnline(true));

  it('runs a report online, keeps it for offline reading, and shares it as a PDF', async () => {
    const { entries, offline } = await admin.reports.loadCatalog();
    expect(offline).toBe(false);
    expect(entries.length).toBeGreaterThan(10);
    const report = entries.find((e) => e.category === 'Attendance') ?? entries[0];
    const run = await admin.reports.runReport(report.key, {});
    expect(run.result.columns.length).toBeGreaterThan(0);

    // No signal: the list of reports and the result are still there; running needs a connection.
    setOnline(false);
    const cached = await admin.reports.loadCatalog();
    expect(cached).toMatchObject({ offline: true });
    expect(cached.entries.map((e) => e.key)).toContain(report.key);
    expect((await admin.reports.savedRuns(report.key))[0].result.title).toBe(run.result.title);
    await expect(admin.reports.runReport(report.key, {})).rejects.toThrow(/offline/i);
    setOnline(true);

    await admin.reports.shareReport(report.key, run.result.title, {}, 'pdf');
    const shared = (globalThis as { __shared?: { uri: string; mimeType?: string }[] }).__shared!.at(-1)!;
    expect(shared.mimeType).toBe('application/pdf');
    expect(readFileSync(shared.uri).subarray(0, 5).toString()).toBe('%PDF-');
  });

  it('finishes a branch report offline, submits it, and the region approves it', async () => {
    const templates = await admin.db.listRecords<ReportTemplate>('reportTemplates', { limit: 50 });
    if (!templates.length) return console.warn('No branch report forms in the sample church: skipped');
    const t = templates.find((x) => x.submitterKinds.includes('branch')) ?? templates[0];
    const kind = t.submitterKinds[0];
    const place = admin.me.nodes.find((n) => n.kind === kind && n.name.includes('Accra')) ?? admin.me.nodes.find((n) => n.kind === kind)!;
    // A period nobody has used yet, so the test always starts a fresh report.
    const year = 2000 + (Date.now() % 20);
    const period = t.frequency === 'monthly' ? `${year}-0${1 + (Date.now() % 9)}` : t.frequency === 'quarterly' ? `${year}-Q${1 + (Date.now() % 4)}` : t.frequency === 'weekly' ? `${year}-W${String(10 + (Date.now() % 40)).padStart(2, '0')}` : String(year);

    const id = await admin.reports.startSubmission(t.id, place.id, period);
    await admin.syncNow();
    let s = (await admin.db.getRecord<Submission>('submissions', id))!;
    expect(s).toMatchObject({ status: 'draft', canEdit: true });

    // Answers filled in and the report submitted, with no signal.
    setOnline(false);
    const answers: Record<string, unknown> = { ...s.data };
    for (const f of t.fields) {
      if (answers[f.name] !== undefined && answers[f.name] !== null && answers[f.name] !== '') continue;
      answers[f.name] = f.type === 'number' || f.type === 'money' ? 12 : f.type === 'boolean' ? true : f.type === 'select' ? f.options?.[0]?.value : f.type === 'date' ? '2026-10-31' : 'Filled in on the phone';
    }
    await admin.reports.saveAnswers(s, answers);
    s = (await admin.db.getRecord<Submission>('submissions', id))!;
    await admin.reports.moveSubmission(admin.me.user.name, s, 'submitted');
    setOnline(true);
    await admin.syncNow();
    const refused = [...(await admin.sync.listOutbox()).filter((o) => o.error)];
    expect(refused, JSON.stringify(refused)).toEqual([]);
    expect((await admin.db.getRecord<Submission>('submissions', id))!.status).toBe('submitted');

    // The regional overseer reviews it from their phone.
    const overseer = await phone('overseer-r', 'overseer@demo.church', PASSWORD);
    const forReview = (await overseer.db.getRecord<Submission>('submissions', id))!;
    expect(forReview, 'the overseer’s phone has the report').toBeTruthy();
    expect(forReview.canReview).toBe(true);
    await overseer.reports.moveSubmission(overseer.me.user.name, forReview, 'approved', 'Well done');
    await overseer.syncNow();
    expect((await overseer.db.getRecord<Submission>('submissions', id))!.status).toBe('approved');
  });
});
