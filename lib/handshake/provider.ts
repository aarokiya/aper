import fs from 'node:fs';
import path from 'node:path';
import type { BrowserContext, Page } from 'playwright';
import { dataDir, getDb, initializeDatabase } from '@/lib/db/client';
import {
  authenticateHandshake,
  checkHandshakeAuth,
  HANDSHAKE_ORIGIN,
  openHandshakeContext,
  passBrowserCheck,
  SIGNED_OUT_PATH,
} from '@/lib/handshake/auth';
import { parseEventWhen } from '@/lib/handshake/dates';
import {
  parseEventDetail,
  parseListing,
  type ListingCandidate,
  type ParsedEvent,
} from '@/lib/handshake/parse';
import {
  markEventsListed,
  rescoreHandshake,
  upsertEvent,
} from '@/lib/handshake/store';
import type {
  AcademicProvider,
  AuthStatus,
  DiscoveryResult,
  SyncResult,
} from '@/lib/sync/provider';
import { nowIso } from '@/lib/sync/utils';

const json = (value: unknown) => JSON.stringify(value ?? null);
const message = (error: unknown) =>
  error instanceof Error ? error.message : String(error);

const positiveInt = (value: string | undefined, fallback: number) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 1 ? Math.floor(parsed) : fallback;
};

/** Handshake's own events list, sorted by its relevance for this student. */
const EVENTS_LIST_URL = `${HANDSHAKE_ORIGIN}/stu/events?collection=ALL&eventFormat=HYBRID&sort=RELEVANCE&date=ALL`;
/**
 * Handshake sits behind Cloudflare, whose browser check never completes in a
 * headless browser, so reads open a real (visible) Chrome window by default.
 * HANDSHAKE_HEADLESS=1 opts back into headless where that check passes.
 */
const READ_HEADLESS = process.env.HANDSHAKE_HEADLESS === '1';
/** Links to a specific event (numeric id), never the nav's list links. */
const EVENT_LINK = String.raw`\/events\/\d+`;

function countEventLinks(page: Page) {
  return page.evaluate(
    (source) =>
      new Set(
        [...document.querySelectorAll('a[href]')]
          .map(
            (link) => link.getAttribute('href')?.match(new RegExp(source))?.[0],
          )
          .filter(Boolean),
      ).size,
    EVENT_LINK,
  );
}

function waitForEventLinks(page: Page) {
  return page
    .waitForFunction(
      (source) =>
        [...document.querySelectorAll('a[href]')].some((link) =>
          new RegExp(source).test(link.getAttribute('href') ?? ''),
        ),
      EVENT_LINK,
      { timeout: 20_000 },
    )
    .then(() => true)
    .catch(() => false);
}

class SignedOutError extends Error {
  constructor(url: string) {
    super(
      `Handshake signed this session out (redirected to ${new URL(url).hostname}${new URL(url).pathname}).`,
    );
  }
}

type EventCandidate = ListingCandidate & { postedBySchool: boolean };

type Run = {
  id: number;
  startedAt: string;
  rawRoot: string;
  seen: number;
  updated: number;
  warnings: string[];
  errors: string[];
  timings: Record<string, number>;
};

export class HandshakeProvider implements AcademicProvider {
  async checkAuth(): Promise<AuthStatus> {
    const context = await openHandshakeContext(READ_HEADLESS);
    try {
      return await checkHandshakeAuth(context);
    } finally {
      await context.close();
    }
  }

  async authenticate(): Promise<void> {
    await authenticateHandshake();
  }

  async discover(): Promise<DiscoveryResult> {
    return {
      provider: 'handshake',
      observedAt: nowIso(),
      sources: [
        {
          entity: 'events sorted by relevance',
          browserUrl: EVENTS_LIST_URL,
          method: 'DOM',
          reliability: 'medium',
        },
        {
          entity: 'event details',
          browserUrl: `${HANDSHAKE_ORIGIN}/stu/events/:eventId`,
          method: 'DOM',
          reliability: 'medium',
        },
      ],
    };
  }

  async sync(): Promise<SyncResult> {
    initializeDatabase();
    const { sqlite } = getDb();
    const startedAt = nowIso();
    const row = sqlite
      .prepare(
        `INSERT INTO sync_runs (provider,started_at,status,auth_status,errors_json,warnings_json,timings_json,progress_label) VALUES ('handshake',?,'RUNNING','UNKNOWN','[]','[]','{}','Checking Handshake sign-in…') RETURNING id`,
      )
      .get(startedAt) as { id: number };
    const run: Run = {
      id: row.id,
      startedAt,
      rawRoot: path.join(dataDir, 'raw', 'handshake', `run-${row.id}`),
      seen: 0,
      updated: 0,
      warnings: [],
      errors: [],
      timings: {},
    };
    let context: BrowserContext | undefined;
    try {
      context = await openHandshakeContext(READ_HEADLESS);
      const page = context.pages()[0] ?? (await context.newPage());
      const auth = await checkHandshakeAuth(context, page);
      sqlite
        .prepare(
          `INSERT INTO providers (key,display_name,auth_status,last_attempt_at) VALUES ('handshake','Handshake',?,?) ON CONFLICT(key) DO UPDATE SET display_name=excluded.display_name,auth_status=excluded.auth_status,last_attempt_at=excluded.last_attempt_at`,
        )
        .run(auth.state, startedAt);
      if (auth.state !== 'CONNECTED')
        return this.finishAuthRequired(run, auth.detail);

      fs.mkdirSync(path.join(run.rawRoot, 'failed'), {
        recursive: true,
        mode: 0o700,
      });
      const delayMs = Number(process.env.HANDSHAKE_DELAY_MS ?? 700);
      const events = await this.syncEvents(page, run, delayMs);
      this.writeSnapshot(run, 'events.json', events);
      rescoreHandshake();
      return this.finish(run);
    } catch (error) {
      if (error instanceof SignedOutError)
        return this.finishAuthRequired(run, error.message);
      run.errors.push(message(error));
      return this.finish(run, 'FAILED');
    } finally {
      if (context) await context.close().catch(() => undefined);
    }
  }

  private progress(run: Run, label: string) {
    getDb()
      .sqlite.prepare(`UPDATE sync_runs SET progress_label=? WHERE id=?`)
      .run(label, run.id);
  }

  private async visit(page: Page, url: string) {
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30_000 });
    if (!(await passBrowserCheck(page)))
      throw new Error(
        "Handshake's browser check (Cloudflare) did not finish. Reads need a visible Chrome window; unset HANDSHAKE_HEADLESS and refresh again.",
      );
    const landed = new URL(page.url());
    if (SIGNED_OUT_PATH.test(landed.pathname))
      throw new SignedOutError(page.url());
  }

  /** Scrolls lazy lists and presses "Load more" until enough links render. */
  private async revealList(page: Page, wanted: number) {
    let previous = -1;
    for (let attempt = 0; attempt < 8; attempt += 1) {
      const count = await countEventLinks(page);
      if (count >= wanted || count === previous) return;
      previous = count;
      const more = page
        .getByRole('button', { name: /^(load|show|see) more/i })
        .first();
      if (await more.isVisible().catch(() => false))
        await more.click().catch(() => undefined);
      await page.evaluate(() => {
        for (const element of document.querySelectorAll<HTMLElement>('*')) {
          if (element.scrollHeight > element.clientHeight + 40) {
            const overflow = getComputedStyle(element).overflowY;
            if (overflow === 'auto' || overflow === 'scroll')
              element.scrollTop = element.scrollHeight;
          }
        }
        window.scrollTo(0, document.body.scrollHeight);
      });
      await page.waitForTimeout(900);
    }
  }

  private async detailHtml(page: Page, url: string) {
    await this.visit(page, url);
    await page
      .waitForSelector('h1', { state: 'attached', timeout: 20_000 })
      .catch(() => undefined);
    await page
      .waitForLoadState('networkidle', { timeout: 5_000 })
      .catch(() => undefined);
    const expanders = page.getByRole('button', {
      name: /^(show|read|see) (more|full)/i,
    });
    for (
      let index = 0;
      index < Math.min(3, await expanders.count());
      index += 1
    ) {
      const button = expanders.nth(index);
      if (await button.isVisible().catch(() => false))
        await button.click().catch(() => undefined);
    }
    return page.content();
  }

  private saveFailure(run: Run, name: string, html: string) {
    const file = path.join(run.rawRoot, 'failed', name);
    fs.writeFileSync(file, html, { mode: 0o600 });
  }

  private writeSnapshot(run: Run, name: string, value: unknown) {
    fs.writeFileSync(
      path.join(run.rawRoot, name),
      `${JSON.stringify(value, null, 2)}\n`,
      { mode: 0o600 },
    );
  }

  private async eventList(page: Page, url: string, wanted: number) {
    await this.visit(page, url);
    const found = await waitForEventLinks(page);
    if (!found) return { candidates: [], html: await page.content() };
    await this.revealList(page, wanted);
    const html = await page.content();
    return { candidates: parseListing(html), html };
  }

  private async syncEvents(page: Page, run: Run, delayMs: number) {
    const started = performance.now();
    const maxEvents = positiveInt(process.env.HANDSHAKE_MAX_EVENTS, 30);
    const now = new Date();
    const listUrl = process.env.HANDSHAKE_EVENTS_URL || EVENTS_LIST_URL;
    const merged: EventCandidate[] = [];
    const parsed: ParsedEvent[] = [];
    const skipped: string[] = [];
    const failures: Array<{ sourceId: string; error: string }> = [];
    try {
      this.progress(run, 'Reading Handshake events…');
      const relevant = await this.eventList(page, listUrl, maxEvents * 2);
      if (!relevant.candidates.length) {
        this.saveFailure(run, 'events-list.html', relevant.html);
        run.errors.push(
          'Handshake events showed no event links. Its layout may have changed; cached events are kept.',
        );
      }
      await page.waitForTimeout(delayMs);
      const school = await this.eventList(
        page,
        `${listUrl}&postedBySchool=true`,
        maxEvents,
      );
      // Interleave Handshake's relevance order with school-posted events so
      // career fairs and info sessions from Georgia Tech aren't crowded out.
      const schoolIds = new Set(school.candidates.map((item) => item.sourceId));
      const seen = new Set<string>();
      const length = Math.max(
        relevant.candidates.length,
        school.candidates.length,
      );
      for (let index = 0; index < length; index += 1) {
        for (const item of [
          relevant.candidates[index],
          school.candidates[index],
        ]) {
          if (!item || seen.has(item.sourceId)) continue;
          seen.add(item.sourceId);
          merged.push({
            ...item,
            rank: merged.length + 1,
            postedBySchool: schoolIds.has(item.sourceId),
          });
        }
      }
    } catch (error) {
      if (error instanceof SignedOutError) throw error;
      run.errors.push(`Event list: ${message(error)}`);
    }
    const listedAt = nowIso();
    markEventsListed(merged, listedAt);
    const rawPath = path.relative(
      dataDir,
      path.join(run.rawRoot, 'events.json'),
    );
    const budget = maxEvents * 2;
    let visits = 0;

    for (const candidate of merged) {
      if (parsed.length >= maxEvents || visits >= budget) break;
      // Skip past events the card already dates, without opening them.
      const cardWhen = parseEventWhen(candidate.cardText, { now });
      const cardEnd = cardWhen.endsAt ?? cardWhen.startsAt;
      if (cardEnd && Date.parse(cardEnd) < now.getTime() - 3 * 3_600_000) {
        skipped.push(candidate.sourceId);
        continue;
      }
      visits += 1;
      this.progress(
        run,
        `Reading Handshake events, ${parsed.length + 1} of up to ${maxEvents}…`,
      );
      run.seen += 1;
      const detailStarted = performance.now();
      let html = '';
      try {
        html = await this.detailHtml(page, candidate.sourceUrl);
        const event = parseEventDetail(html, candidate, {
          now,
          postedBySchool: candidate.postedBySchool,
        });
        const end = event.endsAt ?? event.startsAt;
        if (end && Date.parse(end) < now.getTime() - 3 * 3_600_000) {
          skipped.push(candidate.sourceId);
        } else {
          if (!event.startsAt)
            run.warnings.push(
              `Event ${candidate.sourceId}: date was not readable.`,
            );
          upsertEvent(event, candidate, listedAt, rawPath);
          parsed.push(event);
          run.updated += 1;
        }
      } catch (error) {
        if (error instanceof SignedOutError) throw error;
        const text = message(error);
        failures.push({ sourceId: candidate.sourceId, error: text });
        run.errors.push(`Event ${candidate.sourceId}: ${text}`);
        if (html)
          this.saveFailure(run, `event-${candidate.sourceId}.html`, html);
      }
      run.timings[`event-${candidate.sourceId}`] = Math.round(
        performance.now() - detailStarted,
      );
      await page.waitForTimeout(delayMs);
    }
    if (skipped.length)
      run.warnings.push(
        `Skipped ${skipped.length} past event${skipped.length === 1 ? '' : 's'}.`,
      );
    run.timings.events = Math.round(performance.now() - started);
    return { candidates: merged, events: parsed, skipped, failures };
  }

  private finish(run: Run, forced?: 'FAILED'): SyncResult {
    const finishedAt = nowIso();
    const status =
      forced ??
      (run.errors.length
        ? run.updated
          ? ('PARTIAL' as const)
          : ('FAILED' as const)
        : ('SUCCESS' as const));
    const { sqlite } = getDb();
    sqlite
      .prepare(
        `UPDATE sync_runs SET finished_at=?,status=?,auth_status='CONNECTED',entities_seen=?,entities_updated=?,errors_json=?,warnings_json=?,timings_json=?,progress_label=NULL WHERE id=?`,
      )
      .run(
        finishedAt,
        status,
        run.seen,
        run.updated,
        json(run.errors),
        json(run.warnings),
        json(run.timings),
        run.id,
      );
    const lastError = run.errors.length
      ? `${run.errors.length} item${run.errors.length === 1 ? '' : 's'} could not be read: ${run.errors[0]}`
      : null;
    if (status === 'FAILED')
      sqlite
        .prepare(
          `INSERT INTO providers (key,display_name,auth_status,last_attempt_at,last_error) VALUES ('handshake','Handshake','ERROR',?,?) ON CONFLICT(key) DO UPDATE SET auth_status=CASE WHEN providers.auth_status='CONNECTED' THEN 'CONNECTED' ELSE 'ERROR' END,last_attempt_at=excluded.last_attempt_at,last_error=excluded.last_error`,
        )
        .run(finishedAt, lastError ?? 'Handshake sync failed.');
    else
      sqlite
        .prepare(
          `UPDATE providers SET auth_status='CONNECTED',last_success_at=?,last_error=? WHERE key='handshake'`,
        )
        .run(finishedAt, lastError);
    return {
      provider: 'handshake',
      runId: run.id,
      startedAt: run.startedAt,
      finishedAt,
      status,
      entitiesSeen: run.seen,
      entitiesUpdated: run.updated,
      warnings: run.warnings,
      errors: run.errors,
      timings: run.timings,
    };
  }

  private finishAuthRequired(run: Run, detail?: string): SyncResult {
    const finishedAt = nowIso();
    const text = detail ?? 'Handshake sign-in is required.';
    const { sqlite } = getDb();
    sqlite
      .prepare(
        `UPDATE sync_runs SET status='AUTH_REQUIRED',auth_status='AUTHENTICATION_REQUIRED',finished_at=?,errors_json=?,progress_label=NULL WHERE id=?`,
      )
      .run(finishedAt, json([text]), run.id);
    sqlite
      .prepare(
        `INSERT INTO providers (key,display_name,auth_status,last_attempt_at,last_error) VALUES ('handshake','Handshake','AUTHENTICATION_REQUIRED',?,?) ON CONFLICT(key) DO UPDATE SET auth_status='AUTHENTICATION_REQUIRED',last_attempt_at=excluded.last_attempt_at,last_error=excluded.last_error`,
      )
      .run(finishedAt, text);
    return {
      provider: 'handshake',
      runId: run.id,
      startedAt: run.startedAt,
      finishedAt,
      status: 'AUTH_REQUIRED',
      entitiesSeen: run.seen,
      entitiesUpdated: run.updated,
      warnings: run.warnings,
      errors: [text],
      timings: run.timings,
    };
  }
}
