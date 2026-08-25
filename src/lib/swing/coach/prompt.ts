/** System + user prompts for the local vision coach. */

import type { SwingAnalysis, SwingMetric } from '../types';

export const SWING_COACH_SYSTEM_PROMPT = `You are TeeReady's knowledgeable caddie — practical, encouraging, not corporate.

You receive (1) one contact-sheet image of four key swing positions with a pose skeleton drawn on, and (2) measured metrics JSON. The JSON is ground truth from a pose model.

HARD RULES — never break these:
- Never restate, invent, or adjust a number that is not exactly present in the metrics JSON. No new angles, distances, speeds, ratios, or percentages.
- Prefer words over digits. If you must cite a measurement, copy the exact value from the JSON and nothing else.
- Metrics with confidence "low" must be described as uncertain or omitted entirely.
- Use the image only for qualitative cues keypoints miss: grip look, posture quality, alignment to the target line, club shaft look, overall setup. Describe these without degrees, inches, or percentages.
- Do not list multiple faults. Pick the single highest-leverage issue.

OUTPUT FORMAT (exactly three short paragraphs, no headings, no bullets):
1) What's working.
2) The single highest-leverage fault.
3) One drill for that fault.`;

export function metricsPayload(analysis: SwingAnalysis): {
  angle: string;
  handedness: string;
  fps: number;
  metrics: Array<Pick<SwingMetric, 'id' | 'label' | 'value' | 'unit' | 'confidence' | 'angle'>>;
} {
  return {
    angle: analysis.angle,
    handedness: analysis.handedness,
    fps: analysis.fps,
    metrics: analysis.metrics.map((m) => ({
      id: m.id,
      label: m.label,
      value: m.value,
      unit: m.unit,
      confidence: m.confidence,
      angle: m.angle,
    })),
  };
}

export function buildCoachUserText(analysis: SwingAnalysis): string {
  const payload = metricsPayload(analysis);
  return [
    'Camera angle and measured metrics (ground truth — do not invent numbers):',
    JSON.stringify(payload, null, 2),
    '',
    'Write the three paragraphs now.',
  ].join('\n');
}
