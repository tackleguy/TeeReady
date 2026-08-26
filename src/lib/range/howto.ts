/** Copy for launch monitor and driving range how-to guides. */

export const LAUNCH_HOWTO_STEPS = [
  'Set up corner view — stand 6–10 ft behind the ball, ~45° off the target line. Face-on works for yardage only; corner adds direction.',
  'Record slow-mo in your Camera app (120 or 240 fps is best; 30–60 fps still works with lower accuracy). Keep the ball in frame 1–2 seconds after impact.',
  'Upload the clip here. Pick your club so carry uses a typical flight model — spin is not measured.',
  'Read carry, total, and direction. Numbers are uncalibrated — use them to compare today vs yesterday, not vs TrackMan.',
  'Optional: start a Driving Range session first (Progress → Range). Each analyzed shot logs to your dispersion plot automatically.',
] as const;

export const RANGE_HOWTO_STEPS = [
  'Pick a club and tap Start range session. One session = one club so dispersion stays meaningful.',
  'Open Launch (Progress → Launch) and upload slow-mo for each ball. You can return here after every shot.',
  'Use Dispersion filters — Live session, All shots, or a past session — to compare patterns.',
  'The fairway plot shows each landing; the dashed ellipse is typical spread when you have 3+ shots.',
  'Tap any shot in history to highlight it on the plot. End session when finished — all data stays on-device.',
] as const;
