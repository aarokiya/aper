'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import {
  HandshakeConnectButton,
  HandshakeLiveNote,
  HandshakeRefreshButton,
} from '@/components/careers/handshake-actions';
import { TokenField } from '@/components/careers/token-field';
import { useHandshake } from '@/components/careers/use-handshake';
import { fmtSyncedAt } from '@/lib/handshake/format';
import type { HandshakeStatus } from '@/lib/handshake/queries';
import type { CareerProfile } from '@/lib/handshake/relevance';
import { cn } from '@/lib/utils';

function statusLabel(status: HandshakeStatus) {
  if (status.connected) return 'Connected';
  if (status.authStatus === 'AUTHENTICATION_REQUIRED') return 'Sign-in needed';
  if (status.authStatus === 'ERROR') return 'Could not check';
  return 'Not connected';
}

/**
 * Settings group for Handshake: connection, daily read status, and the
 * local career profile that ranks campus events. Self-contained; reads
 * /api/handshake/status and /api/handshake/profile on mount.
 */
export function HandshakeSettings() {
  const [initial, setInitial] = useState<HandshakeStatus | null>(null);
  const [loadError, setLoadError] = useState('');
  const handshake = useHandshake(initial);
  const status = handshake.status;

  useEffect(() => {
    fetch('/api/handshake/status', { cache: 'no-store' })
      .then((response) => {
        if (!response.ok)
          throw new Error(`Status request failed (${response.status}).`);
        return response.json() as Promise<HandshakeStatus>;
      })
      .then(setInitial)
      .catch((error: unknown) =>
        setLoadError(error instanceof Error ? error.message : String(error)),
      );
  }, []);

  const now = new Date().toISOString();
  return (
    <section id="handshake" className="border-t border-rule pt-7 pb-12">
      <h2 className="display text-[1.375rem]">Handshake</h2>
      <p className="mt-1 max-w-[60ch] text-[0.84375rem] text-ink-3">
        Campus events for Careers and Today, read once a day from your Handshake
        account. Read-only: nothing is registered for, saved, or RSVPed on
        Handshake.
      </p>

      {loadError && (
        <p className="mt-5 text-[0.8125rem] text-bad" role="alert">
          {loadError}
        </p>
      )}

      {status && (
        <dl className="mt-5 grid grid-cols-[9rem_1fr] gap-y-1.5 text-[0.8125rem]">
          <dt className="text-ink-3">Status</dt>
          <dd className={cn(status.connected ? 'text-ink' : 'text-ink-2')}>
            {statusLabel(status)}
          </dd>
          <dt className="text-ink-3">Last read</dt>
          <dd>
            {status.lastSyncedAt
              ? `${fmtSyncedAt(status.lastSyncedAt, now)}, ${status.counts.events} upcoming ${status.counts.events === 1 ? 'event' : 'events'}`
              : 'Never'}
          </dd>
          <dt className="text-ink-3">Schedule</dt>
          <dd>
            Daily after 7 AM while the background worker runs, and whenever you
            refresh
          </dd>
          {status.lastError && !handshake.busy && (
            <>
              <dt className="text-ink-3">Last problem</dt>
              <dd className="text-bad">{status.lastError}</dd>
            </>
          )}
        </dl>
      )}

      <div className="mt-5 flex flex-wrap items-center gap-2">
        <HandshakeConnectButton
          initial={initial}
          primary={!status?.connected}
        />
        {status?.hasSession && <HandshakeRefreshButton initial={initial} />}
        <Link href="/careers" className="textlink ml-1">
          Open Careers
        </Link>
      </div>
      <HandshakeLiveNote initial={initial} className="mt-3" />
      {!status?.hasSession && (
        <p className="mt-3 max-w-[60ch] text-[0.78125rem] text-ink-4">
          Connecting opens a Handshake window on this computer. Sign in with your
          Georgia Tech account there; _aper never sees your password or Duo
          response, and only keeps the session cookie on this machine.
        </p>
      )}

      <CareerProfileEditor />
    </section>
  );
}

function CareerProfileEditor() {
  const [saved, setSaved] = useState<CareerProfile | null>(null);
  const [draft, setDraft] = useState<CareerProfile | null>(null);
  const [state, setState] = useState<{
    kind: 'idle' | 'saving' | 'saved' | 'error';
    message: string;
  }>({
    kind: 'idle',
    message: '',
  });

  useEffect(() => {
    fetch('/api/handshake/profile', { cache: 'no-store' })
      .then((response) => response.json() as Promise<CareerProfile>)
      .then((profile) => {
        setSaved(profile);
        setDraft(profile);
      })
      .catch(() =>
        setState({
          kind: 'error',
          message: 'Could not load the career profile.',
        }),
      );
  }, []);

  if (!draft || !saved) return null;
  const dirty = JSON.stringify(draft) !== JSON.stringify(saved);
  const update = (next: Partial<CareerProfile>) => {
    setDraft({ ...draft, ...next });
    setState({ kind: 'idle', message: '' });
  };

  const save = async () => {
    setState({ kind: 'saving', message: 'Saving…' });
    try {
      const response = await fetch('/api/handshake/profile', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(draft),
      });
      const body = (await response.json()) as CareerProfile & {
        error?: string;
      };
      if (!response.ok)
        throw new Error(body.error ?? `Save failed (${response.status}).`);
      setSaved(body);
      setDraft(body);
      setState({
        kind: 'saved',
        message: 'Saved. Events are re-ranked.',
      });
    } catch (error) {
      setState({
        kind: 'error',
        message: error instanceof Error ? error.message : String(error),
      });
    }
  };

  return (
    <form
      className="mt-10"
      onSubmit={(event) => {
        event.preventDefault();
        void save();
      }}
    >
      <h3 className="text-[0.9375rem] font-medium text-ink">Career profile</h3>
      <p className="mt-1 max-w-[60ch] text-[0.8125rem] text-ink-3">
        Ranks the campus events Handshake shows you. Each event lists the
        matches that put it there.
      </p>
      {!saved.interests.length && (
        <p className="mt-2 max-w-[60ch] text-[0.8125rem] text-ink-2">
          No interests yet, so events are ranked by Handshake and event type
          only. Add a few, like your major or the roles you want.
        </p>
      )}
      <div className="mt-5 grid max-w-[40rem] gap-5">
        <TokenField
          label="Interests"
          hint="Matched in event titles first, then descriptions and organizers."
          placeholder="Add an interest"
          values={draft.interests}
          onChange={(interests) => update({ interests })}
        />
        <TokenField
          label="Leave out"
          hint="Ranks events lower when the title or stated requirements mention these."
          placeholder="Add a word or phrase"
          values={draft.excludes}
          onChange={(excludes) => update({ excludes })}
        />
      </div>
      <div className="mt-5 flex flex-wrap items-center gap-3">
        <button
          type="submit"
          className="pill pill-primary"
          disabled={!dirty || state.kind === 'saving'}
        >
          Save profile
        </button>
        {dirty && (
          <button
            type="button"
            className="textlink"
            onClick={() => {
              setDraft(saved);
              setState({ kind: 'idle', message: '' });
            }}
          >
            Discard changes
          </button>
        )}
        <p
          aria-live="polite"
          className={cn(
            'text-[0.8125rem]',
            state.kind === 'error' ? 'text-bad' : 'text-ink-3',
          )}
        >
          {state.message}
        </p>
      </div>
    </form>
  );
}
