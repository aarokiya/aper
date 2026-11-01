import { chromium, type BrowserContext } from 'playwright';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { AuthStatus } from '@/lib/sync/provider';
import { APP_TIME_ZONE } from '@/lib/time-zone';

export const CANVAS_ORIGIN = 'https://gatech.instructure.com';
export const browserProfileDir = process.env.ACADEMIC_BROWSER_DIR ?? path.join(os.homedir(), '.academic-command-center', 'browser');
const storageStatePath = path.join(browserProfileDir, 'storage-state.json');

export async function openCanvasContext(headless: boolean): Promise<BrowserContext> {
  fs.mkdirSync(browserProfileDir, { recursive: true });
  const common = {
    headless,
    viewport: { width: 1440, height: 980 },
    locale: 'en-US',
    timezoneId: APP_TIME_ZONE,
    args: ['--disable-blink-features=AutomationControlled'],
  };
  let context: BrowserContext;
  try {
    context = await chromium.launchPersistentContext(browserProfileDir, { ...common, channel: process.env.CANVAS_BROWSER_CHANNEL ?? 'chrome' });
  } catch {
    context = await chromium.launchPersistentContext(browserProfileDir, common);
  }
  if (fs.existsSync(storageStatePath)) {
    try {
      const state = JSON.parse(fs.readFileSync(storageStatePath, 'utf8')) as { cookies?: Parameters<BrowserContext['addCookies']>[0] };
      if (state.cookies?.length) await context.addCookies(state.cookies);
    } catch {
      // A malformed or obsolete state file is treated as signed out; visible reauthentication replaces it.
    }
  }
  return context;
}

export async function checkCanvasAuth(context: BrowserContext): Promise<AuthStatus> {
  const checkedAt = new Date().toISOString();
  try {
    const response = await context.request.get(`${CANVAS_ORIGIN}/api/v1/users/self`, {
      timeout: 20_000,
      headers: { Accept: 'application/json+canvas-string-ids, application/json', 'X-Requested-With': 'XMLHttpRequest' },
    });
    const contentType = response.headers()['content-type'] ?? '';
    if (response.ok() && contentType.includes('json')) {
      const user = await response.json() as { name?: string; short_name?: string };
      return { state: 'CONNECTED', accountName: user.name ?? user.short_name, checkedAt };
    }
    return { state: 'AUTHENTICATION_REQUIRED', checkedAt, detail: `Canvas returned ${response.status()}.` };
  } catch (error) {
    return { state: 'ERROR', checkedAt, detail: error instanceof Error ? error.message : String(error) };
  }
}

export async function authenticateCanvas(timeoutMs = 15 * 60_000) {
  const context = await openCanvasContext(false);
  const page = context.pages()[0] ?? await context.newPage();
  await page.goto(CANVAS_ORIGIN, { waitUntil: 'domcontentloaded' });
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const status = await checkCanvasAuth(context);
    if (status.state === 'CONNECTED') {
      await page.goto(CANVAS_ORIGIN, { waitUntil: 'domcontentloaded' }).catch(() => undefined);
      await context.storageState({ path: storageStatePath });
      fs.chmodSync(storageStatePath, 0o600);
      await context.close();
      return status;
    }
    await new Promise((resolve) => setTimeout(resolve, 1500));
  }
  await context.close();
  throw new Error('Canvas authentication timed out. No password or Duo response was captured.');
}
