'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { Menu, Search } from 'lucide-react';
import { useAppearance } from '@/components/appearance/appearance-provider';
import { openCommandPalette } from '@/components/command-palette';
import { FocusTimer } from '@/components/study/focus-timer';
import { useCanvasSync } from '@/hooks/use-canvas-sync';
import { cn } from '@/lib/utils';
import {
  behindWeeks,
  curWeek,
  dayDiff,
  examWeek,
  fmtExamDate,
  nextExam,
  reviewCount,
  topicStatus,
  weekLight,
  weekProg,
  type LightLevel,
} from '@/lib/study/model';
import type { StudyCourseOutline } from '@/lib/study/nav';
import {
  exportStudyProgress,
  importStudyProgress,
  useStudyProgress,
  useStudySaveStatus,
} from '@/lib/study/progress-client';
import type { StudyCourseState } from '@/lib/study/types';
import { ClassZones } from './class-zones';
import type { ShellData } from './shell-data';
import {
  setStudyFocus,
  StudyFocus,
  StudyFocusToggle,
  studyFocusOn,
} from './study-focus';
import { isStudyPath } from './study-focus-boot';

const LIGHT: Record<LightLevel, string> = {
  green: 'bg-good',
  yellow: 'bg-warn',
  red: 'bg-bad',
};

const FOOT_BUTTON = 'cursor-pointer text-[12.5px] text-ink-3 hover:text-ink';

const NAV = [
  { label: 'Today', href: '/' },
  { label: 'Calendar', href: '/calendar' },
  { label: 'Grades', href: '/grades' },
  { label: 'Planner', href: '/planner' },
  { label: 'Files', href: '/files' },
  { label: 'Careers', href: '/careers' },
] as const;

/** h:mm AM/PM without locale data, so server and browser render the same text. */
function clockTime(iso: string) {
  const date = new Date(iso);
  const hours = date.getHours();
  return `${hours % 12 || 12}:${String(date.getMinutes()).padStart(2, '0')} ${hours < 12 ? 'AM' : 'PM'}`;
}

function syncedLabel(iso: string | null, today: string) {
  if (!iso) return 'Not synced yet';
  const date = new Date(iso);
  const day = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
  const months = [
    'Jan',
    'Feb',
    'Mar',
    'Apr',
    'May',
    'Jun',
    'Jul',
    'Aug',
    'Sep',
    'Oct',
    'Nov',
    'Dec',
  ];
  return day === today
    ? `Synced ${clockTime(iso)}`
    : `Synced ${months[date.getMonth()]} ${date.getDate()}, ${clockTime(iso)}`;
}

function ThemeToggle({ className }: { className?: string }) {
  const { appearance, update, resolvedTheme } = useAppearance();
  const dark = resolvedTheme === 'dark';
  return (
    <button
      type="button"
      onClick={() => update({ ...appearance, theme: dark ? 'light' : 'dark' })}
      aria-label={dark ? 'Switch to light mode' : 'Switch to dark mode'}
      title={dark ? 'Light mode' : 'Dark mode'}
      className={cn(
        'grid size-8 shrink-0 place-items-center rounded-full border border-rule text-ink-2 transition-colors hover:border-ink hover:text-ink',
        className,
      )}
    >
      {dark ? (
        <svg
          viewBox="0 0 24 24"
          className="size-[15px]"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinecap="round"
          aria-hidden="true"
        >
          <circle cx="12" cy="12" r="4.2" />
          <path d="M12 2.5v2.2M12 19.3v2.2M2.5 12h2.2M19.3 12h2.2M5.3 5.3l1.6 1.6M17.1 17.1l1.6 1.6M5.3 18.7l1.6-1.6M17.1 6.9l1.6-1.6" />
        </svg>
      ) : (
        <svg
          viewBox="0 0 24 24"
          className="size-[15px]"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <path d="M20 14.5A8.5 8.5 0 0 1 9.5 4a8.5 8.5 0 1 0 10.5 10.5z" />
        </svg>
      )}
    </button>
  );
}

type StudyView =
  | { kind: 'home' }
  | { kind: 'week'; n: number }
  | { kind: 'view'; name: string };

function parseStudyView(rest: string | undefined): StudyView {
  if (!rest) return { kind: 'home' };
  const week = rest.match(/^week\/(\d+)/);
  if (week) return { kind: 'week', n: Number(week[1]) };
  return { kind: 'view', name: rest.split('/')[0] };
}

function StudyCourseBlock({
  outline,
  initial,
  today,
  view,
  cardsDue,
}: {
  outline: StudyCourseOutline;
  initial: StudyCourseState | undefined;
  today: string;
  view: StudyView;
  /** due + learning flashcard reviews today (server count) */
  cardsDue: number;
}) {
  const { state } = useStudyProgress(outline.id, initial);
  const [query, setQuery] = useState('');
  const [matches, setMatches] = useState<Set<number> | null>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const base = `/study/${outline.id}`;
  const current = curWeek(outline.weeks, today);
  const upcoming = nextExam(outline.exams, state, today);
  const upcomingWeek = upcoming
    ? examWeek(outline.weeks, upcoming.exam.id)
    : undefined;
  const days = upcoming ? dayDiff(upcoming.date, today) : null;
  const queue = reviewCount(outline.weeks, state);
  const behind = behindWeeks(outline.labels, state, outline.weeks, today).length;

  useEffect(() => {
    const value = query.trim();
    if (!value) {
      setMatches(null);
      return;
    }
    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      void fetch(
        `/api/study/search/${outline.id}?q=${encodeURIComponent(value)}`,
        { signal: controller.signal },
      )
        .then((response) => response.json())
        .then((payload: { weeks?: number[] }) =>
          setMatches(new Set(payload.weeks ?? [])),
        )
        .catch(() => undefined);
    }, 120);
    return () => {
      controller.abort();
      window.clearTimeout(timer);
    };
  }, [outline.id, query]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (event.key !== '/' || event.metaKey || event.ctrlKey) return;
      if (
        target &&
        (/^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName) ||
          target.isContentEditable)
      )
        return;
      event.preventDefault();
      if (studyFocusOn()) setStudyFocus(false, true);
      window.dispatchEvent(new Event('aper:open-rail'));
      searchRef.current?.focus();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const views: Array<{
    label: string;
    href: string;
    current: boolean;
    count?: number;
  }> = [
    { label: 'Course home', href: base, current: view.kind === 'home' },
    {
      label: 'This week',
      href: `${base}/week/${current}`,
      current: view.kind === 'week' && view.n === current,
    },
    {
      label: behind ? 'Behind' : 'Caught up',
      href: `${base}/behind`,
      current: view.kind === 'view' && view.name === 'behind',
      count: behind,
    },
    {
      label: 'Proof grader',
      href: `${base}/grader`,
      current: view.kind === 'view' && view.name === 'grader',
    },
    {
      label: 'Review queue',
      href: `${base}/review`,
      current: view.kind === 'view' && view.name === 'review',
      count: queue,
    },
    {
      label: 'Flashcards',
      href: `${base}/cards`,
      current: view.kind === 'view' && view.name === 'cards',
      count: cardsDue,
    },
    {
      label: outline.hasFormulas ? 'Formula sheet' : 'Cheat sheet',
      href: `${base}/formulas`,
      current: view.kind === 'view' && view.name === 'formulas',
    },
    ...(outline.hasPages
      ? [
          {
            label: 'Guides',
            href: `${base}/guides`,
            current: view.kind === 'view' && view.name === 'guides',
          },
        ]
      : []),
    {
      label: 'Semester at a glance',
      href: `${base}/semester`,
      current: view.kind === 'view' && view.name === 'semester',
    },
    ...(outline.hasGrading
      ? [
          {
            label: 'Grades',
            href: `${base}/grades`,
            current: view.kind === 'view' && view.name === 'grades',
          },
        ]
      : []),
  ];

  const weeks = matches
    ? outline.weeks.filter((week) => matches.has(week.n))
    : outline.weeks;

  return (
    <div className="flex flex-col gap-[22px]">
      {upcoming && (
        <Link
          href={
            upcomingWeek
              ? `${base}/week/${upcomingWeek.n}?tab=x-${upcoming.exam.id}`
              : base
          }
          className="group block"
        >
          <span className="numeral float-right text-right text-[30px] leading-none">
            {days === 0 ? 'Today' : days !== null && days > 0 ? days : '—'}
            {days !== null && days > 0 && (
              <small className="mt-[3px] block font-sans text-[11px] text-ink-3">
                {days === 1 ? 'day' : 'days'}
              </small>
            )}
          </span>
          <span className="block text-xs text-ink-3">Next exam</span>
          <span className="mt-px block font-serif text-[17px] group-hover:underline group-hover:underline-offset-4">
            {upcoming.exam.title}
          </span>
          <span className="block text-[12.5px] text-ink-3">
            {fmtExamDate(state, upcoming.exam)}
          </span>
        </Link>
      )}
      <div>
        <label className="sr" htmlFor="rail-course-search">
          Search this course
        </label>
        <input
          ref={searchRef}
          id="rail-course-search"
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search this course (press /)"
          className="w-full rounded-none border-0 border-b border-rule bg-transparent py-[7px] text-sm placeholder:text-ink-4 focus:border-ink focus:outline-none"
        />
      </div>
      <nav aria-label="Course views" className="flex flex-col">
        {views.map((item) => (
          <Link
            key={item.label}
            href={item.href}
            aria-current={item.current ? 'page' : undefined}
            className={cn(
              'flex justify-between py-1 text-sm text-ink-3 transition-colors hover:text-ink',
              item.current && 'font-medium text-ink',
            )}
          >
            {item.label}
            {item.count ? (
              <span className="text-xs text-ink">{item.count}</span>
            ) : null}
          </Link>
        ))}
      </nav>
      <div>
        <h2 className="mb-1.5 text-xs font-medium text-ink-3">Weeks</h2>
        <ul>
          {weeks.map((week) => {
            const progress = weekProg(state, week);
            const status = topicStatus(outline.labels, state, week, today);
            const light = weekLight(outline.labels, state, week, current, today);
            const selected = view.kind === 'week' && view.n === week.n;
            return (
              <li key={week.n}>
                <Link
                  href={`${base}/week/${week.n}`}
                  aria-current={selected ? 'page' : undefined}
                  className={cn(
                    'grid w-full grid-cols-[24px_1fr] gap-x-2 py-1 text-ink-3 transition-colors hover:text-ink',
                    selected && 'text-ink',
                  )}
                >
                  <span
                    className={cn(
                      'row-span-2 pt-px text-right text-[13px] tabular-nums',
                      status.behind && 'text-bad',
                    )}
                  >
                    {week.label.length > 2 ? week.label[0] : week.label}
                  </span>
                  <span
                    className={cn(
                      'text-[13.5px] leading-[1.35]',
                      selected && 'font-medium',
                      status.complete && 'text-good',
                    )}
                  >
                    {week.title}
                    {light && (
                      <span
                        // eslint-disable-next-line jsx-a11y/prefer-tag-over-role -- the hub's status dot: a CSS circle with a spoken status
                        role="img"
                        title={light.text}
                        aria-label={light.text}
                        className={cn(
                          'relative -top-px ml-1.5 inline-block size-[5px] rounded-full align-middle',
                          LIGHT[light.level],
                        )}
                      />
                    )}
                  </span>
                  {(week.n === current ||
                    status.complete ||
                    status.behind ||
                    week.exams.length > 0 ||
                    progress.pct > 0) && (
                    <span className="flex items-center gap-2 text-[11.5px] text-ink-4">
                      {week.n === current && (
                        <span className="font-medium text-ink">Now</span>
                      )}
                      {status.complete ? (
                        <span className="font-medium text-good">
                          Complete ✓
                        </span>
                      ) : status.behind ? (
                        <span className="font-medium text-bad">Behind</span>
                      ) : null}
                      {week.exams.length > 0 && (
                        <span className="text-ink-2">Exam</span>
                      )}
                      {progress.pct > 0 && (
                        <>
                          <span className="h-0.5 max-w-20 flex-1 bg-rule">
                            <i
                              className="block h-full bg-ink"
                              style={{ width: `${progress.pct}%` }}
                            />
                          </span>
                          {progress.pct}%
                        </>
                      )}
                    </span>
                  )}
                </Link>
              </li>
            );
          })}
          {!weeks.length && (
            <li className="py-1.5 text-[13px] text-ink-3">
              No week covers “{query.trim()}”.
            </li>
          )}
        </ul>
      </div>
    </div>
  );
}

/** The hub's rail foot on /study pages: focus, export, import, reset, save status. */
function StudyFoot({
  course,
  courses,
}: {
  /** the open course, null on the overview */
  course: { id: string; code: string } | null;
  courses: ReadonlyArray<{ id: string; code: string }>;
}) {
  const router = useRouter();
  const { reset } = useStudyProgress(course?.id ?? null);
  const fileRef = useRef<HTMLInputElement>(null);
  return (
    <>
      <StudyFocusToggle className={FOOT_BUTTON} />
      <button
        type="button"
        className={FOOT_BUTTON}
        onClick={() =>
          void exportStudyProgress(course?.id ?? null).catch((error: Error) =>
            window.alert(error.message),
          )
        }
      >
        Export progress
      </button>
      <button
        type="button"
        className={FOOT_BUTTON}
        onClick={() => fileRef.current?.click()}
      >
        Import progress
      </button>
      <input
        ref={fileRef}
        type="file"
        accept="application/json,.json"
        hidden
        onChange={(event) => {
          const file = event.target.files?.[0];
          event.target.value = '';
          if (!file) return;
          void importStudyProgress(file, courses).then(
            (ids) => {
              if (ids) router.refresh();
            },
            (error: Error) => window.alert(error.message),
          );
        }}
      />
      <button
        type="button"
        className={FOOT_BUTTON}
        onClick={() => {
          if (!course) {
            window.alert('Open a course first, then reset its progress.');
            return;
          }
          if (
            window.confirm(
              `Clear all ${course.code} progress, answers, ratings, grades, and exam scores? This cannot be undone.`,
            )
          )
            reset();
        }}
      >
        Reset this course
      </button>
      <StudySaveStatus />
    </>
  );
}

function StudySaveStatus() {
  const status = useStudySaveStatus();
  if (status === 'idle') return null;
  return (
    <span className="w-full text-[11.5px] text-ink-4">
      {status === 'saving'
        ? 'Saving…'
        : status === 'error'
          ? 'Could not save. Retrying on the next change.'
          : 'Saved on this device'}
    </span>
  );
}

export function Rail({ data }: { data: ShellData }) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const sync = useCanvasSync();
  const { openCustomizer } = useAppearance();
  const studyMatch = pathname.match(/^\/study\/([^/]+)(?:\/(.+))?$/);
  const activeStudyId =
    studyMatch && data.study.outlines[studyMatch[1]] ? studyMatch[1] : null;
  const outline = activeStudyId ? data.study.outlines[activeStudyId] : null;
  const view = parseStudyView(studyMatch?.[2]);
  const canvas = data.providers.find((provider) => provider.key === 'canvas');

  useEffect(() => setOpen(false), [pathname]);

  useEffect(() => {
    const show = () => setOpen(true);
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };
    window.addEventListener('aper:open-rail', show);
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('aper:open-rail', show);
      window.removeEventListener('keydown', onKey);
    };
  }, []);

  const isActive = (href: string) =>
    href === '/'
      ? pathname === '/'
      : pathname === href || pathname.startsWith(`${href}/`);

  return (
    <>
      <div
        data-rail-bar
        className="sticky top-0 z-30 flex items-center gap-3 border-b border-rule bg-paper/90 px-5 py-3 backdrop-blur-xl lg:hidden"
      >
        <button
          type="button"
          className="pill pill-sm"
          aria-expanded={open}
          aria-controls="app-rail"
          onClick={() => setOpen(true)}
        >
          <Menu className="size-3.5" aria-hidden="true" /> Menu
        </button>
        <Link href="/" className="flex-1 font-serif text-base">
          _aper
        </Link>
        <button
          type="button"
          aria-label="Open command palette"
          onClick={openCommandPalette}
          className="grid size-8 place-items-center rounded-full border border-rule text-ink-2 hover:border-ink hover:text-ink"
        >
          <Search className="size-[15px]" aria-hidden="true" />
        </button>
        <ThemeToggle />
      </div>

      <div
        aria-hidden="true"
        data-rail-scrim
        onClick={() => setOpen(false)}
        className={cn(
          'fixed inset-0 z-40 bg-black/40 transition-opacity duration-200 lg:hidden',
          open ? 'opacity-100' : 'pointer-events-none opacity-0',
        )}
      />

      <aside
        id="app-rail"
        aria-label="Navigation"
        className={cn(
          'fixed inset-y-0 left-0 z-50 flex w-[min(290px,86%)] flex-col gap-[22px] overflow-y-auto overscroll-contain border-r border-rule bg-paper px-[18px] pt-7 pb-[18px] transition-[transform,visibility] duration-200 ease-out [scrollbar-width:thin] lg:visible lg:z-20 lg:w-[var(--rail-w)] lg:translate-x-0',
          open ? 'visible translate-x-0' : 'invisible -translate-x-[102%]',
        )}
      >
        <div className="flex items-start justify-between gap-2">
          <Link href="/" className="min-w-0">
            <span className="block font-serif text-[21px] leading-[1.2] font-medium">
              _aper
            </span>
            <span className="mt-[3px] block text-[12.5px] text-ink-3">
              Georgia Tech{data.term ? `, ${data.term}` : ''}
            </span>
          </Link>
          <ThemeToggle />
        </div>

        <button
          type="button"
          onClick={openCommandPalette}
          className="flex w-full items-center gap-2 border-b border-rule py-[7px] text-left text-sm text-ink-4 transition-colors hover:border-ink hover:text-ink-3"
        >
          <Search className="size-3.5 shrink-0" aria-hidden="true" />
          <span className="min-w-0 flex-1 truncate">
            Search courses, work, files…
          </span>
          <span className="kbd">⌘K</span>
        </button>

        <nav aria-label="Primary navigation" className="-mt-1.5 flex flex-col">
          {NAV.map((item) => {
            const active = isActive(item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                aria-current={active ? 'page' : undefined}
                className={cn(
                  'relative flex items-baseline justify-between py-[5px] text-sm text-ink-3 transition-colors hover:text-ink',
                  active &&
                    'font-semibold text-ink before:absolute before:top-1/2 before:-left-[11px] before:size-[5px] before:-translate-y-1/2 before:rounded-full before:bg-ink',
                )}
              >
                {item.label}
              </Link>
            );
          })}
        </nav>

        <ClassZones data={data} pathname={pathname} />

        {outline && (
          <StudyCourseBlock
            key={outline.id}
            outline={outline}
            initial={data.study.progress[outline.id]}
            today={data.today}
            view={view}
            cardsDue={
              (data.study.due[outline.id]?.due ?? 0) +
              (data.study.due[outline.id]?.learning ?? 0)
            }
          />
        )}

        <div className="mt-auto flex flex-wrap items-center gap-x-3 gap-y-1 border-t border-rule pt-3">
          <Link
            href="/settings"
            aria-current={isActive('/settings') ? 'page' : undefined}
            className={cn(
              'text-[12.5px] text-ink-3 hover:text-ink',
              isActive('/settings') && 'text-ink',
            )}
          >
            Settings
          </Link>
          <button
            type="button"
            onClick={() => openCustomizer()}
            className="cursor-pointer text-[12.5px] text-ink-3 hover:text-ink"
          >
            Customize
          </button>
          <FocusTimer initialPrefs={data.study.prefs} className={FOOT_BUTTON} />
          {isStudyPath(pathname) && (
            <StudyFoot
              course={outline}
              courses={Object.values(data.study.outlines)}
            />
          )}
          <div className="flex w-full items-center gap-2 pt-1 text-[11.5px] text-ink-4">
            <span
              className="flex items-center gap-1"
              title={data.providers
                .map((p) => `${p.name}: ${p.authStatus.toLowerCase()}`)
                .join('\n')}
            >
              {data.providers.map((provider) => (
                <span
                  key={provider.key}
                  className={cn(
                    'size-1.5 rounded-full',
                    provider.authStatus === 'CONNECTED'
                      ? 'bg-good'
                      : 'bg-[var(--course-gold)]',
                  )}
                />
              ))}
            </span>
            <span className="min-w-0 flex-1 truncate" aria-live="polite">
              {sync.busy
                ? sync.message || 'Syncing…'
                : syncedLabel(canvas?.lastSuccessAt ?? null, data.today)}
            </span>
            <button
              type="button"
              onClick={() => void sync.startSync()}
              disabled={sync.busy}
              className="cursor-pointer text-[11.5px] text-ink-3 hover:text-ink disabled:cursor-default disabled:opacity-50"
            >
              {sync.busy ? 'Syncing…' : 'Sync now'}
            </button>
          </div>
        </div>
      </aside>
      <StudyFocus />
    </>
  );
}
