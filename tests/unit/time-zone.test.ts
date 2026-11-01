import { afterEach, describe, expect, it, vi } from 'vitest';

// Dynamic import on purpose: APP_TIME_ZONE resolves at module load, so each case re-imports after stubbing env.
async function loadZone(value: string | undefined) {
  vi.resetModules();
  vi.stubEnv('APER_TIME_ZONE', value);
  return (await import('@/lib/time-zone')).APP_TIME_ZONE;
}

describe('APP_TIME_ZONE', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it('uses a valid configured zone', async () => {
    expect(await loadZone(' America/Los_Angeles ')).toBe('America/Los_Angeles');
  });

  it('defaults to Georgia Tech time when unset', async () => {
    expect(await loadZone('')).toBe('America/New_York');
  });

  it('warns and falls back on an invalid zone', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    expect(await loadZone('Mars/Olympus')).toBe('America/New_York');
    expect(warn).toHaveBeenCalledOnce();
  });
});
