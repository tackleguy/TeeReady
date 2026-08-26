/** FPS accuracy helpers for launch metrics. */

import { LM_NUMBERS_MIN_FPS, LM_TIER_MIN_FPS } from './constants';

/** Absolute floor — below this, numeric metrics are refused (tracer may still work). */
export { LM_NUMBERS_MIN_FPS };

/**
 * Warnings appended to metric assumptions based on measured fps.
 * 120+ fps: no extra caveat. 60–119 and 30–59 get progressively stronger notes.
 */
export function fpsAccuracyAssumptions(fps: number): string[] {
  const rounded = Math.round(fps);
  if (fps >= LM_TIER_MIN_FPS) return [];
  if (fps >= 60) {
    return [
      `Measured ~${rounded} fps — standard rate. Numbers shown but less accurate than 120+ fps slow-mo (motion blur, fewer flight frames).`,
    ];
  }
  if (fps >= LM_NUMBERS_MIN_FPS) {
    return [
      `Measured ~${rounded} fps — low rate. Speed and launch are approximate; ball may blur or leave frame within 1–2 frames.`,
    ];
  }
  return [];
}

export function fpsSetupWarning(fps: number): string | null {
  const rounded = Math.round(fps);
  if (fps >= LM_TIER_MIN_FPS) return null;
  if (fps >= 60) {
    return `~${rounded} fps — usable at reduced accuracy. For best results use 120+ fps slow-mo.`;
  }
  if (fps >= LM_NUMBERS_MIN_FPS) {
    return `~${rounded} fps — low accuracy. Tracer and rough yardage still shown; prefer 120+ fps slow-mo when possible.`;
  }
  return `~${rounded} fps — below ${LM_NUMBERS_MIN_FPS} fps minimum for yardage numbers.`;
}
