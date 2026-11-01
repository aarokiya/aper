'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useMemo, useRef, useState } from 'react';
import { BrowseView } from '@/components/study/flashcards/browse';
import { MyCardsView } from '@/components/study/flashcards/my-cards';
import {
  PresetList,
  SessionBuilder,
} from '@/components/study/flashcards/session-builder';
import { StatsView } from '@/components/study/flashcards/stats';
import {
  CountsTable,
  courseInput,
  nextDue,
  presetId,
  useClock,
  type ActiveSession,
  type ReviewCourse,
} from '@/components/study/review/daily';
import { ReviewSession } from '@/components/study/review/session';
import { useStudyPrefs } from '@/lib/study/prefs-client';
import {
  coursePrefs,
  type CustomSession,
  type StudyPrefs,
} from '@/lib/study/prefs-schema';
import { useStudyProgress } from '@/lib/study/progress-client';
import { buildCustomQueue, buildDailyQueue, dailyCounts } from '@/lib/study/srs';

const TABS = [
  { id: 'review', label: 'Review' },
  { id: 'browse', label: 'Browse' },
  { id: 'mine', label: 'My cards' },
  { id: 'stats', label: 'Stats' },
] as const;

type HubTab = (typeof TABS)[number]['id'];

/** A course's Flashcards page: its review and custom sessions, browser, own cards, and stats. */
export function FlashcardsHub({
  course,
  prefs: initialPrefs,
  tab: tabParam,
  now: serverNow,
}: {
  course: ReviewCourse;
  prefs: StudyPrefs;
  /** the `?tab=` value; unknown or missing = review */
  tab: string | undefined;
  /** server render time (ms) */
  now: number;
}) {
  const requested: HubTab =
    TABS.find((item) => item.id === tabParam)?.id ?? 'review';
  const router = useRouter();
  const pathname = usePathname();
  const { state } = useStudyProgress(course.cid, course.initial);
  const [prefs, updatePrefs] = useStudyPrefs(initialPrefs);
  const [now, refreshNow] = useClock(serverNow);
  const [tab, setTab] = useState<HubTab>(requested);
  const [lastRequested, setLastRequested] = useState<HubTab>(requested);
  const [active, setActive] = useState<ActiveSession | null>(null);
  const tabRefs = useRef<Partial<Record<HubTab, HTMLButtonElement | null>>>(
    {},
  );

  // A link to another tab of this page (the rail, the palette) arrives as a new prop.
  if (requested !== lastRequested) {
    setLastRequested(requested);
    setTab(requested);
  }

  const input = courseInput(course, state);
  const inputs = useMemo(() => [input], [input]);
  // The course's own review runs even when it is left out of Daily review.
  const scoped = useMemo(
    (): StudyPrefs => ({
      ...prefs,
      courses: {
        ...prefs.courses,
        [course.cid]: { ...coursePrefs(prefs, course.cid), review: true },
      },
    }),
    [prefs, course.cid],
  );
  const counts = dailyCounts({ courses: inputs, prefs: scoped, now });
  const row = counts[course.cid];
  const queued = row ? row.due + row.learning + row.newAvail : 0;
  const inReview = coursePrefs(prefs, course.cid).review;
  const presets = prefs.presets.filter(
    (preset) => preset.cids.length === 1 && preset.cids[0] === course.cid,
  );
  const mine = Object.keys(state.uc).length;

  const select = (id: HubTab, focus = false) => {
    setTab(id);
    router.replace(
      id === 'review' ? pathname : `${pathname}?tab=${encodeURIComponent(id)}`,
      { scroll: false },
    );
    if (focus) tabRefs.current[id]?.focus();
  };

  const onTabKey = (
    event: React.KeyboardEvent<HTMLButtonElement>,
    index: number,
  ) => {
    const moves: Record<string, number> = {
      ArrowRight: index + 1,
      ArrowLeft: index - 1,
      Home: 0,
      End: TABS.length - 1,
    };
    if (!(event.key in moves)) return;
    event.preventDefault();
    select(TABS[(moves[event.key] + TABS.length) % TABS.length].id, true);
  };

  const start = (session: Omit<ActiveSession, 'key'>) => {
    if (!session.entries.length) {
      refreshNow();
      return;
    }
    setActive({ ...session, key: Date.now() });
    window.scrollTo(0, 0);
  };
  const startCustom = (session: CustomSession) =>
    start({
      title: `${course.code} custom session`,
      entries: buildCustomQueue({
        courses: inputs,
        prefs,
        now: Date.now(),
        session,
        seed: Date.now().toString(),
      }),
      reschedule: session.reschedule,
    });

  const reviewCourses = [
    {
      cid: course.cid,
      code: course.code,
      math: course.math,
      codeLang: course.codeLang,
      initial: state,
      items: course.items,
    },
  ];
  const weeks = course.weeks.map(({ n, label, title }) => ({ n, label, title }));

  if (active)
    return (
      <div className="wrap fh">
        <ReviewSession
          key={active.key}
          courses={reviewCourses}
          entries={active.entries}
          prefs={prefs}
          reschedule={active.reschedule}
          title={active.title}
          onExit={() => {
            setActive(null);
            refreshNow();
            router.refresh();
          }}
        />
      </div>
    );

  const next = queued === 0 ? nextDue(inputs, scoped, now) : null;

  return (
    <div className="wrap fh">
      <div className="whead">
        <div className="kicker">{course.code}</div>
        <h2>Flashcards</h2>
        <div className="sub">
          Spaced review of this course&apos;s cards, quick checks, quiz
          questions, Arrange problems, and your own cards.
        </div>
      </div>
      <div className="tabs" role="tablist" aria-label={`${course.code} flashcards`}>
        {TABS.map((item, index) => {
          const count =
            item.id === 'review' ? queued : item.id === 'mine' ? mine : 0;
          return (
            <button
              key={item.id}
              ref={(node) => {
                tabRefs.current[item.id] = node;
              }}
              type="button"
              role="tab"
              id={`fh-tab-${item.id}`}
              aria-selected={item.id === tab}
              aria-controls="fh-pane"
              tabIndex={item.id === tab ? 0 : -1}
              onClick={() => select(item.id)}
              onKeyDown={(event) => onTabKey(event, index)}
            >
              {item.label}
              {count > 0 && (
                <span className="c">
                  <span aria-hidden="true">{count}</span>
                  <span className="sr">
                    , {count} {item.id === 'review' ? 'to review today' : 'cards'}
                  </span>
                </span>
              )}
            </button>
          );
        })}
      </div>
      <div
        className="sheet"
        role="tabpanel"
        id="fh-pane"
        aria-labelledby={`fh-tab-${tab}`}
        key={tab}
      >
        {tab === 'review' && (
          <>
            <CountsTable courses={[course]} counts={counts} links={false} />
            <div className="dr-go">
              {queued > 0 ? (
                <button
                  type="button"
                  className="pill pill-primary"
                  onClick={() =>
                    start({
                      title: `${course.code} review`,
                      entries: buildDailyQueue({
                        courses: inputs,
                        prefs: scoped,
                        now: Date.now(),
                      }),
                      reschedule: true,
                    })
                  }
                >
                  Start review ({queued})
                </button>
              ) : (
                <p className="dr-done">
                  <b>All caught up.</b>{' '}
                  {next
                    ? `Next reviews are due ${next}.`
                    : 'No reviews are scheduled yet; new items appear as their weeks start.'}
                </p>
              )}
            </div>
            <p className="dr-note">
              {inReview ? (
                <>
                  This course is part of your{' '}
                  <Link href="/study/daily">Daily review</Link>.
                </>
              ) : (
                <>
                  This course is left out of your{' '}
                  <Link href="/study/daily">Daily review</Link>; its review
                  here still works.
                </>
              )}{' '}
              <Link href="/settings#study">Study settings</Link>
            </p>

            <h3 className="grp t2">Custom session</h3>
            <h4 className="dr-sub">Presets</h4>
            <PresetList
              presets={presets}
              codes={{ [course.cid]: course.code }}
              inputs={inputs}
              prefs={prefs}
              now={now}
              onStart={startCustom}
              onDelete={(id) =>
                updatePrefs((draft) => {
                  draft.presets = draft.presets.filter(
                    (preset) => preset.id !== id,
                  );
                })
              }
            />
            <h4 className="dr-sub">New session</h4>
            <SessionBuilder
              courses={[course]}
              prefs={prefs}
              inputs={inputs}
              now={now}
              onStart={startCustom}
              onSave={(session, name) =>
                updatePrefs((draft) => {
                  draft.presets.push({ ...session, id: presetId(), name });
                })
              }
            />
          </>
        )}
        {tab === 'browse' && (
          <BrowseView
            cid={course.cid}
            course={{
              code: course.code,
              math: course.math,
              codeLang: course.codeLang,
              weeks,
            }}
            items={course.items}
            initial={state}
            prefs={prefs}
          />
        )}
        {tab === 'mine' && (
          <MyCardsView
            cid={course.cid}
            course={{ code: course.code, weeks }}
            initial={state}
          />
        )}
        {tab === 'stats' && (
          <StatsView
            courses={[
              {
                cid: course.cid,
                code: course.code,
                items: course.items,
                initial: state,
              },
            ]}
            prefs={prefs}
          />
        )}
      </div>
    </div>
  );
}
