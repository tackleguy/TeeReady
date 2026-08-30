/** Same-origin /api/caddy — works on the HTTPS production site. */

export type SiteCaddyCompletion = {
  text: string;
  elapsedMs: number;
  model: string;
};

export async function requestSiteCaddyCompletion(opts: {
  system: string;
  userText: string;
  signal?: AbortSignal;
  temperature?: number;
  maxTokens?: number;
}): Promise<SiteCaddyCompletion | null> {
  const started =
    typeof performance !== 'undefined' ? performance.now() : Date.now();
  try {
    const res = await fetch('/api/caddy', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        system: opts.system,
        userText: opts.userText,
        temperature: opts.temperature ?? 0.3,
        maxTokens: opts.maxTokens ?? 280,
      }),
      signal: opts.signal,
    });
    if (!res.ok) return null;
    const data: unknown = await res.json();
    if (!data || typeof data !== 'object') return null;
    const text = (data as { text?: unknown }).text;
    if (typeof text !== 'string' || !text.trim()) return null;
    const modelRaw = (data as { model?: unknown }).model;
    const elapsedMs = Math.round(
      (typeof performance !== 'undefined' ? performance.now() : Date.now()) -
        started,
    );
    return {
      text: text.trim(),
      elapsedMs,
      model: typeof modelRaw === 'string' && modelRaw ? modelRaw : 'caddy',
    };
  } catch {
    return null;
  }
}
