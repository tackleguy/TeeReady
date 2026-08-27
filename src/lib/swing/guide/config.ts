/** Per-section model routing for the swing guide. */

import { readViteEnv, swingLlmModel } from '../coach/config';

export type GuideSectionId =
  | 'assessment'
  | 'rootCause'
  | 'whyDrills'
  | 'weeklyFraming'
  | 'visualRead';

const ENV_KEYS: Record<GuideSectionId, keyof ImportMetaEnv | string> = {
  assessment: 'VITE_SWING_LLM_MODEL_ASSESSMENT',
  rootCause: 'VITE_SWING_LLM_MODEL_ROOT_CAUSE',
  whyDrills: 'VITE_SWING_LLM_MODEL_WHY_DRILLS',
  weeklyFraming: 'VITE_SWING_LLM_MODEL_WEEKLY',
  visualRead: 'VITE_SWING_LLM_MODEL_VISUAL',
};

/** Override model per section without rewriting the feature. Falls back to VITE_SWING_LLM_MODEL. */
export function modelForGuideSection(section: GuideSectionId): string {
  const key = ENV_KEYS[section];
  const raw = readViteEnv(String(key));
  return raw || swingLlmModel();
}

export const GUIDE_WORD_LIMITS: Record<GuideSectionId, number> = {
  assessment: 120,
  rootCause: 100,
  whyDrills: 80,
  weeklyFraming: 25, // per week line
  visualRead: 80,
};

export const GUIDE_SYSTEM_BASE = `You are TeeReady's knowledgeable caddie — practical, encouraging, not corporate.

HARD RULES:
- Numbers come only from the input JSON. No new figures, no adjusted figures, no ranges you invent.
- Drill names must match the provided library exactly. Do not rewrite execution steps — reference the drill by name only.
- Never contradict the authored cause chain in the JSON.
- No medical, physiotherapy, or injury-treatment claims. Never tell the player to force a bigger turn, deeper position, or greater range of motion.
- Return JSON only, matching the schema in the user message.`;
