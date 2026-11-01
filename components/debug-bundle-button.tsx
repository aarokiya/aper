'use client';

import { useState } from 'react';

export function DebugBundleButton() {
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ path?: string; error?: string } | null>(
    null,
  );
  const create = async () => {
    setBusy(true);
    try {
      const response = await fetch('/api/debug-bundle', { method: 'POST' });
      const value = (await response.json()) as { path?: string; error?: string };
      setResult(
        value.path || value.error ? value : { error: 'Unable to create bundle.' },
      );
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="mt-5">
      <button type="button" className="pill" onClick={create} disabled={busy}>
        {busy ? 'Exporting…' : 'Export debug bundle'}
      </button>
      {result && (
        <dl
          aria-live="polite"
          className="mt-4 grid grid-cols-[auto_minmax(0,1fr)] gap-x-4 border-t border-rule pt-3 text-[0.8125rem]"
        >
          <dt className="text-ink-3">{result.path ? 'Saved to' : 'Failed'}</dt>
          <dd
            className={
              result.path
                ? 'font-mono text-[0.78125rem] break-all text-ink-2'
                : 'text-bad'
            }
          >
            {result.path ?? result.error}
          </dd>
        </dl>
      )}
    </div>
  );
}
