/**
 * Hard cost guard for Vercel Fluid / Edge Active CPU.
 * When enabled, handlers must return without Overpass, weather fan-out, or LLM work.
 */

export function zeroComputeMode(): boolean {
  const env = (
    globalThis as { process?: { env?: Record<string, string | undefined> } }
  ).process?.env;
  // Opt out only with an explicit escape hatch for local API debugging.
  if (env?.ALLOW_LIVE_COMPUTE === '1') return false;
  // Default ON for every Vercel deployment (production + preview).
  if (env?.VERCEL === '1' || env?.VERCEL_ENV) return true;
  // Local vite / vercel dev: also cheap by default.
  return env?.FORCE_LIVE_COMPUTE !== '1';
}

export function cheapJson(
  body: unknown,
  status = 200,
  cacheSeconds = 3600,
): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': `public, max-age=${cacheSeconds}, s-maxage=${cacheSeconds}`,
      'X-TeeReady-Compute': 'static',
    },
  });
}
