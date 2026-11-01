import { getDb } from '@/lib/db/client';
import type { ClassWork } from '@/lib/study/class-status';
import { localDayKey } from '@/lib/study/model';
import { getClassWork, getStudyNav, type StudyNav } from '@/lib/study/nav';

export type ProviderStatus = {
  key: string;
  name: string;
  authStatus: string;
  lastSuccessAt: string | null;
  lastError: string | null;
};

export type ShellData = {
  term: string | null;
  providers: ProviderStatus[];
  study: StudyNav;
  /** open work per Canvas course id, for the class status dots */
  work: Record<number, ClassWork>;
  /** local `YYYY-MM-DD`, computed once per request so SSR and hydration agree */
  today: string;
};

export function getShellData(): ShellData {
  const study = getStudyNav();
  const { sqlite } = getDb();
  const providers = sqlite
    .prepare(
      `SELECT key, display_name AS name, auth_status AS authStatus, last_success_at AS lastSuccessAt, last_error AS lastError
       FROM providers WHERE key IN ('canvas','gradescope','handshake') ORDER BY CASE key WHEN 'canvas' THEN 0 WHEN 'gradescope' THEN 1 ELSE 2 END`,
    )
    .all() as ProviderStatus[];
  const term = sqlite
    .prepare(
      `SELECT term_name AS term FROM courses WHERE is_current=1 AND COALESCE(term_name,'')<>'Default Term' AND term_name IS NOT NULL
       GROUP BY term_name ORDER BY count(*) DESC LIMIT 1`,
    )
    .get() as { term: string } | undefined;
  return {
    term: term?.term ?? null,
    providers,
    study,
    work: getClassWork(),
    today: localDayKey(),
  };
}
