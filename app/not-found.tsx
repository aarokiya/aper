import Link from 'next/link';

export default function NotFound() {
  return (
    <div className="max-w-[892px] px-5 pt-16 pb-24 sm:px-10 lg:px-14 lg:pt-24">
      <p className="text-[13px] text-ink-3">Not found</p>
      <h1 className="display mt-1 text-[40px]">
        There’s nothing on this page.
      </h1>
      <p className="mt-3 max-w-[60ch] text-ink-2">
        The link may point to a course, week, or file that no longer exists
        after the last sync or Study Hub import.
      </p>
      <div className="mt-7 flex flex-wrap gap-2">
        <Link href="/" className="pill pill-primary">
          Go to Today
        </Link>
        <Link href="/study" className="pill">
          Open Study
        </Link>
      </div>
    </div>
  );
}
