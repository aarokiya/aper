'use client';

import { type ReactNode, type SyntheticEvent, useMemo, useState } from 'react';
import { RefreshCw } from 'lucide-react';
import { useAppearance } from '@/components/appearance/appearance-provider';
import { HandshakeSettings } from '@/components/careers/handshake-settings';
import { StudyHubSettings } from '@/components/study/study-hub-settings';
import {
  StudyPrefsSettings,
  type StudyPrefsCourse,
} from '@/components/study/study-prefs-settings';
import { useCanvasSync } from '@/hooks/use-canvas-sync';
import { ACCENT_PRESETS, FONT_BY_ID, SCENES } from '@/lib/appearance/catalog';
import type { StudyPrefs } from '@/lib/study/prefs-schema';
import { cn } from '@/lib/utils';

type CourseOption = { id: number; code: string };
type AssignmentOption = { id: number; courseId: number; title: string };
type GroqStatus = {
  configured: boolean;
  hint: string | null;
  inEnvFile: boolean;
};
type ImportedArtifact = {
  id: number;
  filename: string;
  course: string | null;
  assignment: string | null;
  importedAt: string;
};

const AUTH_LABEL: Record<string, string> = {
  CONNECTED: 'Connected',
  AUTHENTICATION_REQUIRED: 'Sign-in required',
  ERROR: 'Error',
  UNKNOWN: 'Not checked yet',
};

const formatWhen = (value: string | null) =>
  value
    ? new Date(value).toLocaleString(undefined, {
        dateStyle: 'medium',
        timeStyle: 'short',
      })
    : 'Never';

/** One Settings group: serif title, muted purpose line, then content. */
function Group({
  id,
  title,
  note,
  actions,
  children,
}: {
  id: string;
  title: string;
  note: ReactNode;
  actions?: ReactNode;
  children?: ReactNode;
}) {
  return (
    <section
      id={id}
      aria-labelledby={`${id}-title`}
      className="scroll-mt-6 border-t border-rule pt-7 pb-12"
    >
      <div className="flex flex-wrap items-start justify-between gap-x-6 gap-y-3">
        <div className="min-w-0">
          <h2 id={`${id}-title`} className="display text-[1.375rem]">
            {title}
          </h2>
          <p className="mt-1 max-w-[60ch] text-[0.84375rem] text-ink-3">
            {note}
          </p>
        </div>
        {actions && (
          <div className="flex flex-wrap items-center gap-2">{actions}</div>
        )}
      </div>
      {children && <div className="mt-5">{children}</div>}
    </section>
  );
}

function Facts({ rows }: { rows: Array<[string, ReactNode]> }) {
  return (
    <dl className="grid grid-cols-[minmax(7rem,9rem)_minmax(0,1fr)] gap-x-4 gap-y-1.5 text-[0.8125rem]">
      {rows.map(([term, value]) => (
        <div key={term} className="contents">
          <dt className="text-ink-3">{term}</dt>
          <dd className="min-w-0 text-ink-2">{value}</dd>
        </div>
      ))}
    </dl>
  );
}

function Note({ tone, children }: { tone?: 'bad' | 'good'; children: ReactNode }) {
  return (
    <p
      role={tone === 'bad' ? 'alert' : 'status'}
      className={cn(
        'mt-3 text-[0.8125rem]',
        tone === 'bad' ? 'text-bad' : tone === 'good' ? 'text-good' : 'text-ink-2',
      )}
    >
      {children}
    </p>
  );
}

const labelClass = 'block text-[0.8125rem] text-ink-2';
const fieldClass = 'field mt-1.5';

export function SettingsClient({
  provider,
  gradescopeProvider,
  courses,
  assignments,
  initialImports,
  initialGroq,
  studyPrefs,
  studyCourses,
}: {
  provider: {
    authStatus: string;
    lastSuccessAt: string | null;
    lastError: string | null;
  };
  gradescopeProvider: {
    authStatus: string;
    lastSuccessAt: string | null;
    lastError: string | null;
  };
  courses: CourseOption[];
  assignments: AssignmentOption[];
  initialImports: ImportedArtifact[];
  initialGroq: GroqStatus;
  studyPrefs: StudyPrefs;
  studyCourses: StudyPrefsCourse[];
}) {
  const [busy, setBusy] = useState('');
  const [courseId, setCourseId] = useState('');
  const [assignmentId, setAssignmentId] = useState('');
  const [imports, setImports] = useState(initialImports);
  const [importMessage, setImportMessage] = useState('');
  const [gradescopeMessage, setGradescopeMessage] = useState('');
  const [gradescopeAuthMessage, setGradescopeAuthMessage] = useState('');
  const [groq, setGroq] = useState(initialGroq);
  const [groqKey, setGroqKey] = useState('');
  const [groqMessage, setGroqMessage] = useState('');
  const sync = useCanvasSync();
  const { openCustomizer, appearance } = useAppearance();
  const availableAssignments = useMemo(
    () =>
      assignments.filter(
        (item) => !courseId || String(item.courseId) === courseId,
      ),
    [assignments, courseId],
  );
  const action = async (kind: 'auth' | 'gradescope-auth' | 'export') => {
    setBusy(kind);
    try {
      const response = await fetch(
        kind === 'auth'
          ? '/api/canvas/auth'
          : kind === 'gradescope-auth'
            ? '/api/gradescope/auth'
            : '/api/export',
        { method: 'POST' },
      );
      const value = (await response.json().catch(() => ({}))) as {
        error?: string;
      };
      if (!response.ok) throw new Error(value.error ?? `${kind} failed`);
      location.reload();
    } catch (error) {
      if (kind === 'gradescope-auth')
        setGradescopeAuthMessage(
          error instanceof Error ? error.message : String(error),
        );
      else throw error;
    } finally {
      setBusy('');
    }
  };
  const importArtifact = async (event: SyntheticEvent<HTMLFormElement>) => {
    event.preventDefault();
    const formElement = event.currentTarget;
    setBusy('import');
    setImportMessage('');
    try {
      const form = new FormData(formElement);
      const response = await fetch('/api/gradescope/import', {
        method: 'POST',
        body: form,
      });
      const value = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(value.error ?? 'Import failed');
      const listing = (await fetch('/api/gradescope/import').then((item) =>
        item.json(),
      )) as { imports: ImportedArtifact[] };
      setImports(listing.imports);
      setImportMessage(
        'Artifact imported into the private local Gradescope archive.',
      );
      formElement.reset();
      setCourseId('');
      setAssignmentId('');
    } catch (error) {
      setImportMessage(error instanceof Error ? error.message : String(error));
    } finally {
      setBusy('');
    }
  };
  const addGradescopeAssignment = async (
    event: SyntheticEvent<HTMLFormElement>,
  ) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const text = (key: string) => {
      const value = form.get(key);
      return typeof value === 'string' ? value.trim() : '';
    };
    setBusy('gradescope-assignment');
    setGradescopeMessage('');
    try {
      const dueAt = text('dueAt');
      const sourceUrl = text('sourceUrl');
      const points = text('pointsPossible');
      const response = await fetch('/api/gradescope/assignments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          courseId: Number(text('courseId')),
          title: text('title'),
          dueAt: dueAt ? new Date(dueAt).toISOString() : '',
          assignmentType: text('assignmentType') || 'QUIZ',
          sourceUrl: sourceUrl || null,
          pointsPossible: points ? Number(points) : null,
        }),
      });
      const value = (await response.json()) as { id?: number; error?: string };
      if (!response.ok || !value.id)
        throw new Error(value.error ?? 'Unable to add assignment.');
      window.location.href = `/assignments/${value.id}`;
    } catch (error) {
      setGradescopeMessage(
        error instanceof Error ? error.message : String(error),
      );
    } finally {
      setBusy('');
    }
  };
  const saveGroqKey = async (event: SyntheticEvent<HTMLFormElement>) => {
    event.preventDefault();
    setBusy('groq');
    setGroqMessage('');
    try {
      const response = await fetch('/api/settings/groq', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ key: groqKey }),
      });
      const value = (await response.json()) as GroqStatus & { error?: string };
      if (!response.ok) throw new Error(value.error ?? 'Unable to save key.');
      setGroq(value);
      setGroqKey('');
      setGroqMessage('Key saved to .env and active now.');
    } catch (error) {
      setGroqMessage(error instanceof Error ? error.message : String(error));
    } finally {
      setBusy('');
    }
  };
  const removeGroqKey = async () => {
    setBusy('groq');
    setGroqMessage('');
    try {
      const response = await fetch('/api/settings/groq', { method: 'DELETE' });
      const value = (await response.json()) as GroqStatus;
      setGroq(value);
      setGroqMessage('Key removed. Captures fall back to the manual editor.');
    } catch (error) {
      setGroqMessage(error instanceof Error ? error.message : String(error));
    } finally {
      setBusy('');
    }
  };
  const importFailed = /failed|must|supported|unable/i.test(importMessage);
  return (
    <div>
      <Group
        id="appearance"
        title="Appearance"
        note="Theme, accent, type, the Today background, and the screen saver."
        actions={
          <button
            type="button"
            className="pill pill-primary"
            onClick={() => openCustomizer()}
          >
            Customize appearance
          </button>
        }
      >
        <Facts
          rows={[
            [
              'Theme',
              appearance.theme === 'system'
                ? 'Follows the system'
                : appearance.theme === 'dark'
                  ? 'Dark'
                  : 'Light',
            ],
            [
              'Accent',
              appearance.accent === 'custom'
                ? `Custom ${appearance.customAccent}`
                : (ACCENT_PRESETS.find((item) => item.id === appearance.accent)
                    ?.label ?? appearance.accent),
            ],
            [
              'Type',
              [appearance.fonts.display, appearance.fonts.body]
                .map((id) =>
                  id.startsWith('custom:')
                    ? 'Uploaded font'
                    : (FONT_BY_ID[id]?.label ?? id),
                )
                .join(' and '),
            ],
            ['Text size', `${Math.round(appearance.textScale * 100)}%`],
            [
              'Today background',
              appearance.background.kind === 'photo'
                ? 'Your photo'
                : `${SCENES.find((item) => item.id === appearance.background.scene)?.label ?? 'Scene'} scene`,
            ],
          ]}
        />
      </Group>

      <Group
        id="canvas"
        title="Georgia Tech Canvas"
        note="Courses, assignments, modules, files, and announcements, read through your own signed-in browser profile."
        actions={
          <>
            <button
              type="button"
              className="pill"
              onClick={() => action('auth')}
              disabled={!!busy || sync.busy}
            >
              {busy === 'auth' ? 'Waiting…' : 'Reauthenticate'}
            </button>
            <button
              type="button"
              className="pill pill-primary"
              onClick={sync.startSync}
              disabled={!!busy || sync.busy}
            >
              <RefreshCw
                className={cn('size-3.5', sync.busy && 'animate-spin')}
                aria-hidden="true"
              />
              {sync.busy ? 'Syncing…' : 'Sync now'}
            </button>
          </>
        }
      >
        <Facts
          rows={[
            [
              'Status',
              <span key="s" title={provider.authStatus}>
                {AUTH_LABEL[provider.authStatus] ?? provider.authStatus}
              </span>,
            ],
            ['Last successful sync', formatWhen(provider.lastSuccessAt)],
          ]}
        />
        {provider.lastError && <Note tone="bad">{provider.lastError}</Note>}
        {sync.message && (
          <Note tone={sync.state === 'error' ? 'bad' : undefined}>
            {sync.message}
          </Note>
        )}
      </Group>

      <Group
        id="gradescope"
        title="Gradescope"
        note="Uses the same private, persistent local browser profile as Canvas. Routine sync reads only your visible course dashboard and assignment tables; login, SSO, Duo, and CAPTCHAs stay manual."
        actions={
          <button
            type="button"
            className="pill"
            onClick={() => action('gradescope-auth')}
            disabled={!!busy || sync.busy}
          >
            {busy === 'gradescope-auth'
              ? 'Waiting for sign-in…'
              : gradescopeProvider.authStatus === 'CONNECTED'
                ? 'Reconnect Gradescope'
                : 'Connect Gradescope'}
          </button>
        }
      >
        <Facts
          rows={[
            [
              'Status',
              <span key="s" title={gradescopeProvider.authStatus}>
                {AUTH_LABEL[gradescopeProvider.authStatus] ??
                  gradescopeProvider.authStatus}
              </span>,
            ],
            [
              'Last successful sync',
              formatWhen(gradescopeProvider.lastSuccessAt),
            ],
            [
              'Automatic sync',
              'On after connection. Hourly and manual syncs bring in courses, assignments, release and due dates, submission state, visible scores, and source links. Exact Canvas matches fold into one task.',
            ],
          ]}
        />
        {gradescopeProvider.lastError && (
          <Note tone="bad">{gradescopeProvider.lastError}</Note>
        )}
        {gradescopeAuthMessage && (
          <Note tone="bad">{gradescopeAuthMessage}</Note>
        )}

        <div className="mt-10">
          <h3 className="section-label">Add a Gradescope-only assignment</h3>
          <p className="mt-1 max-w-[60ch] text-[0.8125rem] text-ink-3">
            For work that appears in Gradescope but not Canvas. It behaves like
            every other task in Today, Tasks, Calendar, and the course page.
          </p>
          <form
            onSubmit={addGradescopeAssignment}
            className="mt-4 grid gap-x-5 gap-y-4 sm:grid-cols-2"
          >
            <label className={labelClass}>
              Gradescope course
              <select required name="courseId" className={fieldClass}>
                <option value="">Choose a course</option>
                {courses.map((course) => (
                  <option key={course.id} value={course.id}>
                    {course.code}
                  </option>
                ))}
              </select>
            </label>
            <label className={labelClass}>
              Type
              <select
                name="assignmentType"
                defaultValue="QUIZ"
                className={fieldClass}
              >
                <option value="QUIZ">Quiz</option>
                <option value="ASSIGNMENT">Assignment</option>
                <option value="EXAM">Exam</option>
                <option value="LAB">Lab</option>
                <option value="PROJECT">Project</option>
              </select>
            </label>
            <label className={cn(labelClass, 'sm:col-span-2')}>
              Gradescope assignment title
              <input required name="title" className={fieldClass} />
            </label>
            <label className={labelClass}>
              Gradescope due date
              <input
                required
                name="dueAt"
                type="datetime-local"
                className={fieldClass}
              />
            </label>
            <label className={labelClass}>
              Points (optional)
              <input
                name="pointsPossible"
                type="number"
                min="0"
                step="any"
                className={fieldClass}
              />
            </label>
            <label className={cn(labelClass, 'sm:col-span-2')}>
              Gradescope URL (optional)
              <input
                name="sourceUrl"
                type="url"
                placeholder="https://www.gradescope.com/…"
                className={fieldClass}
              />
            </label>
            <div className="sm:col-span-2">
              <button
                type="submit"
                className="pill"
                disabled={Boolean(busy)}
              >
                {busy === 'gradescope-assignment'
                  ? 'Adding…'
                  : 'Add Gradescope assignment'}
              </button>
              {gradescopeMessage && (
                <Note tone="bad">{gradescopeMessage}</Note>
              )}
            </div>
          </form>
        </div>

        <div className="mt-10">
          <h3 className="section-label">Import a downloaded artifact</h3>
          <p className="mt-1 max-w-[60ch] text-[0.8125rem] text-ink-3">
            The file stays in this app’s private local data directory and is
            never sent back to Gradescope.
          </p>
          <form
            onSubmit={importArtifact}
            className="mt-4 grid gap-x-5 gap-y-4 sm:grid-cols-2"
          >
            <label className={labelClass}>
              Course
              <select
                name="courseId"
                value={courseId}
                onChange={(event) => {
                  setCourseId(event.target.value);
                  setAssignmentId('');
                }}
                className={fieldClass}
              >
                <option value="">Unassigned</option>
                {courses.map((course) => (
                  <option key={course.id} value={course.id}>
                    {course.code}
                  </option>
                ))}
              </select>
            </label>
            <label className={labelClass}>
              Assignment
              <select
                name="assignmentId"
                value={assignmentId}
                onChange={(event) => setAssignmentId(event.target.value)}
                className={fieldClass}
              >
                <option value="">Unassigned</option>
                {availableAssignments.map((assignment) => (
                  <option key={assignment.id} value={assignment.id}>
                    {assignment.title}
                  </option>
                ))}
              </select>
            </label>
            <label className={cn(labelClass, 'sm:col-span-2')}>
              Downloaded artifact
              <input
                required
                name="file"
                type="file"
                accept=".pdf,.json,.csv,.zip,.txt,.html"
                className="mt-1.5 block w-full rounded-md border border-dashed border-rule-2 px-3 py-3 text-[0.8125rem] text-ink-3 transition-colors file:mr-3 file:cursor-pointer file:rounded-full file:border file:border-solid file:border-rule-2 file:bg-transparent file:px-3 file:py-1 file:text-[0.8125rem] file:text-ink hover:border-ink-4 hover:file:border-ink"
              />
            </label>
            <div className="sm:col-span-2">
              <button
                type="submit"
                className="pill pill-primary"
                disabled={Boolean(busy)}
              >
                {busy === 'import' ? 'Importing…' : 'Import artifact'}
              </button>
              {importMessage && (
                <Note tone={importFailed ? 'bad' : 'good'}>{importMessage}</Note>
              )}
            </div>
          </form>
        </div>

        <div className="mt-10">
          <h3 className="section-label">Recent imports</h3>
          {imports.length ? (
            <ul className="rule-rows mt-3">
              {imports.map((item) => (
                <li
                  key={item.id}
                  className="grid gap-x-4 gap-y-0.5 py-2.5 text-[0.8125rem] sm:grid-cols-[minmax(0,1fr)_minmax(0,11rem)_auto]"
                >
                  <span className="truncate font-mono text-[0.78125rem] text-ink">
                    {item.filename}
                  </span>
                  <span className="truncate text-ink-3">
                    {item.course ?? 'Unassigned'}
                    {item.assignment ? ` · ${item.assignment}` : ''}
                  </span>
                  <time
                    dateTime={item.importedAt}
                    className="text-ink-3 tabular-nums"
                  >
                    {formatWhen(item.importedAt)}
                  </time>
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-2 text-[0.8125rem] text-ink-3">
              No Gradescope artifacts imported yet.
            </p>
          )}
        </div>
      </Group>

      <StudyHubSettings />

      <StudyPrefsSettings initial={studyPrefs} courses={studyCourses} />

      <HandshakeSettings />

      <Group
        id="groq"
        title="Groq API key"
        note={
          <>
            Powers natural-language capture in the command palette (
            <span className="kbd">⌘K</span>) and the Study Hub tutor and
            grader. Without a key the palette still opens the manual editor
            with what you typed, and the tutor and grader stay hidden.
          </>
        }
      >
        <Facts
          rows={[
            [
              'Status',
              groq.configured
                ? `Configured · ${groq.hint}${groq.inEnvFile ? '' : ' (from the shell environment, not .env)'}`
                : 'Not configured',
            ],
          ]}
        />
        <form onSubmit={saveGroqKey} className="mt-5 flex flex-wrap items-center gap-2">
          <input
            type="password"
            name="groqKey"
            autoComplete="off"
            spellCheck={false}
            value={groqKey}
            onChange={(event) => setGroqKey(event.target.value)}
            placeholder="gsk_…"
            aria-label="Groq API key"
            className="field max-w-md flex-1 basis-64 font-mono"
          />
          <button
            type="submit"
            className="pill pill-primary"
            disabled={!!busy || !groqKey.trim()}
          >
            {busy === 'groq' ? 'Saving…' : 'Save key'}
          </button>
          {groq.inEnvFile && (
            <button
              type="button"
              className="pill"
              disabled={!!busy}
              onClick={removeGroqKey}
            >
              Remove
            </button>
          )}
        </form>
        {groqMessage && <Note>{groqMessage}</Note>}
        <p className="mt-4 max-w-[60ch] text-xs leading-relaxed text-ink-3">
          The key is written to <code>.env</code> in this repository with 0600
          permissions, is never sent anywhere but Groq, and never leaves the
          server in a response. <code>.env</code> is gitignored.
        </p>
      </Group>

      <Group
        id="data"
        title="Sync and search"
        note="Automatic sync runs every hour while the background worker is running."
        actions={
          <button
            type="button"
            className="pill"
            onClick={() => action('export')}
            disabled={!!busy || sync.busy}
          >
            {busy === 'export' ? 'Rebuilding…' : 'Regenerate corpus'}
          </button>
        }
      >
        <p className="max-w-[60ch] text-[0.8125rem] text-ink-2">
          Regenerating rewrites the Markdown and normalized JSON exports and
          rebuilds the SQLite full-text index that powers search.
        </p>
      </Group>
    </div>
  );
}
