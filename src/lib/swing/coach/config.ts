/** Local OpenAI-compatible swing coach config. */

export const DEFAULT_SWING_LLM_URL = 'http://localhost:1234/v1';
export const DEFAULT_SWING_LLM_MODEL = 'llama-3.2-11b-vision-instruct';

/** Soft cap on coach prose (chars). Longer responses are rejected. */
export const COACH_MAX_CHARS = 1400;

export function swingLlmBaseUrl(): string {
  const raw = (import.meta.env.VITE_SWING_LLM_URL as string | undefined)?.trim();
  return (raw || DEFAULT_SWING_LLM_URL).replace(/\/$/, '');
}

export function swingLlmModel(): string {
  const raw = (import.meta.env.VITE_SWING_LLM_MODEL as string | undefined)?.trim();
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
