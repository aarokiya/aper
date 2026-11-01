'use client';

import Link from 'next/link';
import { useId, useState, type ReactNode } from 'react';
import {
  Group,
  Range,
  Segmented,
  Toggle,
} from '@/components/appearance/controls';
import { useStudyPrefs } from '@/lib/study/prefs-client';
import {
  coursePrefs,
  DEFAULT_STUDY_PREFS,
  ITEM_KINDS,
  type CoursePrefs,
  type ItemKind,
  type StudyPrefs,
} from '@/lib/study/prefs-schema';
import { cn } from '@/lib/utils';

/** A hub course as Settings lists it: the week tabs it has, with its own labels. */
export type StudyPrefsCourse = {
  id: string;
  code: string;
  name: string;
  tabs: Array<{ id: string; label: string }>;
};

const KIND_LABEL: Record<ItemKind, string> = {
  card: 'Cards',
  quick: 'Quick checks',
  practice: 'Quiz questions',
  parsons: 'Arrange code',
  mine: 'My cards',
};

const KIND_NOTE: Record<ItemKind, string> = {
  card: 'Week and formula flashcards',
  quick: 'Short checks from the notes',
  practice: 'Practice questions from each week',
  parsons: 'Put lines of code in order',
  mine: 'Cards you wrote yourself',
};

const PICK_LABEL: Record<StudyPrefs['presets'][number]['pick'], string> = {
  due: 'Due',
  new: 'New',
  weak: 'Weak spots',
  all: 'Everything',
  ahead: 'Review ahead',
};

/** Label + one-line explanation on the left, the control on the right. */
function Row({
  label,
  note,
  htmlFor,
  children,
}: {
  label: string;
  note?: ReactNode;
  htmlFor?: string;
  children: ReactNode;
}) {
  return (
    <div className="flex items-start justify-between gap-4 py-2">
      <div className="min-w-0">
        <label htmlFor={htmlFor} className="block text-[13.5px] text-ink">
          {label}
        </label>
        {note && (
          <span className="mt-0.5 block text-[12.5px] text-ink-3">{note}</span>
        )}
      </div>
      <div className="shrink-0">{children}</div>
    </div>
  );
}

/** Whole-number input that saves each valid value as it is typed (the schema clamps it). */
function NumberField({
  label,
  note,
  value,
  min,
  max,
  unit,
  onChange,
}: {
  label: string;
  note?: ReactNode;
  value: number;
  min: number;
  max: number;
  unit?: string;
  onChange: (value: number) => void;
}) {
  const id = useId();
  const [draft, setDraft] = useState<string | null>(null);
  const text = draft ?? String(value);
  const parsed = Number(text);
  const invalid =
    text.trim() === '' ||
    !Number.isInteger(parsed) ||
    parsed < min ||
    parsed > max;
  return (
    <Row label={label} note={note} htmlFor={id}>
      <span className="flex items-baseline gap-2 text-[12.5px] text-ink-3">
        <input
          id={id}
          type="number"
          inputMode="numeric"
          min={min}
          max={max}
          step={1}
          value={text}
          aria-invalid={invalid || undefined}
          className={cn('field w-24 text-right', invalid && 'border-bad')}
          onChange={(event) => {
            const next = event.target.value;
            setDraft(next);
            const number = Number(next);
            if (
              next.trim() !== '' &&
              Number.isInteger(number) &&
              number >= min &&
              number <= max
            )
              onChange(number);
          }}
          onBlur={() => setDraft(null)}
        />
        {unit}
      </span>
    </Row>
  );
}

/** Comma-separated minutes, saved when the field loses focus or on Enter. */
function StepsField({
  label,
  note,
  value,
  onChange,
}: {
  label: string;
  note: ReactNode;
  value: number[];
  onChange: (value: number[]) => void;
}) {
  const id = useId();
  const errorId = useId();
  const [draft, setDraft] = useState<string | null>(null);
  const [error, setError] = useState('');
  const commit = () => {
    if (draft === null) return;
    const parts = draft
      .split(/[,\s]+/)
      .map((part) => part.trim())
      .filter(Boolean);
    const minutes = parts.map(Number);
    if (
      parts.length > 10 ||
      minutes.some((m) => !Number.isFinite(m) || m < 1 || m > 1440)
    ) {
      setError('Use up to 10 numbers of minutes between 1 and 1440.');
      return;
    }
    setError('');
    setDraft(null);
    onChange(minutes);
  };
  return (
    <div>
      <Row label={label} note={note} htmlFor={id}>
        <span className="flex items-baseline gap-2 text-[12.5px] text-ink-3">
          <input
            id={id}
            type="text"
            inputMode="numeric"
            spellCheck={false}
            value={draft ?? value.join(', ')}
            placeholder="none"
            aria-invalid={error ? true : undefined}
            aria-describedby={error ? errorId : undefined}
            className={cn('field w-32 text-right', error && 'border-bad')}
            onChange={(event) => setDraft(event.target.value)}
            onBlur={commit}
            onKeyDown={(event) => {
              if (event.key === 'Enter') commit();
            }}
          />
          min
        </span>
      </Row>
      {error && (
        <p id={errorId} role="alert" className="-mt-1 pb-2 text-[12.5px] text-bad">
          {error}
        </p>
      )}
    </div>
  );
}

function Select<T extends string>({
  label,
  note,
  value,
  options,
  onChange,
}: {
  label: string;
  note?: ReactNode;
  value: T;
  options: ReadonlyArray<{ value: T; label: string }>;
  onChange: (value: T) => void;
}) {
  const id = useId();
  return (
    <Row label={label} note={note} htmlFor={id}>
      <select
        id={id}
        className="field w-auto pr-8"
        value={value}
        onChange={(event) => onChange(event.target.value as T)}
      >
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </Row>
  );
}

/** A saved custom session: rename in place, or delete. */
function PresetRow({
  preset,
  courses,
  onRename,
  onDelete,
}: {
  preset: StudyPrefs['presets'][number];
  courses: StudyPrefsCourse[];
  onRename: (name: string) => void;
  onDelete: () => void;
}) {
  const id = useId();
  const [draft, setDraft] = useState<string | null>(null);
  const commit = () => {
    const name = draft?.trim();
    setDraft(null);
    if (name && name !== preset.name) onRename(name);
  };
  const codes = preset.cids.map(
    (cid) => courses.find((course) => course.id === cid)?.code ?? cid,
  );
  const summary = [
    codes.length ? codes.join(', ') : 'All courses',
    PICK_LABEL[preset.pick] +
      (preset.pick === 'ahead' ? ` ${preset.aheadDays} days` : ''),
    preset.weeks ? `weeks ${preset.weeks[0]}–${preset.weeks[1]}` : null,
    preset.kinds.length === ITEM_KINDS.length
      ? 'every kind'
      : preset.kinds.map((kind) => KIND_LABEL[kind]).join(', ') || 'no kinds',
    preset.limit ? `up to ${preset.limit}` : null,
    preset.order === 'week' ? 'in week order' : 'mixed',
    preset.reschedule ? null : 'practice only',
  ]
    .filter(Boolean)
    .join(' · ');
  return (
    <li className="flex flex-wrap items-center gap-x-3 gap-y-1 border-t border-rule py-2.5">
      <label htmlFor={id} className="sr">
        Name of saved session {preset.name}
      </label>
      <input
        id={id}
        className="field max-w-[16rem] flex-1 basis-40"
        value={draft ?? preset.name}
        maxLength={80}
        onChange={(event) => setDraft(event.target.value)}
        onBlur={commit}
        onKeyDown={(event) => {
          if (event.key === 'Enter') commit();
          if (event.key === 'Escape') setDraft(null);
        }}
      />
      <button type="button" className="pill pill-sm" onClick={onDelete}>
        Delete
      </button>
      <span className="w-full text-[12.5px] text-ink-3">{summary}</span>
    </li>
  );
}

/** One course's options: Daily review, Notes mode, week tabs, and source overrides. */
function CourseSettings({
  course,
  prefs,
  update,
}: {
  course: StudyPrefsCourse;
  prefs: CoursePrefs;
  update: (mutate: (draft: CoursePrefs) => void) => void;
}) {
  const visible = course.tabs.filter(
    (tab) => !prefs.hiddenTabs.includes(tab.id),
  );
  const lecture = course.tabs.find((tab) => tab.id === 'lecture');
  return (
    <Group
      title={`${course.code}: ${course.name}`}
      className="border-t border-rule pt-4 pb-2"
    >
      <Toggle
        label="Include in Daily review"
        description="Its due and new items join the Daily review queue and the rail count."
        checked={prefs.review}
        onChange={(checked) =>
          update((draft) => {
            draft.review = checked;
          })
        }
      />
      <div className="py-2">
        <Segmented
          label="Notes mode"
          value={prefs.notes}
          options={[
            { value: 'key', label: 'Key ideas' },
            { value: 'full', label: 'Full notes' },
          ]}
          onChange={(value) =>
            update((draft) => {
              draft.notes = value;
            })
          }
        />
        <p className="mt-1.5 text-[12.5px] text-ink-3">
          Key ideas shows the short version of each week&rsquo;s notes first;
          Full notes opens the complete text.
        </p>
      </div>
      <Select
        label="Default week tab"
        note="The tab a week opens on when no tab is picked."
        value={prefs.defaultTab ?? ''}
        options={[
          { value: '', label: `${lecture?.label ?? 'Lecture'} (default)` },
          ...visible
            .filter((tab) => tab.id !== 'lecture')
            .map((tab) => ({ value: tab.id, label: tab.label })),
        ]}
        onChange={(value) =>
          update((draft) => {
            draft.defaultTab = value || null;
          })
        }
      />
      <fieldset className="py-2">
        <legend className="text-[13.5px] text-ink">Hidden week tabs</legend>
        <p className="mt-0.5 text-[12.5px] text-ink-3">
          Hidden tabs leave the week page; their items still count for review.
        </p>
        <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1.5">
          {course.tabs.map((tab) => {
            const hidden = prefs.hiddenTabs.includes(tab.id);
            const last = !hidden && visible.length === 1;
            return (
              <label
                key={tab.id}
                className={cn(
                  'flex cursor-pointer items-center gap-2 text-[0.8125rem] text-ink-2',
                  last && 'cursor-default opacity-50',
                )}
              >
                <input
                  type="checkbox"
                  className="accent-[var(--accent-ink)]"
                  checked={hidden}
                  disabled={last}
                  onChange={(event) =>
                    update((draft) => {
                      draft.hiddenTabs = event.target.checked
                        ? [...draft.hiddenTabs, tab.id]
                        : draft.hiddenTabs.filter((id) => id !== tab.id);
                      if (event.target.checked && draft.defaultTab === tab.id)
                        draft.defaultTab = null;
                    })
                  }
                />
                {tab.label}
              </label>
            );
          })}
        </div>
      </fieldset>
      <fieldset className="py-2">
        <legend className="text-[13.5px] text-ink">Review sources</legend>
        <p className="mt-0.5 text-[12.5px] text-ink-3">
          Override the sources above for this course only.
        </p>
        <div className="mt-2 grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-4 gap-y-1.5">
          {ITEM_KINDS.map((kind) => (
            <SourceOverride
              key={kind}
              kind={kind}
              value={prefs.sources?.[kind]}
              onChange={(value) =>
                update((draft) => {
                  const sources = { ...draft.sources };
                  if (value === undefined) delete sources[kind];
                  else sources[kind] = value;
                  draft.sources = Object.keys(sources).length
                    ? sources
                    : undefined;
                })
              }
            />
          ))}
        </div>
      </fieldset>
    </Group>
  );
}

function SourceOverride({
  kind,
  value,
  onChange,
}: {
  kind: ItemKind;
  value: boolean | undefined;
  onChange: (value: boolean | undefined) => void;
}) {
  const id = useId();
  return (
    <>
      <label htmlFor={id} className="text-[0.8125rem] text-ink-2">
        {KIND_LABEL[kind]}
      </label>
      <select
        id={id}
        className="field h-8 min-h-0 w-auto py-0 pr-8 text-[0.8125rem]"
        value={value === undefined ? '' : value ? 'on' : 'off'}
        onChange={(event) =>
          onChange(
            event.target.value === '' ? undefined : event.target.value === 'on',
          )
        }
      >
        <option value="">Same as above</option>
        <option value="on">On</option>
        <option value="off">Off</option>
      </select>
    </>
  );
}

/**
 * Settings → Study: spaced-repetition scheduling, daily limits, review
 * sources, per-course options, saved custom sessions, and the focus timer.
 * Every change applies at once and saves through /api/study/prefs.
 */
export function StudyPrefsSettings({
  initial,
  courses,
}: {
  initial: StudyPrefs;
  courses: StudyPrefsCourse[];
}) {
  const [prefs, updatePrefs] = useStudyPrefs(initial);
  const headingId = useId();
  const [restored, setRestored] = useState(false);

  const set = (mutate: (draft: StudyPrefs) => void) => {
    setRestored(false);
    updatePrefs(mutate);
  };
  const updateCourse =
    (cid: string) => (mutate: (draft: CoursePrefs) => void) =>
      set((draft) => {
        const course = coursePrefs(draft, cid);
        mutate(course);
        draft.courses[cid] = course;
      });

  return (
    <section
      id="study"
      aria-labelledby={headingId}
      className="scroll-mt-6 border-t border-rule pt-7 pb-12"
    >
      <div className="flex flex-wrap items-start justify-between gap-x-6 gap-y-3">
        <div className="min-w-0">
          <h2 id={headingId} className="display text-[1.375rem]">
            Study
          </h2>
          <p className="mt-1 max-w-[60ch] text-[0.84375rem] text-ink-3">
            How flashcard review is scheduled, what goes into it, how week
            pages open, and the focus timer. Changes save as you make them.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Link href="/study/daily" className="pill">
            Daily review
          </Link>
          <button
            type="button"
            className="pill"
            onClick={() => {
              if (
                !window.confirm(
                  'Restore every study setting to its default? Saved sessions are kept.',
                )
              )
                return;
              updatePrefs((draft) => {
                const presets = draft.presets;
                Object.assign(draft, structuredClone(DEFAULT_STUDY_PREFS), {
                  presets,
                });
              });
              setRestored(true);
            }}
          >
            Restore defaults
          </button>
        </div>
      </div>
      <p aria-live="polite" className="mt-2 min-h-[1.25rem] text-[0.8125rem] text-good">
        {restored ? 'Study settings restored to their defaults.' : ''}
      </p>

      <div className="mt-3 flex flex-col gap-8">
        <Group
          title="Scheduling"
          hint="Spaced repetition (FSRS) brings each item back just before you would forget it."
        >
          <div>
            <Range
              label="Retention target"
              value={prefs.retention}
              min={0.7}
              max={0.97}
              step={0.01}
              format={(value) => `${Math.round(value * 100)}%`}
              onChange={(value) =>
                set((draft) => {
                  draft.retention = value;
                })
              }
            />
            <p className="-mt-1 pb-2 text-[12.5px] text-ink-3">
              The chance you still remember an item when it comes back; higher
              = more reviews.
            </p>
          </div>
          <NumberField
            label="Maximum interval"
            note="The longest gap before an item comes back."
            value={prefs.maxInterval}
            min={1}
            max={36500}
            unit="days"
            onChange={(value) =>
              set((draft) => {
                draft.maxInterval = value;
              })
            }
          />
          <StepsField
            label="Learning steps"
            note="Short repeats for a new item before it moves to days, e.g. 1, 10."
            value={prefs.learningSteps}
            onChange={(value) =>
              set((draft) => {
                draft.learningSteps = value;
              })
            }
          />
          <StepsField
            label="Relearning steps"
            note="Short repeats after you forget an item. Empty = straight back to days."
            value={prefs.relearningSteps}
            onChange={(value) =>
              set((draft) => {
                draft.relearningSteps = value;
              })
            }
          />
        </Group>

        <Group title="Daily limits">
          <NumberField
            label="New items per course per day"
            note="How many unseen items each course introduces a day."
            value={prefs.newPerDay}
            min={0}
            max={9999}
            onChange={(value) =>
              set((draft) => {
                draft.newPerDay = value;
              })
            }
          />
          <NumberField
            label="Max reviews per course per day"
            note="Due reviews beyond this wait for tomorrow, most forgotten first."
            value={prefs.reviewsPerDay}
            min={0}
            max={99999}
            onChange={(value) =>
              set((draft) => {
                draft.reviewsPerDay = value;
              })
            }
          />
          <Select
            label="New day starts at"
            note="Reviews after midnight still count for the day before until this hour."
            value={String(prefs.dayStartsAt)}
            options={Array.from({ length: 24 }, (_, hour) => ({
              value: String(hour),
              label: `${hour % 12 || 12} ${hour < 12 ? 'AM' : 'PM'}`,
            }))}
            onChange={(value) =>
              set((draft) => {
                draft.dayStartsAt = Number(value);
              })
            }
          />
          <Select
            label="New item order"
            note="Which unseen items come first once a week has started."
            value={prefs.newOrder}
            options={[
              { value: 'current-first', label: 'Current week first' },
              { value: 'oldest-first', label: 'Oldest week first' },
              { value: 'random', label: 'Random' },
            ]}
            onChange={(value) =>
              set((draft) => {
                draft.newOrder = value;
              })
            }
          />
        </Group>

        <Group title="Sessions">
          <Toggle
            label="Mix topics (interleave)"
            description="Shuffle courses, weeks, and item kinds together; mixing helps you tell problems apart."
            checked={prefs.interleave}
            onChange={(checked) =>
              set((draft) => {
                draft.interleave = checked;
              })
            }
          />
          <Toggle
            label="Shuffle answer choices"
            description="Reorder multiple-choice options in review so you recall the answer, not its position."
            checked={prefs.shuffleChoices}
            onChange={(checked) =>
              set((draft) => {
                draft.shuffleChoices = checked;
              })
            }
          />
          <Toggle
            label="Show next-review times on buttons"
            description="Again, Hard, Good, and Easy show when the item would come back."
            checked={prefs.showIntervals}
            onChange={(checked) =>
              set((draft) => {
                draft.showIntervals = checked;
              })
            }
          />
        </Group>

        <Group
          title="Sources"
          hint="Which kinds of items go into review, in every course unless a course overrides it."
        >
          {ITEM_KINDS.map((kind) => (
            <Toggle
              key={kind}
              label={KIND_LABEL[kind]}
              description={KIND_NOTE[kind]}
              checked={prefs.sources[kind]}
              onChange={(checked) =>
                set((draft) => {
                  draft.sources[kind] = checked;
                })
              }
            />
          ))}
        </Group>

        <Group
          title="Courses"
          hint="Daily review, Notes mode, and week tabs for each Study Hub course."
        >
          {courses.length ? (
            <div className="flex flex-col gap-4">
              {courses.map((course) => (
                <CourseSettings
                  key={course.id}
                  course={course}
                  prefs={coursePrefs(prefs, course.id)}
                  update={updateCourse(course.id)}
                />
              ))}
            </div>
          ) : (
            <p className="text-[0.8125rem] text-ink-3">
              Import a Study Hub above to set options per course.
            </p>
          )}
        </Group>

        <Group
          title="Saved sessions"
          hint="Custom sessions saved from the Daily review builder."
        >
          {prefs.presets.length ? (
            <ul className="border-b border-rule">
              {prefs.presets.map((preset) => (
                <PresetRow
                  key={preset.id}
                  preset={preset}
                  courses={courses}
                  onRename={(name) =>
                    set((draft) => {
                      const found = draft.presets.find(
                        (item) => item.id === preset.id,
                      );
                      if (found) found.name = name;
                    })
                  }
                  onDelete={() => {
                    if (!window.confirm(`Delete the saved session “${preset.name}”?`))
                      return;
                    set((draft) => {
                      draft.presets = draft.presets.filter(
                        (item) => item.id !== preset.id,
                      );
                    });
                  }}
                />
              ))}
            </ul>
          ) : (
            <p className="text-[0.8125rem] text-ink-3">
              None yet. Build a custom session on{' '}
              <Link
                href="/study/daily"
                className="underline decoration-rule-2 underline-offset-[3px] hover:decoration-ink"
              >
                Daily review
              </Link>{' '}
              and save it to reuse it here.
            </p>
          )}
        </Group>

        <div id="study-timer" className="scroll-mt-6">
          <Group
            title="Focus timer"
            hint="The timer in the sidebar: focus sessions with short breaks, and a long break every few sessions."
          >
            <NumberField
              label="Focus"
              value={prefs.timer.focus}
              min={1}
              max={180}
              unit="min"
              onChange={(value) =>
                set((draft) => {
                  draft.timer.focus = value;
                })
              }
            />
            <NumberField
              label="Short break"
              value={prefs.timer.short}
              min={1}
              max={60}
              unit="min"
              onChange={(value) =>
                set((draft) => {
                  draft.timer.short = value;
                })
              }
            />
            <NumberField
              label="Long break"
              value={prefs.timer.long}
              min={1}
              max={120}
              unit="min"
              onChange={(value) =>
                set((draft) => {
                  draft.timer.long = value;
                })
              }
            />
            <NumberField
              label="Long break every"
              note="Focus sessions before a long break."
              value={prefs.timer.longEvery}
              min={1}
              max={12}
              unit="sessions"
              onChange={(value) =>
                set((draft) => {
                  draft.timer.longEvery = value;
                })
              }
            />
            <Toggle
              label="Auto-start breaks"
              description="A break starts by itself when a focus session ends."
              checked={prefs.timer.autoBreak}
              onChange={(checked) =>
                set((draft) => {
                  draft.timer.autoBreak = checked;
                })
              }
            />
            <Toggle
              label="Sound"
              description="A short chime when a session or break ends."
              checked={prefs.timer.sound}
              onChange={(checked) =>
                set((draft) => {
                  draft.timer.sound = checked;
                })
              }
            />
          </Group>
        </div>
      </div>
    </section>
  );
}
