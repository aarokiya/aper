'use client';

import { useRouter } from 'next/navigation';
import { useRef, useState } from 'react';

/**
 * Picks a planner file (degree requirements plus a starting plan, as JSON)
 * and imports it. `replace` is the quiet version shown once a plan exists.
 */
export function PlannerImport({ replace = false }: { replace?: boolean }) {
  const router = useRouter();
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const importFile = async (file: File) => {
    if (
      replace &&
      !window.confirm(
        'Replace the requirements with this file? Your plan is kept unless the file’s plan is newer.',
      )
    )
      return;
    setBusy(true);
    setError(null);
    const response = await fetch('/api/planner', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: await file.text(),
    }).catch(() => null);
    setBusy(false);
    if (!response?.ok) {
      const body = (await response?.json().catch(() => null)) as {
        error?: string;
      } | null;
      setError(
        body?.error ?? 'That did not work. Check that _aper is running.',
      );
      return;
    }
    router.refresh();
  };

  return (
    <div>
      <button
        type="button"
        className={replace ? 'textlink' : 'pill pill-primary'}
        disabled={busy}
        onClick={() => input.current?.click()}
      >
        {busy
          ? 'Importing…'
          : replace
            ? 'Import a new planner file'
            : 'Import a planner file'}
      </button>
      <input
        ref={input}
        type="file"
        accept="application/json,.json"
        aria-label="Planner file"
        className="sr"
        onChange={(event) => {
          const file = event.target.files?.[0];
          event.target.value = '';
          if (file) void importFile(file);
        }}
      />
      {error && (
        <p role="alert" className="mt-2 max-w-[60ch] text-[13px] text-bad">
          {error}
        </p>
      )}
    </div>
  );
}
