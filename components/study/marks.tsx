/** The artifact's hand-drawn check and cross marks. */

/** `decorative` leaves out the "correct" label where the text beside it already says so. */
export function CheckMark({
  className,
  decorative = false,
}: {
  className?: string;
  decorative?: boolean;
}) {
  return (
    <>
      <svg
        viewBox="0 0 40 36"
        width="20"
        height="18"
        aria-hidden="true"
        className={className}
      >
        <path
          d="M5 20c3 2 6 5 9 11C19 19 26 10 36 3"
          fill="none"
          stroke="currentColor"
          strokeWidth="3.6"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
      {!decorative && <span className="sr">correct</span>}
    </>
  );
}

export function CrossMark({ className }: { className?: string }) {
  return (
    <>
      <svg
        viewBox="0 0 40 36"
        width="18"
        height="17"
        aria-hidden="true"
        className={className}
      >
        <path
          d="M9 6c7 7 15 15 23 25M31 5C24 13 16 21 8 31"
          fill="none"
          stroke="currentColor"
          strokeWidth="3.6"
          strokeLinecap="round"
        />
      </svg>
      <span className="sr">wrong</span>
    </>
  );
}

export function Tick() {
  return (
    <svg viewBox="0 0 40 36" width="10" height="10" aria-hidden="true">
      <path
        d="M5 20c3 2 6 5 9 11C19 19 26 10 36 3"
        fill="none"
        stroke="currentColor"
        strokeWidth="4.5"
        strokeLinecap="round"
      />
    </svg>
  );
}

/** Correct/wrong mark in a problem's left gutter. */
export function ProblemMark({ ok }: { ok: boolean }) {
  return <div className="mark">{ok ? <CheckMark /> : <CrossMark />}</div>;
}
