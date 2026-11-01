'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useId, useRef, useState } from 'react';

type HubSummary = {
  title: string;
  importedAt: string;
  source: string;
  courses: Array<{
    id: string;
    code: string;
    name: string;
    weeks: number;
    exams: number;
  }>;
};

type Status = { kind: 'idle' | 'busy' | 'error' | 'done'; message: string };

const IDLE: Status = { kind: 'idle', message: '' };

async function readHub(response: Response) {
  const payload = (await response.json().catch(() => null)) as {
    hub?: HubSummary | null;
    seeded?: string[];
    error?: string;
  } | null;
  if (!response.ok)
    throw new Error(
      payload?.error ?? `The server answered ${response.status}.`,
    );
  return { hub: payload?.hub ?? null, seeded: payload?.seeded ?? [] };
}

/**
 * Settings → Study Hub: what is imported, and import, replace, or remove it.
 * Accepts a courses JSON (docs/study-hub-format.md) or a hub .html export.
 */
export function StudyHubSettings() {
  const router = useRouter();
  const [hub, setHub] = useState<HubSummary | null | undefined>(undefined);
  const [status, setStatus] = useState<Status>(IDLE);
  const fileRef = useRef<HTMLInputElement>(null);
  const headingId = useId();
  const fileId = useId();

  useEffect(() => {
    let live = true;
    fetch('/api/study/hub')
      .then(readHub)
      .then((value) => live && setHub(value.hub))
      .catch((error: Error) => {
        if (!live) return;
        setHub(null);
        setStatus({
          kind: 'error',
          message: `Could not read the Study Hub: ${error.message}`,
        });
      });
    return () => {
      live = false;
    };
  }, []);

  const upload = async (file: File) => {
    setStatus({ kind: 'busy', message: `Importing ${file.name}…` });
    const body = new FormData();
    body.set('file', file);
    try {
      const { hub: next, seeded } = await readHub(
        await fetch('/api/study/hub', { method: 'POST', body }),
      );
      setHub(next);
      const codes = seeded
        .map((id) => next?.courses.find((course) => course.id === id)?.code)
        .filter(Boolean);
      setStatus({
        kind: 'done',
        message: `Imported ${next?.courses.length ?? 0} ${next?.courses.length === 1 ? 'course' : 'courses'} from ${file.name}.${codes.length ? ` Progress saved in the file replaced older progress for ${codes.join(', ')}.` : ''}`,
      });
      router.refresh();
    } catch (error) {
      setStatus({
        kind: 'error',
        message: error instanceof Error ? error.message : 'Import failed.',
      });
    } finally {
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  const remove = async () => {
    if (
      !window.confirm(
        'Remove the imported Study Hub? Your saved progress stays, and comes back if you import it again.',
      )
    )
      return;
    setStatus({ kind: 'busy', message: 'Removing…' });
    try {
      await readHub(await fetch('/api/study/hub', { method: 'DELETE' }));
      setHub(null);
      setStatus({ kind: 'done', message: 'Study Hub removed.' });
      router.refresh();
    } catch (error) {
      setStatus({
        kind: 'error',
        message:
          error instanceof Error
            ? error.message
            : 'Could not remove the Study Hub.',
      });
    }
  };

  const busy = status.kind === 'busy';

  return (
    <section
      id="study-hub"
      aria-labelledby={headingId}
      className="border-t border-rule pt-7 pb-12"
    >
      <h2 id={headingId} className="display text-[1.375rem]">
        Study Hub
      </h2>
      <p className="mt-1 max-w-[60ch] text-[0.84375rem] text-ink-3">
        Weekly lectures, practice, flashcards, and practice exams for each
        course, imported from your Study Hub. Progress saved in the file is kept
        where it is newer than yours.
      </p>

      <div className="mt-5">
        {hub === undefined ? (
          <p className="text-[0.8125rem] text-ink-3">
            Reading the current Study Hub…
          </p>
        ) : hub ? (
          <dl className="grid grid-cols-[9rem_1fr] gap-y-1.5 text-[0.8125rem]">
            <dt className="text-ink-3">Title</dt>
            <dd>{hub.title}</dd>
            <dt className="text-ink-3">Imported</dt>
            <dd>
              {new Date(hub.importedAt).toLocaleString('en-US', {
                month: 'short',
                day: 'numeric',
                year: 'numeric',
                hour: 'numeric',
                minute: '2-digit',
              })}
              <span className="text-ink-3"> from {hub.source}</span>
            </dd>
            <dt className="text-ink-3">Courses</dt>
            <dd>
              <ul className="space-y-1">
                {hub.courses.map((course) => (
                  <li key={course.id}>
                    <Link
                      href={`/study/${course.id}`}
                      className="underline decoration-rule-2 underline-offset-[3px] hover:decoration-ink"
                    >
                      {course.code}: {course.name}
                    </Link>
                    <span className="text-ink-3">
                      {' '}
                      {course.weeks} {course.weeks === 1 ? 'week' : 'weeks'},{' '}
                      {course.exams} {course.exams === 1 ? 'exam' : 'exams'}
                    </span>
                  </li>
                ))}
              </ul>
            </dd>
          </dl>
        ) : (
          <p className="max-w-[60ch] text-[0.8125rem] text-ink-2">
            Nothing imported yet. Import a courses JSON file (format in
            docs/study-hub-format.md) or a hub&rsquo;s .html export here, or run{' '}
            <code>pnpm study:import</code> with the file or its folder.
          </p>
        )}

        <div className="mt-5 flex flex-wrap items-center gap-2">
          <label htmlFor={fileId} className="sr">
            Study Hub file (.html or .json)
          </label>
          <input
            ref={fileRef}
            id={fileId}
            type="file"
            accept=".html,.htm,.json,text/html,application/json"
            className="sr"
            tabIndex={-1}
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (file) void upload(file);
            }}
          />
          <button
            type="button"
            className="pill pill-primary"
            disabled={busy || hub === undefined}
            onClick={() => fileRef.current?.click()}
          >
            {hub ? 'Replace Study Hub…' : 'Import Study Hub…'}
          </button>
          {hub && (
            <button
              type="button"
              className="pill"
              disabled={busy}
              onClick={() => void remove()}
            >
              Remove
            </button>
          )}
        </div>
        <p
          role={status.kind === 'error' ? 'alert' : 'status'}
          className={`mt-3 min-h-[1.25rem] text-[0.8125rem] ${status.kind === 'error' ? 'text-bad' : 'text-ink-3'}`}
        >
          {status.message}
        </p>
      </div>
    </section>
  );
}
