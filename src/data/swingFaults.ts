/**
 * Authored swing-fault graph.
 *
 * A human maintains this file. The LLM never writes to it and must never invent
 * faults or cause links outside these ids. Cause chains are looked up here —
 * not reasoned out by the model.
 *
 * REVIEW REQUIRED by a qualified coach before treating this as launch-ready.
 */

export type FaultAngle = 'dtl' | 'face-on';

export type FaultDetectionRule = {
  /** Phase 1 SwingMetric.id */
  metric: string;
  comparator: '>' | '<' | '>=' | '<=';
  threshold: number;
  angle: FaultAngle;
};

export type SeverityBands = {
  /** Absolute metric magnitude at which the fault is mild / moderate / severe. */
  mild: number;
  moderate: number;
  severe: number;
};

export type SwingFaultDef = {
  id: string;
  label: string;
  detectedBy: FaultDetectionRule[];
  /**
   * Bands apply to the triggering metric's absolute deviation (or raw value
   * when the rule is a simple magnitude check). See `severityForValue`.
   */
  severityBands: SeverityBands;
  /** Other fault ids or setup/physical cause tokens used in authored copy. */
  causes: string[];
  consequences: string[];
  drills: string[];
  /** Prefer this fault when it matches these questionnaire leaks / goals. */
  alignsWithLeaks?: Array<'driving' | 'approach' | 'short-game' | 'putting' | 'mental'>;
  alignsWithGoals?: string[];
  /** Authored fallback prose when the LLM section is discarded. */
  assessmentFallback: string;
  rootCauseFallback: string;
};

/**
 * Setup / physical cause tokens (not measured faults) used in `causes` chains.
 * Guides may mention these only via authored links — never prescribe rehab.
 */
export const SETUP_CAUSE_COPY: Record<string, string> = {
  'setup-too-close': 'standing too close to the ball at address',
  'setup-ball-position': 'ball position that pulls the sternum toward the ball',
  'setup-weight-toes': 'address weight pressed into the toes',
  'setup-narrow-stance': 'a stance that is too narrow to stabilise the hips',
  'limited-hip-mobility':
    'a common pattern when hip turn is restricted — a qualified professional can assess mobility; this guide will not prescribe stretches',
  'limited-torso-turn':
    'a short torso turn pattern — do not force a bigger turn; a coach can help you find width you can own',
  'grip-strong-weak': 'grip orientation that encourages an early throw or flip',
  'ball-too-far-forward': 'ball too far forward in the stance for the club',
};

export const SWING_FAULTS: SwingFaultDef[] = [
  {
    id: 'early-extension',
    label: 'Early extension',
    detectedBy: [
      { metric: 'early_extension', comparator: '>', threshold: 8, angle: 'dtl' },
    ],
    severityBands: { mild: 8, moderate: 12, severe: 18 },
    causes: ['setup-too-close', 'setup-weight-toes', 'sway', 'insufficient-shoulder-turn'],
    consequences: [
      'thin or fat contact',
      'blocks and hooks',
      'loss of low-point control',
      'inconsistent start line',
    ],
    drills: ['wall-butt-brush', 'chair-trail-glute', 'pump-to-impact-posture', 'alignment-stick-hip-line'],
    alignsWithLeaks: ['approach', 'driving'],
    alignsWithGoals: ['approaches', 'fairways', 'break-90', 'lower-handicap'],
    assessmentFallback:
      'Down-the-line, the spine stands up from address into impact more than a quiet strike usually allows. That early extension pattern is the measured story here.',
    rootCauseFallback:
      'In this graph, early extension often traces to setup (too close or weight in the toes) or to a short turn that makes the body thrust to invent space. We will treat the root link the plan selected — not chase every symptom.',
  },
  {
    id: 'loss-of-spine-angle',
    label: 'Loss of spine angle',
    detectedBy: [
      { metric: 'early_extension', comparator: '>', threshold: 6, angle: 'dtl' },
    ],
    severityBands: { mild: 6, moderate: 10, severe: 16 },
    causes: ['early-extension', 'setup-too-close', 'head-lift'],
    consequences: [
      'inconsistent strike height',
      'distance control scatter',
      'thin contact under pressure',
    ],
    drills: ['chair-trail-glute', 'wall-butt-brush', 'headcover-under-trail-arm'],
    alignsWithLeaks: ['approach'],
    alignsWithGoals: ['approaches', 'break-90'],
    assessmentFallback:
      'Spine tilt from address to impact changes enough to move the low point. Measured loss of spine angle is the headline from this clip.',
    rootCauseFallback:
      'Loss of spine angle usually rides along with early extension or a head that floats up. The plan picks the root in the cause graph rather than stacking both as separate projects.',
  },
  {
    id: 'sway',
    label: 'Hip sway',
    detectedBy: [
      { metric: 'hip_sway', comparator: '>', threshold: 0.15, angle: 'face-on' },
    ],
    severityBands: { mild: 0.15, moderate: 0.22, severe: 0.32 },
    causes: ['setup-narrow-stance', 'setup-weight-toes', 'limited-hip-mobility'],
    consequences: [
      'fat shots from the trail side',
      'thin recoveries',
      'path that starts left or right of intent',
      'distance loss on irons',
    ],
    drills: ['trail-hip-post', 'step-drill-load', 'feet-together-swings', 'mirror-centre-chest'],
    alignsWithLeaks: ['driving', 'approach'],
    alignsWithGoals: ['fairways', 'approaches', 'break-90'],
    assessmentFallback:
      'Face-on, the hips drift laterally toward the top more than a centred coil. That sway is measurable against shoulder width.',
    rootCauseFallback:
      'Sway often starts in a narrow or toe-heavy setup, or when the body slides because turn feels unavailable. We will not force a bigger turn — we stabilise the centre first.',
  },
  {
    id: 'slide',
    label: 'Hip slide',
    detectedBy: [
      { metric: 'hip_slide', comparator: '>', threshold: 0.18, angle: 'face-on' },
    ],
    severityBands: { mild: 0.18, moderate: 0.26, severe: 0.36 },
    causes: ['sway', 'reverse-pivot', 'setup-ball-position'],
    consequences: [
      'blocks to the right (right-hander)',
      'pulls when the hands flip to save it',
      'early weight dump',
      'poor compression',
    ],
    drills: ['lead-hip-post', 'step-through-hold', 'pump-to-impact-posture', 'gate-at-hips'],
    alignsWithLeaks: ['driving', 'approach'],
    alignsWithGoals: ['fairways', 'break-90'],
    assessmentFallback:
      'Through impact the hip centre slides toward the target more than a braced strike. Slide shows up clearly in the face-on hip-centre metric.',
    rootCauseFallback:
      'Slide is often a downswing rescue after sway or a reverse load. Fix the root load pattern; do not add a slide-stopping thought on top of five others.',
  },
  {
    id: 'reverse-pivot',
    label: 'Reverse pivot',
    detectedBy: [
      { metric: 'weight_shift', comparator: '<', threshold: -0.08, angle: 'face-on' },
    ],
    severityBands: { mild: 0.08, moderate: 0.14, severe: 0.22 },
    causes: ['setup-ball-position', 'limited-hip-mobility', 'sway'],
    consequences: [
      'hang-back contact',
      'high weak fades',
      'fat irons',
      'loss of power',
    ],
    drills: ['step-drill-load', 'trail-hip-post', 'finish-on-lead', 'mirror-centre-chest'],
    alignsWithLeaks: ['driving', 'approach'],
    alignsWithGoals: ['fairways', 'lower-handicap'],
    assessmentFallback:
      'The hip-centre weight-shift proxy moves away from the lead side into impact — a reverse-pivot pattern relative to a normal pressure shift.',
    rootCauseFallback:
      'Reverse pivots often pair with ball position or a sway that never loads the trail side. The plan restores a simple load, not a forced lunge.',
  },
  {
    id: 'insufficient-shoulder-turn',
    label: 'Insufficient shoulder turn',
    detectedBy: [
      { metric: 'shoulder_turn_p4', comparator: '<', threshold: 70, angle: 'dtl' },
    ],
    severityBands: { mild: 70, moderate: 55, severe: 40 },
    causes: ['limited-torso-turn', 'sway', 'setup-too-close'],
    consequences: [
      'armsy downswing',
      'distance loss',
      'steep salvage moves',
      'early extension as space-making',
    ],
    drills: ['cross-arm-turns', 'trail-shoulder-under', 'feet-together-swings', 'pause-at-top'],
    alignsWithLeaks: ['driving'],
    alignsWithGoals: ['fairways', 'break-90', 'play-more'],
    assessmentFallback:
      'Shoulder turn at the top sits short of a full, free coil on this down-the-line capture. Width is coming more from the arms than the torso.',
    rootCauseFallback:
      'A short turn is sometimes mobility and sometimes sway pretending to be turn. We improve the turn you can own — never force a bigger twist into pain.',
  },
  {
    id: 'flat-shoulder-plane',
    label: 'Flat shoulder plane',
    /** Proxied via low X-factor with decent shoulder turn — limited without a true plane metric. */
    detectedBy: [
      { metric: 'x_factor', comparator: '<', threshold: 25, angle: 'dtl' },
      { metric: 'shoulder_turn_p4', comparator: '>=', threshold: 70, angle: 'dtl' },
    ],
    severityBands: { mild: 25, moderate: 18, severe: 12 },
    causes: ['setup-too-close', 'insufficient-shoulder-turn'],
    consequences: [
      'in-to-out exaggerate',
      'hooks or pushes',
      'low point that wants to be behind the ball',
    ],
    drills: ['alignment-stick-plane', 'headcover-under-trail-arm', 'pause-at-top'],
    alignsWithLeaks: ['driving'],
    alignsWithGoals: ['fairways'],
    assessmentFallback:
      'X-factor is small even when the shoulders move — a flatter, less separated coil than a typical power turn.',
    rootCauseFallback:
      'A flat look often starts with setup proximity or a turn that rotates level. The graph links to setup and turn drills already in the library.',
  },
  {
    id: 'steep-shoulder-plane',
    label: 'Steep shoulder plane',
    detectedBy: [
      { metric: 'x_factor', comparator: '>', threshold: 55, angle: 'dtl' },
    ],
    severityBands: { mild: 55, moderate: 65, severe: 75 },
    causes: ['over-the-top', 'insufficient-shoulder-turn'],
    consequences: [
      'out-to-in path',
      'pulls and cuts',
      'heavy left-side misses (right-hander)',
    ],
    drills: ['headcover-under-trail-arm', 'alignment-stick-plane', 'pump-to-impact-posture'],
    alignsWithLeaks: ['driving', 'approach'],
    alignsWithGoals: ['fairways', 'approaches'],
    assessmentFallback:
      'Separation between shoulder and hip turn is unusually large at the top — a steep, high-hands look relative to the hips.',
    rootCauseFallback:
      'Steep coils often pair with an over-the-top rescue. We quiet the upper-body throw before chasing path band-aids.',
  },
  {
    id: 'head-lift',
    label: 'Head lift',
    detectedBy: [
      { metric: 'head_depth', comparator: '>', threshold: 0.08, angle: 'dtl' },
    ],
    severityBands: { mild: 0.08, moderate: 0.12, severe: 0.18 },
    causes: ['early-extension', 'loss-of-spine-angle'],
    consequences: [
      'thin shots',
      'topped fairway woods',
      'early peek at the target',
    ],
    drills: ['spot-on-ground', 'chair-trail-glute', 'finish-hold-pose'],
    alignsWithLeaks: ['approach', 'driving'],
    alignsWithGoals: ['approaches', 'fairways'],
    assessmentFallback:
      'Head depth changes from address to impact beyond a quiet strike. The head is floating up or away from the ball.',
    rootCauseFallback:
      'Head lift is frequently a passenger of early extension. Fix posture retention and the peek often settles without a “keep your head down” lecture.',
  },
  {
    id: 'head-sway',
    label: 'Head sway',
    detectedBy: [
      { metric: 'head_lateral', comparator: '>', threshold: 0.12, angle: 'face-on' },
    ],
    severityBands: { mild: 0.12, moderate: 0.18, severe: 0.28 },
    causes: ['sway', 'slide', 'reverse-pivot'],
    consequences: [
      'centre-face contact scatter',
      'start-line variance',
      'timing pressure on short clubs',
    ],
    drills: ['spot-on-ground', 'mirror-centre-chest', 'feet-together-swings'],
    alignsWithLeaks: ['approach'],
    alignsWithGoals: ['approaches', 'break-80'],
    assessmentFallback:
      'Face-on head position drifts laterally from address to impact more than a stable strike typically shows.',
    rootCauseFallback:
      'The head usually follows the hips. If sway or slide is present, that is the root — not a neck-only cue.',
  },
  {
    id: 'over-the-top',
    label: 'Over-the-top move',
    /**
     * Inferred without a dedicated plane-change metric: steep separation plus
     * face-on slide/sway patterns that usually accompany an OTT rescue.
     * Requires ALL listed rules (see detectFaults).
     */
    detectedBy: [
      { metric: 'x_factor', comparator: '>', threshold: 50, angle: 'dtl' },
    ],
    severityBands: { mild: 50, moderate: 60, severe: 70 },
    causes: ['steep-shoulder-plane', 'insufficient-shoulder-turn', 'reverse-pivot'],
    consequences: [
      'left-missing pulls and slices',
      'steep attack on irons',
      'weak fades under pressure',
    ],
    drills: ['headcover-under-trail-arm', 'pump-to-impact-posture', 'trail-hip-post', 'pause-at-top'],
    alignsWithLeaks: ['driving'],
    alignsWithGoals: ['fairways', 'break-90'],
    assessmentFallback:
      'The measured coil separation points to a steep upper-body pattern that often throws over the top in transition. Treat this as an inference from pose metrics, not a path sensor.',
    rootCauseFallback:
      'Over-the-top is usually a rescue of a steep or reverse-loaded backswing. The graph points at those roots; we do not invent a path number the pose model did not measure.',
  },
  {
    id: 'tempo-imbalance',
    label: 'Tempo imbalance',
    detectedBy: [
      { metric: 'tempo_ratio', comparator: '<', threshold: 2.0, angle: 'face-on' },
    ],
    severityBands: { mild: 2.0, moderate: 1.5, severe: 1.2 },
    causes: ['insufficient-shoulder-turn', 'over-the-top'],
    consequences: [
      'rushed transition',
      'sequence breakdown',
      'distance that comes and goes',
    ],
    drills: ['pause-at-top', 'whoosh-rehearsal', 'count-three-one', 'feet-together-swings'],
    alignsWithLeaks: ['mental', 'driving'],
    alignsWithGoals: ['play-more', 'break-90'],
    assessmentFallback:
      'Backswing-to-downswing frame ratio is quicker than the classic calm transition. Tempo is rushed relative to a measured 3:1-style feel.',
    rootCauseFallback:
      'Fast transitions often chase a short turn or an early upper-body throw. Smooth the sequence before adding speed.',
  },
  {
    id: 'tempo-too-slow',
    label: 'Overlong backswing tempo',
    detectedBy: [
      { metric: 'tempo_ratio', comparator: '>', threshold: 4.0, angle: 'face-on' },
    ],
    severityBands: { mild: 4.0, moderate: 5.0, severe: 6.5 },
    causes: ['insufficient-shoulder-turn'],
    consequences: [
      'deceleration into the ball',
      'timing that depends on a perfect day',
      'lost distance',
    ],
    drills: ['count-three-one', 'whoosh-rehearsal', 'pause-at-top'],
    alignsWithLeaks: ['approach'],
    alignsWithGoals: ['approaches'],
    assessmentFallback:
      'The backswing consumes many more frames than the downswing — an elongated takeaway relative to the strike.',
    rootCauseFallback:
      'A long, slow backswing is often a search for turn. Shorten the journey; do not add forced speed at the bottom.',
  },
  {
    id: 'soft-lead-arm',
    label: 'Collapsed lead arm at the top',
    detectedBy: [
      { metric: 'lead_arm_p4', comparator: '<', threshold: 100, angle: 'face-on' },
    ],
    severityBands: { mild: 100, moderate: 85, severe: 70 },
    causes: ['insufficient-shoulder-turn', 'grip-strong-weak'],
    consequences: [
      'narrow arc',
      'distance loss',
      'timing-heavy release',
    ],
    drills: ['lead-arm-width', 'cross-arm-turns', 'pause-at-top'],
    alignsWithLeaks: ['driving'],
    alignsWithGoals: ['fairways'],
    assessmentFallback:
      'Lead-arm angle at the top is more bent than a wide, structural coil. Width is leaking out of the lead side.',
    rootCauseFallback:
      'A soft lead arm often pairs with a short body turn. Restore width you can hold — never lock the elbow into a painful straight arm.',
  },
  {
    id: 'upright-address',
    label: 'Over-upright address posture',
    detectedBy: [
      { metric: 'spine_address', comparator: '<', threshold: 22, angle: 'dtl' },
    ],
    severityBands: { mild: 22, moderate: 16, severe: 10 },
    causes: ['setup-too-close', 'ball-too-far-forward'],
    consequences: [
      'arms hang disconnected',
      'early extension later in the swing',
      'path that needs a save',
    ],
    drills: ['hip-hinge-setup', 'club-across-thighs', 'mirror-centre-chest'],
    alignsWithLeaks: ['approach', 'driving'],
    alignsWithGoals: ['approaches', 'fairways'],
    assessmentFallback:
      'Spine angle at address is quite vertical versus an athletic hinge. Setup posture is the first measurable issue.',
    rootCauseFallback:
      'Upright address is a setup cause, not a downswing mystery. Fix the hinge and many later faults shrink.',
  },
  {
    id: 'excess-bend-address',
    label: 'Excess forward bend at address',
    detectedBy: [
      { metric: 'spine_address', comparator: '>', threshold: 48, angle: 'dtl' },
    ],
    severityBands: { mild: 48, moderate: 55, severe: 62 },
    causes: ['setup-too-close'],
    consequences: [
      'restricted turn',
      'early stand-up to make room',
      'balance on the toes',
    ],
    drills: ['hip-hinge-setup', 'club-across-thighs', 'trail-hip-post'],
    alignsWithLeaks: ['approach'],
    alignsWithGoals: ['approaches'],
    assessmentFallback:
      'Address spine bend is deeper than a free-turning setup. You may be reaching for the ball.',
    rootCauseFallback:
      'Excess bend often means the ball is too far away or the hinge is all spine. Soften toward an athletic posture without forcing flexibility.',
  },
];

export const SWING_FAULT_BY_ID: Record<string, SwingFaultDef> = Object.fromEntries(
  SWING_FAULTS.map((f) => [f.id, f]),
);

export function getSwingFault(id: string): SwingFaultDef | undefined {
  return SWING_FAULT_BY_ID[id];
}
