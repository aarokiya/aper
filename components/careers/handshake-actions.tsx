'use client';

import { cn } from '@/lib/utils';
import type { HandshakeStatus } from '@/lib/handshake/queries';
import { useHandshake } from '@/components/careers/use-handshake';

/** Opens the visible Handshake sign-in window; label adapts to state. */
export function HandshakeConnectButton({
  initial,
  primary = true,
  small = false,
  className,
}: {
  initial?: HandshakeStatus | null;
  primary?: boolean;
  small?: boolean;
  className?: string;
}) {
  const handshake = useHandshake(initial);
  const reconnect = Boolean(handshake.status?.hasSession);
  return (
    <button
      type="button"
      className={cn(
        'pill',
        primary && 'pill-primary',
        small && 'pill-sm',
        className,
      )}
      onClick={handshake.connect}
      disabled={handshake.busy}
    >
      {handshake.phase === 'connecting'
        ? 'Waiting for sign-in…'
        : reconnect
          ? 'Reconnect Handshake'
          : 'Connect Handshake'}
    </button>
  );
}

/** Starts an on-demand read; joins one already in progress. */
export function HandshakeRefreshButton({
  initial,
  small = false,
  className,
}: {
  initial?: HandshakeStatus | null;
  small?: boolean;
  className?: string;
}) {
  const handshake = useHandshake(initial);
  return (
    <button
      type="button"
      className={cn('pill', small && 'pill-sm', className)}
      onClick={handshake.refresh}
      disabled={handshake.busy}
    >
      {handshake.phase === 'syncing' ? 'Refreshing…' : 'Refresh now'}
    </button>
  );
}

/**
 * The live progress/result line for whichever Handshake control was used.
 * Every instance reads the same shared state; changes are announced politely.
 */
export function HandshakeLiveNote({
  initial,
  className,
}: {
  initial?: HandshakeStatus | null;
  className?: string;
}) {
  const handshake = useHandshake(initial);
  return (
    <p
      aria-live="polite"
      className={cn(
        'text-[0.8125rem] text-ink-3',
        handshake.phase === 'error' && 'text-bad',
        !handshake.message && 'sr',
        className,
      )}
    >
      {handshake.busy && (
        <span
          aria-hidden
          className="mr-2 inline-block size-1.5 animate-pulse rounded-full bg-ink-3 align-middle motion-reduce:animate-none"
        />
      )}
      {handshake.message}
    </p>
  );
}
