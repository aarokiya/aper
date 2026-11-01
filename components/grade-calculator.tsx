'use client';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { CourseColorDot } from '@/components/course-color-dot';
import { LetterPill, LetterTile, ROW_TINT } from '@/components/grades/letter';
import {
  describeScoring,
  describeSources,
  sourceNames,
  type SourceNames,
} from '@/components/grades/policy-text';
import { SyllabusPanel } from '@/components/grades/syllabus-panel';
import type { CourseColorSource } from '@/lib/course-colors';
import {
  arrangeCourse,
  categoryKey,
  categoryResult,
  courseCategories,
  courseGrade,
  creditsFor,
  cutoffsFor,
  gpa,
  LEAVE_OUT,
  letterFor,
  neededOnRemaining,
  type CalculatorState,
  type GradeCategory,
  type GradeCourse,
  type GradeItem,
} from '@/lib/grades/calculator';
import type { PolicyComponent } from '@/lib/grades/policy';
import { cn } from '@/lib/utils';

type SetState = React.Dispatch<React.SetStateAction<CalculatorState>>;

const SOURCE_LABEL: Record<GradeItem['source'], string> = {
  canvas: 'Canvas',
  gradescope: 'Gradescope',
  both: 'Both',
};
const SOURCE_TITLE: Record<GradeItem['source'], string> = {
  canvas: 'Only on Canvas',
  gradescope: 'Only on Gradescope',
  both: 'On Canvas and Gradescope',
};
const numberField =
  'field numeral h-8 min-h-0 px-2 py-0 text-right text-[0.875rem]';

const formatPercent = (value: number | null) =>
  value == null ? '—' : `${value.toFixed(1)}%`;
const points = (value: number) => String(+value.toFixed(2));

/** Reads a number input; blank or invalid clears the override. */
function inputNumber(value: string) {
  const parsed = Number(value);
  return value.trim() === '' || !Number.isFinite(parsed) ? null : parsed;
}

function withEntry<T>(record: Record<string, T>, key: string, value: T | null) {
  const next = { ...record };
  if (value == null) delete next[key];
  else next[key] = value;
  return next;
}

const isBucket = (category: GradeCategory) => category.id === 'gradescope';

export function GradeCalculator({
  courses,
  initialState,
  syncedAt,
  colorCourses,
}: {
  courses: GradeCourse[];
  initialState: CalculatorState;
  syncedAt: string | null;
  colorCourses: CourseColorSource[];
}) {
  const router = useRouter();
  const [state, setState] = useState(initialState);
  const [resetVersion, setResetVersion] = useState(0);
  const [confirmClear, setConfirmClear] = useState(false);
  const [saveError, setSaveError] = useState('');
  const loaded = useRef(false);

  useEffect(() => {
    if (!loaded.current) {
      loaded.current = true;
      return;
    }
    const timer = setTimeout(() => {
      fetch('/api/grades/calculator', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(state),
      })
        .then((response) =>
          setSaveError(
            response.ok ? '' : 'Changes could not be saved. Try again.',
          ),
        )
        .catch(() =>
          setSaveError(
            'Changes could not be saved. Check that _aper is running.',
          ),
        );
    }, 300);
    return () => clearTimeout(timer);
  }, [state]);

  useEffect(() => {
    if (!confirmClear) return;
    const timer = setTimeout(() => setConfirmClear(false), 4000);
    return () => clearTimeout(timer);
  }, [confirmClear]);

  const clearWhatIfs = () => {
    if (!confirmClear) {
      setConfirmClear(true);
      return;
    }
    setState((current) => ({ ...current, whatIf: {}, categoryWhatIf: {} }));
    setResetVersion((version) => version + 1);
    setConfirmClear(false);
  };

  if (!courses.length)
    return (
      <div className="max-w-[60ch] border-t border-rule pt-6">
        <p className="font-serif text-[17px] leading-relaxed text-ink-2">
          No graded courses yet.
        </p>
        <p className="mt-1 text-[13px] text-ink-3">
          Sync Canvas and Gradescope with Sync now in the sidebar to load
          categories and scores.
        </p>
      </div>
    );

  const gpaNow = gpa(courses, 'current', state);
  const gpaProjected = gpa(courses, 'projected', state);

  return (
    <div>
      <div className="max-w-[64ch]">
        <p className="font-serif text-[17px] leading-[1.6] text-ink-2">
          Each assignment counts its Canvas score when Canvas has one and its
          Gradescope score otherwise, scaled to Canvas points; work posted only
          on Gradescope counts too.
        </p>
        <p className="mt-2 text-[13px] text-ink-3">
          {syncedAt ? `Synced ${syncedAt}. ` : 'Not synced yet. '}
          Type a what-if into any ungraded item; blanks use the assumption
          below.
        </p>
      </div>

      <div className="mt-8 flex flex-wrap items-end gap-x-14 gap-y-6 border-y border-rule py-6">
        <Figure label="Current GPA" size="lg">
          {gpaNow == null ? '—' : gpaNow.toFixed(2)}
        </Figure>
        <Figure label="Projected GPA" size="lg">
          {gpaProjected == null ? '—' : gpaProjected.toFixed(2)}
        </Figure>
        <label className="grid gap-1.5">
          <span className="section-label">Assume on ungraded work</span>
          <span className="flex items-center gap-3">
            <input
              type="range"
              min={50}
              max={100}
              step={1}
              value={state.assume}
              aria-valuetext={`${state.assume} percent`}
              onChange={(event) =>
                setState((current) => ({
                  ...current,
                  assume: Number(event.target.value),
                }))
              }
              className="h-5 w-44 max-w-[52vw] cursor-pointer accent-[var(--accent-ink)]"
            />
            <span className="numeral w-12 text-[22px] leading-none">
              {state.assume}%
            </span>
          </span>
        </label>
        <div className="grid gap-1.5">
          <button
            type="button"
            onClick={clearWhatIfs}
            className={cn(
              'textlink justify-self-start',
              confirmClear && 'text-bad hover:text-bad',
            )}
          >
            {confirmClear
              ? 'Click again to clear every what-if'
              : 'Clear what-ifs'}
          </button>
          <span
            aria-live="polite"
            className="text-[12px] text-bad empty:hidden"
          >
            {saveError}
          </span>
        </div>
      </div>

      <div key={resetVersion} className="mt-8">
        {courses.map((course) => (
          <CourseRow
            key={course.id}
            course={course}
            state={state}
            setState={setState}
            colorCourses={colorCourses}
            onPolicySaved={() => router.refresh()}
          />
        ))}
      </div>

      <footer className="mt-12 grid max-w-[68ch] gap-2 text-[12.5px] leading-relaxed text-ink-3">
        <p>
          A class graded by its syllabus uses the syllabus&rsquo;s weights,
          drops, ranked exams, point caps, letter scale, and credit hours;
          otherwise Canvas&rsquo;s groups count, with cutoffs of 90, 80, 70
          and 60 and 3 credit hours until you change them. GPA uses A = 4, B =
          3, C = 2, D = 1, F = 0, weighted by credit hours.
        </p>
        <p>
          Gradescope scores are matched to Canvas assignments by title.
          Assignments only on Gradescope go to the category their name suggests;
          pick another with Counts toward. What-ifs, syllabus rules, and choices
          stay in the local database and are never sent to Canvas or
          Gradescope.
        </p>
      </footer>
    </div>
  );
}

function Figure({
  label,
  size,
  children,
  detail,
}: {
  label: string;
  size: 'lg' | 'md';
  children: React.ReactNode;
  detail?: React.ReactNode;
}) {
  return (
    <div className="grid content-start gap-1">
      <span className="section-label">{label}</span>
      <span
        className={cn(
          'numeral flex flex-wrap items-center gap-x-2.5 gap-y-1 leading-none text-ink',
          size === 'lg' ? 'text-[34px]' : 'text-[28px]',
        )}
      >
        {children}
      </span>
      {detail}
    </div>
  );
}

function CourseRow({
  course,
  state,
  setState,
  colorCourses,
  onPolicySaved,
}: {
  course: GradeCourse;
  state: CalculatorState;
  setState: SetState;
  colorCourses: CourseColorSource[];
  onPolicySaved: () => void;
}) {
  const id = String(course.id);
  const current = courseGrade(course, 'current', state);
  const projected = courseGrade(course, 'projected', state);
  const cutoffs = cutoffsFor(course, state);
  const credits = creditsFor(course, state);
  const currentLetter = letterFor(current, cutoffs);
  const { policy } = course;
  const groups = arrangeCourse(course, state).categories;
  const { categories, leftOut, uncounted: notCounted } = courseCategories(
    course,
    state,
  );
  const counted = policy
    ? categories
    : categories.filter((category) =>
        course.weighted ? category.weight > 0 : category.items.length > 0,
      );
  const pending =
    !policy && course.weighted
      ? categories.find(
          (category) => isBucket(category) && category.items.length,
        )
      : undefined;
  const uncounted = policy
    ? []
    : categories.filter(
        (category) =>
          course.weighted &&
          category.weight <= 0 &&
          !isBucket(category) &&
          category.items.length > 0,
      );
  const items = groups.flatMap((category) => category.items);
  const filled = items.filter(
    (item) => item.source === 'both' && item.scoreSource === 'gradescope',
  ).length;
  const disagree = items.filter(disagrees).length;
  const gradescopeOnly =
    items.filter((item) => item.placement).length + leftOut.length;
  const placementOptions = optionsFor(course, groups);
  const names = sourceNames(course);
  const notes = [
    course.origin === 'gradescope'
      ? 'This class is only on Gradescope, so its grade pools Gradescope points.'
      : course.weighted || policy
        ? null
        : 'Canvas grades this course by total points, so categories carry no weights.',
    filled
      ? `${filled} ${filled === 1 ? 'score comes' : 'scores come'} from Gradescope because Canvas hasn't posted ${filled === 1 ? 'it' : 'them'} yet.`
      : null,
    disagree
      ? `Canvas and Gradescope disagree on ${disagree} ${disagree === 1 ? 'assignment' : 'assignments'}; Canvas's score counts.`
      : null,
    gradescopeOnly && course.origin === 'canvas'
      ? `${gradescopeOnly} ${gradescopeOnly === 1 ? 'assignment is' : 'assignments are'} only on Gradescope; Counts toward under each one sets its category.`
      : null,
    (course.weighted || policy) &&
    counted.some((category) => category.items.length === 0)
      ? `${policy ? 'Parts' : 'Categories'} with nothing posted yet use the assumption, or a what-if percentage you enter.`
      : null,
  ].filter((note): note is string => Boolean(note));

  return (
    <details
      open={state.open[id] ?? false}
      onToggle={(event) => {
        const open = event.currentTarget.open;
        setState((value) =>
          value.open[id] === open
            ? value
            : { ...value, open: { ...value.open, [id]: open } },
        );
      }}
      data-course-id={course.id}
      data-letter={currentLetter ?? undefined}
      className="group mb-4 overflow-hidden rounded-2xl border border-rule bg-paper"
    >
      <summary
        className={cn(
          'relative grid cursor-pointer list-none grid-cols-2 gap-x-6 gap-y-4 border-l-[6px] py-5 pr-12 pl-4 sm:pl-5 md:grid-cols-[auto_minmax(0,1.4fr)_minmax(0,1fr)_minmax(0,1fr)_minmax(0,1.15fr)] md:items-center md:gap-x-7 [&::-webkit-details-marker]:hidden',
          currentLetter ? ROW_TINT[currentLetter] : 'border-l-rule-2',
        )}
      >
        <div className="col-span-2 flex min-w-0 items-center gap-4 md:contents">
          <LetterTile letter={currentLetter} label={`${course.code} is at`} />
          <div className="min-w-0">
            <span className="flex items-baseline gap-2">
              <CourseColorDot
                courseId={course.id}
                courses={colorCourses}
                className="size-2 -translate-y-[3px]"
              />
              <span className="display text-[22px] text-ink">
                {course.code}
              </span>
            </span>
            <span className="mt-1 block truncate text-[13px] text-ink-3">
              {course.name}, {credits} {credits === 1 ? 'credit' : 'credits'}
            </span>
            <span className="mt-1.5 block text-[12px] text-ink-3">
              {policy ? 'Graded by the syllabus' : 'Graded by Canvas’s groups'}
            </span>
          </div>
        </div>
        <Figure
          label="Current"
          size="md"
          detail={
            course.canvasScore != null &&
            current != null &&
            Math.abs(course.canvasScore - current) >= 0.05 ? (
              <span className="text-[12px] text-ink-3">
                Canvas shows {course.canvasScore.toFixed(1)}%
              </span>
            ) : null
          }
        >
          <span>{formatPercent(current)}</span>
        </Figure>
        <Figure label="Projected" size="md">
          <span>{formatPercent(projected)}</span>
          <LetterPill letter={letterFor(projected, cutoffs)} />
        </Figure>
        <div className="col-span-2 grid content-start gap-1 md:col-span-1">
          <span className="section-label">To finish with</span>
          {(['A', 'B'] as const).map((letter, index) => {
            const needed = neededOnRemaining(course, cutoffs[index], state);
            return (
              <span
                key={letter}
                className="flex items-baseline gap-2 text-[13px] text-ink-2"
              >
                <span className="w-3 font-medium text-ink">{letter}</span>
                {needed.state === 'locked' ? (
                  <span className="text-good">locked in</span>
                ) : needed.state === 'out' ? (
                  <span className="text-ink-3">out of reach</span>
                ) : needed.state === 'need' ? (
                  <span>
                    <span className="numeral text-[15px] text-ink">
                      {needed.percent.toFixed(1)}%
                    </span>{' '}
                    on the rest
                  </span>
                ) : (
                  <span className="text-ink-4">—</span>
                )}
              </span>
            );
          })}
        </div>
        <span
          aria-hidden="true"
          className="absolute top-5 right-4 font-serif text-[22px] leading-none text-ink-3"
        >
          <span className="group-open:hidden">+</span>
          <span className="hidden group-open:inline">−</span>
        </span>
      </summary>

      <div className="px-4 pb-10 sm:px-5">
        <SyllabusPanel course={course} onSaved={onPolicySaved} />

        <div className="mt-6 flex flex-wrap items-center gap-x-8 gap-y-3 text-[13px] text-ink-2">
          <label className="flex items-center gap-2.5">
            Credit hours
            <input
              key={credits}
              type="number"
              min={0}
              max={12}
              step={1}
              defaultValue={credits}
              onChange={(event) => {
                const value = inputNumber(event.target.value);
                setState((current) => ({
                  ...current,
                  credits: withEntry(current.credits, id, value),
                }));
              }}
              className={cn(numberField, 'w-14')}
              aria-label={`Credit hours for ${course.code}`}
            />
          </label>
          <fieldset
            key={cutoffs.join('/')}
            className="flex flex-wrap items-center gap-2"
          >
            <legend className="float-left mr-1">Cutoffs for A, B, C, D</legend>
            {cutoffs.map((value, index) => (
              <input
                key={index}
                type="number"
                min={0}
                max={100}
                defaultValue={value}
                onChange={(event) => {
                  const cutoff = Math.min(
                    100,
                    Math.max(0, inputNumber(event.target.value) ?? 0),
                  );
                  setState((current) => {
                    const next = [
                      ...cutoffsFor(course, current),
                    ] as typeof cutoffs;
                    next[index] = cutoff;
                    return {
                      ...current,
                      cutoffs: { ...current.cutoffs, [id]: next },
                    };
                  });
                }}
                className={cn(numberField, 'w-14')}
                aria-label={`${'ABCD'[index]} cutoff for ${course.code}`}
              />
            ))}
          </fieldset>
        </div>

        {notes.length > 0 && (
          <div className="mt-6 grid max-w-[68ch] gap-1 border-l-2 border-ink pl-4 text-[13px] leading-relaxed text-ink-2">
            {notes.map((note) => (
              <p key={note}>{note}</p>
            ))}
          </div>
        )}

        {counted.map((category, index) => (
          <CategoryBlock
            key={categoryKey(course.id, category)}
            course={course}
            category={category}
            state={state}
            setState={setState}
            placementOptions={placementOptions}
            component={policy?.components[index]}
            names={names}
          />
        ))}

        {pending && (
          <ItemGroup
            title="Only on Gradescope"
            description="Not counted yet. Choose the category each one counts toward."
            items={pending.items}
            course={course}
            state={state}
            setState={setState}
            placementOptions={placementOptions}
          />
        )}

        {leftOut.length > 0 && (
          <ItemGroup
            title="Left out"
            description="Gradescope assignments you chose not to count."
            items={leftOut}
            course={course}
            state={state}
            setState={setState}
            placementOptions={placementOptions}
          />
        )}

        {(uncounted.length > 0 || notCounted.length > 0) && (
          <details className="group/uncounted mt-8 border-t border-rule pt-3">
            <summary className="cursor-pointer list-none text-[13px] text-ink-3 hover:text-ink [&::-webkit-details-marker]:hidden">
              <span
                aria-hidden="true"
                className="mr-2 inline-block w-3 group-open/uncounted:hidden"
              >
                +
              </span>
              <span
                aria-hidden="true"
                className="mr-2 hidden w-3 group-open/uncounted:inline-block"
              >
                −
              </span>
              {policy
                ? `Not counted by the syllabus: ${notCounted.length} ${notCounted.length === 1 ? 'assignment' : 'assignments'}`
                : `Not counted toward the grade: ${uncounted.map((category) => category.name).join(', ')}`}
            </summary>
            {policy ? (
              <ul className="mt-2 grid lg:grid-cols-2 lg:gap-x-12">
                {notCounted.map((item) => (
                  <ItemRow
                    key={item.id}
                    course={course}
                    item={item}
                    state={state}
                    setState={setState}
                    dropped={false}
                    readOnly
                    placementOptions={placementOptions}
                  />
                ))}
              </ul>
            ) : (
              uncounted.map((category) => (
                <CategoryBlock
                  key={categoryKey(course.id, category)}
                  course={course}
                  category={category}
                  state={state}
                  setState={setState}
                  placementOptions={placementOptions}
                  readOnly
                />
              ))
            )}
          </details>
        )}
      </div>
    </details>
  );
}

type PlacementOption = { value: string; label: string };

/** Where a Gradescope-only item may count: categories that carry grade, the Gradescope bucket, or nowhere. */
function optionsFor(
  course: GradeCourse,
  categories: GradeCategory[],
): PlacementOption[] {
  const options = categories
    .filter(
      (category) =>
        !isBucket(category) &&
        (course.weighted ? category.weight > 0 : category.items.length > 0),
    )
    .map((category) => ({
      value: categoryKey(course.id, category),
      label: course.weighted
        ? `${category.name} (${+category.weight.toFixed(2)}%)`
        : category.name,
    }));
  // In a weighted course the bucket counts nothing, so it is offered only as
  // the starting value of an item no category matched (see PlacementSelect).
  if (!course.weighted && categories.some(isBucket))
    options.push({
      value: categoryKey(course.id, { id: 'gradescope' }),
      label: 'Gradescope (points only)',
    });
  options.push({ value: LEAVE_OUT, label: 'Leave it out' });
  return options;
}

function disagrees(item: GradeItem) {
  const gs = item.gradescope;
  if (
    item.canvasScore == null ||
    gs?.score == null ||
    !gs.possible ||
    item.possible <= 0
  )
    return false;
  return (
    Math.abs((gs.score / gs.possible) * item.possible - item.canvasScore) >=
    0.01
  );
}

/** One plain line on where the counted score came from, when that isn't obvious. */
function provenance(item: GradeItem) {
  const gs = item.gradescope;
  if (disagrees(item))
    return `Gradescope has ${points(gs!.score!)}/${points(gs!.possible!)}; Canvas's ${points(item.canvasScore!)}/${points(item.possible)} counts.`;
  if (
    item.source === 'both' &&
    item.scoreSource === 'gradescope' &&
    gs?.score != null &&
    gs.possible
  ) {
    const scaled = Math.abs(gs.possible - item.possible) >= 0.01;
    return scaled
      ? `From Gradescope, ${points(gs.score)}/${points(gs.possible)} scaled to ${points(item.possible)} points. Canvas hasn't posted it.`
      : "From Gradescope. Canvas hasn't posted it.";
  }
  if (item.possibleEstimated)
    return `Gradescope hasn't posted points; ${points(item.possible)} is taken from similar work.`;
  if (item.source === 'gradescope' && item.possible <= 0)
    return "Gradescope hasn't posted points, so this isn't counted yet.";
  return null;
}

function CategoryBlock({
  course,
  category,
  state,
  setState,
  placementOptions,
  readOnly = false,
  component,
  names,
}: {
  course: GradeCourse;
  category: GradeCategory;
  state: CalculatorState;
  setState: SetState;
  placementOptions: PlacementOption[];
  readOnly?: boolean;
  /** set when the course is graded by its syllabus */
  component?: PolicyComponent;
  names?: SourceNames;
}) {
  const now = categoryResult(course, category, 'current', state);
  const projected = categoryResult(course, category, 'projected', state);
  const key = categoryKey(course.id, category);
  const drops = [
    category.dropLowest ? `drops the lowest ${category.dropLowest}` : null,
    category.dropHighest ? `drops the highest ${category.dropHighest}` : null,
  ].filter(Boolean);
  const categoryWhatIf = state.categoryWhatIf[key];
  const weightText = component
    ? `${+category.weight.toFixed(2)}% of the grade · ${describeScoring(component)}`
    : `${course.weighted ? `${+category.weight.toFixed(2)}% of the grade` : 'Counted by points'}${drops.length ? `, ${drops.join(' and ')}` : ''}`;
  const rule = category.rule;
  // Ranked parts: which rank (and share of the grade) each item lands in now.
  const rankTags = new Map<number, string>();
  if (rule?.kind === 'ranked')
    category.items
      .flatMap((item) => {
        const value =
          item.score ??
          state.whatIf[String(item.id)] ??
          (state.assume / 100) * item.possible;
        return item.possible > 0
          ? [{ id: item.id, percent: value / item.possible }]
          : [];
      })
      .sort((a, b) => b.percent - a.percent)
      .forEach((row, index) =>
        rankTags.set(
          row.id,
          index < rule.weights.length
            ? `counts ${+rule.weights[index].toFixed(2)}%`
            : 'not counted',
        ),
      );
  const itemList = (
    <ul className="mt-1 grid lg:grid-cols-2 lg:gap-x-12">
      {category.items.map((item) => (
        <ItemRow
          key={item.id}
          course={course}
          item={item}
          state={state}
          setState={setState}
          dropped={!readOnly && projected.dropped.has(item.id)}
          readOnly={readOnly}
          placementOptions={placementOptions}
          tag={rankTags.get(item.id)}
        />
      ))}
    </ul>
  );

  return (
    <section
      className="mt-9"
      data-category={category.name}
      aria-label={category.name}
    >
      <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1">
        <h3 className="text-[15px] font-medium text-ink">{category.name}</h3>
        <span className="text-[13px] text-ink-3">
          {readOnly ? 'Not counted' : weightText}
        </span>
        {!readOnly && (
          <span className="flex gap-4 text-[13px] text-ink-3 sm:ml-auto">
            <span>
              Now{' '}
              <span className="numeral text-[15px] text-ink">
                {formatPercent(now.percent)}
              </span>
            </span>
            <span>
              Projected{' '}
              <span className="numeral text-[15px] text-ink">
                {formatPercent(projected.percent)}
              </span>
            </span>
          </span>
        )}
      </div>
      {component && names && (
        <p
          className={cn(
            'mt-1 text-[12.5px]',
            component.sources.length ? 'text-ink-3' : 'text-bad',
          )}
        >
          {component.sources.length
            ? `Counts ${describeSources(component.sources, names)}`
            : 'No Canvas work counts toward this part yet; choose it with Edit rules.'}
          {component.quote && (
            <span className="text-ink-4"> · “{component.quote}”</span>
          )}
        </p>
      )}
      {rule?.kind === 'pool' && (
        <p className="mt-1 text-[12.5px] text-ink-3">
          <span className="numeral text-ink-2">{points(now.earned)}</span>{' '}
          points earned of{' '}
          <span className="numeral text-ink-2">{points(now.possible)}</span>{' '}
          available so far; full credit at {points(rule.cap)}.
        </p>
      )}
      {!readOnly && (
        <div className="mt-2.5 h-[2px] bg-rule" aria-hidden="true">
          <i
            className="block h-full bg-accent-ink transition-[width] duration-500 ease-out"
            style={{
              width: `${Math.max(0, Math.min(100, projected.percent ?? 0))}%`,
            }}
          />
        </div>
      )}
      {category.items.length === 0 ? (
        <div className="mt-1 flex items-center justify-between gap-4 border-b border-rule py-2.5 text-[14px]">
          <span className="text-ink-3">Nothing posted on Canvas yet</span>
          <span className="flex items-center gap-1.5 text-ink-3">
            <input
              type="number"
              min={0}
              max={200}
              step={0.5}
              placeholder={String(state.assume)}
              defaultValue={categoryWhatIf ?? ''}
              onChange={(event) => {
                const value = inputNumber(event.target.value);
                setState((current) => ({
                  ...current,
                  categoryWhatIf: withEntry(current.categoryWhatIf, key, value),
                }));
              }}
              className={cn(
                numberField,
                'w-[4.75rem]',
                categoryWhatIf != null && 'border-accent-ink',
              )}
              aria-label={`What-if percentage for ${category.name}`}
            />
            %
          </span>
        </div>
      ) : rule?.kind === 'pool' ? (
        <details className="group/pool mt-1 border-b border-rule py-2.5">
          <summary className="cursor-pointer list-none text-[13px] text-ink-3 hover:text-ink [&::-webkit-details-marker]:hidden">
            <span className="group-open/pool:hidden">Show</span>
            <span className="hidden group-open/pool:inline">Hide</span> the{' '}
            {category.items.length} assignments that earn these points
          </summary>
          {itemList}
        </details>
      ) : (
        itemList
      )}
    </section>
  );
}

function ItemGroup({
  title,
  description,
  items,
  course,
  state,
  setState,
  placementOptions,
}: {
  title: string;
  description: string;
  items: GradeItem[];
  course: GradeCourse;
  state: CalculatorState;
  setState: SetState;
  placementOptions: PlacementOption[];
}) {
  return (
    <section className="mt-9" aria-label={title}>
      <h3 className="text-[15px] font-medium text-ink">{title}</h3>
      <p className="mt-0.5 text-[13px] text-ink-3">{description}</p>
      <ul className="mt-2 grid border-t border-rule lg:grid-cols-2 lg:gap-x-12 lg:border-t-0">
        {items.map((item) => (
          <ItemRow
            key={item.id}
            course={course}
            item={item}
            state={state}
            setState={setState}
            dropped={false}
            readOnly
            placementOptions={placementOptions}
          />
        ))}
      </ul>
    </section>
  );
}

function ItemRow({
  course,
  item,
  state,
  setState,
  dropped,
  readOnly,
  placementOptions,
  tag,
}: {
  course: GradeCourse;
  item: GradeItem;
  state: CalculatorState;
  setState: SetState;
  dropped: boolean;
  readOnly: boolean;
  placementOptions: PlacementOption[];
  /** a ranked part's standing: "counts 25%" */
  tag?: string;
}) {
  const whatIf = state.whatIf[String(item.id)];
  const note = provenance(item);
  const possibleText = `${item.possibleEstimated ? '~' : ''}${points(item.possible)}`;
  const sourceTitle = disagrees(item)
    ? `${SOURCE_TITLE.both}; the scores differ`
    : SOURCE_TITLE[item.source];

  return (
    <li className="grid grid-cols-[minmax(0,1fr)_auto] items-baseline gap-x-4 border-b border-rule py-2.5">
      <div className="min-w-0">
        <div className="flex min-w-0 items-baseline gap-2">
          <Link
            href={`/assignments/${item.id}`}
            title={item.title}
            className={cn(
              'min-w-0 truncate text-[14px] text-ink underline-offset-[3px] hover:underline',
              dropped && 'text-ink-4 line-through',
            )}
          >
            {item.title}
          </Link>
          <span
            title={sourceTitle}
            className={cn(
              'shrink-0 text-[11.5px]',
              item.source === 'canvas' ? 'text-ink-4' : 'text-ink-3',
              disagrees(item) && 'text-bad',
            )}
          >
            <span className="sr">, </span>
            {SOURCE_LABEL[item.source]}
          </span>
          {dropped && (
            <span className="shrink-0 text-[11.5px] text-ink-4">dropped</span>
          )}
          {tag && !dropped && (
            <span className="shrink-0 rounded-full bg-wash px-1.5 text-[11.5px] text-ink-2">
              {tag}
            </span>
          )}
        </div>
        {note && (
          <p className="mt-0.5 text-[12px] leading-snug text-ink-3">{note}</p>
        )}
        {item.placement && (
          <PlacementSelect
            course={course}
            item={item}
            state={state}
            setState={setState}
            options={placementOptions}
          />
        )}
      </div>
      {item.score != null ? (
        <span className="numeral whitespace-nowrap text-[15px] text-ink">
          {points(item.score)}
          <span className="text-ink-3">/{possibleText}</span>
        </span>
      ) : readOnly || item.possible <= 0 ? (
        <span className="numeral whitespace-nowrap text-[15px] text-ink-4">
          —/{item.possible > 0 ? possibleText : '?'}
        </span>
      ) : (
        <span className="numeral flex items-center gap-1 whitespace-nowrap text-[15px] text-ink-3">
          <input
            type="number"
            min={0}
            step={0.5}
            placeholder={points((state.assume / 100) * item.possible)}
            defaultValue={whatIf ?? ''}
            onChange={(event) => {
              const value = inputNumber(event.target.value);
              setState((current) => ({
                ...current,
                whatIf: withEntry(current.whatIf, String(item.id), value),
              }));
            }}
            className={cn(
              numberField,
              'w-[4.75rem]',
              whatIf != null && 'border-accent-ink',
            )}
            aria-label={`What-if score for ${item.title}`}
          />
          /{possibleText}
        </span>
      )}
    </li>
  );
}

function PlacementSelect({
  course,
  item,
  state,
  setState,
  options,
}: {
  course: GradeCourse;
  item: GradeItem;
  state: CalculatorState;
  setState: SetState;
  options: PlacementOption[];
}) {
  const inferred = item.placement!.inferred;
  const id = String(item.id);
  const override = state.placement[id];
  const value =
    override != null && options.some((option) => option.value === override)
      ? override
      : inferred;
  // A weighted course's bucket is not a choice, only where an unmatched item starts.
  const choices = options.some((option) => option.value === inferred)
    ? options
    : [
        ...options.slice(0, -1),
        { value: inferred, label: 'Not counted yet' },
        ...options.slice(-1),
      ];
  return (
    <label className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-[12px] text-ink-3">
      Counts toward
      <span className="sr">
        {' '}
        for {item.title} in {course.code}
      </span>
      <select
        value={value}
        onChange={(event) => {
          const next = event.target.value;
          setState((current) => ({
            ...current,
            placement: withEntry(
              current.placement,
              id,
              next === inferred ? null : next,
            ),
          }));
        }}
        className={cn(
          'field h-7 min-h-0 w-auto max-w-full py-0 pr-7 pl-2 text-[12.5px]',
          value !== inferred && 'border-accent-ink',
        )}
      >
        {choices.map((option) => (
          <option key={option.value} value={option.value}>
            {`${option.label}${option.value === inferred && item.placement!.confident ? ' (suggested)' : ''}`}
          </option>
        ))}
      </select>
    </label>
  );
}
