/** Physical and quality constants for launch monitor. */

/** USGA / R&A standard golf ball diameter (mm). */
export const GOLF_BALL_DIAMETER_MM = 42.67;

/** Ideal corner camera: degrees off the target line (behind-right typical). */
export const CORNER_AZIMUTH_DEG = 45;

/** Recommended distance behind the ball (feet). */
export const IDEAL_CAMERA_DISTANCE_FT_MIN = 6;
export const IDEAL_CAMERA_DISTANCE_FT_MAX = 10;

export const IDEAL_SETUP_SUMMARY =
  `Corner view — ${IDEAL_CAMERA_DISTANCE_FT_MIN}–${IDEAL_CAMERA_DISTANCE_FT_MAX} ft behind the ball, ~${CORNER_AZIMUTH_DEG}° off the target line.`;

/** Downrange foreshortening on screen from corner camera pitch. */
export const CORNER_DOWNRANGE_PITCH = 0.2;

/** Minimum fps to attempt numeric metrics (tracer still runs below this). */
export const LM_NUMBERS_MIN_FPS = 30;

/** Tier: launch-monitor analysis (tracer + rough numbers). */
export const LM_TIER_MIN_FPS = 120;

/** Tier: high-precision label. */
export const HIGH_PRECISION_MIN_FPS = 240;

/** Minimum post-impact track points for a valid tracer. */
export const MIN_TRACK_POINTS = 3;

/** Minimum clip duration (seconds). */
export const MIN_CLIP_DURATION_S = 0.5;

/** Minimum sampled frames to attempt analysis. */
export const MIN_SAMPLED_FRAMES = 10;

/** Default assumed driver spin (rpm) for carry model. */
export const DEFAULT_ASSUMED_SPIN_RPM = 2500;

/** Club presets for assumed spin (rpm). */
export const CLUB_SPIN_RPM: Record<string, number> = {
  driver: 2500,
  '2-wood': 3200,
  '3-wood': 3500,
  '4-wood': 3800,
  '5-wood': 4000,
  '7-wood': 4500,
  hybrid: 4500,
  '2-hybrid': 4600,
  '3-hybrid': 4700,
  '3-iron': 4800,
  '4-iron': 5000,
  '5-iron': 5500,
  '6-iron': 6200,
  '7-iron': 7000,
  '8-iron': 7800,
  '9-iron': 8600,
  pw: 9500,
  gw: 10000,
  sw: 10500,
  lw: 11000,
  wedge: 9000,
};

/** Typical roll after landing (fraction of carry) — matches golf bag model. */
export const CLUB_ROLL_PCT: Record<string, number> = {
  driver: 0.1,
  '2-wood': 0.09,
  '3-wood': 0.08,
  '4-wood': 0.07,
  '5-wood': 0.06,
  '7-wood': 0.06,
  hybrid: 0.05,
  '2-hybrid': 0.05,
  '3-hybrid': 0.05,
  '3-iron': 0.05,
  '4-iron': 0.05,
  '5-iron': 0.045,
  '6-iron': 0.04,
  '7-iron': 0.04,
  '8-iron': 0.035,
  '9-iron': 0.03,
  pw: 0.02,
  gw: 0.018,
  sw: 0.015,
  lw: 0.01,
  wedge: 0.015,
};

/** Clubs offered in Launch / Range selectors (long → short). */
export const LAUNCH_CLUBS = [
  'driver',
  '2-wood',
  '3-wood',
  '4-wood',
  '5-wood',
  '7-wood',
  'hybrid',
  '2-hybrid',
  '3-hybrid',
  '3-iron',
  '4-iron',
  '5-iron',
  '6-iron',
  '7-iron',
  '8-iron',
  '9-iron',
  'pw',
  'gw',
  'sw',
  'lw',
] as const;

export type LaunchClub = (typeof LAUNCH_CLUBS)[number];

const LAUNCH_CLUB_LABELS: Record<string, string> = {
  driver: 'Driver',
  hybrid: 'Hybrid',
  '2-hybrid': '2 Hybrid',
  '3-hybrid': '3 Hybrid',
  pw: 'Pitching wedge',
  gw: 'Gap wedge',
  sw: 'Sand wedge',
  lw: 'Lob wedge',
};

/** Display label for club dropdowns. */
export function formatLaunchClubLabel(club: string): string {
  return LAUNCH_CLUB_LABELS[club] ?? club;
}
