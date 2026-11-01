'use client';

import { useCallback, useState } from 'react';
import { ACADEMIC_PROVIDER_KEYS } from '@/lib/sync/provider';

type SyncState = 'idle' | 'starting' | 'running' | 'success' | 'error';
type SyncStatus = {
  active: boolean;
  providers: Array<{
    key: string;
    displayName: string;
    authStatus: string;
    lastError: string | null;
  }>;
  latestRun: null | {
    id: number;
    status: string;
    progressLabel: string | null;
    errors: string;
  };
};

const wait = (milliseconds: number) =>
  new Promise((resolve) => window.setTimeout(resolve, milliseconds));

export function useCanvasSync() {
  const [state, setState] = useState<SyncState>('idle');
  const [message, setMessage] = useState('');

  const startSync = useCallback(async () => {
    if (state === 'starting' || state === 'running') return;
    setState('starting');
    setMessage('Starting Canvas and Gradescope sync…');
    try {
      const before = (await fetch('/api/sync/status', {
        cache: 'no-store',
      }).then((response) => response.json())) as SyncStatus;
      const response = await fetch('/api/sync', { method: 'POST' });
      if (!response.ok)
        throw new Error(`Sync request failed (${response.status})`);
      setState('running');
      for (let attempt = 0; attempt < 360; attempt += 1) {
        await wait(1000);
        const current = (await fetch('/api/sync/status', {
          cache: 'no-store',
        }).then((value) => value.json())) as SyncStatus;
        const trackedRun = Boolean(
          current.latestRun &&
          (before.active
            ? current.latestRun.id === before.latestRun?.id
            : current.latestRun.id !== before.latestRun?.id),
        );
        setMessage(
          current.latestRun?.progressLabel ||
            (current.active
              ? 'Syncing academic sources…'
              : 'Finalizing local index…'),
        );
        if (!current.active && trackedRun && current.latestRun) {
          // Only Canvas and Gradescope decide this sync's outcome; Handshake
          // has its own daily run and may legitimately need sign-in.
          const providerProblems = current.providers.filter(
            (provider) =>
              (ACADEMIC_PROVIDER_KEYS as readonly string[]).includes(provider.key) &&
              (provider.authStatus !== 'CONNECTED' || provider.lastError),
          );
          if (providerProblems.length)
            throw new Error(
              providerProblems
                .map(
                  (provider) =>
                    `${provider.displayName}: ${provider.lastError || provider.authStatus}`,
                )
                .join(' '),
            );
          if (
            current.latestRun.status === 'SUCCESS' ||
            current.latestRun.status === 'PARTIAL'
          ) {
            setState('success');
            setMessage(
              current.latestRun.status === 'PARTIAL'
                ? 'Sync completed with warnings. Refreshing…'
                : 'Canvas and Gradescope are up to date. Refreshing…',
            );
            window.location.reload();
            return;
          }
          const errors = (() => {
            try {
              return (JSON.parse(current.latestRun.errors) as string[]).join(
                ' ',
              );
            } catch {
              return '';
            }
          })();
          throw new Error(
            errors || `Sync ended with ${current.latestRun.status}.`,
          );
        }
      }
      throw new Error(
        'Sync is still running. Check Settings or Developer debug for progress.',
      );
    } catch (error) {
      setState('error');
      setMessage(error instanceof Error ? error.message : String(error));
    }
  }, [state]);

  return {
    startSync,
    state,
    message,
    busy: state === 'starting' || state === 'running',
  };
}
