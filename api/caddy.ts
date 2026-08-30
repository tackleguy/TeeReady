/**
 * Same-origin caddie completions.
 * Local (Vite / vercel dev): Ollama on 127.0.0.1:11434.
 * Production: Vercel AI Gateway or Groq.
 */

import { rateLimit, RATE } from './_lib/rateLimit';
import {
  completeCaddyPrompt,
  MAX_CADDY_SYSTEM,
  MAX_CADDY_USER,
  resolveCaddyUpstream,
} from './_lib/caddyLlm';

export const config = { runtime: 'edge' };

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'no-store',
    },
  });
}

function oidcToken(req: Request): string | undefined {
  return (
    req.headers.get('x-vercel-oidc-token')?.trim() ||
    (globalThis as { process?: { env?: Record<string, string | undefined> } })
      .process?.env?.VERCEL_OIDC_TOKEN?.trim()
  );
}

export default async function handler(req: Request): Promise<Response> {
  const vercelProd = Boolean(
    (globalThis as { process?: { env?: Record<string, string | undefined> } })
      .process?.env?.VERCEL_ENV &&
      ['production', 'preview'].includes(
        String(
          (globalThis as { process?: { env?: Record<string, string | undefined> } })
            .process?.env?.VERCEL_ENV,
        ),
      ),
  );

  if (req.method === 'GET') {
    const up = await resolveCaddyUpstream({
      oidc: oidcToken(req),
      preferOllama: !vercelProd,
    });
    return json({
      ok: true,
      configured: Boolean(up),
      backend: up?.base ?? null,
    });
  }

  if (req.method !== 'POST') {
    return json({ error: 'method not allowed' }, 405);
  }

  const limited = rateLimit(req, RATE.caddy);
  if (limited) return limited;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return json({ error: 'invalid json' }, 400);
  }

  const rec = body && typeof body === 'object' ? (body as Record<string, unknown>) : {};
  const system = typeof rec.system === 'string' ? rec.system.trim() : '';
  const userText = typeof rec.userText === 'string' ? rec.userText.trim() : '';
  if (!system || !userText) return json({ error: 'system and userText required' }, 400);
  if (system.length > MAX_CADDY_SYSTEM || userText.length > MAX_CADDY_USER) {
    return json({ error: 'prompt too long' }, 413);
  }

  const temperature =
    typeof rec.temperature === 'number' && Number.isFinite(rec.temperature)
      ? Math.min(1, Math.max(0, rec.temperature))
      : 0.3;
  const maxTokens =
    typeof rec.maxTokens === 'number' && Number.isFinite(rec.maxTokens)
      ? Math.min(400, Math.max(40, Math.round(rec.maxTokens)))
      : 280;

  const result = await completeCaddyPrompt({
    system,
    userText,
    temperature,
    maxTokens,
    oidc: oidcToken(req),
    preferOllama: !vercelProd,
  });

  if (!result.ok) {
    return json(
      { error: result.error ?? 'upstream llm failed', status: result.status },
      result.status === 503 ? 503 : 502,
    );
  }

  return json({ text: result.text, model: result.model, source: 'llm' });
}
