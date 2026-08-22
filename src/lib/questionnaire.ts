/** Extended player questionnaire — separate from account settings. */

import type { GolfPlayerProfile } from './golfProfile';
import { hasAnyGoals } from './goals';

export type TeeTimePref = 'morning' | 'midday' | 'twilight';
export type TransportPref = 'walk' | 'cart' | 'either';
export type BiggestLeak =
  | 'putting'
  | 'driving'
  | 'approach'
  | 'short-game'
  | 'mental';
export type PracticeFocus = 'range' | 'short-game' | 'putting' | 'course';
export type CompetitiveLevel = 'casual' | 'league' | 'tournament';

export type QuestionnaireExtras = {
  questionnaireCompleted: boolean;
  roundsPerMonthGoal: number;
  preferredTeeTime: TeeTimePref;
  transport: TransportPref;
  biggestLeak: BiggestLeak;
  practiceFocus: PracticeFocus;
  competitiveLevel: CompetitiveLevel;
  motivation: string;
  dreamCourse: string;
};

export const DEFAULT_QUESTIONNAIRE: QuestionnaireExtras = {
  questionnaireCompleted: false,
  roundsPerMonthGoal: 2,
  preferredTeeTime: 'morning',
  transport: 'either',
  biggestLeak: 'approach',
  practiceFocus: 'course',
  competitiveLevel: 'casual',
  motivation: '',
  dreamCourse: '',
};

export function needsQuestionnaire(profile: GolfPlayerProfile): boolean {
  if (profile.questionnaireCompleted) return false;
  // Legacy users who filled signup before completion flag
  if (hasAnyGoals(profile.goals, profile.customGoals) && profile.motivation.trim()) {
    return false;
  }
  return !profile.questionnaireCompleted;
}

export function normalizeQuestionnaire(
  parsed: Partial<GolfPlayerProfile>,
): QuestionnaireExtras {
  const d = DEFAULT_QUESTIONNAIRE;
  const tee = parsed.preferredTeeTime;
  const transport = parsed.transport;
  const leak = parsed.biggestLeak;
  const practice = parsed.practiceFocus;
  const level = parsed.competitiveLevel;
  return {
    questionnaireCompleted: Boolean(parsed.questionnaireCompleted),
    roundsPerMonthGoal: Math.min(
      8,
      Math.max(1, Number(parsed.roundsPerMonthGoal) || d.roundsPerMonthGoal),
    ),
    preferredTeeTime:
      tee === 'morning' || tee === 'midday' || tee === 'twilight' ? tee : d.preferredTeeTime,
    transport:
      transport === 'walk' || transport === 'cart' || transport === 'either'
        ? transport
        : d.transport,
    biggestLeak:
      leak === 'putting' ||
      leak === 'driving' ||
      leak === 'approach' ||
      leak === 'short-game' ||
      leak === 'mental'
        ? leak
        : d.biggestLeak,
    practiceFocus:
      practice === 'range' ||
      practice === 'short-game' ||
      practice === 'putting' ||
      practice === 'course'
        ? practice
        : d.practiceFocus,
    competitiveLevel:
      level === 'casual' || level === 'league' || level === 'tournament'
        ? level
        : d.competitiveLevel,
    motivation:
      typeof parsed.motivation === 'string' ? parsed.motivation.slice(0, 280) : '',
    dreamCourse:
      typeof parsed.dreamCourse === 'string' ? parsed.dreamCourse.slice(0, 120) : '',
  };
}
