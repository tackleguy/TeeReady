/** Rule-based coaching thresholds — no AI. Tunable without code changes. */

export const SWING_THRESHOLDS = {
  /** Mean landmark visibility below this → reject. */
  minMeanVisibility: 0.55,
  /** Fraction of frames that must have a usable pose. */
  minPoseFrameRatio: 0.7,
  /** Max normalised landmark jump per frame (vs shoulder width) before flicker reject. */
  maxLandmarkJump: 0.55,
  /** Frames required for a usable swing. */
  minFrames: 20,
  /** Impact / P7-dependent metrics need at least this fps. */
  impactMetricMinFps: 30,
  /** Soft warn below this. */
  warnBelowFps: 30,

  faceOn: {
    /** Head lateral move at impact, as fraction of shoulder width. */
    headLateralGood: 0.12,
    headLateralWarn: 0.22,
    /** Hip sway (lateral) at top, fraction of shoulder width. */
    hipSwayGood: 0.15,
    hipSwayWarn: 0.28,
    /** Lead arm angle at P4 (degrees from vertical). */
    leadArmFoldMin: 90,
    leadArmFoldIdeal: 140,
    /** Tempo backswing:downswing. Ideal ~3:1. */
    tempoIdeal: 3,
    tempoTol: 0.75,
  },

  dtl: {
    /** Spine angle at address (deg from vertical). */
    spineAddressIdeal: 35,
    spineAddressTol: 12,
    /** Early extension: spine angle change P1→P7 (deg, positive = stands up). */
    earlyExtWarn: 8,
    earlyExtBad: 15,
    /** Shoulder turn at P4 (deg). */
    shoulderTurnIdeal: 90,
    shoulderTurnMin: 70,
    /** Hip turn at P4 (deg). */
    hipTurnIdeal: 45,
    hipTurnMin: 30,
    /** X-factor (shoulder − hip) at P4. */
    xFactorIdeal: 45,
    xFactorMin: 25,
    /** Head depth change P1→P7 (normalised). */
    headDepthWarn: 0.08,
  },
} as const;
