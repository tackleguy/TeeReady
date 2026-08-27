/** Phase 2: local vision LLM coaching on top of Phase 1 metrics. */

import { buildContactSheet } from './contactSheet';
import { CoachFetchError, requestCoachCompletion } from './client';
import {
  isMixedContentRisk,
  isSafariBrowser,
  swingLlmBaseUrl,
  swingLlmEnabled,
  swingLlmModel,
} from './config';
import { buildCoachUserText, SWING_COACH_SYSTEM_PROMPT } from './prompt';
import {
  logCoachRejection,
  validateCoachResponse,
} from './validate';
import type { SwingAnalysis } from '../types';

export type CoachSource = 'llm' | 'rules';

export type SwingCoachResult = {
  text: string;
  source: CoachSource;
  /** Wall-clock for the local model call only (when source=llm). */
  elapsedMs?: number;
  model?: string;
  /** Actionable mixed-content / Safari guidance — still returns rules text. */
  notice?: string;
  rejectionReason?: string;
};

/**
 * Ask the local vision model for caddie notes.
 * Always returns usable text: LLM when valid, otherwise Phase 1 rule summary.
 * Unreachable endpoint → silent rules fallback (no throw).
 */
export async function coachSwingAnalysis(
  analysis: SwingAnalysis,
  opts?: { signal?: AbortSignal },
): Promise<SwingCoachResult> {
  const rulesFallback = (): SwingCoachResult => ({
    text: analysis.summary,
    source: 'rules',
  });

  if (!swingLlmEnabled()) return rulesFallback();

  const base = swingLlmBaseUrl();
  if (isMixedContentRisk(base) && isSafariBrowser()) {
    return {
      ...rulesFallback(),
      notice:
        'Safari blocks this HTTPS page from reaching a local http://localhost model. Use Chrome or Edge, or open the app at http://localhost while coaching.',
    };
  }

  try {
    const imageDataUrl = await buildContactSheet(analysis.keyframes);
    const { text, elapsedMs } = await requestCoachCompletion({
      system: SWING_COACH_SYSTEM_PROMPT,
      userText: buildCoachUserText(analysis),
      imageDataUrl,
      signal: opts?.signal,
    });

    const validated = validateCoachResponse(text, analysis.metrics, [
      analysis.fps,
    ]);

    if (!validated.ok) {
      logCoachRejection({
        reason: validated.reason,
        detail: validated.detail,
        fabricated: validated.fabricated,
        excerpt: text.slice(0, 240),
      });
      return {
        ...rulesFallback(),
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
    if (e instanceof CoachFetchError) {
      if (e.kind === 'mixed-content') {
        return { ...rulesFallback(), notice: e.message };
      }
      // Unreachable / HTTP / parse — degrade quietly to rules.
      return rulesFallback();
    }
    return rulesFallback();
  }
}

export {
  allowedNumbersFromMetrics,
  extractNumbersFromText,
  loadCoachRejections,
  normalizeNumberToken,
  validateCoachResponse,
} from './validate';
export type { CoachValidation } from './validate';
export { buildContactSheet } from './contactSheet';
export { probeSwingLlm, CoachFetchError } from './client';
export {
  DEFAULT_SWING_LLM_URL,
  DEFAULT_SWING_LLM_MODEL,
  swingLlmBaseUrl,
  swingLlmModel,
  swingLlmEnabled,
  isMixedContentRisk,
  isSafariBrowser,
} from './config';
