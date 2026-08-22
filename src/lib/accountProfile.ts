/** Cloud account profile — mirrors local Settings / golf profile. */

import type { MissBias } from './golfProfile';
import {
  DEFAULT_PROFILE,
  loadGolfProfile,
  saveGolfProfile,
  type GolfPlayerProfile,
} from './golfProfile';
import { normalizeCustomGoals, normalizeGoals } from './goals';
import { loadDisplayProfile, saveDisplayProfile } from './mock';
import { loadTheme, setTheme, type ThemeId } from './theme';
import { supabase } from './supabase';

export type CloudProfile = {
  id: string;
  display_name: string;
  handicap: number;
  miss: MissBias;
  seven_iron_yards: number;
  driver_yards: number;
  common_courses: string[];
  goals?: string[];
  custom_goals?: string[];
  target_handicap?: number | null;
  theme: string;
  updated_at?: string;
};

function isMiss(v: unknown): v is MissBias {
  return (
    v === 'left' || v === 'right' || v === 'both' || v === 'straight'
  );
}

function isTheme(v: unknown): v is ThemeId {
  return v === 'light' || v === 'dark' || v === 'sand' || v === 'auto';
}

export function applyCloudProfile(row: CloudProfile): void {
  const displayName =
    typeof row.display_name === 'string' && row.display_name.trim()
      ? row.display_name.trim()
      : loadDisplayProfile().name;
  saveDisplayProfile({ name: displayName });

  const local = loadGolfProfile() ?? DEFAULT_PROFILE;
  const next: GolfPlayerProfile = {
    commonCourses: Array.isArray(row.common_courses)
      ? row.common_courses.filter((x): x is string => typeof x === 'string')
      : local.commonCourses,
    handicap: Number.isFinite(Number(row.handicap))
      ? Number(row.handicap)
      : local.handicap,
    miss: isMiss(row.miss) ? row.miss : local.miss,
    sevenIronYards: Number.isFinite(Number(row.seven_iron_yards))
      ? Number(row.seven_iron_yards)
      : local.sevenIronYards,
    driverYards: Number.isFinite(Number(row.driver_yards))
      ? Number(row.driver_yards)
      : local.driverYards,
    goals: normalizeGoals(row.goals).length
      ? normalizeGoals(row.goals)
      : local.goals,
    customGoals: normalizeCustomGoals(row.custom_goals).length
      ? normalizeCustomGoals(row.custom_goals)
      : local.customGoals,
    targetHandicap:
      row.target_handicap != null &&
      Number.isFinite(Number(row.target_handicap))
        ? Number(row.target_handicap)
        : local.targetHandicap,
  };
  saveGolfProfile(next);

  if (isTheme(row.theme)) setTheme(row.theme);
}

export async function fetchCloudProfile(
  userId: string,
): Promise<CloudProfile | null> {
  if (!supabase) return null;
  const { data, error } = await supabase
    .from('teeready_profiles')
    .select(
      'id, display_name, handicap, miss, seven_iron_yards, driver_yards, common_courses, goals, custom_goals, target_handicap, theme, updated_at',
    )
    .eq('id', userId)
    .maybeSingle();
  if (error) throw error;
  return data as CloudProfile | null;
}

export async function upsertCloudProfile(userId: string): Promise<void> {
  if (!supabase) return;
  const display = loadDisplayProfile();
  const golf = loadGolfProfile() ?? DEFAULT_PROFILE;
  const theme = loadTheme();
  const { error } = await supabase.from('teeready_profiles').upsert(
    {
      id: userId,
      display_name: display.name,
      handicap: golf.handicap,
      miss: golf.miss,
      seven_iron_yards: golf.sevenIronYards,
      driver_yards: golf.driverYards,
      common_courses: golf.commonCourses,
      goals: golf.goals,
      custom_goals: golf.customGoals,
      target_handicap: golf.targetHandicap ?? null,
      theme,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'id' },
  );
  if (error) throw error;
}

/** Pull cloud → local when signing in; seed cloud from local if empty. */
export async function syncProfileOnSignIn(userId: string): Promise<void> {
  const remote = await fetchCloudProfile(userId);
  if (
    remote &&
    (remote.display_name.trim() ||
      remote.handicap !== DEFAULT_PROFILE.handicap ||
      remote.common_courses.length > 0 ||
      (Array.isArray(remote.goals) && remote.goals.length > 0) ||
      (Array.isArray(remote.custom_goals) && remote.custom_goals.length > 0))
  ) {
    applyCloudProfile(remote);
    return;
  }
  await upsertCloudProfile(userId);
}
