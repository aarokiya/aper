import { createHash } from 'node:crypto';

export const nowIso = () => new Date().toISOString();

export function contentHash(value: unknown) {
  return createHash('sha256')
    .update(typeof value === 'string' ? value : JSON.stringify(value))
    .digest('hex');
}

export async function mapLimit<T, R>(
  items: T[],
  limit: number,
  mapper: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const results = Array.from<R>({ length: items.length });
  let cursor = 0;
  const workers = Array.from(
    { length: Math.min(limit, items.length) },
    async () => {
      while (cursor < items.length) {
        const index = cursor++;
        results[index] = await mapper(items[index], index);
      }
    },
  );
  await Promise.all(workers);
  return results;
}

export async function retry<T>(
  fn: () => Promise<T>,
  attempts = 3,
  baseDelayMs = 350,
): Promise<T> {
  let lastError: unknown;
  for (let attempt = 0; attempt < attempts; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;
      if (attempt < attempts - 1)
        await new Promise((resolve) =>
          setTimeout(resolve, baseDelayMs * 2 ** attempt),
        );
    }
  }
  throw lastError;
}
