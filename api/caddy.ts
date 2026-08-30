/**
 * Same-origin caddie completions for the HTTPS site.
 * The browser never calls http://localhost — this Edge function talks to
 * Vercel AI Gateway, Groq, or a configured OpenAI-compatible URL.
 */

import { rateLimit, RATE } from './_lib/rateLimit';

export const config = { runtime: 'edge' };

const MAX_SYSTEM = 4_000;
const MAX_USER = 10_000;
const GATEWAY = 'https://ai-gateway.vercel.sh/v1';
const GROQ = 'https://api.groq.com/openai/v1';
const LOCAL = 'http://127.0.0.1:1234/v1';

const GATEWAY_MODELS = [
  'meta/llama-3.1-8b',
  'meta/llama-3.2-3b',
  'meta/llama-3.3-70b',
];
const GROQ_MODELS = ['llama-3.1-8b-instant', 'llama-3.3-70b-versatile'];

function env(name: string): string | undefined {
  const v = (globalThis as { process?: { env?: Record<string, string | undefined> } })
    .process?.env?.[name];
  return v?.trim() || undefined;
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'no-store',
    },
  });
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

function oidcToken(req: Request): string | undefined {
  return (
    req.headers.get('x-vercel-oidc-token')?.trim() || env('VERCEL_OIDC_TOKEN')
  );
}

function upstream(
  req: Request,
): { base: string; key?: string; models: string[] } | null {
  const explicitUrl = env('CADDY_LLM_URL')?.replace(/\/$/, '');
  const explicitModel = env('CADDY_LLM_MODEL');
  const key =
    env('CADDY_LLM_API_KEY') ||
    env('GROQ_API_KEY') ||
    env('AI_GATEWAY_API_KEY') ||
    oidcToken(req);

  if (explicitUrl) {
    const groqish = /groq\.com/i.test(explicitUrl);
    const models = explicitModel
      ? [explicitModel]
      : groqish
        ? GROQ_MODELS
        : GATEWAY_MODELS;
    return { base: explicitUrl, key, models };
  }

  if (env('GROQ_API_KEY')) {
    return {
      base: GROQ,
      key: env('GROQ_API_KEY'),
      models: explicitModel ? [explicitModel] : GROQ_MODELS,
    };
  }

  if (key) {
    return {
      base: GATEWAY,
      key,
      models: explicitModel ? [explicitModel, ...GATEWAY_MODELS] : GATEWAY_MODELS,
    };
  }

  // LM Studio only when this function runs on the same machine (vercel dev).
  if (env('VERCEL_ENV') === 'production' || env('VERCEL_ENV') === 'preview') {
    return null;
  }
  return {
    base: LOCAL,
    models: explicitModel ? [explicitModel] : ['llama-3.2-11b-vision-instruct'],
  };
}

async function chatComplete(opts: {
  base: string;
  key?: string;
  model: string;
  system: string;
  userText: string;
  temperature: number;
  maxTokens: number;
}): Promise<{ ok: true; text: string; model: string } | { ok: false; status: number }> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };
  if (opts.key) headers.Authorization = `Bearer ${opts.key}`;

  const res = await fetch(`${opts.base}/chat/completions`, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      model: opts.model,
      temperature: opts.temperature,
      max_tokens: opts.maxTokens,
      messages: [
        { role: 'system', content: opts.system },
        { role: 'user', content: opts.userText },
      ],
    }),
    signal: AbortSignal.timeout(22_000),
  });

  if (!res.ok) return { ok: false, status: res.status };
  const data: unknown = await res.json();
  const text = extractAssistantText(data);
  if (!text) return { ok: false, status: 502 };
  return { ok: true, text, model: opts.model };
}

export default async function handler(req: Request): Promise<Response> {
  if (req.method === 'GET') {
    const up = upstream(req);
    return json({
      ok: true,
      configured: Boolean(up && (up.key || up.base === LOCAL)),
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
  if (system.length > MAX_SYSTEM || userText.length > MAX_USER) {
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

  const up = upstream(req);
  if (!up) return json({ error: 'caddy llm not configured' }, 503);

  let lastStatus = 502;
  for (const model of up.models) {
    try {
      const result = await chatComplete({
        base: up.base,
        key: up.key,
        model,
        system,
        userText,
        temperature,
        maxTokens,
      });
      if (result.ok) {
        return json({ text: result.text, model: result.model, source: 'llm' });
      }
      lastStatus = result.status;
      if (result.status !== 404 && result.status !== 400) break;
    } catch {
      lastStatus = 502;
    }
  }

  return json({ error: 'upstream llm failed', status: lastStatus }, 502);
}
