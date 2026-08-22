import { formatHandicap } from './golfHandicap';
import type { GolfPlayerProfile } from './golfProfile';
import { missLabel } from './golfProfile';
import { getGoal, type GoalId } from './goals';
import { roundsThisMonth } from './roundLog';

export type CoachStep = {
  id: string;
  title: string;
  detail: string;
  href?: string;
  cta?: string;
};

export type CoachPlan = {
  headline: string;
  summary: string;
  focusGoal?: GoalId;
  focusCustom?: string;
  steps: CoachStep[];
  progressLabel: string;
  progressPct: number;
};

function missTip(miss: GolfPlayerProfile['miss']): string {
  if (miss === 'left') {
    return 'Your pattern misses left — pick a start line slightly right of your usual target and let the ball work back.';
  }
  if (miss === 'right') {
    return 'You tend to miss right — aim at the left edge of fairways and favor conservative tee clubs when trouble is right.';
  }
  if (miss === 'both') {
    return 'Two-way miss days need smaller targets — favor the wide side of the hole and commit to one shape per shot.';
  }
  return 'Straight pattern — you can be aggressive on lines, but still pick a specific small target for every full swing.';
}

function stepsForCustomGoal(
  text: string,
  profile: GolfPlayerProfile,
  homeCourse: string | undefined,
): CoachStep[] {
  const home = homeCourse?.split(' ·')[0];
  return [
    {
      id: 'custom-focus',
      title: `Keep "${text}" front of mind`,
      detail: `Before each tee shot, ask: does this line help me ${text.toLowerCase()}? One clear intention beats ten swing thoughts.`,
      href: '/rounds/prep',
      cta: 'Plan your round',
    },
    {
      id: 'custom-prep',
      title: 'Prep three holes that matter',
      detail: home
        ? `At ${home}, pick three holes where ${text.toLowerCase()} would change your score the most — study wind and miss lines in prep.`
        : `Pick three holes on your course where ${text.toLowerCase()} would change your score — study them in prep first.`,
      href: '/rounds/prep',
      cta: 'Hole prep',
    },
    {
      id: 'custom-track',
      title: 'Track one round with GPS',
      detail: `Log distances in GPS mode so your coach can tie real numbers to "${text}" over time.`,
      href: '/rounds/gps',
      cta: 'Open GPS',
    },
    {
      id: 'custom-miss',
      title: 'Use your miss pattern',
      detail: `${missTip(profile.miss)} That supports "${text}" when you pick safer lines.`,
    },
  ];
}

function stepsForGoal(
  goalId: GoalId,
  profile: GolfPlayerProfile,
  homeCourse: string | undefined,
): CoachStep[] {
  const hcp = profile.handicap;
  switch (goalId) {
    case 'lower-handicap': {
      const target =
        profile.targetHandicap ??
        Math.max(0, Math.round((hcp - 3) * 10) / 10);
      return [
        {
          id: 'hcp-prep',
          title: 'Prep one hole you leak strokes on',
          detail: `You're at ${formatHandicap(hcp)} — chart a conservative line on a hard par 4 before you tee off. TeeReady's miss lines are built for your ${missLabel(profile.miss).toLowerCase()}.`,
          href: '/rounds/prep',
          cta: 'Open prep',
        },
        {
          id: 'hcp-gps',
          title: 'Track one round with GPS',
          detail: 'Drop shots at your ball in GPS mode so you know real distances — better yardages tighten approach decisions.',
          href: '/rounds/gps',
          cta: 'Start GPS',
        },
        {
          id: 'hcp-target',
          title: `Work toward ${formatHandicap(target)}`,
          detail: 'Pick one goal per round: fewer three-putts, no double bogeys, or hit 8+ fairways — not all three at once.',
        },
      ];
    }
    case 'break-90':
      return [
        {
          id: '90-doubles',
          title: 'Eliminate doubles first',
          detail: `At ${formatHandicap(hcp)}, breaking 90 is about damage control — lay up instead of hero shots when trouble is in play.`,
          href: '/rounds/prep',
          cta: 'Plan safe lines',
        },
        {
          id: '90-par3',
          title: 'Par 3 rule: center of green',
          detail: 'Take one extra club if needed and aim middle — bogey beats double every time on short holes.',
        },
        {
          id: '90-putt',
          title: 'Two-putt speed on every green',
          detail: 'Lag first putts to tap-in range. Three-putts cost more strokes than missed fairways at this level.',
        },
      ];
    case 'break-80':
      return [
        {
          id: '80-gir',
          title: 'Convert par 4s with position',
          detail: 'Hitting greens in regulation matters more than distance — use wind-adjusted yardages in prep before each tee shot.',
          href: '/rounds/prep',
          cta: 'Wind + yardages',
        },
        {
          id: '80-wedge',
          title: 'Dial wedge distances',
          detail: `Your 7-iron is ${profile.sevenIronYards} yd total avg — trust those numbers inside 150 instead of guessing.`,
        },
        {
          id: '80-score',
          title: 'Track the card live',
          detail: 'Open the scorecard during your round so you know when to press vs. protect a good score.',
          href: '/rounds/gps',
          cta: 'Round + GPS',
        },
      ];
    case 'fairways':
      return [
        {
          id: 'fw-miss',
          title: 'Use your miss line off the tee',
          detail: missTip(profile.miss),
          href: '/rounds/prep',
          cta: 'See miss lines',
        },
        {
          id: 'fw-club',
          title: 'Club down when the hole is tight',
          detail: 'Fairways beat distance — 3-wood or hybrid into the short grass sets up better scores than driver in trouble.',
        },
      ];
    case 'approaches':
      return [
        {
          id: 'app-wind',
          title: 'Check plays-like yardage',
          detail: 'Wind and elevation change the number — open prep on your course and note head/cross components before selecting a club.',
          href: '/rounds/prep',
          cta: 'Hole prep',
        },
        {
          id: 'app-mid',
          title: 'Front / mid / back from GPS',
          detail: 'In GPS mode, range front and back of the green — pick a club for the middle and swing smooth.',
          href: '/rounds/gps',
          cta: 'Live ranging',
        },
      ];
    case 'short-game':
      return [
        {
          id: 'sg-wedge',
          title: 'Know your wedge ladder',
          detail: `PW ~${profile.sevenIronYards - 45} yd, GW and SW fill the gaps — pick one stock swing per distance before chipping.`,
        },
        {
          id: 'sg-updown',
          title: 'Par save mindset',
          detail: 'Inside 30 yards, get on the green first — leave yourself uphill putts when you can.',
        },
      ];
    case 'play-more': {
      const played = roundsThisMonth();
      const target = 4;
      return [
        {
          id: 'play-schedule',
          title: played < 2 ? 'Book your next round' : 'Keep the streak going',
          detail:
            played === 0
              ? 'You haven\'t logged a round this month — even nine holes keeps your feel sharp.'
              : `${played} round${played === 1 ? '' : 's'} this month — aim for ${target} to build momentum.`,
          href: '/courses',
          cta: 'Pick a course',
        },
        {
          id: 'play-home',
          title: homeCourse ? `Quick nine at ${homeCourse.split(' ·')[0]}` : 'Play somewhere familiar',
          detail: homeCourse
            ? 'Your home course is the fastest way to get reps — prep is already tuned to your bag.'
            : 'Add home courses in Settings so prep and quick picks stay one tap away.',
          href: homeCourse ? '/rounds/prep' : '/settings',
          cta: homeCourse ? 'Open prep' : 'Add courses',
        },
      ];
    }
    case 'home-course':
      return [
        {
          id: 'home-prep',
          title: homeCourse ? `Study ${homeCourse.split(' ·')[0]}` : 'Set your home courses',
          detail: homeCourse
            ? 'Walk through holes 1–3 in prep — note where your miss tends to show up on each tee shot.'
            : 'Add the tracks you play most so TeeReady surfaces them everywhere.',
          href: homeCourse ? '/rounds/prep' : '/settings',
          cta: homeCourse ? 'Hole-by-hole' : 'Add courses',
        },
        {
          id: 'home-repeat',
          title: 'Same course, new focus',
          detail: 'Each round pick one hole type to improve: par 3s, reachable par 5s, or tight par 4s.',
        },
      ];
    case 'compete':
      return [
        {
          id: 'comp-social',
          title: 'Start a live group',
          detail: 'Skins, stroke, match, scramble, or Stableford — invite friends with a code and track standings live.',
          href: '/group',
          cta: 'Social',
        },
        {
          id: 'comp-strategy',
          title: 'Match-play mindset',
          detail: 'When competing, play the player and the hole — safe pars beat risky birdie attempts when your opponent is in trouble.',
        },
      ];
    default:
      return [];
  }
}

function progressForGoal(goalId: GoalId, profile: GolfPlayerProfile): {
  label: string;
  pct: number;
} {
  const hcp = profile.handicap;
  switch (goalId) {
    case 'lower-handicap': {
      const target = profile.targetHandicap ?? Math.max(0, hcp - 3);
      const span = Math.max(1, hcp - target);
      const done = Math.max(0, Math.min(span, span * 0.35));
      return {
        label: `${formatHandicap(hcp)} → ${formatHandicap(target)}`,
        pct: Math.round((done / span) * 100),
      };
    }
    case 'break-90':
      return {
        label: hcp <= 18 ? 'On track — keep stacking pars' : `${formatHandicap(hcp)} — tighten doubles`,
        pct: hcp <= 18 ? 55 : Math.max(15, 100 - hcp * 2),
      };
    case 'break-80':
      return {
        label: hcp <= 8 ? 'In range — convert birdie looks' : `${formatHandicap(hcp)} — GIR is the lever`,
        pct: hcp <= 8 ? 70 : Math.max(10, 100 - hcp * 3),
      };
    case 'play-more': {
      const n = roundsThisMonth();
      return {
        label: `${n} of 4 rounds this month`,
        pct: Math.min(100, Math.round((n / 4) * 100)),
      };
    }
    default:
      return { label: 'Building habits', pct: 40 };
  }
}

export function buildCoachPlan(
  profile: GolfPlayerProfile,
  displayName: string,
): CoachPlan | null {
  const goals = profile.goals;
  const customGoals = profile.customGoals ?? [];
  if (!goals.length && !customGoals.length) return null;

  const homeCourse = profile.commonCourses[0];
  const firstName = displayName.trim().split(/\s+/)[0] || 'You';

  if (goals.length > 0) {
    const focusGoal = goals[0]!;
    const meta = getGoal(focusGoal);
    const steps = stepsForGoal(focusGoal, profile, homeCourse);
    const { label, pct } = progressForGoal(focusGoal, profile);

    const summaries: Partial<Record<GoalId, string>> = {
      'lower-handicap': `${firstName}, we'll chip away at ${formatHandicap(profile.handicap)} with smarter targets and tracked rounds.`,
      'break-90': `${firstName}, breaking 90 starts with eliminating doubles — here's your plan for the next outing.`,
      'break-80': `${firstName}, you're chasing 79 — approach positions and wedge control move the needle fastest.`,
      fairways: `${firstName}, let's tighten tee shots using your ${missLabel(profile.miss).toLowerCase()} in prep.`,
      approaches: `${firstName}, wind-adjusted yardages and GPS ranges will tighten your approach game.`,
      'short-game': `${firstName}, up-and-down saves come from committed wedge distances — no guesswork.`,
      'play-more': `${firstName}, consistency beats perfection — let's get you on the course again.`,
      'home-course': homeCourse
        ? `${firstName}, knowing ${homeCourse.split(' ·')[0]!} hole-by-hole is your edge.`
        : `${firstName}, add home courses and we'll personalize every prep session.`,
      compete: `${firstName}, live groups make every hole matter — start a game when your foursome is ready.`,
    };

    return {
      headline: meta.label,
      summary:
        summaries[focusGoal] ??
        `${firstName}, here's how to move toward ${meta.label.toLowerCase()}.`,
      focusGoal,
      steps: steps.slice(0, 4),
      progressLabel: label,
      progressPct: pct,
    };
  }

  const focusCustom = customGoals[0]!;
  return {
    headline: focusCustom,
    summary: `${firstName}, your coach built a plan around "${focusCustom}" — one focus at a time.`,
    focusCustom,
    steps: stepsForCustomGoal(focusCustom, profile, homeCourse).slice(0, 4),
    progressLabel: 'Custom goal',
    progressPct: 30,
  };
}

/** One-liner for prep / GPS banners. */
export function coachTipForRound(profile: GolfPlayerProfile): string | null {
  const plan = buildCoachPlan(profile, 'You');
  if (!plan) return null;
  const step = plan.steps[0];
  return step ? `${plan.headline}: ${step.detail.split('—')[0]?.trim() ?? step.detail}` : null;
}
