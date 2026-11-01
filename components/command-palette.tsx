'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useRouter } from 'next/navigation';
import {
  ArrowRight,
  ArrowUpRight,
  FileText,
  Palette,
  Plus,
  RefreshCw,
  Search,
  Timer,
} from 'lucide-react';
import { useAppearance } from '@/components/appearance/appearance-provider';
import { NewLocalTaskForm } from '@/components/new-local-task-form';
import {
  pauseFocusTimer,
  startFocusTimer,
  useFocusTimer,
} from '@/components/study/focus-timer';
import { useCanvasSync } from '@/hooks/use-canvas-sync';
import { focusStatus } from '@/lib/study/focus-timer';
import { cn } from '@/lib/utils';

type SearchResult = {
  entityType: string;
  entityId: number;
  courseId: number | null;
  title: string;
  snippet: string;
  sourceUrl: string | null;
};

const stripMarks = (value: string) => value.replace(/<\/?mark>/g, '');

const hrefFor = (result: SearchResult) => {
  if (result.entityType === 'assignment')
    return `/assignments/${result.entityId}`;
  if (result.entityType === 'course') return `/courses/${result.entityId}`;
  return result.sourceUrl;
};

const quickLinks = [
  ['Open today', '/'],
  ['Open tasks', '/tasks'],
  ['Open calendar', '/calendar'],
  ['Open study', '/study'],
  ['Daily review', '/study/daily'],
  ['Open grades', '/grades'],
  ['Open planner', '/planner'],
  ['Open files', '/files'],
  ['Open careers', '/careers'],
  ['Open search', '/search'],
  ['Open settings', '/settings'],
  ['Study settings', '/settings#study'],
] as const;

type PaletteRow = {
  id: string;
  group: string;
  label: string;
  detail?: string;
  icon: React.ReactNode;
  hint?: React.ReactNode;
  disabled?: boolean;
  run: () => void;
};

const iconClass = 'size-3.5 shrink-0 text-ink-3';

const OPEN_EVENT = 'aper:command-palette';

/** Open the palette from any trigger (rail search, mobile top bar). */
export function openCommandPalette() {
  window.dispatchEvent(new Event(OPEN_EVENT));
}

/** Single palette instance, mounted once by the app shell. */
export function CommandPalette() {
  const router = useRouter();
  const sync = useCanvasSync();
  const { openCustomizer } = useAppearance();
  const timerStatus = focusStatus(useFocusTimer());
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchResult[]>([]);
  const [capturing, setCapturing] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [editorTitle, setEditorTitle] = useState<string | null>(null);
  const [courses, setCourses] = useState<Array<{ id: number; code: string }>>(
    [],
  );
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const listener = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        setOpen((value) => !value);
      }
      if (event.key === 'Escape') {
        setOpen(false);
        setEditorTitle(null);
      }
    };
    const show = () => setOpen(true);
    window.addEventListener('keydown', listener);
    window.addEventListener(OPEN_EVENT, show);
    return () => {
      window.removeEventListener('keydown', listener);
      window.removeEventListener(OPEN_EVENT, show);
    };
  }, []);

  useEffect(() => {
    if (open) inputRef.current?.focus();
    else {
      setQuery('');
      setResults([]);
      setMessage(null);
    }
  }, [open]);

  useEffect(() => {
    const value = query.trim();
    if (!value) {
      setResults([]);
      return;
    }
    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      void fetch(`/api/search?q=${encodeURIComponent(value)}`, {
        signal: controller.signal,
      })
        .then((response) => response.json())
        .then((payload: { results?: SearchResult[] }) =>
          setResults((payload.results ?? []).slice(0, 12)),
        )
        .catch(() => undefined);
    }, 140);
    return () => {
      controller.abort();
      window.clearTimeout(timer);
    };
  }, [query]);

  const go = useCallback(
    (href: string | null) => {
      if (!href) return;
      setOpen(false);
      if (href.startsWith('/')) router.push(href);
      else window.open(href, '_blank', 'noopener,noreferrer');
    },
    [router],
  );

  const openEditor = useCallback((title: string) => {
    setOpen(false);
    setEditorTitle(title);
    void fetch('/api/courses')
      .then((response) => response.json())
      .then((rows: Array<{ id: number; displayCode: string; name: string }>) =>
        setCourses(
          rows.map((row) => ({ id: row.id, code: row.displayCode ?? row.name })),
        ),
      )
      .catch(() => undefined);
  }, []);

  const capture = useCallback(async () => {
    const text = query.trim();
    if (capturing) return;
    // Nothing typed: go straight to the manual editor.
    if (!text) {
      openEditor('');
      return;
    }
    setCapturing(true);
    setMessage('Reading that…');
    try {
      const response = await fetch('/api/capture', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text }),
      });
      const payload = (await response.json()) as {
        parsed?: boolean;
        title?: string;
        personalDueAt?: string | null;
        course?: string | null;
        error?: string | null;
      };
      if (!response.ok) throw new Error('capture failed');
      // Unreadable by the model — the same text opens the editor, so a capture
      // is never lost.
      if (!payload.parsed) {
        openEditor(text);
        setMessage(null);
        return;
      }
      const when = payload.personalDueAt
        ? ` · ${new Date(payload.personalDueAt).toLocaleString()}`
        : '';
      setMessage(
        `Added “${payload.title}”${payload.course ? ` · ${payload.course}` : ''}${when}`,
      );
      setQuery('');
      router.refresh();
    } catch {
      setMessage('Could not save that task.');
    } finally {
      setCapturing(false);
    }
  }, [capturing, openEditor, query, router]);

  const rows = useMemo<PaletteRow[]>(() => {
    const addTask: PaletteRow = {
      id: 'capture',
      group: 'Actions',
      label: query ? `Add task: ${query}` : 'Add task…',
      icon: <Plus className={iconClass} aria-hidden="true" />,
      hint: (
        <span className="kbd" aria-hidden="true">
          ⌘↵
        </span>
      ),
      disabled: capturing,
      run: () => void capture(),
    };
    if (query) {
      return [
        addTask,
        ...results.map((result) => ({
          id: `${result.entityType}-${result.entityId}`,
          group: 'Results',
          label: result.title,
          detail: `${result.entityType} · ${stripMarks(result.snippet)}`,
          icon: <FileText className={iconClass} aria-hidden="true" />,
          hint: hrefFor(result)?.startsWith('/') ? undefined : (
            <ArrowUpRight className={iconClass} aria-hidden="true" />
          ),
          run: () => go(hrefFor(result)),
        })),
      ];
    }
    return [
      addTask,
      {
        id: 'sync',
        group: 'Actions',
        label: 'Sync Canvas + Gradescope',
        icon: <RefreshCw className={iconClass} aria-hidden="true" />,
        run: () => {
          void sync.startSync();
          setOpen(false);
        },
      },
      {
        id: 'appearance',
        group: 'Actions',
        label: 'Customize appearance',
        icon: <Palette className={iconClass} aria-hidden="true" />,
        run: () => {
          setOpen(false);
          openCustomizer();
        },
      },
      {
        id: 'focus-timer',
        group: 'Actions',
        label:
          timerStatus === 'running'
            ? 'Pause focus timer'
            : timerStatus === 'paused'
              ? 'Resume focus timer'
              : 'Start focus timer',
        icon: <Timer className={iconClass} aria-hidden="true" />,
        run: () => {
          setOpen(false);
          if (timerStatus === 'running') pauseFocusTimer();
          else startFocusTimer();
        },
      },
      ...quickLinks.map(([label, href]) => ({
        id: href,
        group: 'Go to',
        label,
        icon: <ArrowRight className={iconClass} aria-hidden="true" />,
        run: () => go(href),
      })),
    ];
  }, [
    capture,
    capturing,
    go,
    openCustomizer,
    query,
    results,
    sync,
    timerStatus,
  ]);

  // Typing lands on the first result (Enter opens it, as before); with no
  // results the highlight stays on "Add task".
  useEffect(() => {
    setActive(query && results.length ? 1 : 0);
  }, [query, results]);

  const listRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    listRef.current
      ?.querySelector<HTMLElement>(`[data-index="${active}"]`)
      ?.scrollIntoView({ block: 'nearest' });
  }, [active]);

  const move = (delta: number) =>
    setActive((index) => (index + delta + rows.length) % rows.length);

  return (
    <>
      {/* Portalled so the overlays sit above the shell's sticky layers. */}
      {open &&
        createPortal(
          <div
            role="presentation"
            className="fixed inset-0 z-50 bg-black/25 p-4 dark:bg-black/55"
            onMouseDown={(event) => {
              if (event.target === event.currentTarget) setOpen(false);
            }}
          >
            <dialog
              open
              aria-modal="true"
              aria-label="Command palette"
              className="mx-auto mt-[12vh] flex max-h-[76vh] w-full max-w-[36rem] flex-col overflow-hidden rounded-[10px] border border-rule bg-popover p-0 text-ink shadow-(--shadow-float)"
            >
              <div className="flex h-14 shrink-0 items-center gap-3 border-b border-rule px-5">
                <Search className="size-4 shrink-0 text-ink-4" aria-hidden="true" />
                <input
                  ref={inputRef}
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === 'ArrowDown') {
                      event.preventDefault();
                      move(1);
                      return;
                    }
                    if (event.key === 'ArrowUp') {
                      event.preventDefault();
                      move(-1);
                      return;
                    }
                    if (event.key !== 'Enter') return;
                    event.preventDefault();
                    if (event.metaKey || event.ctrlKey) void capture();
                    else rows[active]?.run();
                  }}
                  placeholder="Search, or describe a task to add…"
                  className="h-full min-w-0 flex-1 bg-transparent text-[0.9375rem] outline-none placeholder:text-ink-4"
                />
                <span className="kbd shrink-0" aria-hidden="true">
                  esc
                </span>
              </div>
              <div
                ref={listRef}
                className="min-h-0 flex-1 overflow-y-auto px-2 pt-1 pb-2"
              >
                {message && (
                  <p
                    aria-live="polite"
                    className="mx-3 mt-3 mb-1 border-l-2 border-ink py-0.5 pl-3 text-[0.8125rem] text-ink-2"
                  >
                    {message}
                  </p>
                )}
                {rows.map((row, index) => (
                  <div key={row.id}>
                    {row.group !== rows[index - 1]?.group && (
                      <p className="px-3 pt-3 pb-1 text-xs font-medium text-ink-3">
                        {row.group}
                      </p>
                    )}
                    <button
                      data-index={index}
                      data-active={index === active || undefined}
                      disabled={row.disabled}
                      onMouseMove={() => setActive(index)}
                      onClick={row.run}
                      className={cn(
                        'flex w-full items-center gap-3 rounded-md px-3 py-2 text-left text-sm text-ink-2 transition-colors disabled:opacity-40',
                        index === active && 'bg-wash text-ink',
                      )}
                    >
                      {row.icon}
                      <span className="min-w-0 flex-1">
                        <span className="block truncate">{row.label}</span>
                        {row.detail && (
                          <span className="block truncate text-xs text-ink-3">
                            {row.detail}
                          </span>
                        )}
                      </span>
                      {row.hint}
                    </button>
                  </div>
                ))}
                {query && results.length === 0 && (
                  <p className="px-3 pt-4 pb-2 text-[0.8125rem] text-ink-3">
                    No matches yet. Press ⌘↵ to add it as a task.
                  </p>
                )}
              </div>
              <div className="hidden shrink-0 items-center gap-4 border-t border-rule px-5 py-2.5 text-xs text-ink-3 sm:flex">
                <span className="flex items-center gap-1.5">
                  <span className="kbd">↑</span>
                  <span className="kbd">↓</span> move
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="kbd">↵</span> open
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="kbd">⌘↵</span> add as task
                </span>
              </div>
            </dialog>
          </div>,
          document.body,
        )}

      {editorTitle !== null &&
        createPortal(
          <div
            role="presentation"
            className="fixed inset-0 z-50 overflow-y-auto bg-black/25 p-4 dark:bg-black/55"
            onMouseDown={(event) => {
              if (event.target === event.currentTarget) setEditorTitle(null);
            }}
          >
            <dialog
              open
              aria-modal="true"
              aria-label="Add task"
              className="mx-auto my-[8vh] w-full max-w-3xl rounded-[10px] border border-rule bg-popover p-6 text-ink shadow-(--shadow-float) sm:p-8"
            >
              <h2 className="display mb-5 text-[1.625rem]">Add task</h2>
              <NewLocalTaskForm
                courses={courses}
                initialTitle={editorTitle}
                open
                onClose={() => setEditorTitle(null)}
                onCreated={() => {
                  setEditorTitle(null);
                  router.refresh();
                }}
              />
            </dialog>
          </div>,
          document.body,
        )}
    </>
  );
}
