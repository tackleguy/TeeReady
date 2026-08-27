/** Local OpenAI-compatible swing coach / caddie config. */

export const DEFAULT_SWING_LLM_URL = 'http://localhost:1234/v1';
/** Same-origin Vite proxy path — avoids HTTPS→http mixed content in the browser. */
export const DEV_SWING_LLM_PROXY_PATH = '/llm/v1';
export const DEFAULT_SWING_LLM_MODEL = 'llama-3.2-11b-vision-instruct';

/** Soft cap on coach prose (chars). Longer responses are rejected. */
export const COACH_MAX_CHARS = 1400;

const MIXED_CONTENT_HINT =
  'This page is HTTPS and cannot call a plain http://localhost model. Open TeeReady via `npm run dev` at http://localhost:5173 (Vite proxies /llm → LM Studio), or set VITE_SWING_LLM_URL to an https endpoint.';

/** Read Vite `import.meta.env` or Node `process.env` without throwing. */
export function readViteEnv(key: string): string | undefined {
  try {
    const meta = (import.meta as ImportMeta & {
      env?: Record<string, string | undefined>;
    }).env;
    const fromMeta = meta?.[key]?.trim();
    if (fromMeta) return fromMeta;
  } catch {
    /* import.meta.env absent outside Vite */
  }
  if (typeof process !== 'undefined' && process.env) {
    const fromProcess = process.env[key]?.trim();
    if (fromProcess) return fromProcess;
  }
  return undefined;
}

function isViteDev(): boolean {
  try {
    return Boolean(
      (import.meta as ImportMeta & { env?: { DEV?: boolean } }).env?.DEV,
    );
  } catch {
    return false;
  }
}

function isLocalHttpLlmUrl(url: string): boolean {
  try {
    const base =
      typeof window !== 'undefined' ? window.location.href : 'http://localhost/';
    const u = new URL(url, base);
    if (u.protocol !== 'http:') return false;
    return (
      u.hostname === 'localhost' ||
      u.hostname === '127.0.0.1' ||
      u.hostname === '[::1]'
    );
  } catch {
    return false;
  }
}

/**
 * When false, skip local LLM calls and use rules / authored fallbacks only.
 * Set `VITE_SWING_LLM_DISABLED=1` for fully offline coaching UX.
 */
export function swingLlmEnabled(): boolean {
  const raw = readViteEnv('VITE_SWING_LLM_DISABLED');
  if (raw === '1' || raw === 'true' || raw === 'yes') return false;
  return true;
}

/**
 * Base URL for OpenAI-compatible `/models` and `/chat/completions`.
 * In the Vite browser (dev), defaults to same-origin `/llm/v1` so HTTPS pages
 * do not hit mixed-content blocks talking to LM Studio on :1234.
 */
export function swingLlmBaseUrl(): string {
  const raw = readViteEnv('VITE_SWING_LLM_URL')?.replace(/\/$/, '');
  const configured = (raw || DEFAULT_SWING_LLM_URL).replace(/\/$/, '');

  // Vite browser: same-origin /llm proxy (see vite.config.ts) — no mixed content.
  if (typeof window !== 'undefined' && isViteDev()) {
    if (!raw || isLocalHttpLlmUrl(configured)) {
      return DEV_SWING_LLM_PROXY_PATH;
    }
  }

  return configured;
}

export function swingLlmModel(): string {
  const raw = readViteEnv('VITE_SWING_LLM_MODEL');
  return raw || DEFAULT_SWING_LLM_MODEL;
}

/**
 * True when the page is HTTPS and the model URL is absolute plain HTTP
 * (browsers block active mixed content). Relative `/llm/...` is same-origin.
 */
export function isMixedContentRisk(baseUrl: string = swingLlmBaseUrl()): boolean {
  if (typeof window === 'undefined') return false;
  if (window.location.protocol !== 'https:') return false;
  if (baseUrl.startsWith('/')) return false;
  try {
    const u = new URL(baseUrl, window.location.href);
    if (u.protocol !== 'http:') return false;
    // Same host over http while page is https is still mixed; localhost too.
    return true;
  } catch {
    return false;
  }
}

export function mixedContentHint(): string {
  return MIXED_CONTENT_HINT;
}

export function isSafariBrowser(): boolean {
  if (typeof navigator === 'undefined') return false;
  const ua = navigator.userAgent;
  return /Safari/i.test(ua) && !/Chrome|Chromium|Edg|OPR|Android/i.test(ua);
}
