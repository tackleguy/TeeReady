/** Llama 3.2 round caddie for Prep (weather) and GPS (live yardages). */

import {
  CoachFetchError,
  requestCoachCompletion,
} from '../swing/coach/client';
import {
  isMixedContentRisk,
  isSafariBrowser,
  swingLlmBaseUrl,
  swingLlmEnabled,
  swingLlmModel,
} from '../swing/coach/config';
import type { CaddyContext, CaddyResult } from './types';
import {
  buildAskUserText,
  buildAutoTipUserText,
  CADDY_SYSTEM_PROMPT,
} from './prompt';
import { rulesCaddyAsk, rulesCaddyTip } from './rules';
import { validateCaddyResponse } from './validate';

export type { CaddyContext, CaddyFacts, CaddyMode, CaddyResult, CaddySource } from './types';
export { buildCaddyContext, allowedNumbersFromFacts } from './context';
export { validateCaddyResponse, extractNumbersFromText } from './validate';
export { rulesCaddyTip, rulesCaddyAsk } from './rules';
export {
  probeSwingLlm as probeCaddyLlm,
  CoachFetchError,
} from '../swing/coach/client';
export {
  swingLlmBaseUrl as caddyLlmBaseUrl,
  swingLlmModel as caddyLlmModel,
  DEFAULT_SWING_LLM_MODEL as DEFAULT_CADDY_LLM_MODEL,
  swingLlmEnabled as caddyLlmEnabled,
} from '../swing/coach/config';

async function runCaddyLlm(opts: {
  ctx: CaddyContext;
  userText: string;
  fallback: CaddyResult;
  signal?: AbortSignal;
}): Promise<CaddyResult> {
  if (!swingLlmEnabled()) return opts.fallback;

  const base = swingLlmBaseUrl();
  if (isMixedContentRisk(base) && isSafariBrowser()) {
    return {
      ...opts.fallback,
      notice:
        'Safari blocks this HTTPS page from reaching a local http://localhost model. Use Chrome or Edge, or open the app at http://localhost.',
    };
  }

  try {
    const { text, elapsedMs } = await requestCoachCompletion({
      system: CADDY_SYSTEM_PROMPT,
      userText: opts.userText,
      signal: opts.signal,
      temperature: 0.3,
      maxTokens: 280,
    });

    const validated = validateCaddyResponse(text, opts.ctx.facts);
    if (!validated.ok) {
      return {
        ...opts.fallback,
        rejectionReason: validated.detail,
        elapsedMs,
        model: swingLlmModel(),
      };
    }

    return {
      text: validated.text,
      source: 'llm',
      elapsedMs,
      model: swingLlmModel(),
    };
  } catch (e) {
    if (e instanceof CoachFetchError && e.kind === 'mixed-content') {
      return { ...opts.fallback, notice: e.message };
    }
    return opts.fallback;
  }
}

/** Auto tip when hole or weather changes. */
export async function autoCaddyTip(
  ctx: CaddyContext,
  opts?: { signal?: AbortSignal },
): Promise<CaddyResult> {
  const fallback = rulesCaddyTip(ctx);
  return runCaddyLlm({
    ctx,
    userText: buildAutoTipUserText(ctx.facts),
    fallback,
    signal: opts?.signal,
  });
}

/** Answer a player question with the same facts + Llama when available. */
export async function askCaddy(
  ctx: CaddyContext,
  question: string,
  opts?: { signal?: AbortSignal },
): Promise<CaddyResult> {
  const q = question.trim();
  if (!q) return rulesCaddyTip(ctx);
  const fallback = rulesCaddyAsk(ctx, q);
  return runCaddyLlm({
    ctx,
    userText: buildAskUserText(ctx.facts, q),
    fallback,
    signal: opts?.signal,
  });
}
