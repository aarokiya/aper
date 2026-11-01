/**
 * Providers covered by the hourly "Sync now". Handshake syncs separately
 * (daily + on demand), so its auth state never affects an academic sync.
 */
export const ACADEMIC_PROVIDER_KEYS = ['canvas', 'gradescope'] as const;

export type AuthState = 'CONNECTED' | 'AUTHENTICATION_REQUIRED' | 'UNKNOWN' | 'ERROR';

export interface AuthStatus {
  state: AuthState;
  accountName?: string;
  checkedAt: string;
  detail?: string;
}

export interface DiscoverySource {
  entity: string;
  browserUrl: string;
  endpoint?: string;
  method: 'GET' | 'DOM';
  reliability: 'high' | 'medium' | 'fallback';
}

export interface DiscoveryResult {
  provider: string;
  observedAt: string;
  sources: DiscoverySource[];
}

export interface SyncResult {
  provider: string;
  runId: number;
  startedAt: string;
  finishedAt: string;
  status: 'SUCCESS' | 'PARTIAL' | 'FAILED' | 'AUTH_REQUIRED';
  entitiesSeen: number;
  entitiesUpdated: number;
  warnings: string[];
  errors: string[];
  timings: Record<string, number>;
}

export interface AcademicProvider {
  checkAuth(): Promise<AuthStatus>;
  authenticate(): Promise<void>;
  discover(): Promise<DiscoveryResult>;
  sync(): Promise<SyncResult>;
}
