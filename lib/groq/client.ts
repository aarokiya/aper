/**
 * The one place that talks to Groq (or any OpenAI-compatible server named by
 * GROQ_BASE_URL). Plain fetch, no SDK. Errors are typed by code so callers can
 * show specific copy, and they never carry the key or a response body: the
 * body can repeat the request, which holds the student's work.
 */

const defaultBaseUrl = 'https://api.groq.com/openai/v1';
// qwen/qwen3.6-27b was shut down on 2026-09-14; Groq names 3.8 as its successor
// and as its vision model (console.groq.com/docs/vision).
const defaultModel = 'qwen/qwen3.8-27b';
const defaultVisionModel = 'qwen/qwen3.8-27b';
const defaultTimeoutMs = 30_000;

export type GroqErrorCode =
  | 'not_configured'
  | 'rate_limited'
  | 'image_rejected'
  | 'invalid_json'
  | 'http'
  | 'timeout'
  | 'cancelled';

export class GroqError extends Error {
  readonly code: GroqErrorCode;
  readonly status: number | null;

  constructor(
    code: GroqErrorCode,
    detail: string,
    status: number | null = null,
  ) {
    super(`groq: ${detail}`);
    this.name = 'GroqError';
    this.code = code;
    this.status = status;
  }
}

/** HTTP status an API route answers with for each failure; the body carries `{ code }`. */
export const GROQ_ERROR_STATUS: Record<GroqErrorCode, number> = {
  not_configured: 503,
  rate_limited: 429,
  image_rejected: 422,
  invalid_json: 502,
  http: 502,
  timeout: 504,
  cancelled: 499,
};

export type GroqContentPart =
  | { type: 'text'; text: string }
  | { type: 'image_url'; image_url: { url: string } };

export type GroqMessage = {
  role: 'system' | 'user' | 'assistant';
  content: string | GroqContentPart[];
};

export type GroqRequest = {
  messages: GroqMessage[];
  model?: string;
  /** Ask for a JSON object (`response_format: json_object`). */
  json?: boolean;
  temperature?: number;
  maxTokens?: number;
  signal?: AbortSignal;
  timeoutMs?: number;
};

export type GroqStreamRequest = GroqRequest & {
  /** Called once with the final `finish_reason` (`length` means cut short). */
  onFinish?: (reason: string | null) => void;
};

export const groqEnabled = () => Boolean(process.env.GROQ_API_KEY?.trim());

export const groqTextModel = () =>
  process.env.GROQ_MODEL?.trim() || defaultModel;

export const groqVisionModel = () =>
  process.env.GROQ_VISION_MODEL?.trim() || defaultVisionModel;

/**
 * Groq rejects `reasoning_effort=low` on the qwen family and only accepts
 * low/medium/high on gpt-oss, so this is a hard 400 if guessed wrong. `none`
 * keeps qwen in its instruct mode: answers arrive without a thinking preamble.
 */
const effortFor = (model: string) =>
  model.startsWith('qwen') ? 'none' : 'low';

type Signals = { caller?: AbortSignal; timeout: AbortSignal };

/** Turns an abort or network failure into the code the UI needs. */
function failure(error: unknown, signals: Signals) {
  if (error instanceof GroqError) return error;
  if (signals.caller?.aborted) return new GroqError('cancelled', 'cancelled');
  if (signals.timeout.aborted) return new GroqError('timeout', 'timed out');
  return new GroqError('http', 'network error');
}

async function httpFailure(response: Response, images: boolean) {
  const status = response.status;
  if (status === 429)
    return new GroqError('rate_limited', 'rate limited', status);
  // Only the machine-readable code is read; the message is never surfaced.
  let code = '';
  try {
    const payload = (await response.json()) as { error?: { code?: unknown } };
    code = typeof payload.error?.code === 'string' ? payload.error.code : '';
  } catch {
    code = '';
  }
  if (code === 'json_validate_failed')
    return new GroqError('invalid_json', 'invalid json', status);
  if (
    images &&
    (status === 400 || status === 413 || status === 415 || status === 422)
  )
    return new GroqError(
      'image_rejected',
      `image rejected (http ${status})`,
      status,
    );
  return new GroqError('http', `http ${status}`, status);
}

async function post(request: GroqRequest, stream: boolean) {
  const key = process.env.GROQ_API_KEY?.trim();
  if (!key) throw new GroqError('not_configured', 'not configured');
  const model = request.model ?? groqTextModel();
  const base = (process.env.GROQ_BASE_URL?.trim() || defaultBaseUrl).replace(
    /\/+$/,
    '',
  );
  const signals: Signals = {
    caller: request.signal,
    timeout: AbortSignal.timeout(request.timeoutMs ?? defaultTimeoutMs),
  };
  if (signals.caller?.aborted) throw new GroqError('cancelled', 'cancelled');
  const signal = signals.caller
    ? AbortSignal.any([signals.caller, signals.timeout])
    : signals.timeout;
  let response: Response;
  try {
    response = await fetch(`${base}/chat/completions`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${key}`,
        'Content-Type': 'application/json',
        // Groq 403s some default agents.
        'User-Agent': 'aper/0.1',
      },
      body: JSON.stringify({
        model,
        messages: request.messages,
        temperature: request.temperature ?? 0,
        reasoning_effort: effortFor(model),
        ...(request.maxTokens
          ? { max_completion_tokens: request.maxTokens }
          : {}),
        ...(request.json ? { response_format: { type: 'json_object' } } : {}),
        ...(stream ? { stream: true } : {}),
      }),
      signal,
    });
  } catch (error) {
    throw failure(error, signals);
  }
  if (!response.ok) {
    const images = request.messages.some(
      (message) =>
        Array.isArray(message.content) &&
        message.content.some((part) => part.type === 'image_url'),
    );
    throw await httpFailure(response, images);
  }
  return { response, signals };
}

/** One completion; resolves to the assistant's text. */
export async function groqChat(request: GroqRequest): Promise<string> {
  const { response, signals } = await post(request, false);
  let payload: { choices?: Array<{ message?: { content?: unknown } }> };
  try {
    payload = (await response.json()) as typeof payload;
  } catch (error) {
    throw failure(error, signals);
  }
  const content = payload.choices?.[0]?.message?.content;
  if (typeof content !== 'string' || !content.trim())
    throw new GroqError('http', 'empty response');
  return content;
}

type StreamChunk = {
  choices?: Array<{ delta?: { content?: unknown }; finish_reason?: unknown }>;
  error?: unknown;
};

/**
 * A streamed completion as a stream of text deltas. Resolves once the server
 * has accepted the request, so HTTP failures (rate limits, a bad key) reject
 * here rather than mid-stream; later failures error the stream with a
 * GroqError. Cancelling the stream aborts the upstream read.
 */
export async function groqStream(
  request: GroqStreamRequest,
): Promise<ReadableStream<string>> {
  const { response, signals } = await post(request, true);
  if (!response.body) throw new GroqError('http', 'empty response');
  const reader = response.body.pipeThrough(new TextDecoderStream()).getReader();
  let buffer = '';
  let finish: string | null = null;
  const close = (controller: ReadableStreamDefaultController<string>) => {
    request.onFinish?.(finish);
    controller.close();
  };
  return new ReadableStream<string>({
    async pull(controller) {
      try {
        for (;;) {
          const newline = buffer.indexOf('\n');
          if (newline < 0) {
            const { done, value } = await reader.read();
            if (!done) {
              buffer += value;
              continue;
            }
            // A server may end without a trailing newline or [DONE].
            if (!buffer.trim()) return close(controller);
            buffer += '\n';
            continue;
          }
          const line = buffer.slice(0, newline).trim();
          buffer = buffer.slice(newline + 1);
          if (!line.startsWith('data:')) continue;
          const data = line.slice(5).trim();
          if (data === '[DONE]') {
            await reader.cancel().catch(() => undefined);
            return close(controller);
          }
          let chunk: StreamChunk;
          try {
            chunk = JSON.parse(data) as StreamChunk;
          } catch {
            continue;
          }
          if (chunk.error) throw new GroqError('http', 'stream error');
          const choice = chunk.choices?.[0];
          if (typeof choice?.finish_reason === 'string')
            finish = choice.finish_reason;
          const delta = choice?.delta?.content;
          if (typeof delta === 'string' && delta) {
            controller.enqueue(delta);
            return;
          }
        }
      } catch (error) {
        controller.error(failure(error, signals));
      }
    },
    cancel(reason) {
      return reader.cancel(reason);
    },
  });
}
