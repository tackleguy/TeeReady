/** OpenAI-compatible chat completions client for local vision models. */

import {
  isMixedContentRisk,
  isSafariBrowser,
  swingLlmBaseUrl,
  swingLlmModel,
} from './config';

export type CoachFetchErrorKind =
  | 'unreachable'
  | 'mixed-content'
  | 'http'
  | 'parse'
  | 'empty';

export class CoachFetchError extends Error {
  kind: CoachFetchErrorKind;
  constructor(kind: CoachFetchErrorKind, message: string) {
    super(message);
    this.name = 'CoachFetchError';
    this.kind = kind;
  }
}

export type ChatCompletionResult = {
  text: string;
  elapsedMs: number;
};

type ContentPart =
  | { type: 'text'; text: string }
  | { type: 'image_url'; image_url: { url: string } };

/**
 * POST /chat/completions against LM Studio / Ollama (OpenAI-compatible).
 */
export async function requestCoachCompletion(opts: {
  system: string;
  userText: string;
  /** data:image/...;base64,... */
  imageDataUrl: string;
  signal?: AbortSignal;
}): Promise<ChatCompletionResult> {
  const base = swingLlmBaseUrl();
  const model = swingLlmModel();
  const url = `${base}/chat/completions`;

  if (isMixedContentRisk(base) && isSafariBrowser()) {
    throw new CoachFetchError(
      'mixed-content',
      'Safari blocks HTTPS pages from calling http://localhost. Open TeeReady on http://localhost in Chrome or Edge, or run the app over HTTP while using a local model.',
    );
  }

  const body = {
    model,
    temperature: 0.35,
    max_tokens: 450,
    messages: [
      { role: 'system', content: opts.system },
      {
        role: 'user',
        content: [
          { type: 'text', text: opts.userText },
          { type: 'image_url', image_url: { url: opts.imageDataUrl } },
        ] satisfies ContentPart[],
      },
    ],
  };

  const started = performance.now();
  let res: Response;
  try {
    res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: opts.signal,
    });
  } catch (e) {
    if (isMixedContentRisk(base)) {
      throw new CoachFetchError(
        'mixed-content',
        'Browser blocked the local model request (mixed content). Use Chrome/Edge, or serve the app over HTTP for local coaching.',
      );
    }
    const msg = e instanceof Error ? e.message : 'Network error';
    throw new CoachFetchError('unreachable', msg);
  }

  const elapsedMs = Math.round(performance.now() - started);

  if (!res.ok) {
    const detail = await res.text().catch(() => '');
    throw new CoachFetchError(
      'http',
      `Local model HTTP ${res.status}${detail ? `: ${detail.slice(0, 180)}` : ''}`,
    );
  }

  let data: unknown;
  try {
    data = await res.json();
  } catch {
    throw new CoachFetchError('parse', 'Local model returned non-JSON');
  }

  const text = extractAssistantText(data);
  if (!text) {
    throw new CoachFetchError('empty', 'Local model returned empty content');
  }

  return { text, elapsedMs };
}

function extractAssistantText(data: unknown): string {
  if (!data || typeof data !== 'object') return '';
  const choices = (data as { choices?: unknown }).choices;
  if (!Array.isArray(choices) || !choices[0]) return '';
  const msg = (choices[0] as { message?: { content?: unknown } }).message;
  const content = msg?.content;
  if (typeof content === 'string') return content.trim();
  if (Array.isArray(content)) {
    return content
      .map((part) => {
        if (typeof part === 'string') return part;
        if (part && typeof part === 'object' && 'text' in part) {
          return String((part as { text: unknown }).text ?? '');
        }
        return '';
      })
      .join('')
      .trim();
  }
  return '';
}

/** Lightweight reachability probe (does not require a vision model response). */
export async function probeSwingLlm(signal?: AbortSignal): Promise<boolean> {
  const base = swingLlmBaseUrl();
  try {
    const res = await fetch(`${base}/models`, { signal });
    return res.ok;
  } catch {
    return false;
  }
}
