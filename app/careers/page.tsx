import { PageFrame } from '@/components/page-frame';
import { CareersView } from '@/components/careers/careers-view';
import {
  HandshakeConnectButton,
  HandshakeRefreshButton,
} from '@/components/careers/handshake-actions';
import { parseEventFilters } from '@/lib/handshake/event-filters';
import { fmtSyncedAt } from '@/lib/handshake/format';
import { getCareersPage, type HandshakeStatus } from '@/lib/handshake/queries';

export const dynamic = 'force-dynamic';

function eyebrow(status: HandshakeStatus, now: string) {
  if (status.lastSyncedAt)
    return `From Handshake, updated ${fmtSyncedAt(status.lastSyncedAt, now)}`;
  if (status.connected) return 'From Handshake, not read yet';
  if (status.hasSession) return 'Handshake needs you to sign in again';
  return 'Handshake is not connected';
}

export default async function CareersPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const filters = parseEventFilters(await searchParams);
  const data = getCareersPage();
  const { status } = data;
  return (
    <PageFrame
      title="Careers"
      eyebrow={eyebrow(status, data.now)}
      actions={
        status.hasSession ? (
          <HandshakeRefreshButton initial={status} />
        ) : data.events.length ? (
          <HandshakeConnectButton initial={status} />
        ) : null
      }
    >
      <CareersView data={data} initialFilters={filters} />
    </PageFrame>
  );
}
