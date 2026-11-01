'use client';

import type { Cutoffs, GradeCourse } from '@/lib/grades/calculator';
import type {
  GradePolicy,
  PolicyComponent,
  PolicyScoring,
  PolicySource,
} from '@/lib/grades/policy';
import { cn } from '@/lib/utils';
import { describeSource, sourceNames } from './policy-text';

const field = 'field h-8 min-h-0 px-2 py-0 text-[0.875rem]';
const numeric = cn(field, 'numeral w-[4.5rem] text-right');

const SCORING: Array<[PolicyScoring['kind'], string]> = [
  ['points', 'By points'],
  ['equal', 'Each counts equally'],
  ['ranked', 'Ranked (best counts most)'],
  ['pool', 'Points out of a total'],
];

/** Reads a number input; blank or invalid gives null. */
function numberValue(value: string) {
  const parsed = Number(value);
  return value.trim() === '' || !Number.isFinite(parsed) ? null : parsed;
}

function scoringFor(
  kind: PolicyScoring['kind'],
  component: PolicyComponent,
): PolicyScoring {
  if (kind === 'ranked')
    return {
      kind,
      weights:
        component.scoring.kind === 'ranked'
          ? component.scoring.weights
          : [component.weight],
    };
  if (kind === 'pool')
    return {
      kind,
      cap: component.scoring.kind === 'pool' ? component.scoring.cap : 100,
    };
  return { kind };
}

/**
 * Edits syllabus rules: each component's name, weight, how it is scored,
 * drops, and which Canvas groups or assignments feed it; plus the letter
 * scale and credit hours.
 */
export function PolicyEditor({
  course,
  draft,
  onChange,
}: {
  course: GradeCourse;
  draft: GradePolicy;
  onChange: (draft: GradePolicy) => void;
}) {
  const names = sourceNames(course);
  const groups = course.categories.filter(
    (category): category is typeof category & { id: number } =>
      typeof category.id === 'number',
  );
  const total = draft.components.reduce(
    (sum, component) => sum + component.weight,
    0,
  );
  const setComponent = (index: number, patch: Partial<PolicyComponent>) =>
    onChange({
      ...draft,
      components: draft.components.map((component, at) =>
        at === index ? { ...component, ...patch } : component,
      ),
    });
  const setSource = (
    index: number,
    sourceIndex: number,
    patch: Partial<PolicySource> | null,
  ) => {
    const sources = draft.components[index].sources.flatMap((source, at) =>
      at !== sourceIndex ? [source] : patch ? [{ ...source, ...patch }] : [],
    );
    setComponent(index, { sources });
  };
  const addComponent = () => {
    const keys = new Set(draft.components.map((component) => component.key));
    let n = draft.components.length + 1;
    while (keys.has(`part-${n}`)) n += 1;
    onChange({
      ...draft,
      components: [
        ...draft.components,
        {
          key: `part-${n}`,
          name: 'New part',
          weight: Math.max(0, +(100 - total).toFixed(2)),
          sources: [],
          scoring: { kind: 'points' },
          dropLowest: 0,
          quote: null,
        },
      ],
    });
  };

  return (
    <div className="grid gap-5">
      {draft.components.map((component, index) => (
        <fieldset
          key={component.key}
          className="grid gap-3 rounded-xl border border-rule bg-paper p-4"
        >
          <legend className="sr">{component.name}</legend>
          <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
            <label className="min-w-0 flex-1 basis-56">
              <span className="sr">Name</span>
              <input
                className={cn(field, 'w-full font-medium')}
                value={component.name}
                onChange={(event) =>
                  setComponent(index, { name: event.target.value })
                }
              />
            </label>
            <label className="flex items-center gap-1.5 text-[13px] text-ink-3">
              <span className="sr">Weight for {component.name}</span>
              <input
                type="number"
                min={0}
                max={100}
                step={0.5}
                className={numeric}
                value={component.weight}
                onChange={(event) =>
                  setComponent(index, {
                    weight: Math.min(
                      100,
                      Math.max(0, numberValue(event.target.value) ?? 0),
                    ),
                  })
                }
              />
              % of the grade
            </label>
            <label>
              <span className="sr">How {component.name} is scored</span>
              <select
                className={cn(field, 'w-auto pr-8')}
                value={component.scoring.kind}
                onChange={(event) =>
                  setComponent(index, {
                    scoring: scoringFor(
                      event.target.value as PolicyScoring['kind'],
                      component,
                    ),
                  })
                }
              >
                {SCORING.map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </label>
            <button
              type="button"
              className="textlink text-[13px] text-ink-3"
              onClick={() =>
                onChange({
                  ...draft,
                  components: draft.components.filter((_, at) => at !== index),
                })
              }
              disabled={draft.components.length === 1}
            >
              Remove
            </button>
          </div>

          <div className="flex flex-wrap items-center gap-x-5 gap-y-2 text-[13px] text-ink-2">
            {(component.scoring.kind === 'points' ||
              component.scoring.kind === 'equal') && (
              <label className="flex items-center gap-1.5">
                Drop the lowest
                <input
                  type="number"
                  min={0}
                  max={50}
                  step={1}
                  className={numeric}
                  value={component.dropLowest}
                  onChange={(event) =>
                    setComponent(index, {
                      dropLowest: Math.max(
                        0,
                        Math.round(numberValue(event.target.value) ?? 0),
                      ),
                    })
                  }
                />
              </label>
            )}
            {component.scoring.kind === 'ranked' && (
              <label className="flex items-center gap-1.5">
                Rank weights, best first
                <input
                  className={cn(field, 'numeral w-40')}
                  defaultValue={component.scoring.weights.join(', ')}
                  onBlur={(event) => {
                    const weights = event.target.value
                      .split(/[,\s]+/)
                      .map(Number)
                      .filter((value) => Number.isFinite(value) && value > 0);
                    if (weights.length)
                      setComponent(index, {
                        scoring: { kind: 'ranked', weights },
                        weight: +weights
                          .reduce((sum, weight) => sum + weight, 0)
                          .toFixed(2),
                      });
                  }}
                />
              </label>
            )}
            {component.scoring.kind === 'pool' && (
              <label className="flex items-center gap-1.5">
                Full credit at
                <input
                  type="number"
                  min={1}
                  step={1}
                  className={numeric}
                  value={component.scoring.cap}
                  onChange={(event) =>
                    setComponent(index, {
                      scoring: {
                        kind: 'pool',
                        cap: Math.max(1, numberValue(event.target.value) ?? 1),
                      },
                    })
                  }
                />
                points
              </label>
            )}
          </div>

          <div className="grid gap-1.5">
            <span className="text-[12px] text-ink-3">Counts from Canvas</span>
            <ul className="flex flex-wrap gap-1.5">
              {component.sources.map((source, sourceIndex) => (
                <li
                  key={`${source.group ?? 'i'}-${source.item ?? ''}-${sourceIndex}`}
                  className="flex items-center gap-1.5 rounded-full border border-rule bg-wash py-0.5 pr-1 pl-3 text-[12.5px] text-ink-2"
                >
                  {describeSource({ ...source, scale: undefined }, names)}
                  {component.scoring.kind === 'pool' && (
                    <>
                      <label className="flex items-center gap-1 text-ink-3">
                        ×
                        <input
                          type="number"
                          min={0.01}
                          step={0.05}
                          className="numeral h-6 w-14 rounded border border-rule bg-paper px-1 text-right"
                          value={source.scale ?? 1}
                          aria-label={`Points per point from ${describeSource(source, names)}`}
                          onChange={(event) =>
                            setSource(index, sourceIndex, {
                              scale: numberValue(event.target.value) ?? 1,
                            })
                          }
                        />
                      </label>
                      <label className="flex items-center gap-1 text-ink-3">
                        <input
                          type="checkbox"
                          checked={source.choice != null}
                          onChange={(event) =>
                            setSource(index, sourceIndex, {
                              choice: event.target.checked
                                ? 'either-1'
                                : undefined,
                            })
                          }
                        />
                        either/or
                      </label>
                    </>
                  )}
                  <button
                    type="button"
                    className="grid size-5 cursor-pointer place-items-center rounded-full text-ink-4 hover:bg-paper hover:text-ink"
                    aria-label={`Stop counting ${describeSource(source, names)}`}
                    onClick={() => setSource(index, sourceIndex, null)}
                  >
                    ×
                  </button>
                </li>
              ))}
              <li>
                <label>
                  <span className="sr">
                    Add Canvas work to {component.name}
                  </span>
                  <select
                    className="field h-7 min-h-0 w-auto py-0 pr-7 pl-2 text-[12.5px]"
                    value=""
                    onChange={(event) => {
                      const [kind, id] = event.target.value.split(':');
                      const source: PolicySource =
                        kind === 'item'
                          ? { item: Number(id) }
                          : kind === 'rest'
                            ? { group: Number(id), rest: true }
                            : { group: Number(id) };
                      setComponent(index, {
                        sources: [...component.sources, source],
                      });
                    }}
                  >
                    <option value="">Add…</option>
                    <optgroup label="Canvas groups">
                      {groups.map((group) => (
                        <option key={group.id} value={`group:${group.id}`}>
                          All of {group.name}
                        </option>
                      ))}
                    </optgroup>
                    <optgroup label="What the other parts leave in a group">
                      {groups.map((group) => (
                        <option key={group.id} value={`rest:${group.id}`}>
                          The rest of {group.name}
                        </option>
                      ))}
                    </optgroup>
                    {groups
                      .filter((group) => group.items.length)
                      .map((group) => (
                        <optgroup key={group.id} label={group.name}>
                          {group.items.map((item) => (
                            <option key={item.id} value={`item:${item.id}`}>
                              {item.title}
                            </option>
                          ))}
                        </optgroup>
                      ))}
                  </select>
                </label>
              </li>
            </ul>
          </div>
          {component.quote && (
            <p className="border-l-2 border-rule pl-3 text-[12.5px] leading-relaxed text-ink-3">
              {component.quote}
            </p>
          )}
        </fieldset>
      ))}

      <div className="flex flex-wrap items-center justify-between gap-3">
        <button type="button" className="pill pill-sm" onClick={addComponent}>
          Add a part
        </button>
        <span
          className={cn(
            'text-[13px] tabular-nums',
            Math.abs(total - 100) < 0.01 ? 'text-ink-3' : 'text-bad',
          )}
        >
          Weights add up to {+total.toFixed(2)}%
        </span>
      </div>

      <div className="flex flex-wrap items-center gap-x-8 gap-y-3 text-[13px] text-ink-2">
        <fieldset className="flex flex-wrap items-center gap-2">
          <legend className="float-left mr-1">Letter scale, A B C D</legend>
          {(draft.cutoffs ?? [90, 80, 70, 60]).map((value, index) => (
            <input
              key={index}
              type="number"
              min={0}
              max={100}
              className={numeric}
              value={value}
              aria-label={`${'ABCD'[index]} starts at`}
              onChange={(event) => {
                const next = [
                  ...(draft.cutoffs ?? [90, 80, 70, 60]),
                ] as Cutoffs;
                next[index] = Math.min(
                  100,
                  Math.max(0, numberValue(event.target.value) ?? 0),
                );
                onChange({ ...draft, cutoffs: next });
              }}
            />
          ))}
        </fieldset>
        <label className="flex items-center gap-2">
          Credit hours
          <input
            type="number"
            min={0}
            max={12}
            step={1}
            className={numeric}
            value={draft.credits ?? ''}
            placeholder="3"
            onChange={(event) =>
              onChange({ ...draft, credits: numberValue(event.target.value) })
            }
          />
        </label>
      </div>
    </div>
  );
}
