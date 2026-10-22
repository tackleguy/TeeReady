/** Same-origin /api/caddy — disabled to keep Vercel Active CPU at zero. */

export type SiteCaddyCompletion = {
  text: string;
  elapsedMs: number;
  model: string;
};

export async function requestSiteCaddyCompletion(_opts: {
  system: string;
  userText: string;
  signal?: AbortSignal;
  temperature?: number;
  maxTokens?: number;
}): Promise<SiteCaddyCompletion | null> {
  return null;
}
