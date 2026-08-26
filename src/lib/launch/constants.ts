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
  '3-wood': 3500,
  '5-wood': 4000,
  hybrid: 4500,
  '4-iron': 5000,
  '7-iron': 7000,
  wedge: 9000,
};

/** Typical roll after landing (fraction of carry) — matches golf bag model. */
export const CLUB_ROLL_PCT: Record<string, number> = {
  driver: 0.1,
  '3-wood': 0.08,
  '5-wood': 0.06,
  '4-iron': 0.05,
  hybrid: 0.05,
  '7-iron': 0.04,
  wedge: 0.015,
};
