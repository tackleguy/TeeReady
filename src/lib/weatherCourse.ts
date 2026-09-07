/** Resolve which course Weather should center on. */

import type { GolfCourseSummary } from './golf';
import {
  loadHolePackManifest,
  type HolePackManifestEntry,
} from './golfHolePacks';
import { loadGolfProfile } from './golfProfile';
import { hasStoredRound, loadRound } from './golfTracker';
import { peekPendingCourse } from './pendingCourse';
import { defaultSearchLoc } from './searchLoc';
import {
  haversineMi,
  holePackEntryToSummary,
} from './workingCourses';
import {
  namesConflict,
  namesLooselyMatch,
} from '../../api/golf/_lib/courseRelate';

const WEATHER_COURSE_KEY = 'teeready-weather-course-v1';

function entryMatchesName(
  entry: HolePackManifestEntry,
  name: string,
): boolean {
  if (entry.name.toLowerCase() === name.toLowerCase()) return true;
  if (namesConflict(name, entry.name)) return false;
  return namesLooselyMatch(name, entry.name);
}

function findBySlugOrName(
  entries: HolePackManifestEntry[],
  opts: { slug?: string | null; name?: string | null },
  from: { lat: number; lon: number },
): GolfCourseSummary | null {
  const slug = opts.slug?.replace(/^holepack:/, '')?.trim();
  if (slug) {
    const hit = entries.find((e) => e.slug === slug);
    if (hit) return holePackEntryToSummary(hit, from);
  }
  const name = opts.name?.trim();
  if (!name) return null;
  const exact = entries.find(
    (e) => e.name.toLowerCase() === name.toLowerCase(),
  );
  if (exact) return holePackEntryToSummary(exact, from);
  const loose = entries.find((e) => entryMatchesName(e, name));
  return loose ? holePackEntryToSummary(loose, from) : null;
}

export function stashWeatherCourse(course: GolfCourseSummary): void {
  try {
    sessionStorage.setItem(WEATHER_COURSE_KEY, JSON.stringify(course));
  } catch {
    // ignore
  }
}

export function peekWeatherCourse(): GolfCourseSummary | null {
  try {
    const raw = sessionStorage.getItem(WEATHER_COURSE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as GolfCourseSummary;
    if (parsed?.id && parsed?.name && parsed.lat != null && parsed.lon != null) {
      return parsed;
    }
  } catch {
    // ignore
  }
  return null;
}

/** Live round → pending Prep pick → last Weather pick → home course → nearest. */
export async function resolveWeatherCourse(): Promise<GolfCourseSummary | null> {
  const loc = defaultSearchLoc();
  const from = { lat: loc.lat, lon: loc.lon };
  const manifest = await loadHolePackManifest();
  const entries = manifest?.courses ?? [];

  if (hasStoredRound()) {
    const round = loadRound();
    if (round) {
      const hit = findBySlugOrName(
        entries,
        { slug: round.courseId, name: round.courseName },
        from,
      );
      if (hit) return hit;
    }
  }

  const pending = peekPendingCourse();
  if (pending) {
    const hit = findBySlugOrName(
      entries,
      { slug: pending.id, name: pending.name },
      from,
    );
    if (hit) return hit;
    return pending;
  }

  const remembered = peekWeatherCourse();
  if (remembered) {
    const hit = findBySlugOrName(
      entries,
      { slug: remembered.id, name: remembered.name },
      from,
    );
    if (hit) return hit;
    return remembered;
  }

  const profile = loadGolfProfile();
  for (const name of profile?.commonCourses ?? []) {
    const hit = findBySlugOrName(entries, { name }, from);
    if (hit) return hit;
  }

  if (!entries.length) return null;
  const nearest = [...entries].sort(
    (a, b) =>
      haversineMi(loc.lat, loc.lon, a.lat, a.lon) -
      haversineMi(loc.lat, loc.lon, b.lat, b.lon),
  )[0];
  return nearest ? holePackEntryToSummary(nearest, from) : null;
}
