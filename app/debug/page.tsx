import { PageFrame } from '@/components/page-frame';
import { DebugBundleButton } from '@/components/debug-bundle-button';
import { dataDir, dbPath, getDb, initializeDatabase } from '@/lib/db/client';
import { cn } from '@/lib/utils';

export const dynamic = 'force-dynamic';

type SyncRun = {
  id: number;
  provider: string;
  started_at: string;
  finished_at: string | null;
  status: string;
  auth_status: string | null;
  entities_seen: number | null;
  entities_updated: number | null;
  errors_json: string | null;
  warnings_json: string | null;
  progress_label: string | null;
};

const ENTITY_LABEL: Record<string, string> = {
  courses: 'Courses',
  assignments: 'Assignments',
  modules: 'Modules',
  announcements: 'Announcements',
  pages: 'Pages',
  files: 'Files',
  search: 'Search documents',
};

const listLength = (value: string | null) => {
  try {
    const parsed: unknown = value ? JSON.parse(value) : [];
    return Array.isArray(parsed) ? parsed.length : 0;
  } catch {
    return 0;
  }
};

export default function DebugPage() {
  initializeDatabase();
  const { sqlite } = getDb();
  const counts = sqlite
    .prepare(
      `SELECT 'courses' AS entity,count(*) AS count FROM courses UNION ALL SELECT 'assignments',count(*) FROM assignments UNION ALL SELECT 'modules',count(*) FROM modules UNION ALL SELECT 'announcements',count(*) FROM announcements UNION ALL SELECT 'pages',count(*) FROM pages UNION ALL SELECT 'files',count(*) FROM course_files UNION ALL SELECT 'search',count(*) FROM search_documents`,
    )
    .all() as Array<{ entity: string; count: number }>;
  const runs = sqlite
    .prepare(`SELECT * FROM sync_runs ORDER BY id DESC LIMIT 10`)
    .all() as SyncRun[];
  return (
    <PageFrame title="Developer debug" eyebrow="Local-only diagnostics">
      <div className="grid gap-x-14 gap-y-12 lg:grid-cols-2">
        <section aria-labelledby="database-title">
          <h2 id="database-title" className="section-label mb-3">
            Database
          </h2>
          <p className="mb-4 font-mono text-[0.78125rem] break-all text-ink-2">
            {dbPath}
          </p>
          <dl className="rule-rows text-[0.875rem]">
            {counts.map((row) => (
              <div
                key={row.entity}
                className="flex items-baseline justify-between gap-4 py-2"
              >
                <dt className="text-ink-3">
                  {ENTITY_LABEL[row.entity] ?? row.entity}
                </dt>
                <dd className="numeral text-[1rem]">
                  {row.count.toLocaleString('en-US')}
                </dd>
              </div>
            ))}
          </dl>
        </section>
        <section aria-labelledby="data-title">
          <h2 id="data-title" className="section-label mb-3">
            Data directory
          </h2>
          <p className="font-mono text-[0.78125rem] break-all text-ink-2">
            {dataDir}
          </p>
          <p className="mt-4 max-w-[52ch] text-[0.8125rem] leading-relaxed text-ink-3">
            Debug exports deliberately exclude browser profiles, cookies,
            credentials, and tokens.
          </p>
          <DebugBundleButton />
        </section>
        <section aria-labelledby="runs-title" className="lg:col-span-2">
          <h2 id="runs-title" className="section-label mb-3">
            Recent sync runs
          </h2>
          {runs.length ? (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[640px] border-collapse text-left text-[0.8125rem]">
                <thead>
                  <tr className="border-b border-rule text-xs text-ink-3">
                    <th className="py-2 pr-4 font-medium">Run</th>
                    <th className="py-2 pr-4 font-medium">Provider</th>
                    <th className="py-2 pr-4 font-medium">Started</th>
                    <th className="py-2 pr-4 font-medium">Status</th>
                    <th className="py-2 pr-4 text-right font-medium">Seen</th>
                    <th className="py-2 pr-4 text-right font-medium">Updated</th>
                    <th className="py-2 text-right font-medium">Errors</th>
                  </tr>
                </thead>
                <tbody>
                  {runs.map((run) => {
                    const errors = listLength(run.errors_json);
                    const warnings = listLength(run.warnings_json);
                    return (
                      <tr key={run.id} className="border-b border-rule align-baseline">
                        <td className="py-2 pr-4 font-mono text-xs text-ink-3">
                          #{run.id}
                        </td>
                        <td className="py-2 pr-4 capitalize">{run.provider}</td>
                        <td className="py-2 pr-4 text-ink-2 tabular-nums">
                          {new Date(run.started_at).toLocaleString(undefined, {
                            dateStyle: 'medium',
                            timeStyle: 'short',
                          })}
                        </td>
                        <td
                          className={cn(
                            'py-2 pr-4',
                            run.status === 'SUCCESS' && 'text-good',
                            run.status === 'FAILED' && 'text-bad',
                          )}
                        >
                          {run.status.charAt(0) +
                            run.status.slice(1).toLowerCase().replaceAll('_', ' ')}
                          {run.progress_label && (
                            <span className="text-ink-3"> · {run.progress_label}</span>
                          )}
                        </td>
                        <td className="py-2 pr-4 text-right tabular-nums">
                          {run.entities_seen ?? '—'}
                        </td>
                        <td className="py-2 pr-4 text-right tabular-nums">
                          {run.entities_updated ?? '—'}
                        </td>
                        <td
                          className={cn(
                            'py-2 text-right tabular-nums',
                            errors ? 'text-bad' : 'text-ink-3',
                          )}
                        >
                          {errors}
                          {warnings > 0 && (
                            <span className="text-ink-3"> · {warnings} warn</span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="text-[0.875rem] text-ink-3">No sync runs yet.</p>
          )}
          {runs.length > 0 && (
            <details className="mt-6">
              <summary className="textlink">Raw sync run records</summary>
              <pre className="mt-3 max-h-[500px] overflow-auto rounded-md border border-rule bg-wash p-4 font-mono text-xs leading-relaxed">
                {JSON.stringify(runs, null, 2)}
              </pre>
            </details>
          )}
        </section>
      </div>
    </PageFrame>
  );
}
