'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { cn } from '@/lib/utils';
import {
  FILE_CLASS_GROUP_LABELS,
  FILE_KIND_LABELS,
  FILE_KINDS,
  type FileClass,
  type FileClassGroup,
  type FileEntry,
  type FileIndex,
  type FileKind,
  type FileModuleGroup,
  type FileModuleId,
} from '@/lib/files/types';

type Filters = {
  classId: number | null;
  moduleId: FileModuleId | null;
  kind: FileKind | null;
  q: string;
};

/** Files shown per class in the all-classes overview before "All N files". */
const OVERVIEW_LIMIT = 8;

const GROUPS: FileClassGroup[] = ['current', 'organization', 'past'];

const fold = (value: string) =>
  value
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();

function parseFilters(
  params: URLSearchParams,
  classes: Map<number, FileClass>,
): Filters {
  const classId = Number(params.get('class'));
  const selected = classes.get(classId) ?? null;
  const moduleParam = params.get('module');
  const moduleId: FileModuleId | null =
    moduleParam === 'none'
      ? 'none'
      : moduleParam && /^\d+$/.test(moduleParam)
        ? Number(moduleParam)
        : null;
  const kind = params.get('type') as FileKind | null;
  return {
    classId: selected?.id ?? null,
    moduleId: selected?.modules.some((group) => group.id === moduleId)
      ? moduleId
      : null,
    kind: kind && FILE_KINDS.includes(kind) ? kind : null,
    q: params.get('q') ?? '',
  };
}

function filtersQuery({ classId, moduleId, kind, q }: Filters) {
  const params = new URLSearchParams();
  if (classId !== null) params.set('class', String(classId));
  if (classId !== null && moduleId !== null)
    params.set('module', String(moduleId));
  if (kind) params.set('type', kind);
  if (q.trim()) params.set('q', q.trim());
  return params.toString();
}

const inModule = (file: FileEntry, id: FileModuleId) =>
  id === 'none'
    ? file.modules.length === 0
    : file.modules.some((ref) => ref.id === id);

/** `Week 16 - Recitation 15` → [`16`, `Recitation 15`], echoing the Study Hub week list. */
function splitWeek(title: string): [string | null, string] {
  const match = title.match(/^week\s+(\d{1,2})\s*[-–—:]\s*(.+)$/i);
  return match ? [match[1], match[2]] : [null, title];
}

export function FilesBrowser({ index }: { index: FileIndex }) {
  const searchParams = useSearchParams();
  const classes = useMemo(
    () => new Map(index.classes.map((item) => [item.id, item])),
    [index.classes],
  );
  const [filters, setFilters] = useState<Filters>(() =>
    parseFilters(new URLSearchParams(searchParams), classes),
  );
  const written = useRef(filtersQuery(filters));
  const searchRef = useRef<HTMLInputElement>(null);
  const resultsRef = useRef<HTMLDivElement>(null);

  // Arriving from a link (e.g. the rail's Files item) resets the filters to that URL.
  const external = searchParams.toString();
  useEffect(() => {
    if (external === written.current) return;
    written.current = external;
    setFilters(parseFilters(new URLSearchParams(external), classes));
  }, [external, classes]);

  // Keep the URL linkable without a server round trip.
  useEffect(() => {
    const query = filtersQuery(filters);
    if (query === written.current) return;
    written.current = query;
    window.history.replaceState(
      window.history.state,
      '',
      query ? `?${query}` : window.location.pathname,
    );
  }, [filters]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (event.key !== '/' || event.metaKey || event.ctrlKey || event.altKey)
        return;
      if (
        target &&
        (/^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName) ||
          target.isContentEditable)
      )
        return;
      event.preventDefault();
      searchRef.current?.focus();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const haystacks = useMemo(
    () =>
      new Map(
        index.files.map((file) => {
          const owner = classes.get(file.courseId);
          return [
            file.key,
            fold(
              [
                file.title,
                file.filename,
                owner?.code,
                owner?.name,
                file.typeLabel,
                ...file.modules.map((ref) => ref.title),
              ]
                .filter(Boolean)
                .join(' '),
            ),
          ];
        }),
      ),
    [index.files, classes],
  );

  const selectedClass =
    filters.classId === null ? null : (classes.get(filters.classId) ?? null);
  const selectedModule =
    selectedClass?.modules.find((group) => group.id === filters.moduleId) ??
    null;
  const searching = filters.q.trim().length > 0;

  const facets = useMemo(() => {
    const terms = fold(filters.q).split(/\s+/).filter(Boolean);
    const matched = terms.length
      ? index.files.filter((file) =>
          terms.every((term) => haystacks.get(file.key)!.includes(term)),
        )
      : index.files;
    const ofKind = filters.kind
      ? matched.filter((file) => file.kind === filters.kind)
      : matched;
    const classCounts = new Map<number, number>();
    for (const file of ofKind)
      classCounts.set(file.courseId, (classCounts.get(file.courseId) ?? 0) + 1);
    const inClass =
      filters.classId === null
        ? matched
        : matched.filter((file) => file.courseId === filters.classId);
    const moduleCounts = new Map<FileModuleId, number>();
    const classOfKind = filters.kind
      ? inClass.filter((item) => item.kind === filters.kind)
      : inClass;
    for (const file of classOfKind) {
      if (!file.modules.length)
        moduleCounts.set('none', (moduleCounts.get('none') ?? 0) + 1);
      for (const ref of file.modules)
        moduleCounts.set(ref.id, (moduleCounts.get(ref.id) ?? 0) + 1);
    }
    const inModuleFiles =
      filters.moduleId === null
        ? inClass
        : inClass.filter((file) => inModule(file, filters.moduleId!));
    const kindCounts: Record<FileKind, number> = {
      pdf: 0,
      slides: 0,
      docs: 0,
      other: 0,
    };
    for (const file of inModuleFiles) kindCounts[file.kind] += 1;
    const results = filters.kind
      ? inModuleFiles.filter((file) => file.kind === filters.kind)
      : inModuleFiles;
    return {
      classCounts,
      classTotal: ofKind.length,
      moduleCounts,
      moduleTotal: classOfKind.length,
      kindCounts,
      kindTotal: inModuleFiles.length,
      results,
    };
  }, [
    index.files,
    haystacks,
    filters.q,
    filters.kind,
    filters.classId,
    filters.moduleId,
  ]);

  const update = (next: Partial<Filters>) =>
    setFilters((current) => ({ ...current, ...next }));

  const chooseModule = (moduleId: FileModuleId | null) => {
    update({ moduleId });
    const top = resultsRef.current?.getBoundingClientRect().top ?? 0;
    if (top < 0)
      resultsRef.current?.scrollIntoView({
        block: 'start',
        behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches
          ? 'auto'
          : 'smooth',
      });
  };

  const { results } = facets;
  const hasModules = Boolean(selectedClass?.modules.length);
  const scope = selectedModule
    ? `${selectedModule.title} in ${selectedClass!.code}`
    : selectedClass
      ? selectedClass.code
      : 'all classes';
  const status = `${results.length} ${results.length === 1 ? 'file' : 'files'} in ${scope}${
    filters.kind ? `, ${FILE_KIND_LABELS[filters.kind]} only` : ''
  }${filters.q.trim() ? `, matching “${filters.q.trim()}”` : ''}.`;

  if (!index.files.length)
    return (
      <div className="max-w-[60ch] border-t border-rule pt-6">
        <h2 className="display text-[1.375rem]">No files yet</h2>
        <p className="mt-2 text-[0.9375rem] text-ink-2">
          Files from Canvas appear here after a sync, including the ones your
          classes only share inside modules. Use Sync now at the bottom of the
          sidebar to fetch them.
        </p>
      </div>
    );

  return (
    <div>
      <div className="flex flex-col gap-5">
        <div className="flex flex-wrap items-end gap-x-10 gap-y-4">
          <div className="w-full max-w-[26rem] min-w-0 sm:w-auto sm:flex-1">
            <label htmlFor="file-search" className="sr">
              Search files
            </label>
            <input
              id="file-search"
              ref={searchRef}
              type="search"
              autoComplete="off"
              spellCheck={false}
              value={filters.q}
              onChange={(event) => update({ q: event.target.value })}
              onKeyDown={(event) => {
                if (event.key === 'Escape' && filters.q) {
                  event.preventDefault();
                  update({ q: '' });
                }
              }}
              placeholder="Search files (press /)"
              className="w-full rounded-none border-0 border-b border-rule bg-transparent py-[7px] text-[0.9375rem] placeholder:text-ink-4 focus:border-ink focus:outline-none"
            />
          </div>
          <fieldset className="m-0 flex min-w-0 flex-wrap gap-1.5 border-0 p-0">
            <legend className="sr">File type</legend>
            <FilterPill
              small
              resets
              pressed={filters.kind === null}
              count={facets.kindTotal}
              onClick={() => update({ kind: null })}
            >
              All types
            </FilterPill>
            {FILE_KINDS.map((kind) => (
              <FilterPill
                key={kind}
                small
                pressed={filters.kind === kind}
                count={facets.kindCounts[kind]}
                onClick={() =>
                  update({ kind: filters.kind === kind ? null : kind })
                }
              >
                {FILE_KIND_LABELS[kind]}
              </FilterPill>
            ))}
          </fieldset>
        </div>

        <div className="flex flex-col gap-3">
          {GROUPS.map((group) => {
            const members = index.classes.filter(
              (item) => item.group === group,
            );
            if (!members.length) return null;
            const label = FILE_CLASS_GROUP_LABELS[group];
            return (
              <fieldset
                key={group}
                className="m-0 grid min-w-0 gap-x-4 gap-y-2 border-0 p-0 sm:grid-cols-[7.5rem_minmax(0,1fr)] sm:items-baseline"
              >
                <legend className="sr">{label}</legend>
                <p className="text-[0.8125rem] text-ink-3" aria-hidden="true">
                  {label}
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {group === 'current' && (
                    <FilterPill
                      resets
                      pressed={filters.classId === null}
                      count={facets.classTotal}
                      onClick={() => update({ classId: null, moduleId: null })}
                    >
                      All classes
                    </FilterPill>
                  )}
                  {members.map((item) => (
                    <FilterPill
                      key={item.id}
                      pressed={filters.classId === item.id}
                      count={facets.classCounts.get(item.id) ?? 0}
                      title={item.name || undefined}
                      onClick={() =>
                        update({
                          classId: filters.classId === item.id ? null : item.id,
                          moduleId: null,
                        })
                      }
                    >
                      {item.code}
                    </FilterPill>
                  ))}
                </div>
              </fieldset>
            );
          })}
        </div>
      </div>

      <p aria-live="polite" aria-atomic="true" className="sr">
        {status}
      </p>

      <div ref={resultsRef} className="scroll-mt-6">
        {selectedClass ? (
          <section
            aria-labelledby="files-class-heading"
            className="mt-10 border-t border-rule pt-6"
          >
            <header className="mb-6 flex flex-wrap items-baseline justify-between gap-x-6 gap-y-2">
              <h2
                id="files-class-heading"
                className="display text-[1.625rem] sm:text-[1.75rem]"
              >
                {selectedClass.code}
                {selectedClass.name && (
                  <span className="ml-3 font-sans text-[0.9375rem] font-normal tracking-normal text-ink-3">
                    {selectedClass.name}
                  </span>
                )}
              </h2>
              {selectedClass.canvasUrl && (
                <a
                  className="textlink"
                  href={selectedClass.canvasUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  Open in Canvas ↗<span className="sr"> (new tab)</span>
                </a>
              )}
            </header>

            <div
              className={cn(
                hasModules &&
                  'lg:grid lg:grid-cols-[15rem_minmax(0,1fr)] lg:gap-12',
              )}
            >
              {hasModules && (
                <>
                  <nav
                    aria-label={`Modules in ${selectedClass.code}`}
                    className="sticky top-6 hidden max-h-[calc(100dvh-3rem)] self-start overflow-y-auto pr-2 pb-4 lg:block"
                  >
                    <ul>
                      <li>
                        <ModuleButton
                          resets
                          pressed={filters.moduleId === null}
                          count={facets.moduleTotal}
                          onClick={() => chooseModule(null)}
                          title="All modules"
                        />
                      </li>
                      {selectedClass.modules.map((group) => (
                        <li key={group.id}>
                          <ModuleButton
                            pressed={filters.moduleId === group.id}
                            count={facets.moduleCounts.get(group.id) ?? 0}
                            onClick={() =>
                              chooseModule(
                                filters.moduleId === group.id ? null : group.id,
                              )
                            }
                            title={group.title}
                          />
                        </li>
                      ))}
                    </ul>
                  </nav>
                  <div className="mb-8 lg:hidden">
                    <label
                      htmlFor="file-module"
                      className="text-[0.8125rem] text-ink-2"
                    >
                      Module
                    </label>
                    <select
                      id="file-module"
                      className="field mt-1.5 max-w-[30rem]"
                      value={
                        filters.moduleId === null
                          ? ''
                          : String(filters.moduleId)
                      }
                      onChange={(event) =>
                        update({
                          moduleId:
                            event.target.value === ''
                              ? null
                              : event.target.value === 'none'
                                ? 'none'
                                : Number(event.target.value),
                        })
                      }
                    >
                      <option value="">
                        All modules ({facets.moduleTotal})
                      </option>
                      {selectedClass.modules.map((group) => {
                        const count = facets.moduleCounts.get(group.id) ?? 0;
                        return (
                          <option
                            key={group.id}
                            value={String(group.id)}
                            disabled={!count && filters.moduleId !== group.id}
                          >
                            {group.title} ({count})
                          </option>
                        );
                      })}
                    </select>
                  </div>
                </>
              )}

              <div className="min-w-0">
                {results.length ? (
                  hasModules ? (
                    selectedClass.modules
                      .filter(
                        (group) =>
                          filters.moduleId === null ||
                          group.id === filters.moduleId,
                      )
                      .map((group) => {
                        const files = results
                          .filter((file) => inModule(file, group.id))
                          .sort(
                            (a, b) =>
                              (a.modules.find((ref) => ref.id === group.id)
                                ?.itemPosition ?? Infinity) -
                              (b.modules.find((ref) => ref.id === group.id)
                                ?.itemPosition ?? Infinity),
                          );
                        return files.length ? (
                          <ModuleSection
                            key={group.id}
                            group={group}
                            files={files}
                          />
                        ) : null;
                      })
                  ) : (
                    <FileList files={results} />
                  )
                ) : (
                  <EmptyResults
                    filters={filters}
                    scope={scope}
                    update={update}
                  />
                )}
              </div>
            </div>
          </section>
        ) : results.length ? (
          index.classes.map((item) => {
            const files = results.filter((file) => file.courseId === item.id);
            if (!files.length) return null;
            const capped =
              !searching && !filters.kind && files.length > OVERVIEW_LIMIT;
            return (
              <section
                key={item.id}
                aria-labelledby={`files-class-${item.id}`}
                className="mt-10 border-t border-rule pt-6"
              >
                <header className="mb-4 flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1">
                  <h2
                    id={`files-class-${item.id}`}
                    className="display text-[1.375rem]"
                  >
                    {item.code}
                    {item.name && (
                      <span className="ml-3 font-sans text-[0.875rem] font-normal tracking-normal text-ink-3">
                        {item.name}
                      </span>
                    )}
                  </h2>
                  <button
                    type="button"
                    className="textlink"
                    onClick={() => update({ classId: item.id, moduleId: null })}
                  >
                    {item.modules.length
                      ? 'Browse by module'
                      : `Only ${item.code}`}
                  </button>
                </header>
                <FileList
                  files={capped ? files.slice(0, OVERVIEW_LIMIT) : files}
                  showModule
                />
                {capped && (
                  <button
                    type="button"
                    className="pill pill-sm mt-4"
                    onClick={() => update({ classId: item.id, moduleId: null })}
                  >
                    All {files.length} files in {item.code}
                  </button>
                )}
              </section>
            );
          })
        ) : (
          <div className="mt-10 border-t border-rule pt-6">
            <EmptyResults filters={filters} scope={scope} update={update} />
          </div>
        )}
      </div>
    </div>
  );
}

/** `resets` marks the "All …" option, which stays usable even when nothing matches. */
function FilterPill({
  pressed,
  count,
  small,
  resets,
  title,
  onClick,
  children,
}: {
  pressed: boolean;
  count: number;
  small?: boolean;
  resets?: boolean;
  title?: string;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-pressed={pressed}
      disabled={!count && !pressed && !resets}
      title={title}
      onClick={onClick}
      className={cn('pill', small && 'pill-sm', pressed && 'pill-primary')}
    >
      {children}
      <span
        aria-hidden="true"
        className={cn(
          'numeral tabular-nums',
          pressed ? 'opacity-70' : 'text-ink-3',
        )}
      >
        {count}
      </span>
      <span className="sr">, {count === 1 ? '1 file' : `${count} files`}</span>
    </button>
  );
}

function ModuleButton({
  title,
  count,
  pressed,
  onClick,
  resets,
}: {
  title: string;
  count: number;
  pressed: boolean;
  onClick: () => void;
  resets?: boolean;
}) {
  const [week, rest] = splitWeek(title);
  return (
    <button
      type="button"
      aria-pressed={pressed}
      disabled={!count && !pressed && !resets}
      onClick={onClick}
      className={cn(
        'grid w-full grid-cols-[1.5rem_minmax(0,1fr)_auto] gap-x-2 rounded-[2px] py-1 text-left text-ink-3 transition-colors hover:text-ink disabled:cursor-default disabled:text-ink-4',
        pressed && 'text-ink',
      )}
    >
      <span
        aria-hidden="true"
        className="pt-px text-right text-[0.8125rem] tabular-nums"
      >
        {week}
      </span>
      <span
        className={cn(
          'text-[0.84375rem] leading-[1.35]',
          pressed && 'font-medium',
        )}
      >
        {week && <span className="sr">Week {week}: </span>}
        {rest}
      </span>
      <span aria-hidden="true" className="pt-px text-[0.75rem] tabular-nums">
        {count}
      </span>
      <span className="sr">, {count === 1 ? '1 file' : `${count} files`}</span>
    </button>
  );
}

function ModuleSection({
  group,
  files,
}: {
  group: FileModuleGroup;
  files: FileEntry[];
}) {
  return (
    <section className="mb-9 last:mb-0" aria-label={group.title}>
      <div className="mb-2 flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1">
        <h3 className="text-[0.8125rem] text-ink-3">
          <span className="font-medium text-ink">{group.title}.</span>{' '}
          {files.length} {files.length === 1 ? 'file' : 'files'}
        </h3>
        {group.canvasUrl && (
          <a
            className="textlink"
            href={group.canvasUrl}
            target="_blank"
            rel="noopener noreferrer"
          >
            Module in Canvas ↗<span className="sr"> (new tab)</span>
          </a>
        )}
      </div>
      <FileList files={files} />
    </section>
  );
}

function FileList({
  files,
  showModule,
}: {
  files: FileEntry[];
  showModule?: boolean;
}) {
  return (
    <ul className="grid grid-cols-[repeat(auto-fill,minmax(min(17.5rem,100%),1fr))] gap-x-8">
      {files.map((file) => {
        const meta = [
          file.typeLabel,
          file.size,
          showModule && file.modules[0]
            ? file.modules.length > 1
              ? `${file.modules[0].title} and ${file.modules.length - 1} more`
              : file.modules[0].title
            : null,
          file.updatedLabel && `updated ${file.updatedLabel}`,
        ]
          .filter(Boolean)
          .join(', ');
        return (
          <li key={file.key} className="border-t border-rule py-[7px]">
            <a
              href={file.href}
              target="_blank"
              rel="noopener noreferrer"
              className="group block text-[0.90625rem] leading-snug [overflow-wrap:anywhere] text-ink no-underline"
            >
              <span className="decoration-rule-2 underline-offset-[3px] group-hover:underline">
                {file.title}
              </span>
              {!file.cached && (
                <span aria-hidden="true" className="text-[0.75rem] text-ink-4">
                  {'\u00a0↗'}
                </span>
              )}
              <span className="sr">
                {file.cached
                  ? ' (saved copy, new tab)'
                  : ' (opens Canvas in a new tab)'}
              </span>
            </a>
            <p className="mt-0.5 flex items-baseline justify-between gap-3 text-[0.78125rem] leading-snug text-ink-3">
              <span className="min-w-0">{meta}</span>
              <span
                className={cn(
                  'shrink-0',
                  file.cached ? 'text-ink-2' : 'text-ink-4',
                )}
              >
                {file.cached
                  ? 'On this device'
                  : file.opensLabel
                    ? `Opens ${file.opensLabel}`
                    : 'Canvas'}
              </span>
            </p>
          </li>
        );
      })}
    </ul>
  );
}

function EmptyResults({
  filters,
  scope,
  update,
}: {
  filters: Filters;
  scope: string;
  update: (next: Partial<Filters>) => void;
}) {
  const q = filters.q.trim();
  return (
    <div className="max-w-[60ch]">
      <p className="font-serif text-[1.0625rem] leading-relaxed text-ink">
        {q
          ? `Nothing matches “${q}” in ${scope}${filters.kind ? `, ${FILE_KIND_LABELS[filters.kind]} only` : ''}.`
          : `No ${filters.kind ? `${FILE_KIND_LABELS[filters.kind]} ` : ''}files in ${scope}.`}
      </p>
      <p className="mt-1 text-[0.8125rem] text-ink-3">
        Widen the search, or check Canvas: files your classes post as links or
        pages are not listed here.
      </p>
      <div className="mt-4 flex flex-wrap gap-2">
        {q && (
          <button
            type="button"
            className="pill"
            onClick={() => update({ q: '' })}
          >
            Clear search
          </button>
        )}
        {filters.kind && (
          <button
            type="button"
            className="pill"
            onClick={() => update({ kind: null })}
          >
            All types
          </button>
        )}
        {filters.moduleId !== null && (
          <button
            type="button"
            className="pill"
            onClick={() => update({ moduleId: null })}
          >
            All modules
          </button>
        )}
        {filters.classId !== null && (
          <button
            type="button"
            className="pill"
            onClick={() => update({ classId: null, moduleId: null })}
          >
            Search all classes
          </button>
        )}
      </div>
    </div>
  );
}
