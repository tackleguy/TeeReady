/**
 * Authored swing-drill library.
 *
 * The model selects drills by id and may explain why they were chosen.
 * It never writes setup/execution text and must not invent drills.
 *
 * ⚠️ REVIEW REQUIRED by a qualified coach / physio-aware instructor before
 * launch. Seed content only — not a medical or coaching credential.
 *
 * Safety (applies to every drill):
 * - Stop if anything hurts; consult a qualified professional.
 * - No drill here is physiotherapy or injury treatment.
 * - Never force a bigger turn, deeper hinge, or greater range of motion.
 */

export type DrillLocation = 'range' | 'home' | 'course' | 'gym';
export type DrillRepUnit = 'balls' | 'swings' | 'minutes';

export type SwingDrillDef = {
  id: string;
  name: string;
  fixes: string[];
  setup: string;
  execution: string;
  reps: { sets: number; reps: number; unit: DrillRepUnit };
  equipment: string[];
  location: DrillLocation;
  difficulty: 1 | 2 | 3;
  checkpoint: string;
  source?: string;
};

export const SWING_DRILLS: SwingDrillDef[] = [
  {
    id: 'wall-butt-brush',
    name: 'Wall butt-brush',
    fixes: ['early-extension', 'loss-of-spine-angle'],
    setup:
      'Stand in golf posture with your trail glute lightly touching a wall or alignment stick behind you. Club optional for rehearsals.',
    execution:
      'Make slow backswings and start-downs while keeping a soft brush of contact with the wall through the strike zone. If you lose the wall early, reset — do not shove harder into it.',
    reps: { sets: 3, reps: 8, unit: 'swings' },
    equipment: ['wall or chair', 'optional iron'],
    location: 'home',
    difficulty: 1,
    checkpoint: 'You still feel trail-glute presence as the hands pass the thigh.',
    source: 'Common early-extension rehearsal (seed — review before launch)',
  },
  {
    id: 'chair-trail-glute',
    name: 'Chair trail-glute hold',
    fixes: ['early-extension', 'loss-of-spine-angle', 'head-lift'],
    setup:
      'Place a chair or soft bag just behind the trail hip in address posture.',
    execution:
      'Brush the chair on the way back and keep the trail hip from thrusting through a half-speed strike. Stop immediately if your low back complains.',
    reps: { sets: 3, reps: 10, unit: 'swings' },
    equipment: ['chair', 'iron'],
    location: 'home',
    difficulty: 1,
    checkpoint: 'Chair contact remains available into the start of the downswing.',
  },
  {
    id: 'pump-to-impact-posture',
    name: 'Pump to impact posture',
    fixes: ['early-extension', 'slide', 'over-the-top', 'steep-shoulder-plane'],
    setup:
      'Take your normal address with an iron. No ball for the first set.',
    execution:
      'Swing to the top, pump twice down to a mid-thigh “impact” shape while holding trail-hip depth, then flow through to a balanced finish on the third pump.',
    reps: { sets: 3, reps: 6, unit: 'swings' },
    equipment: ['iron'],
    location: 'range',
    difficulty: 2,
    checkpoint: 'Chest does not leap upright on the pumps; finish stays soft on the lead side.',
  },
  {
    id: 'alignment-stick-hip-line',
    name: 'Alignment-stick hip line',
    fixes: ['early-extension'],
    setup:
      'Plant an alignment stick in the ground just outside the trail hip, angled like your shaft at address.',
    execution:
      'Rehearse half swings so the trail hip stays inside the stick instead of bumping it toward the ball.',
    reps: { sets: 2, reps: 12, unit: 'swings' },
    equipment: ['alignment stick', 'iron'],
    location: 'range',
    difficulty: 2,
    checkpoint: 'Stick stays quiet; you feel space, not a collision.',
  },
  {
    id: 'trail-hip-post',
    name: 'Trail-hip post',
    fixes: ['sway', 'reverse-pivot', 'over-the-top', 'excess-bend-address'],
    setup:
      'Feel more pressure in the trail heel at address without leaning outside the trail foot.',
    execution:
      'Make waist-high swings where the trail hip posts in place while the torso turns over it. No lunge away from the target.',
    reps: { sets: 3, reps: 10, unit: 'swings' },
    equipment: ['iron'],
    location: 'range',
    difficulty: 1,
    checkpoint: 'Chest stays over the feet; trail hip does not drift outside the trail foot.',
  },
  {
    id: 'step-drill-load',
    name: 'Step-drill load',
    fixes: ['sway', 'reverse-pivot'],
    setup:
      'Start with feet together, ball opposite the lead toe for a mid-iron.',
    execution:
      'Step the trail foot out as you take the club back, plant, then strike — teaching a real trail-side load without a slide away from the ball.',
    reps: { sets: 3, reps: 8, unit: 'balls' },
    equipment: ['iron', 'balls'],
    location: 'range',
    difficulty: 2,
    checkpoint: 'You feel pressure build in the trail foot before the downswing starts.',
  },
  {
    id: 'feet-together-swings',
    name: 'Feet-together swings',
    fixes: ['sway', 'insufficient-shoulder-turn', 'head-sway', 'tempo-imbalance'],
    setup:
      'Stand with feet touching, short iron, soft knees.',
    execution:
      'Hit easy balls focusing on balance and centred rotation. If you lose balance, shorten the swing — do not muscle a bigger turn.',
    reps: { sets: 2, reps: 12, unit: 'balls' },
    equipment: ['short iron', 'balls'],
    location: 'range',
    difficulty: 1,
    checkpoint: 'You finish in balance without a hop or stumble.',
  },
  {
    id: 'mirror-centre-chest',
    name: 'Mirror centre-chest',
    fixes: ['sway', 'reverse-pivot', 'head-sway', 'upright-address'],
    setup:
      'Face a mirror or phone camera in face-on view with a mid-iron.',
    execution:
      'Rehearse to the top watching the centre of the chest stay inside the feet. Pause, check, then ease down.',
    reps: { sets: 2, reps: 10, unit: 'swings' },
    equipment: ['mirror or phone', 'iron'],
    location: 'home',
    difficulty: 1,
    checkpoint: 'Chest logo does not drift outside the trail foot at the top.',
  },
  {
    id: 'lead-hip-post',
    name: 'Lead-hip post',
    fixes: ['slide'],
    setup:
      'Address normally; imagine a wall just outside the lead hip.',
    execution:
      'Start down by rotating against a firm lead hip instead of sliding into the wall. Half speed only.',
    reps: { sets: 3, reps: 8, unit: 'swings' },
    equipment: ['iron'],
    location: 'range',
    difficulty: 2,
    checkpoint: 'Belt buckle turns open without a big lateral lunge.',
  },
  {
    id: 'step-through-hold',
    name: 'Step-through hold',
    fixes: ['slide'],
    setup:
      'Hit a mid-iron with room to step toward the target after contact.',
    execution:
      'Strike, then step the trail foot through and hold a tall finish for a two-count. Smooth speed only.',
    reps: { sets: 2, reps: 10, unit: 'balls' },
    equipment: ['iron', 'balls'],
    location: 'range',
    difficulty: 1,
    checkpoint: 'You can hold the finish without falling toward the target line.',
  },
  {
    id: 'gate-at-hips',
    name: 'Gate at hips',
    fixes: ['slide'],
    setup:
      'Set two alignment sticks or headcovers just outside each hip as a soft gate.',
    execution:
      'Swing without bumping the lead gate early. Rotate inside the gate through impact.',
    reps: { sets: 3, reps: 8, unit: 'swings' },
    equipment: ['two headcovers or sticks', 'iron'],
    location: 'range',
    difficulty: 2,
    checkpoint: 'Lead gate stays quiet until after low point.',
  },
  {
    id: 'finish-on-lead',
    name: 'Finish on lead',
    fixes: ['reverse-pivot'],
    setup:
      'Normal address with a short iron.',
    execution:
      'Swing to a finish with trail heel up and soft pressure on the lead foot. Hold three seconds. No forced lean.',
    reps: { sets: 3, reps: 8, unit: 'swings' },
    equipment: ['short iron'],
    location: 'home',
    difficulty: 1,
    checkpoint: 'You could lift the trail foot without falling backward.',
  },
  {
    id: 'cross-arm-turns',
    name: 'Cross-arm turns',
    fixes: ['insufficient-shoulder-turn', 'soft-lead-arm'],
    setup:
      'Cross arms over chest in golf posture, no club.',
    execution:
      'Turn shoulders as far as comfort allows without swaying, then return to centre. Stop at the first hint of pain or pinching.',
    reps: { sets: 2, reps: 12, unit: 'swings' },
    equipment: [],
    location: 'home',
    difficulty: 1,
    checkpoint: 'Trail shoulder moves behind you without the hips sliding.',
  },
  {
    id: 'trail-shoulder-under',
    name: 'Trail shoulder under',
    fixes: ['insufficient-shoulder-turn'],
    setup:
      'Mid-iron at address; feel tall through the crown of the head.',
    execution:
      'On the backswing, sense the trail shoulder moving “under” the chin rather than level-spinning. Easy pace; never wrench the neck.',
    reps: { sets: 3, reps: 8, unit: 'balls' },
    equipment: ['iron', 'balls'],
    location: 'range',
    difficulty: 2,
    checkpoint: 'You see the ball without spinning the chin off the line.',
  },
  {
    id: 'pause-at-top',
    name: 'Pause at the top',
    fixes: [
      'insufficient-shoulder-turn',
      'tempo-imbalance',
      'tempo-too-slow',
      'over-the-top',
      'flat-shoulder-plane',
      'soft-lead-arm',
    ],
    setup:
      'Any iron; commit to three-quarter length.',
    execution:
      'Swing to the top, pause one comfortable beat, then start down without a lunge. Let the pause set sequence — do not add speed as a fix.',
    reps: { sets: 3, reps: 8, unit: 'balls' },
    equipment: ['iron', 'balls'],
    location: 'range',
    difficulty: 1,
    checkpoint: 'The pause is calm; the first move down is lower-body, not a throw.',
  },
  {
    id: 'alignment-stick-plane',
    name: 'Alignment-stick plane gate',
    fixes: ['flat-shoulder-plane', 'steep-shoulder-plane'],
    setup:
      'Angle an alignment stick in the ground mirroring a good shaft plane for a mid-iron.',
    execution:
      'Brush soft rehearsals so the butt of the club tracks near the stick without crashing into it. Feedback only — no forcing.',
    reps: { sets: 2, reps: 12, unit: 'swings' },
    equipment: ['alignment stick', 'iron'],
    location: 'range',
    difficulty: 2,
    checkpoint: 'Club stays near the stick without a collision or a wild miss.',
  },
  {
    id: 'headcover-under-trail-arm',
    name: 'Headcover under trail arm',
    fixes: [
      'loss-of-spine-angle',
      'flat-shoulder-plane',
      'steep-shoulder-plane',
      'over-the-top',
    ],
    setup:
      'Tuck a headcover or glove under the trail upper arm at address.',
    execution:
      'Make waist-to-waist swings keeping the headcover from falling early. If it drops every time, shorten the motion rather than squeezing painfully.',
    reps: { sets: 3, reps: 10, unit: 'swings' },
    equipment: ['headcover or glove', 'iron'],
    location: 'home',
    difficulty: 1,
    checkpoint: 'Cover stays put into the start of the downswing.',
  },
  {
    id: 'spot-on-ground',
    name: 'Spot on the ground',
    fixes: ['head-lift', 'head-sway'],
    setup:
      'Pick a daisy, divot edge, or tee in front of the ball as a focus spot.',
    execution:
      'Keep soft awareness of that spot until after contact, then release the eyes to the flight. No rigid neck lock.',
    reps: { sets: 2, reps: 12, unit: 'balls' },
    equipment: ['tee or marker', 'iron', 'balls'],
    location: 'range',
    difficulty: 1,
    checkpoint: 'You still see the spot a beat after the ball leaves.',
  },
  {
    id: 'finish-hold-pose',
    name: 'Finish hold pose',
    fixes: ['head-lift'],
    setup:
      'Normal short-iron setup.',
    execution:
      'Swing through and freeze a balanced finish for three seconds with eyes eventually to the target — not a frozen stare at the ground.',
    reps: { sets: 2, reps: 10, unit: 'swings' },
    equipment: ['short iron'],
    location: 'course',
    difficulty: 1,
    checkpoint: 'Finish is quiet enough to hold without a stumble.',
  },
  {
    id: 'whoosh-rehearsal',
    name: 'Whoosh rehearsal',
    fixes: ['tempo-imbalance', 'tempo-too-slow'],
    setup:
      'Hold the club upside down by the head, or use an alignment stick.',
    execution:
      'Make smooth rehearsals listening for the whoosh to happen past the bottom, not at the top. Easy athletic pace — never yank.',
    reps: { sets: 2, reps: 5, unit: 'minutes' },
    equipment: ['club or stick'],
    location: 'home',
    difficulty: 1,
    checkpoint: 'Loudest whoosh is after low point, not at transition.',
  },
  {
    id: 'count-three-one',
    name: 'Count three-and-one',
    fixes: ['tempo-imbalance', 'tempo-too-slow'],
    setup:
      'Any club; speak the count aloud.',
    execution:
      'Count “one-two-three” on the backswing and “one” on the downswing. Match motion to the count without forcing speed or lag.',
    reps: { sets: 3, reps: 8, unit: 'balls' },
    equipment: ['iron', 'balls'],
    location: 'range',
    difficulty: 1,
    checkpoint: 'The spoken count and the motion stay together.',
  },
  {
    id: 'lead-arm-width',
    name: 'Lead-arm width swings',
    fixes: ['soft-lead-arm'],
    setup:
      'Mid-iron; soft elbow, not locked.',
    execution:
      'Feel the lead arm structure stay long to a three-quarter top, then swing through. Stop if the elbow or shoulder complains.',
    reps: { sets: 3, reps: 8, unit: 'balls' },
    equipment: ['iron', 'balls'],
    location: 'range',
    difficulty: 2,
    checkpoint: 'Lead arm looks longer at the top without a hyperextended lock.',
  },
  {
    id: 'hip-hinge-setup',
    name: 'Hip-hinge setup',
    fixes: ['upright-address', 'excess-bend-address'],
    setup:
      'Club across the chest or thighs; feet in stance width.',
    execution:
      'Hinge from the hips until arms hang under the shoulders, then take the club. Adjust ball position rather than reaching.',
    reps: { sets: 2, reps: 8, unit: 'minutes' },
    equipment: ['club'],
    location: 'home',
    difficulty: 1,
    checkpoint: 'Weight feels mid-foot; fingertips hang under the shoulders.',
  },
  {
    id: 'club-across-thighs',
    name: 'Club-across-thighs check',
    fixes: ['upright-address', 'excess-bend-address'],
    setup:
      'Hold a club across the thigh line in posture.',
    execution:
      'Settle posture so the club sits level-ish across the thighs without the chest collapsing or the pelvis tucking hard.',
    reps: { sets: 2, reps: 6, unit: 'minutes' },
    equipment: ['club'],
    location: 'course',
    difficulty: 1,
    checkpoint: 'You can waggle without losing the thigh line.',
  },
  {
    id: 'pre-round-three-feel',
    name: 'Pre-round three-feel warm-up',
    fixes: ['tempo-imbalance', 'early-extension', 'sway'],
    setup:
      'On the first tee or range bay, pick the one swing feel from this cycle.',
    execution:
      'Three easy rehearsal swings with that single feel, then one committed ball. No stack of thoughts.',
    reps: { sets: 1, reps: 3, unit: 'swings' },
    equipment: ['game club'],
    location: 'course',
    difficulty: 1,
    checkpoint: 'You can name the one feel in a short sentence before you pull the trigger.',
  },
  {
    id: 'gate-start-line',
    name: 'Start-line gate',
    fixes: ['head-sway', 'slide', 'over-the-top'],
    setup:
      'Two tees or sticks making a short gate just in front of the ball on the start line.',
    execution:
      'Hit soft 9-irons through the gate. Use it as feedback for centred contact — not as a path number to chase.',
    reps: { sets: 2, reps: 10, unit: 'balls' },
    equipment: ['two tees', '9-iron', 'balls'],
    location: 'range',
    difficulty: 2,
    checkpoint: 'Balls mostly clear the gate without a desperate flip.',
  },
  {
    id: 'half-speed-compression',
    name: 'Half-speed compression',
    fixes: ['slide', 'early-extension', 'tempo-imbalance'],
    setup:
      'Mid-iron; commit to half effort.',
    execution:
      'Strike balls at half speed with a quiet lower body and a complete finish. Speed is not the goal.',
    reps: { sets: 3, reps: 8, unit: 'balls' },
    equipment: ['iron', 'balls'],
    location: 'range',
    difficulty: 1,
    checkpoint: 'Turf bruise is after the ball when you use an iron.',
  },
  {
    id: 'gym-posture-holds',
    name: 'Athletic posture holds',
    fixes: ['upright-address', 'excess-bend-address'],
    setup:
      'No load beyond bodyweight. Soft knees, hinged hips, long spine.',
    execution:
      'Hold athletic posture for short breaths, reset, repeat. This is awareness — not a mobility prescription or rehab protocol. Skip if anything hurts.',
    reps: { sets: 3, reps: 3, unit: 'minutes' },
    equipment: [],
    location: 'gym',
    difficulty: 1,
    checkpoint: 'You can breathe quietly without shaking or straining.',
  },
];

export const SWING_DRILL_BY_ID: Record<string, SwingDrillDef> = Object.fromEntries(
  SWING_DRILLS.map((d) => [d.id, d]),
);

export function getSwingDrill(id: string): SwingDrillDef | undefined {
  return SWING_DRILL_BY_ID[id];
}

/** All drill names — used by validators. */
export function swingDrillNames(): string[] {
  return SWING_DRILLS.map((d) => d.name);
}
