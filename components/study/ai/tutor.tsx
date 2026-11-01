'use client';

import 'katex/dist/katex.min.css';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useId,
  useImperativeHandle,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
  type Ref,
} from 'react';
import { TUTOR_ERROR_COPY, md } from '@/components/study/ai/format';
import {
  TUTOR_TRAILER,
  type TutorContext,
  type TutorTurn,
} from '@/lib/groq/tutor';
import { renderMathInHtml } from '@/lib/study/math';
import type { StudyCourse } from '@/lib/study/types';
import { cn } from '@/lib/utils';

export type TutorCourse = Pick<
  StudyCourse,
  'id' | 'code' | 'tutor' | 'math' | 'code_lang'
>;
export type TutorAsk = TutorContext & { starter: string };

type TutorValue = { enabled: boolean; ask: (context?: TutorAsk) => void };

const TutorValueContext = createContext<TutorValue>({
  enabled: false,
  ask: () => undefined,
});

/** `enabled` is false outside a TutorProvider, so callers can hide their tutor buttons. */
export const useTutor = () => useContext(TutorValueContext);

/** Markdown answer styling: the artifact's `.msg.ai` paragraphs, lists, and code. */
export const TUTOR_PROSE =
  '[&_p]:mb-2 [&_p:last-child]:mb-0 [&_ul]:mb-2 [&_ul]:list-disc [&_ul]:pl-5 [&_li]:mb-0.5 [&_strong]:font-semibold [&_code]:rounded-[3px] [&_code]:bg-wash [&_code]:px-1 [&_code]:py-px [&_code]:font-mono [&_code]:text-[0.84em] [&_pre]:my-2 [&_pre]:overflow-x-auto [&_pre]:rounded-md [&_pre]:border [&_pre]:border-rule [&_pre]:bg-wash [&_pre]:px-3.5 [&_pre]:py-3 [&_pre]:font-mono [&_pre]:text-[0.8125rem] [&_pre]:leading-[1.55] [&_pre_code]:bg-transparent [&_pre_code]:p-0 [&_pre_code]:text-[1em]';

type DrawerHandle = {
  open: (course: TutorCourse, context: TutorAsk | null) => void;
};

/**
 * Wraps a course's pages. When `enabled` (a Groq key is configured), renders
 * the "Ask a tutor" button and the tutor drawer, and lets any descendant open
 * the drawer with a problem attached through `useTutor().ask`.
 */
export function TutorProvider({
  course,
  enabled,
  children,
}: {
  course: TutorCourse;
  enabled: boolean;
  children: ReactNode;
}) {
  const drawer = useRef<DrawerHandle>(null);
  const [open, setOpen] = useState(false);
  const ask = useCallback(
    (context?: TutorAsk) => {
      drawer.current?.open(course, context ?? null);
      setOpen(true);
    },
    [course],
  );
  const value = useMemo<TutorValue>(
    () => ({ enabled, ask: enabled ? ask : () => undefined }),
    [enabled, ask],
  );
  return (
    <TutorValueContext value={value}>
      {children}
      {enabled ? (
        <>
          <button
            type="button"
            hidden={open}
            onClick={() => ask()}
            className="fixed right-6 bottom-[calc(1.5rem+env(safe-area-inset-bottom,0px))] z-20 rounded-full border border-ink bg-paper px-4 py-2 text-[0.84375rem] text-ink transition-colors hover:bg-ink hover:text-paper max-sm:right-4 max-sm:bottom-[calc(1rem+env(safe-area-inset-bottom,0px))]"
          >
            Ask a tutor
          </button>
          <TutorDrawer
            ref={drawer}
            open={open}
            onClose={() => setOpen(false)}
          />
        </>
      ) : null}
    </TutorValueContext>
  );
}

type Bubble =
  | { id: number; role: 'me'; text: string }
  | {
      id: number;
      role: 'ai';
      text: string;
      status: 'thinking' | 'streaming' | 'done' | 'stopped' | 'failed';
      note: string;
      truncated: boolean;
    };

type AiBubble = Extract<Bubble, { role: 'ai' }>;

class TutorFailure extends Error {
  readonly code: string;

  constructor(code: string) {
    super(code);
    this.code = code;
  }
}

function TutorDrawer({
  ref,
  open,
  onClose,
}: {
  ref: Ref<DrawerHandle>;
  open: boolean;
  onClose: () => void;
}) {
  const [course, setCourse] = useState<TutorCourse | null>(null);
  const [chip, setChip] = useState<TutorAsk | null>(null);
  const [bubbles, setBubbles] = useState<Bubble[]>([]);
  const [draft, setDraft] = useState('');
  const [busy, setBusy] = useState(false);
  const turns = useRef<TutorTurn[]>([]);
  // The context the conversation started with; it rides on the first turn.
  const thread = useRef<TutorContext | null>(null);
  const controller = useRef<AbortController | null>(null);
  const opener = useRef<HTMLElement | null>(null);
  const nextId = useRef(0);
  const textarea = useRef<HTMLTextAreaElement>(null);
  const list = useRef<HTMLDivElement>(null);
  const pinned = useRef(true);
  const inputId = useId();

  useImperativeHandle(
    ref,
    () => ({
      open(nextCourse, context) {
        // Opening always starts a fresh conversation, as in the artifact.
        controller.current?.abort();
        controller.current = null;
        turns.current = [];
        thread.current = null;
        pinned.current = true;
        if (
          document.activeElement instanceof HTMLElement &&
          !document.activeElement.closest('[data-tutor]')
        )
          opener.current = document.activeElement;
        setCourse(nextCourse);
        setChip(context);
        setBubbles([]);
        setBusy(false);
        setDraft(context?.starter ?? '');
      },
    }),
    [],
  );

  const close = useCallback(() => {
    controller.current?.abort();
    onClose();
    const back = opener.current;
    opener.current = null;
    // The button that opened the drawer may be hidden until this close renders.
    if (back) requestAnimationFrame(() => back.isConnected && back.focus());
  }, [onClose]);

  useEffect(() => {
    if (!open) return;
    const frame = requestAnimationFrame(() => textarea.current?.focus());
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !event.defaultPrevented) close();
    };
    document.addEventListener('keydown', onKey);
    return () => {
      cancelAnimationFrame(frame);
      document.removeEventListener('keydown', onKey);
    };
  }, [open, close]);

  // Follow the answer as it streams unless the student has scrolled up to read.
  useLayoutEffect(() => {
    const element = list.current;
    if (element && pinned.current) element.scrollTop = element.scrollHeight;
  }, [bubbles]);

  const patch = (id: number, change: Partial<AiBubble>) =>
    setBubbles((current) =>
      current.map((bubble) =>
        bubble.id === id && bubble.role === 'ai'
          ? { ...bubble, ...change }
          : bubble,
      ),
    );

  async function send() {
    const question = draft;
    if (!course || !question.trim()) return;
    setDraft('');
    if (!turns.current.length)
      thread.current = chip ? { label: chip.label, text: chip.text } : null;
    turns.current = [...turns.current, { role: 'user', content: question }];
    const meId = nextId.current++;
    const aiId = nextId.current++;
    pinned.current = true;
    setBubbles((current) => [
      ...current,
      { id: meId, role: 'me', text: question },
      {
        id: aiId,
        role: 'ai',
        text: '',
        status: 'thinking',
        note: '',
        truncated: false,
      },
    ]);
    const request = new AbortController();
    controller.current = request;
    setBusy(true);
    let answer = '';
    try {
      const response = await fetch('/api/study/tutor', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          courseId: course.id,
          messages: turns.current,
          context: thread.current,
        }),
        signal: request.signal,
      });
      if (!response.ok || !response.body) {
        const payload = (await response.json().catch(() => ({}))) as {
          code?: string;
        };
        throw new TutorFailure(payload.code ?? 'http');
      }
      const reader = response.body
        .pipeThrough(new TextDecoderStream())
        .getReader();
      let raw = '';
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        raw += value;
        answer = raw.split(TUTOR_TRAILER)[0];
        patch(aiId, { text: answer, status: 'streaming' });
      }
      const trailer = raw.includes(TUTOR_TRAILER)
        ? raw.slice(raw.indexOf(TUTOR_TRAILER) + 1)
        : '';
      if (trailer && trailer !== 'truncated') throw new TutorFailure(trailer);
      if (!answer.trim()) throw new TutorFailure('http');
      turns.current = [
        ...turns.current,
        { role: 'assistant', content: answer },
      ];
      patch(aiId, {
        text: answer,
        status: 'done',
        truncated: trailer === 'truncated',
      });
    } catch (error) {
      // The failed question leaves the history, so asking again starts clean.
      turns.current = turns.current.slice(0, -1);
      if (!turns.current.length) thread.current = null;
      const code = request.signal.aborted
        ? 'cancelled'
        : error instanceof TutorFailure
          ? error.code
          : 'http';
      if (code === 'cancelled')
        patch(aiId, { text: answer, status: 'stopped' });
      else
        patch(aiId, {
          text: answer,
          status: 'failed',
          note: TUTOR_ERROR_COPY[code] ?? TUTOR_ERROR_COPY.fallback,
        });
    } finally {
      if (controller.current === request) {
        controller.current = null;
        setBusy(false);
      }
    }
  }

  const streaming = bubbles.some(
    (bubble) => bubble.role === 'ai' && bubble.status === 'streaming',
  );

  return (
    <aside
      data-tutor
      aria-label="Tutor"
      aria-hidden={!open}
      inert={!open}
      className={cn(
        'fixed inset-y-0 right-0 z-[45] flex w-[min(420px,100%)] flex-col border-l border-rule bg-paper pt-[env(safe-area-inset-top,0px)] pb-[env(safe-area-inset-bottom,0px)] transition-transform duration-200 ease-out',
        open
          ? 'translate-x-0'
          : 'invisible translate-x-full transition-[transform,visibility]',
      )}
    >
      <header className="flex items-center justify-between gap-3 border-b border-rule px-[18px] py-4">
        <h2 className="font-serif text-[1.1875rem] leading-tight font-medium">
          Tutor
        </h2>
        <button type="button" className="pill" onClick={close}>
          Close
        </button>
      </header>
      {chip ? (
        <div className="mx-[18px] mt-3 flex items-start justify-between gap-2 rounded-md bg-wash px-2.5 py-2 text-[0.78125rem] leading-snug text-ink-2">
          <span className="min-w-0">
            About: <b className="font-medium text-ink">{chip.label}</b>
            {course ? ` (${course.code})` : ''}
          </span>
          <button
            type="button"
            className="textlink shrink-0 text-[0.78125rem]"
            onClick={() => setChip(null)}
          >
            Clear
          </button>
        </div>
      ) : null}
      <div
        ref={list}
        aria-live="polite"
        aria-busy={streaming}
        onScroll={(event) => {
          const element = event.currentTarget;
          pinned.current =
            element.scrollHeight - element.scrollTop - element.clientHeight <
            48;
        }}
        className="flex flex-1 flex-col gap-3.5 overflow-y-auto overscroll-contain px-[18px] py-3.5"
      >
        <p className="text-[0.78125rem] leading-normal text-ink-3">
          {chip
            ? 'Ask anything about this, or send the suggested question.'
            : `Ask about any ${course?.code ?? 'course'} topic. The tutor buttons next to each problem attach that problem automatically.`}
        </p>
        {bubbles.map((bubble) =>
          bubble.role === 'me' ? (
            <div
              key={bubble.id}
              className="max-w-[88%] self-end rounded-xl bg-wash px-3 py-[7px] text-[0.90625rem] leading-[1.6] break-words whitespace-pre-wrap"
            >
              {bubble.text}
            </div>
          ) : (
            <AnswerBubble
              key={bubble.id}
              bubble={bubble}
              math={Boolean(course?.math)}
            />
          ),
        )}
      </div>
      <form
        className="flex items-end gap-2 border-t border-rule px-[18px] py-3"
        onSubmit={(event) => {
          event.preventDefault();
          if (busy) controller.current?.abort();
          else void send();
        }}
      >
        <label className="sr" htmlFor={inputId}>
          Your question
        </label>
        <textarea
          ref={textarea}
          id={inputId}
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={(event) => {
            if (
              event.key === 'Enter' &&
              !event.shiftKey &&
              !event.nativeEvent.isComposing
            ) {
              event.preventDefault();
              event.currentTarget.form?.requestSubmit();
            }
          }}
          placeholder="Ask a question…"
          rows={1}
          className="field max-h-40 min-h-[42px] flex-1 resize-none py-[9px] text-[0.875rem] leading-normal [field-sizing:content]"
        />
        <button type="submit" className="pill pill-primary min-h-[42px] px-4">
          {busy ? 'Stop' : 'Send'}
        </button>
      </form>
    </aside>
  );
}

function AnswerBubble({ bubble, math }: { bubble: AiBubble; math: boolean }) {
  // Math is typeset once the answer is complete; partial TeX would flicker.
  const html = useMemo(() => {
    if (!bubble.text) return '';
    const markup = md(bubble.text);
    return math && bubble.status === 'done' ? renderMathInHtml(markup) : markup;
  }, [bubble.text, bubble.status, math]);
  const note =
    bubble.status === 'failed'
      ? bubble.note
      : bubble.status === 'stopped' && !bubble.text
        ? 'Stopped.'
        : bubble.truncated
          ? 'The answer was cut short. Ask for the rest.'
          : '';
  return (
    <div className="font-serif text-base leading-[1.6] text-ink">
      {bubble.status === 'thinking' ? (
        <p className="text-ink-3">Thinking…</p>
      ) : null}
      {html ? (
        <div
          className={TUTOR_PROSE}
          dangerouslySetInnerHTML={{ __html: html }}
        />
      ) : null}
      {note ? (
        <p
          className={cn(
            'font-sans text-[0.78125rem] text-ink-3',
            html && 'mt-2',
          )}
        >
          {note}
        </p>
      ) : null}
    </div>
  );
}
