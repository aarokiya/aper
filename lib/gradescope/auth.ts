import fs from 'node:fs';
import path from 'node:path';
import type { BrowserContext, Page } from 'playwright';
import { browserProfileDir, openCanvasContext } from '@/lib/canvas/auth';
import type { AuthStatus } from '@/lib/sync/provider';

export const GRADESCOPE_ORIGIN = 'https://www.gradescope.com';
const storageStatePath = path.join(
  browserProfileDir,
  'gradescope-storage-state.json',
);

export async function openGradescopeContext(headless: boolean) {
  const context = await openCanvasContext(headless);
  if (fs.existsSync(storageStatePath)) {
    try {
      const state = JSON.parse(fs.readFileSync(storageStatePath, 'utf8')) as {
        cookies?: Parameters<BrowserContext['addCookies']>[0];
      };
      if (state.cookies?.length) await context.addCookies(state.cookies);
    } catch {
      // A stale state file is replaced after the next visible login.
    }
  }
  return context;
}

export async function checkGradescopeAuth(
  context: BrowserContext,
  existingPage?: Page,
  navigate = true,
): Promise<AuthStatus> {
  const checkedAt = new Date().toISOString();
  const page = existingPage ?? (await context.newPage());
  try {
    if (navigate)
      await page.goto(`${GRADESCOPE_ORIGIN}/`, {
        waitUntil: 'domcontentloaded',
        timeout: 30_000,
      });
    const connected =
      (await page.title()).includes('Your Courses') &&
      (await page
        .getByRole('heading', { name: 'Course Dashboard' })
        .isVisible()
        .catch(() => false));
    return connected
      ? { state: 'CONNECTED', checkedAt }
      : {
          state: 'AUTHENTICATION_REQUIRED',
          checkedAt,
          detail: `Sign in to Gradescope in the dedicated browser window. Current page: ${await page.title()} (${page.url()}).`,
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

export async function authenticateGradescope(timeoutMs = 15 * 60_000) {
  const context = await openGradescopeContext(false);
  const page = context.pages()[0] ?? (await context.newPage());
  try {
    await page.goto(`${GRADESCOPE_ORIGIN}/`, {
      waitUntil: 'domcontentloaded',
    });
    const login = page.getByRole('button', { name: 'Log In' });
    if (await login.isVisible().catch(() => false)) await login.click();

    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      const status = await checkGradescopeAuth(context, page, false);
      if (status.state === 'CONNECTED') {
        await context.storageState({ path: storageStatePath });
        fs.chmodSync(storageStatePath, 0o600);
        return status;
      }
      await new Promise((resolve) => setTimeout(resolve, 1500));
    }
    throw new Error(
      'Gradescope authentication timed out. No password, SSO response, Duo response, or CAPTCHA was captured.',
    );
  } finally {
    await context.close();
  }
}
