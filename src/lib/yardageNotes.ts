import type { GolfCourseSummary, GolfNotebook } from './golf';
import type { GolfPlayerProfile } from './golfProfile';

const NOTES_KEY = 'teeready-yardage-notes-v1';

export type TeeHeightRec = {
  label: string;
  detail: string;
};

/** Recommend ball tee height from the club you hit off the tee. */
export function teeHeightForClub(recommendedClub: string): TeeHeightRec {
  const teeClub = recommendedClub.split('→')[0]?.trim().toLowerCase() ?? '';
  if (teeClub.includes('driver') || teeClub === 'dr') {
    return {
      label: 'High',
      detail: 'Half the ball above the driver crown (~2–2¼″)',
    };
  }
  if (
    teeClub.includes('3w') ||
    teeClub.includes('3-wood') ||
    teeClub.includes('5w') ||
    teeClub.includes('5-wood') ||
    teeClub.includes('wood')
  ) {
    return {
      label: 'Low',
      detail: 'Ball just clear of the turf (~½–1″)',
    };
  }
  if (teeClub.includes('hybrid') || /[2345]h/.test(teeClub)) {
    return {
      label: 'Brush',
      detail: 'Very low — brush the grass with the ball',
    };
  }
  if (
    teeClub.includes('pw') ||
    teeClub.includes('gw') ||
    teeClub.includes('sw') ||
    teeClub.includes('lw') ||
    teeClub.includes('wedge')
  ) {
    return {
      label: 'None',
      detail: 'Play it off the turf — no tee',
    };
  }
  // Irons / unknown
  return {
    label: 'Low',
    detail: 'Tee just off the ground for a clean iron strike',
  };
}

export type SavedYardageNotes = {
  courseId: string;
  courseName: string;
  region?: string;
  teeKindLabel?: string;
  savedAt: string;
  notebook: GolfNotebook;
  profileSnapshot: {
    handicap: number;
    miss: GolfPlayerProfile['miss'];
    driverYards: number;
    sevenIronYards: number;
  };
};

function readAll(): Record<string, SavedYardageNotes> {
  try {
    const raw = localStorage.getItem(NOTES_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as Record<string, SavedYardageNotes>;
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

export function saveYardageNotesFromPrep(input: {
  course: GolfCourseSummary;
  profile: GolfPlayerProfile;
  notebook: GolfNotebook;
  teeKindLabel?: string;
}): SavedYardageNotes {
  const entry: SavedYardageNotes = {
    courseId: input.course.id,
    courseName: input.course.name,
    region: input.course.region,
    teeKindLabel: input.teeKindLabel,
    savedAt: new Date().toISOString(),
    notebook: input.notebook,
    profileSnapshot: {
      handicap: input.profile.handicap,
      miss: input.profile.miss,
      driverYards: input.profile.driverYards,
      sevenIronYards: input.profile.sevenIronYards,
    },
  };
  try {
    const all = readAll();
    all[input.course.id] = entry;
    const keys = Object.keys(all);
    if (keys.length > 12) {
      const oldest = keys
        .map((k) => ({ k, at: all[k]!.savedAt }))
        .sort((a, b) => a.at.localeCompare(b.at));
      for (const row of oldest.slice(0, keys.length - 12)) {
        delete all[row.k];
      }
    }
    localStorage.setItem(NOTES_KEY, JSON.stringify(all));
    window.dispatchEvent(
      new CustomEvent('teeready-yardage-notes-changed', { detail: entry }),
    );
  } catch {
    // ignore quota
  }
  return entry;
}

export function loadYardageNotes(
  courseId: string,
): SavedYardageNotes | null {
  const entry = readAll()[courseId];
  return entry?.notebook?.holes ? entry : null;
}
