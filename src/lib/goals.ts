/** Player goals — picked at signup and edited in Settings. */

export type GoalId =
  | 'lower-handicap'
  | 'break-90'
  | 'break-80'
  | 'fairways'
  | 'approaches'
  | 'short-game'
  | 'play-more'
  | 'home-course'
  | 'compete';

export type GoalOption = {
  id: GoalId;
  label: string;
  blurb: string;
  emoji: string;
};

export const GOAL_OPTIONS: GoalOption[] = [
  {
    id: 'lower-handicap',
    label: 'Lower handicap',
    blurb: 'Trim strokes with smarter targets and course management.',
    emoji: '📉',
  },
  {
    id: 'break-90',
    label: 'Break 90',
    blurb: 'Eliminate blow-up holes and protect doubles.',
    emoji: '🎯',
  },
  {
    id: 'break-80',
    label: 'Break 80',
    blurb: 'Convert chances — birdie looks and stress-free pars.',
    emoji: '⛳',
  },
  {
    id: 'fairways',
    label: 'More fairways',
    blurb: 'Tighter tee patterns and miss-side planning.',
    emoji: '🛣️',
  },
  {
    id: 'approaches',
    label: 'Better approaches',
    blurb: 'Dial yardages and wind into your club picks.',
    emoji: '📍',
  },
  {
    id: 'short-game',
    label: 'Sharpen short game',
    blurb: 'Up-and-down saves and confident wedge distances.',
    emoji: '🏌️',
  },
  {
    id: 'play-more',
    label: 'Play more golf',
    blurb: 'Build a rhythm — even nine holes counts.',
    emoji: '📅',
  },
  {
    id: 'home-course',
    label: 'Own my home course',
    blurb: 'Hole-by-hole prep at the tracks you play most.',
    emoji: '🏠',
  },
  {
    id: 'compete',
    label: 'Win with friends',
    blurb: 'Skins, match play, and live group games.',
    emoji: '🏆',
  },
];

const GOAL_SET = new Set<string>(GOAL_OPTIONS.map((g) => g.id));

export function isGoalId(v: unknown): v is GoalId {
  return typeof v === 'string' && GOAL_SET.has(v);
}

export function getGoal(id: GoalId): GoalOption {
  return GOAL_OPTIONS.find((g) => g.id === id) ?? GOAL_OPTIONS[0]!;
}

export function normalizeGoals(raw: unknown, max = 5): GoalId[] {
  if (!Array.isArray(raw)) return [];
  const out: GoalId[] = [];
  for (const item of raw) {
    if (isGoalId(item) && !out.includes(item)) out.push(item);
    if (out.length >= max) break;
  }
  return out;
}
