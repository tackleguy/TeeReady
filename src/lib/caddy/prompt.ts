/** System + user prompts for Prep/GPS Llama caddie. */

import type { CaddyFacts } from './types';

export const CADDY_MAX_CHARS = 900;

export const CADDY_SYSTEM_PROMPT = `You are TeeReady's on-course caddie — practical, calm, encouraging, not corporate.

You receive ground-truth JSON from weather ensemble, hole geometry, turf, player bag/miss, prep focus, and (in GPS) live remaining yardages. That JSON is the only source of numbers.

HARD RULES — never break these:
- Never invent, restate incorrectly, or adjust a number that is not exactly present in the facts JSON. No new yardages, wind speeds, percentages, or clubs.
- Prefer words over digits. If you must cite a measurement, copy the exact value from the JSON and nothing else.
- Do not invent hazards, bunkers, water, or pin positions that are not in the facts.
- Club advice must only name clubs already in recommendedClub, clubHint, or bagClubForRemain.
- Keep it short: two or three tight sentences. No headings, no bullet lists, no markdown.

MODE AWARENESS:
- mode "prep": build a hole plan — wind, plays-like, turf firmness, miss bias, and prepFocus/prepFocusTip when present. Help them visualize the shot before they walk to the tee.
- mode "gps": help the player commit to the next shot with remain yardages and wind — commitment over theory.`;

export function buildAutoTipUserText(facts: CaddyFacts): string {
  return [
    'Ground-truth hole and weather facts (do not invent numbers):',
    JSON.stringify(facts, null, 2),
    '',
    facts.mode === 'prep'
      ? 'Write a short Prep tip: how this hole plays in these conditions, use prepFocus if set, and what to plan for (club / miss / wind). Two or three sentences.'
      : 'Write a short GPS tip: what to hit next given remain yardages and wind. Two or three sentences. Commit.',
  ].join('\n');
}

export function buildAskUserText(facts: CaddyFacts, question: string): string {
  return [
    'Ground-truth hole and weather facts (do not invent numbers):',
    JSON.stringify(facts, null, 2),
    '',
    `Player question: ${question.trim()}`,
    '',
    facts.mode === 'prep'
      ? 'Answer like a prep-room caddie: strategy first, then club/wind from the facts. Two or three sentences.'
      : 'Answer in two or three sentences using only the facts above. Commit to the next shot.',
  ].join('\n');
}

/** Quick prompts players can tap in Prep / GPS. */
export const CADDY_QUICK_ASKS: Record<
  'prep' | 'gps',
  Array<{ label: string; question: string }>
> = {
  prep: [
    {
      label: 'Tee plan',
      question:
        'How should I play the tee shot on this hole in these conditions?',
    },
    {
      label: 'Club',
      question: 'What club fits this hole from the numbers?',
    },
    {
      label: 'Miss side',
      question: 'Where should I miss given my miss bias and the wind?',
    },
    {
      label: 'Wind',
      question: 'How does the wind change this hole?',
    },
    {
      label: 'Plays-like',
      question:
        'Walk me through the plays-like number and what club that implies from my bag.',
    },
    {
      label: 'Round key',
      question:
        'Given the prep focus for this hole, what is the one thing I must not do?',
    },
  ],
  gps: [
    {
      label: 'What now?',
      question: 'What should I hit next from these remain yardages?',
    },
    {
      label: 'Club',
      question: 'Which club fits the mid remain number?',
    },
    {
      label: 'Wind adjust',
      question: 'How should I adjust for wind on this shot?',
    },
    {
      label: 'Commit',
      question: 'Give me a one-line commit for this shot.',
    },
  ],
};
