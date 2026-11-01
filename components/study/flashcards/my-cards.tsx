'use client';

import {
  type KeyboardEvent,
  useEffect,
  useEffectEvent,
  useMemo,
  useRef,
  useState,
} from 'react';
import { plural, weekName } from '@/components/study/format';
import { useStudyProgress } from '@/lib/study/progress-client';
import { itemKey } from '@/lib/study/srs';
import type { StudyCourseState, UserCard } from '@/lib/study/types';
import {
  cardsToTsv,
  parseCardTable,
  type ParsedCard,
} from '@/lib/study/user-cards';
import { renderUserText } from '@/lib/study/user-text';

type CourseWeek = { n: number; label: string; title: string };

type Draft = {
  /** card being edited; null = a new card */
  id: string | null;
  f: string;
  b: string;
  a: string;
  w: string;
  tags: string;
};

const EMPTY: Draft = { id: null, f: '', b: '', a: '', w: '', tags: '' };

/** Comma-separated tags, trimmed and deduplicated. */
const parseTags = (text: string) => [
  ...new Set(
    text
      .split(',')
      .map((tag) => tag.trim())
      .filter(Boolean),
  ),
];

/** A short id no card of this course uses yet. */
function newId(taken: Record<string, unknown>) {
  let id = crypto.randomUUID().slice(0, 8);
  while (id in taken) id = crypto.randomUUID().slice(0, 8);
  return id;
}

/** Flashcards → My cards: write, edit, import, and export the student's own cards. */
export function MyCardsView({
  cid,
  course,
  initial,
}: {
  cid: string;
  course: { code: string; weeks: CourseWeek[] };
  initial: StudyCourseState;
}) {
  const { state, update } = useStudyProgress(cid, initial);
  const [draft, setDraft] = useState<Draft>(EMPTY);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const formRef = useRef<HTMLFormElement>(null);
  const frontRef = useRef<HTMLTextAreaElement>(null);

  const cards = useMemo(
    () =>
      Object.entries(state.uc).sort(
        ([idA, a], [idB, b]) => b.t - a.t || idA.localeCompare(idB),
      ),
    [state.uc],
  );

  const weekLabel = (n: number | undefined) => {
    if (n === undefined) return null;
    const found = course.weeks.find((week) => week.n === n);
    return found ? weekName(found) : `Week ${n}`;
  };

  const edit = (id: string, card: UserCard) => {
    setDraft({
      id,
      f: card.f,
      b: card.b,
      a: (card.a ?? []).join('\n'),
      w: card.w === undefined ? '' : String(card.w),
      tags: (card.tags ?? []).join(', '),
    });
    setError('');
    formRef.current?.scrollIntoView({ block: 'start' });
    frontRef.current?.focus({ preventScroll: true });
  };

  // Deep links (`#<card id>`, e.g. "Edit card" in a review session) open that card in the form.
  const openFromHash = useEffectEvent(() => {
    const id = decodeURIComponent(window.location.hash.slice(1));
    const card = id ? state.uc[id] : undefined;
    if (card) edit(id, card);
  });
  useEffect(() => {
    const frame = window.requestAnimationFrame(() => openFromHash());
    const onHash = () => openFromHash();
    window.addEventListener('hashchange', onHash);
    return () => {
      window.cancelAnimationFrame(frame);
      window.removeEventListener('hashchange', onHash);
    };
  }, []);

  const save = () => {
    const f = draft.f.trim();
    const b = draft.b.trim();
    if (!f || !b) {
      setError('A card needs a front and a back.');
      return;
    }
    const answers = draft.a
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean);
    const tags = parseTags(draft.tags);
    const editing = draft.id;
    const card: UserCard = {
      f,
      b,
      t: (editing && state.uc[editing]?.t) || Date.now(),
    };
    if (answers.length > 0) card.a = answers;
    if (draft.w) card.w = Number(draft.w);
    if (tags.length > 0) card.tags = tags;
    const id = editing && state.uc[editing] ? editing : newId(state.uc);
    update((next) => {
      next.uc[id] = card;
    });
    setDraft(EMPTY);
    setError('');
    setNotice(editing ? 'Card updated.' : 'Card added.');
    if (editing && window.location.hash)
      window.history.replaceState(
        null,
        '',
        window.location.pathname + window.location.search,
      );
    frontRef.current?.focus();
  };

  const remove = (id: string) => {
    if (!window.confirm('Delete this card and its review history?')) return;
    update((next) => {
      delete next.uc[id];
      delete next.srs[itemKey('mine', id)];
    });
    if (draft.id === id) setDraft(EMPTY);
    setNotice('Card deleted.');
  };

  const exportCards = () => {
    const blob = new Blob([cardsToTsv(state.uc)], {
      type: 'text/tab-separated-values;charset=utf-8',
    });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `${course.code.replace(/\s+/g, '')}-my-cards.tsv`;
    document.body.append(link);
    link.click();
    link.remove();
    window.setTimeout(() => URL.revokeObjectURL(link.href), 2000);
  };

  /** Ctrl/⌘+Enter in any form field saves the card. */
  const saveOnModEnter = (event: KeyboardEvent) => {
    if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) {
      event.preventDefault();
      formRef.current?.requestSubmit();
    }
  };

  return (
    <section className="ca" aria-label={`My ${course.code} cards`}>
      <form
        ref={formRef}
        className="ca-form"
        aria-labelledby="ca-form-h"
        onSubmit={(event) => {
          event.preventDefault();
          save();
        }}
      >
        <h3 id="ca-form-h" className="ca-h">
          {draft.id ? 'Edit card' : 'New card'}
        </h3>
        <div className="ca-pair">
          <label className="ca-field">
            <span>Front</span>
            <textarea
              ref={frontRef}
              rows={4}
              onKeyDown={saveOnModEnter}
              value={draft.f}
              onChange={(event) =>
                setDraft({ ...draft, f: event.target.value })
              }
              required
            />
          </label>
          <label className="ca-field">
            <span>Back</span>
            <textarea
              rows={4}
              onKeyDown={saveOnModEnter}
              value={draft.b}
              onChange={(event) =>
                setDraft({ ...draft, b: event.target.value })
              }
              required
            />
          </label>
        </div>
        <p className="ca-hint">
          Plain text. Wrap code in backticks for <code>`inline code`</code>, or
          put it between lines of <code>```</code> for a code block.
        </p>
        <div className="ca-pair">
          <label className="ca-field">
            <span>Typed answers (optional, one per line)</span>
            <textarea
              rows={2}
              onKeyDown={saveOnModEnter}
              value={draft.a}
              onChange={(event) =>
                setDraft({ ...draft, a: event.target.value })
              }
              aria-describedby="ca-a-hint"
            />
            <small id="ca-a-hint" className="ca-hint">
              With answers, review asks you to type one instead of flipping.
            </small>
          </label>
          <div className="ca-pair-col">
            <label className="ca-field">
              <span>Week (optional)</span>
              <select
                value={draft.w}
                onChange={(event) =>
                  setDraft({ ...draft, w: event.target.value })
                }
              >
                <option value="">No week</option>
                {course.weeks.map((week) => (
                  <option key={week.n} value={String(week.n)}>
                    {`${weekName(week)}${week.title ? ` · ${week.title}` : ''}`}
                  </option>
                ))}
              </select>
            </label>
            <label className="ca-field">
              <span>Tags (comma separated)</span>
              <input
                type="text"
                value={draft.tags}
                onKeyDown={saveOnModEnter}
                onChange={(event) =>
                  setDraft({ ...draft, tags: event.target.value })
                }
              />
            </label>
          </div>
        </div>

        {draft.f.trim() || draft.b.trim() ? (
          <div className="ca-preview" aria-label="Preview">
            <div className="ca-side">
              <span className="ca-lbl">Front preview</span>
              <div
                className="ca-user"
                dangerouslySetInnerHTML={{ __html: renderUserText(draft.f) }}
              />
            </div>
            <div className="ca-side">
              <span className="ca-lbl">Back preview</span>
              <div
                className="ca-user"
                dangerouslySetInnerHTML={{ __html: renderUserText(draft.b) }}
              />
            </div>
          </div>
        ) : null}

        <div className="ca-row">
          <button type="submit" className="pill pill-primary pill-sm">
            {draft.id ? 'Save changes' : 'Add card'}
          </button>
          {draft.id || draft.f || draft.b ? (
            <button
              type="button"
              className="textlink"
              onClick={() => {
                setDraft(EMPTY);
                setError('');
              }}
            >
              {draft.id ? 'Cancel editing' : 'Clear'}
            </button>
          ) : null}
          <span className="ca-hint">
            <kbd className="kbd">Ctrl</kbd>/<kbd className="kbd">⌘</kbd>+
            <kbd className="kbd">Enter</kbd> saves
          </span>
          <span className={error ? 'ca-msg bad' : 'ca-msg'} aria-live="polite">
            {error || notice}
          </span>
        </div>
      </form>

      <h3 className="ca-h">
        Your cards <span className="ca-meta">{cards.length}</span>
      </h3>
      {cards.length === 0 ? (
        <p className="ca-empty">
          No cards yet. Cards you add join Daily review as new items.
        </p>
      ) : (
        <ul className="ca-list">
          {cards.map(([id, card]) => {
            const week = weekLabel(card.w);
            return (
              <li
                key={id}
                id={id}
                className={draft.id === id ? 'ca-editing' : undefined}
              >
                <div className="ca-pair">
                  <div
                    className="ca-user"
                    dangerouslySetInnerHTML={{ __html: renderUserText(card.f) }}
                  />
                  <div
                    className="ca-user ca-back"
                    dangerouslySetInnerHTML={{ __html: renderUserText(card.b) }}
                  />
                </div>
                <div className="ca-row">
                  <span className="ca-meta">
                    {[
                      week,
                      card.a?.length
                        ? plural(card.a.length, 'typed answer')
                        : null,
                      card.tags?.length ? card.tags.join(', ') : null,
                      new Date(card.t).toLocaleDateString('en-US', {
                        month: 'short',
                        day: 'numeric',
                      }),
                    ]
                      .filter(Boolean)
                      .join(' · ')}
                  </span>
                  <button
                    type="button"
                    className="textlink"
                    onClick={() => edit(id, card)}
                  >
                    Edit
                  </button>
                  <button
                    type="button"
                    className="textlink"
                    onClick={() => remove(id)}
                  >
                    Delete
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      <ImportCards
        weeks={course.weeks}
        onAdd={(parsed, w, extraTags) => {
          const at = Date.now();
          update((next) => {
            parsed.forEach((entry, i) => {
              const card: UserCard = { f: entry.f, b: entry.b, t: at + i };
              if (w !== null) card.w = w;
              const tags = [...new Set([...(entry.tags ?? []), ...extraTags])];
              if (tags.length > 0) card.tags = tags;
              next.uc[newId(next.uc)] = card;
            });
          });
          setNotice(`Added ${plural(parsed.length, 'card')}.`);
        }}
      />

      <div className="ca-sec">
        <h3 className="ca-h">Export</h3>
        <p className="ca-hint">
          A tab-separated file (front, back, tags) that spreadsheets and other
          flashcard apps open, and that Import reads back.
        </p>
        <button
          type="button"
          className="pill pill-sm"
          disabled={cards.length === 0}
          onClick={exportCards}
        >
          Download {course.code.replace(/\s+/g, '')}-my-cards.tsv
        </button>
      </div>
    </section>
  );
}

function ImportCards({
  weeks,
  onAdd,
}: {
  weeks: CourseWeek[];
  onAdd: (
    cards: ParsedCard[],
    week: number | null,
    tags: string[],
  ) => void;
}) {
  const [text, setText] = useState('');
  const [week, setWeek] = useState('');
  const [tags, setTags] = useState('');
  const [fileError, setFileError] = useState('');
  const parsed = useMemo(
    () => (text.trim() ? parseCardTable(text) : null),
    [text],
  );

  return (
    <div className="ca-sec">
      <h3 className="ca-h">Import</h3>
      <p className="ca-hint">
        Paste rows from a spreadsheet, or choose a .csv, .tsv, or .txt file.
        Column 1 is the front, column 2 the back, an optional column 3 holds
        tags; a header row is skipped.
      </p>
      <label className="ca-field">
        <span>Cards to import</span>
        <textarea
          rows={5}
          value={text}
          onChange={(event) => setText(event.target.value)}
          spellCheck={false}
          className="mono"
        />
      </label>
      <div className="ca-row">
        <label className="ca-file">
          <span>Choose file</span>
          <input
            type="file"
            accept=".csv,.tsv,.txt,text/csv,text/tab-separated-values,text/plain"
            onChange={async (event) => {
              const input = event.currentTarget;
              const file = input.files?.[0];
              if (!file) return;
              try {
                setText(await file.text());
                setFileError('');
              } catch {
                setFileError(`Could not read ${file.name}.`);
              }
              input.value = '';
            }}
          />
        </label>
        <label className="ca-field ca-inline">
          <span>Week for all</span>
          <select value={week} onChange={(event) => setWeek(event.target.value)}>
            <option value="">No week</option>
            {weeks.map((w) => (
              <option key={w.n} value={String(w.n)}>
                {weekName(w)}
              </option>
            ))}
          </select>
        </label>
        <label className="ca-field ca-inline">
          <span>Extra tags</span>
          <input
            type="text"
            value={tags}
            placeholder="comma separated"
            onChange={(event) => setTags(event.target.value)}
          />
        </label>
      </div>
      <p className="ca-msg" aria-live="polite">
        {fileError ||
          (parsed
            ? `${plural(parsed.cards.length, 'card')} ready, ${parsed.skipped} skipped`
            : '')}
      </p>
      {parsed && parsed.cards.length > 0 ? (
        <>
          <div className="tbl-wrap">
            <table className="ca-table">
              <thead>
                <tr>
                  <th scope="col">Front</th>
                  <th scope="col">Back</th>
                  <th scope="col">Tags</th>
                </tr>
              </thead>
              <tbody>
                {parsed.cards.slice(0, 10).map((card, i) => (
                  <tr key={i}>
                    <td className="ca-clip">{card.f}</td>
                    <td className="ca-clip">{card.b}</td>
                    <td>{card.tags?.join(', ')}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {parsed.cards.length > 10 ? (
            <p className="ca-hint">
              Showing the first 10 of {parsed.cards.length}.
            </p>
          ) : null}
          <div className="ca-row">
            <button
              type="button"
              className="pill pill-primary pill-sm"
              onClick={() => {
                onAdd(
                  parsed.cards,
                  week ? Number(week) : null,
                  parseTags(tags),
                );
                setText('');
              }}
            >
              Add all {parsed.cards.length}
            </button>
            <button
              type="button"
              className="textlink"
              onClick={() => setText('')}
            >
              Discard
            </button>
          </div>
        </>
      ) : null}
    </div>
  );
}
