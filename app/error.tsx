'use client';

import Link from 'next/link';
export default function RouteError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="max-w-[892px] px-5 pt-16 pb-24 sm:px-10 lg:px-14 lg:pt-24">
      <p className="text-[13px] text-ink-3">Something broke</p>
      <h1 className="display mt-1 text-[40px]">This page could not load.</h1>
      <p className="mt-3 max-w-[60ch] text-ink-2">
        Your cached coursework is untouched. Try again; if it keeps failing,
        Developer debug has the latest sync and error details.
      </p>
      {error.digest && (
        <p className="mt-2 font-mono text-xs text-ink-4">
          Reference {error.digest}
        </p>
      )}
      <div className="mt-7 flex flex-wrap gap-2">
        <button type="button" onClick={reset} className="pill pill-primary">
          Try again
        </button>
        <Link href="/debug" className="pill">
          Open Developer debug
        </Link>
      </div>
    </div>
  );
}
