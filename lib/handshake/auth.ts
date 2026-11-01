import fs from 'node:fs';
import path from 'node:path';
import type { BrowserContext, Page } from 'playwright';
import { browserProfileDir, openCanvasContext } from '@/lib/canvas/auth';
import { HANDSHAKE_ORIGIN } from '@/lib/handshake/parse';
import type { AuthStatus } from '@/lib/sync/provider';

export { HANDSHAKE_ORIGIN };
/** Georgia Tech's school entry point; it hands off to GT SSO, then to app.joinhandshake.com. */
export const HANDSHAKE_SCHOOL_LOGIN = 'https://gatech.joinhandshake.com/login';
export const handshakeStorageStatePath = path.join(
  browserProfileDir,
  'handshake-storage-state.json',
);

/** True once the student has completed a visible Handshake sign-in here. */
export function hasHandshakeSession() {
  return fs.existsSync(handshakeStorageStatePath);
}

/**
 * Opens the shared persistent profile (Canvas/Gradescope) and restores the
 * Handshake cookies saved after the last visible sign-in.
 */
export async function openHandshakeContext(headless: boolean) {
  const context = await openCanvasContext(headless);
  if (hasHandshakeSession()) {
    try {
      const state = JSON.parse(
        fs.readFileSync(handshakeStorageStatePath, 'utf8'),
      ) as { cookies?: Parameters<BrowserContext['addCookies']>[0] };
      const cookies = state.cookies?.filter((cookie) =>
        cookie.domain?.includes('joinhandshake.com'),
      );
      if (cookies?.length) await context.addCookies(cookies);
    } catch {
      // Malformed or stale state is treated as signed out; visible sign-in replaces it.
    }
  }
  return context;
}

/** Signed-out pages, e.g. app.joinhandshake.com/access and the school /login. */
export const SIGNED_OUT_PATH =
  /^\/(access|login|logout|sign_?in|sign_?up|sso|saml|auth)\b/i;
const STUDENT_NAV =
  'a[href*="/job-search"], a[href*="/stu/"], a[href*="/explore"], a[href*="/inbox"]';
const BROWSER_CHECK_TITLE = /just a moment/i;

/**
 * Handshake is behind Cloudflare. Its interstitial ("Just a moment…") clears
 * itself in a real browser within a few seconds; wait for it rather than
 * reading the interstitial as a page. False when it never clears.
 */
export async function passBrowserCheck(page: Page, timeoutMs = 30_000) {
  const deadline = Date.now() + timeoutMs;
  while (BROWSER_CHECK_TITLE.test(await page.title().catch(() => ''))) {
    if (Date.now() > deadline) return false;
    await page.waitForTimeout(500);
  }
  return true;
}
/** Signed in = on a Handshake student page with student navigation present. */
export async function checkHandshakeAuth(
  context: BrowserContext,
  existingPage?: Page,
  navigate = true,
): Promise<AuthStatus> {
  const checkedAt = new Date().toISOString();
  const page = existingPage ?? (await context.newPage());
  try {
    if (navigate)
      await page.goto(`${HANDSHAKE_ORIGIN}/stu/events`, {
        waitUntil: 'domcontentloaded',
        timeout: 30_000,
      });
    if (!(await passBrowserCheck(page, navigate ? 30_000 : 1_000)))
      return {
        state: 'ERROR',
        checkedAt,
        detail:
          "Handshake's browser check (Cloudflare) did not finish. Reads need a visible Chrome window.",
      };
    const url = new URL(page.url());
    const onStudentHost =
      url.hostname === 'app.joinhandshake.com' ||
      (url.hostname.endsWith('.joinhandshake.com') &&
        !/^(www|support|help)\./.test(url.hostname));
    const navVisible =
      onStudentHost &&
      !SIGNED_OUT_PATH.test(url.pathname) &&
      (await page
        .locator(STUDENT_NAV)
        .first()
        .waitFor({ state: 'attached', timeout: navigate ? 12_000 : 1_000 })
        .then(() => true)
        .catch(() => false));
    return navVisible
      ? { state: 'CONNECTED', checkedAt }
      : {
          state: 'AUTHENTICATION_REQUIRED',
          checkedAt,
          detail: `Sign in to Handshake with your Georgia Tech account. The last page was ${url.hostname}${url.pathname}.`,
        };
  } catch (error) {
    return {
      state: 'ERROR',
      checkedAt,
      detail: error instanceof Error ? error.message : String(error),
    };
  } finally {
    if (!existingPage) await page.close().catch(() => undefined);
  }
}

/**
 * Opens a visible window at Georgia Tech's Handshake login and waits up to
 * 15 minutes for the student to finish SSO/Duo themselves. Nothing typed in
 * that window is read or stored; only the resulting cookies are saved (0600).
 */
export async function authenticateHandshake(timeoutMs = 15 * 60_000) {
  const context = await openHandshakeContext(false);
  const page = context.pages()[0] ?? (await context.newPage());
  try {
    await page.goto(HANDSHAKE_SCHOOL_LOGIN, { waitUntil: 'domcontentloaded' });
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      if (page.isClosed())
        throw new Error(
          'The Handshake window was closed before sign-in finished.',
        );
      const status = await checkHandshakeAuth(context, page, false);
      if (status.state === 'CONNECTED') {
        await context.storageState({ path: handshakeStorageStatePath });
        fs.chmodSync(handshakeStorageStatePath, 0o600);
        return status;
      }
      await page.waitForTimeout(1_500).catch(() => undefined);
    }
    throw new Error(
      `Handshake sign-in timed out after ${Math.round(timeoutMs / 60_000) || 1} minute${timeoutMs > 60_000 ? 's' : ''}. No password, SSO, Duo, or CAPTCHA response was captured.`,
    );
  } finally {
    await context.close().catch(() => undefined);
  }
}
