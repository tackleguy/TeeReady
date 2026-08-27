/** OpenAI-compatible chat completions client for local vision models. */

import {
  isMixedContentRisk,
  isSafariBrowser,
  mixedContentHint,
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
  /** Model id actually used (may differ from preferred when auto-resolved). */
  model: string;
};

type ContentPart =
  | { type: 'text'; text: string }
  | { type: 'image_url'; image_url: { url: string } };

const NON_CHAT_MODEL = /embed|t5|encoder|diffusion|flux|comfy/i;
const LLAMA_32 = /llama[-_.]?3\.?2/i;

/**
 * Prefer configured model when listed by the local server; otherwise the first
 * chat-capable id (Llama 3.2 when present). Throws unreachable/http on probe fail.
 */
export async function resolveSwingLlmModel(
  signal?: AbortSignal,
): Promise<string> {
  const preferred = swingLlmModel();
  const base = swingLlmBaseUrl();
  let res: Response;
  try {
    res = await fetch(`${base}/models`, { signal });
  } catch (e) {
    if (isMixedContentRisk(base)) {
      throw new CoachFetchError('mixed-content', mixedContentHint());
    }
    const msg = e instanceof Error ? e.message : 'Network error';
    throw new CoachFetchError(
      'unreachable',
      `Local LLM unreachable at ${base} (${msg}). Start LM Studio / Ollama on port 1234, and use npm run dev (proxies /llm).`,
    );
  }
  if (!res.ok) {
    throw new CoachFetchError(
      'http',
      `Local model list HTTP ${res.status} at ${base}/models`,
    );
  }
  let data: unknown;
  try {
    data = await res.json();
  } catch {
    throw new CoachFetchError('parse', 'Local /models returned non-JSON');
  }
  const ids = listModelIds(data);
  if (ids.includes(preferred)) return preferred;
  const llama = ids.find((id) => LLAMA_32.test(id) && !NON_CHAT_MODEL.test(id));
  if (llama) return llama;
  const chat = ids.find((id) => !NON_CHAT_MODEL.test(id));
  if (chat) return chat;
  throw new CoachFetchError(
    'empty',
    `No chat model loaded at ${base}. Preferred "${preferred}" not found. Load Llama 3.2 (or any chat LLM) in LM Studio.`,
  );
}

function listModelIds(data: unknown): string[] {
  if (!data || typeof data !== 'object') return [];
  const arr = (data as { data?: unknown }).data;
  if (!Array.isArray(arr)) return [];
  return arr
    .map((row) => {
      if (!row || typeof row !== 'object') return '';
      const id = (row as { id?: unknown }).id;
      return typeof id === 'string' ? id : '';
    })
    .filter(Boolean);
}

/**
 * POST /chat/completions against LM Studio / Ollama (OpenAI-compatible).
 * Text-only by default; pass imageDataUrl for vision coach.
 * Resolves the model id against the local server so a missing preferred
 * Llama 3.2 name does not silently 404.
 */
export async function requestCoachCompletion(opts: {
  system: string;
  userText: string;
  /** data:image/...;base64,... — omit for text-only caddie calls */
  imageDataUrl?: string;
  signal?: AbortSignal;
  temperature?: number;
  maxTokens?: number;
}): Promise<ChatCompletionResult> {
  const base = swingLlmBaseUrl();
  const url = `${base}/chat/completions`;

  if (isMixedContentRisk(base)) {
    throw new CoachFetchError('mixed-content', mixedContentHint());
  }

  const model = await resolveSwingLlmModel(opts.signal);

  const userContent: ContentPart[] | string = opts.imageDataUrl
    ? [
        { type: 'text', text: opts.userText },
        { type: 'image_url', image_url: { url: opts.imageDataUrl } },
      ]
    : opts.userText;

  const body = {
    model,
    temperature: opts.temperature ?? 0.35,
    max_tokens: opts.maxTokens ?? 450,
    messages: [
      { role: 'system', content: opts.system },
      { role: 'user', content: userContent },
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
    if (opts.signal?.aborted) throw e;
    if (isMixedContentRisk(base)) {
      throw new CoachFetchError('mixed-content', mixedContentHint());
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

  return { text, elapsedMs, model };
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
