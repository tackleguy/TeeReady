/** Shared caddie LLM upstream (Ollama locally, Gateway/Groq on Vercel). */

export const MAX_CADDY_SYSTEM = 4_000;
export const MAX_CADDY_USER = 10_000;

const GATEWAY = 'https://ai-gateway.vercel.sh/v1';
const GROQ = 'https://api.groq.com/openai/v1';
const OLLAMA_DEFAULT = 'http://127.0.0.1:11434/v1';
const LMSTUDIO_DEFAULT = 'http://127.0.0.1:1234/v1';

const GATEWAY_MODELS = [
  'meta/llama-3.1-8b',
  'meta/llama-3.2-3b',
  'meta/llama-3.3-70b',
];
const GROQ_MODELS = ['llama-3.1-8b-instant', 'llama-3.3-70b-versatile'];
const OLLAMA_MODELS = ['llama3.2', 'llama3.2:latest', 'llama3.1', 'llama3'];

export type CaddyUpstream = {
  base: string;
  key?: string;
  models: string[];
};

export type CaddyCompleteOk = { ok: true; text: string; model: string };
export type CaddyCompleteFail = { ok: false; status: number; error?: string };

function env(name: string): string | undefined {
  const v = (globalThis as { process?: { env?: Record<string, string | undefined> } })
    .process?.env?.[name];
  return v?.trim() || undefined;
}

export function extractAssistantText(data: unknown): string {
  if (!data || typeof data !== 'object') return '';
  const rec = data as Record<string, unknown>;
  const choices = rec.choices;
  if (Array.isArray(choices) && choices[0]) {
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
  }
  // Ollama native /api/chat
  if (typeof rec.response === 'string') return rec.response.trim();
  const message = rec.message as { content?: unknown } | undefined;
  if (typeof message?.content === 'string') return message.content.trim();
  return '';
}

export function ollamaBaseUrl(): string {
  const host = (env('OLLAMA_HOST') || 'http://127.0.0.1:11434').replace(/\/$/, '');
  return host.endsWith('/v1') ? host : `${host}/v1`;
}

async function ollamaModelIds(base: string): Promise<string[]> {
  const host = base.replace(/\/v1$/, '');
  try {
    const res = await fetch(`${host}/api/tags`, {
      signal: AbortSignal.timeout(2_500),
    });
    if (!res.ok) return [];
    const data: unknown = await res.json();
    const models = (data as { models?: Array<{ name?: string }> }).models;
    if (!Array.isArray(models)) return [];
    return models.map((m) => m.name).filter((n): n is string => Boolean(n));
  } catch {
    return [];
  }
}

function pickOllamaModels(installed: string[], preferred?: string): string[] {
  const names = [...installed];
  const out: string[] = [];
  const add = (id: string) => {
    if (!out.includes(id)) out.push(id);
  };
  if (preferred) add(preferred);
  for (const id of installed) {
    if (/llama3\.?2/i.test(id)) add(id);
  }
  for (const id of OLLAMA_MODELS) add(id);
  for (const id of names) add(id);
  return out;
}

export async function resolveCaddyUpstream(opts: {
  oidc?: string;
  preferOllama?: boolean;
}): Promise<CaddyUpstream | null> {
  const explicitUrl = env('CADDY_LLM_URL')?.replace(/\/$/, '');
  const explicitModel = env('CADDY_LLM_MODEL');
  const vercelProd =
    env('VERCEL_ENV') === 'production' || env('VERCEL_ENV') === 'preview';
  const preferOllama = opts.preferOllama ?? !vercelProd;

  if (preferOllama && !explicitUrl) {
    const base = ollamaBaseUrl();
    const installed = await ollamaModelIds(base);
    if (installed.length > 0) {
      return {
        base,
        models: pickOllamaModels(installed, explicitModel),
      };
    }
    return {
      base,
      models: pickOllamaModels([], explicitModel),
    };
  }

  const key =
    env('CADDY_LLM_API_KEY') ||
    env('GROQ_API_KEY') ||
    env('AI_GATEWAY_API_KEY') ||
    opts.oidc ||
    env('VERCEL_OIDC_TOKEN');

  if (explicitUrl) {
    const groqish = /groq\.com/i.test(explicitUrl);
    const ollamaish = /11434|ollama/i.test(explicitUrl);
    const models = explicitModel
      ? [explicitModel]
      : groqish
        ? GROQ_MODELS
        : ollamaish
          ? pickOllamaModels(await ollamaModelIds(explicitUrl), explicitModel)
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

  if (vercelProd) return null;

  return {
    base: LMSTUDIO_DEFAULT,
    models: explicitModel ? [explicitModel] : ['llama-3.2-11b-vision-instruct'],
  };
}

export async function chatComplete(opts: {
  base: string;
  key?: string;
  model: string;
  system: string;
  userText: string;
  temperature: number;
  maxTokens: number;
}): Promise<CaddyCompleteOk | CaddyCompleteFail> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };
  if (opts.key) headers.Authorization = `Bearer ${opts.key}`;

  try {
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
      signal: AbortSignal.timeout(120_000),
    });
    if (!res.ok) return { ok: false, status: res.status };
    const data: unknown = await res.json();
    const text = extractAssistantText(data);
    if (!text) return { ok: false, status: 502, error: 'empty' };
    return { ok: true, text, model: opts.model };
  } catch {
    return { ok: false, status: 502 };
  }
}

export async function completeCaddyPrompt(opts: {
  system: string;
  userText: string;
  temperature?: number;
  maxTokens?: number;
  oidc?: string;
  preferOllama?: boolean;
}): Promise<CaddyCompleteOk | CaddyCompleteFail> {
  const up = await resolveCaddyUpstream({
    oidc: opts.oidc,
    preferOllama: opts.preferOllama,
  });
  if (!up) return { ok: false, status: 503, error: 'caddy llm not configured' };

  const temperature = opts.temperature ?? 0.3;
  const maxTokens = opts.maxTokens ?? 280;
  let last: CaddyCompleteFail = { ok: false, status: 502 };
  for (const model of up.models) {
    const result = await chatComplete({
      base: up.base,
      key: up.key,
      model,
      system: opts.system,
      userText: opts.userText,
      temperature,
      maxTokens,
    });
    if (result.ok) return result;
    last = result;
    if (result.status !== 404 && result.status !== 400) break;
  }
  return last;
}
