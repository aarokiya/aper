import type { APIRequestContext, APIResponse } from 'playwright';
import { CANVAS_ORIGIN } from './auth';
import { retry } from '@/lib/sync/utils';

const headers = { Accept: 'application/json+canvas-string-ids, application/json', 'X-Requested-With': 'XMLHttpRequest' };

function nextLink(value?: string) {
  if (!value) return null;
  for (const part of value.split(',')) {
    const match = part.match(/<([^>]+)>;\s*rel="([^"]+)"/);
    if (match?.[2] === 'next') return match[1];
  }
  return null;
}

export class CanvasApi {
  constructor(private readonly request: APIRequestContext) {}

  async response(pathOrUrl: string): Promise<APIResponse> {
    const url = pathOrUrl.startsWith('http') ? pathOrUrl : `${CANVAS_ORIGIN}${pathOrUrl}`;
    return retry(async () => {
      const response = await this.request.get(url, { headers, timeout: 30_000 });
      if ([429, 500, 502, 503, 504].includes(response.status())) throw new Error(`Canvas transient error ${response.status()} for ${new URL(url).pathname}`);
      if (!response.ok()) throw new Error(`Canvas returned ${response.status()} for ${new URL(url).pathname}`);
      return response;
    });
  }

  async get<T>(pathOrUrl: string): Promise<T> {
    return (await this.response(pathOrUrl)).json() as Promise<T>;
  }

  async paginate<T>(pathOrUrl: string, maxPages = 100): Promise<T[]> {
    const values: T[] = [];
    let url: string | null = pathOrUrl;
    let pages = 0;
    while (url && pages++ < maxPages) {
      const response = await this.response(url);
      const body = await response.json() as T[];
      if (!Array.isArray(body)) throw new Error(`Expected an array from ${new URL(response.url()).pathname}`);
      values.push(...body);
      url = nextLink(response.headers().link);
    }
    return values;
  }
}
