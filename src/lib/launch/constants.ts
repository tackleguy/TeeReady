/** Physical and quality constants for launch monitor. */

/** USGA / R&A standard golf ball diameter (mm). */
export const GOLF_BALL_DIAMETER_MM = 42.67;

/** Refuse ball-speed / carry numbers below this measured fps. */
export const LM_NUMBERS_MIN_FPS = 60;

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
