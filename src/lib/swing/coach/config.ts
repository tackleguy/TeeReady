/** Local OpenAI-compatible swing coach / caddie config. */

export const DEFAULT_SWING_LLM_URL = 'http://localhost:1234/v1';
export const DEFAULT_SWING_LLM_MODEL = 'llama-3.2-11b-vision-instruct';

/** Soft cap on coach prose (chars). Longer responses are rejected. */
export const COACH_MAX_CHARS = 1400;

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

/**
 * When false, skip local LLM calls and use rules / authored fallbacks only.
 * Set `VITE_SWING_LLM_DISABLED=1` for fully offline coaching UX.
 */
export function swingLlmEnabled(): boolean {
  const raw = readViteEnv('VITE_SWING_LLM_DISABLED');
  if (raw === '1' || raw === 'true' || raw === 'yes') return false;
  return true;
}

export function swingLlmBaseUrl(): string {
  const raw = readViteEnv('VITE_SWING_LLM_URL');
  return (raw || DEFAULT_SWING_LLM_URL).replace(/\/$/, '');
}

export function swingLlmModel(): string {
  const raw = readViteEnv('VITE_SWING_LLM_MODEL');
  return raw || DEFAULT_SWING_LLM_MODEL;
}

/** True when the page is HTTPS and the model URL is plain HTTP (Safari blocks this). */
export function isMixedContentRisk(baseUrl: string = swingLlmBaseUrl()): boolean {
  if (typeof window === 'undefined') return false;
  if (window.location.protocol !== 'https:') return false;
  try {
    const u = new URL(baseUrl);
    return u.protocol === 'http:';
  } catch {
    return false;
  }
}

export function isSafariBrowser(): boolean {
  if (typeof navigator === 'undefined') return false;
  const ua = navigator.userAgent;
  return /Safari/i.test(ua) && !/Chrome|Chromium|Edg|OPR|Android/i.test(ua);
}
