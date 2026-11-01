'use client';

import { Fragment, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { ArrowUpRight, Search } from 'lucide-react';

type Result = {
  entityType: string;
  entityId: number;
  courseId: number | null;
  title: string;
  snippet: string;
  sourceUrl: string | null;
};

/** FTS snippets mark hits with <mark>; render those as elements, the rest as text. */
function Snippet({ value }: { value: string }) {
  const parts = value.split(/<mark>(.*?)<\/mark>/g);
  return (
    <>
      {parts.map((part, index) =>
        index % 2 ? (
          <mark
            key={index}
            className="rounded-[2px] bg-[color-mix(in_srgb,var(--accent-ink)_16%,transparent)] px-px text-ink"
          >
            {part}
          </mark>
        ) : (
          <Fragment key={index}>{part}</Fragment>
        ),
      )}
    </>
  );
}

export function SearchClient({
  courses,
}: {
  courses: Array<{ id: number; code: string }>;
}) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<Result[]>([]);
  const [loading, setLoading] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  // The search page exists to type into; focus the field once it mounts.
  useEffect(() => input.current?.focus(), []);
  useEffect(() => {
    if (!query.trim()) return;
    const timer = setTimeout(async () => {
      setLoading(true);
      try {
        const response = await fetch(
          `/api/search?q=${encodeURIComponent(query)}`,
        );
        setResults((await response.json()).results ?? []);
      } finally {
        setLoading(false);
      }
    }, 180);
    return () => clearTimeout(timer);
  }, [query]);
  const visibleResults = query.trim() ? results : [];
  const codeFor = new Map(courses.map((course) => [course.id, course.code]));
  return (
    <>
      <label className="flex max-w-[780px] items-center gap-3 border-b border-rule-2 transition-colors focus-within:border-ink">
        <Search className="size-5 shrink-0 text-ink-4" aria-hidden="true" />
        <span className="sr">Search</span>
        <input
          ref={input}
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search malloc, exam, syllabus, filename…"
          className="h-14 min-w-0 flex-1 bg-transparent font-serif text-[1.375rem] outline-none placeholder:text-ink-4 sm:text-[1.625rem] [&::-webkit-search-cancel-button]:appearance-none"
        />
        {query && (
          <button
            type="button"
            className="textlink"
            onClick={() => {
              setQuery('');
              setResults([]);
            }}
          >
            Clear
          </button>
        )}
      </label>
      <p className="mt-3 min-h-5 text-[0.8125rem] text-ink-3" aria-live="polite">
        {!query.trim()
          ? 'Assignments, pages, announcements, files, and syllabi stored on this computer.'
          : loading
            ? 'Searching…'
            : visibleResults.length
              ? `${visibleResults.length} ${visibleResults.length === 1 ? 'result' : 'results'}`
              : ''}
      </p>
      {visibleResults.length > 0 && (
        <ul className="rule-rows mt-6 max-w-[780px]">
          {visibleResults.map((item) => {
            const href =
              item.entityType === 'assignment'
                ? `/assignments/${item.entityId}`
                : item.entityType === 'course'
                  ? `/courses/${item.entityId}`
                  : item.sourceUrl;
            const external = Boolean(href && !href.startsWith('/'));
            const code = item.courseId == null ? null : codeFor.get(item.courseId);
            const body = (
              <>
                <p className="text-[0.78125rem] text-ink-3">
                  {item.entityType.charAt(0).toUpperCase() +
                    item.entityType.slice(1).replaceAll('_', ' ')}
                  {code ? ` · ${code}` : ''}
                </p>
                <h2 className="mt-0.5 flex items-baseline gap-1.5 font-serif text-[1.125rem] leading-snug font-medium underline-offset-[3px] group-hover:underline">
                  {item.title}
                  {external && (
                    <ArrowUpRight
                      className="size-3.5 shrink-0 self-center text-ink-4"
                      aria-label="Opens in a new tab"
                    />
                  )}
                </h2>
                {item.snippet && (
                  <p className="mt-1 line-clamp-3 text-[0.84375rem] leading-relaxed text-ink-2">
                    <Snippet value={item.snippet} />
                  </p>
                )}
              </>
            );
            return (
              <li key={`${item.entityType}-${item.entityId}`}>
                {!href ? (
                  <div className="py-4">{body}</div>
                ) : external ? (
                  <a
                    href={href}
                    target="_blank"
                    rel="noreferrer"
                    className="group block py-4 no-underline"
                  >
                    {body}
                  </a>
                ) : (
                  <Link href={href} className="group block py-4 no-underline">
                    {body}
                  </Link>
                )}
              </li>
            );
          })}
        </ul>
      )}
      {query.trim() && !loading && !visibleResults.length && (
        <p className="mt-6 border-t border-rule py-6 text-[0.9375rem] text-ink-3">
          No local matches for “{query.trim()}”.
        </p>
      )}
    </>
  );
}
