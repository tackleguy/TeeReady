/** Llama 3.2 round caddie for Prep (weather) and GPS (live yardages). */

import {
  CoachFetchError,
  requestCoachCompletion,
} from '../swing/coach/client';
import { swingLlmEnabled, swingLlmReachableFromPage } from '../swing/coach/config';
import type { CaddyContext, CaddyResult } from './types';
import {
  buildAskUserText,
  buildAutoTipUserText,
  CADDY_SYSTEM_PROMPT,
} from './prompt';
import { rulesCaddyAsk, rulesCaddyTip } from './rules';
import { requestSiteCaddyCompletion } from './siteClient';
import { validateCaddyResponse } from './validate';

export type { CaddyContext, CaddyFacts, CaddyMode, CaddyResult, CaddySource } from './types';
export { buildCaddyContext, allowedNumbersFromFacts } from './context';
export { validateCaddyResponse, extractNumbersFromText } from './validate';
export { rulesCaddyTip, rulesCaddyAsk } from './rules';
export {
  probeSwingLlm as probeCaddyLlm,
  CoachFetchError,
  resolveSwingLlmModel as resolveCaddyLlmModel,
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
  /** When true, throw instead of rules fallback (smoke / CI). */
  requireLlm?: boolean;
}): Promise<CaddyResult> {
  if (!swingLlmEnabled()) {
    if (opts.requireLlm) {
      throw new Error('VITE_SWING_LLM_DISABLED is set — local Llama required');
    }
    return opts.fallback;
  }

  const applyText = (
    text: string,
    elapsedMs: number | undefined,
    model: string | undefined,
  ): CaddyResult => {
    const validated = validateCaddyResponse(text, opts.ctx.facts);
    if (!validated.ok) {
      if (opts.requireLlm) {
        throw new Error(`Caddy LLM rejected: ${validated.detail}`);
      }
      return {
        ...opts.fallback,
        rejectionReason: validated.detail,
        elapsedMs,
        model,
      };
    }
    return {
      text: validated.text,
      source: 'llm',
      elapsedMs,
      model,
    };
  };

  const site = await requestSiteCaddyCompletion({
    system: CADDY_SYSTEM_PROMPT,
    userText: opts.userText,
    signal: opts.signal,
    temperature: 0.3,
    maxTokens: 280,
  });
  if (opts.signal?.aborted) {
    throw new DOMException('Aborted', 'AbortError');
  }
  if (site) return applyText(site.text, site.elapsedMs, site.model);

  if (!swingLlmReachableFromPage()) {
    if (opts.requireLlm) {
      throw new CoachFetchError(
        'unreachable',
        'Site caddy API and local Llama are both unavailable.',
      );
    }
    return opts.fallback;
  }

  try {
    const { text, elapsedMs, model } = await requestCoachCompletion({
      system: CADDY_SYSTEM_PROMPT,
      userText: opts.userText,
      signal: opts.signal,
      temperature: 0.3,
      maxTokens: 280,
    });
    return applyText(text, elapsedMs, model);
  } catch (e) {
    if (opts.signal?.aborted) throw e;
    if (opts.requireLlm) throw e;
    return opts.fallback;
  }
}

/** Auto tip when hole or weather changes. */
export async function autoCaddyTip(
  ctx: CaddyContext,
  opts?: { signal?: AbortSignal; requireLlm?: boolean },
): Promise<CaddyResult> {
  const fallback = rulesCaddyTip(ctx);
  return runCaddyLlm({
    ctx,
    userText: buildAutoTipUserText(ctx.facts),
    fallback,
    signal: opts?.signal,
    requireLlm: opts?.requireLlm,
  });
}

/** Answer a player question with the same facts + Llama when available. */
export async function askCaddy(
  ctx: CaddyContext,
  question: string,
  opts?: { signal?: AbortSignal; requireLlm?: boolean },
): Promise<CaddyResult> {
  const q = question.trim();
  if (!q) return rulesCaddyTip(ctx);
  const fallback = rulesCaddyAsk(ctx, q);
  return runCaddyLlm({
    ctx,
    userText: buildAskUserText(ctx.facts, q),
    fallback,
    signal: opts?.signal,
    requireLlm: opts?.requireLlm,
  });
}
