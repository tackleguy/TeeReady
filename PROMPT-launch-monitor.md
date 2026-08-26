# TeeReady AI Launch Monitor — build prompt

Spec by Keith. Engineering constraints and phasing added. Build in the order given.

> **Scale warning, read first.** This is months of work, not a session. Phases 0–5 are the MVP that
> proves the concept is even possible on the target hardware. Do not start Phase 6+ until Phase 5
> has been validated against real ground truth. If the numbers can't be validated, the rest of the
> product is decoration on top of invented data.

---

## PHASE 0 — Capability probe. Build this before anything else. ~1 day.

**The whole architecture depends on one number, and nobody knows it yet: what frame rate can the
browser actually deliver on the target phones?**

TeeReady is a web app. iPhone slow-motion at 120/240 fps is a native camera capability
(AVFoundation). The web `getUserMedia` API historically caps far lower and its frame-rate
constraints on iOS have long-standing WebKit bugs. **Do not assume 240 fps is reachable from a web
page. Measure it.**

Write a throwaway probe page (~50 lines, `/dev/camera-probe`, dev-only route):

```js
const stream = await navigator.mediaDevices.getUserMedia({
  video: { frameRate: { ideal: 240 }, width: { ideal: 1920 } }
});
const track = stream.getVideoTracks()[0];
console.log(track.getSettings());        // what you actually got
console.log(track.getCapabilities());    // what the device claims it can do
```

Then measure the **real** delivered rate by counting `requestVideoFrameCallback` ticks over 5
seconds — `getSettings()` reports what was negotiated, not what arrives.

Run it on: iPhone Safari, iPhone Chrome, Android Chrome. Try each camera (`facingMode`, and each
`deviceId` — the ultra-wide and telephoto often differ). Report a table of requested vs negotiated
vs actually-delivered fps per device and camera.

### The fork this creates

- **If the browser delivers ≥120 fps:** live capture works. Build sections 1–4 as specified.
- **If it caps at 60 fps:** the live-capture launch monitor is not possible on the web. The
  architecture becomes **record in the native Camera app at 240 fps → user uploads the file →
  analyze the file.** That kills the live "READY TO HIT" setup guidance in section 2, because the
  app never sees the camera. Setup guidance becomes a pre-recording checklist plus post-hoc
  validation of the uploaded clip.

**Report the measured numbers and which fork applies before writing any analysis code.** Do not
build both paths speculatively.

---

## Physical limits — non-negotiable, design around these

### You cannot measure spin

Real launch monitors get spin from Doppler radar or high-speed stereo cameras with marked balls.
A single phone camera on an unmarked ball cannot. **Spin is one of the largest determinants of
carry distance.**

So carry is **not measured** — it is modelled from ball speed and launch angle with an *assumed*
spin rate typical for that club. That assumption can be wrong by thousands of rpm on a mishit, which
is tens of yards of carry.

**Consequence to enforce in code: carry confidence can never exceed the confidence of the spin
assumption.** A carry number cannot be reported at 84% confidence when the spin behind it is a
guess. Report `Spin: not measurable` as the spec says — and propagate that uncertainty into every
downstream number rather than letting carry look independently reliable.

### One camera sees a 2D projection of a 3D event

The spec lists ball speed, launch angle, launch direction, carry, apex and dispersion as if one
camera yields them all. It does not.

- **Down-the-line** (behind the ball, on the target line): launch **direction** and ball speed
  component along the line. Launch **angle** is badly foreshortened — effectively unmeasurable.
- **Face-on** (perpendicular): launch **angle** and ball speed. Launch **direction** is
  unmeasurable — the ball moves toward or away from the camera.

Every measurement must carry the camera angle it is valid for, exactly like the swing metrics
already do in `src/lib/swing/metrics.ts`:

```ts
{ value, unit, confidence, validForAngle: 'dtl' | 'face-on', assumptions: string[] }
```

**A measurement requested from an angle that cannot produce it returns `null`, not an estimate.**
Two cameras, or two shots from two angles, is the only honest way to get both. Say so in the UI.

### Scale calibration — use the ball

Pixel measurements are meaningless without a real-world scale. A golf ball is **42.67 mm** by rule,
always. That is the calibration reference: detect the ball at address, measure its pixel diameter,
derive mm-per-pixel at that depth. Everything downstream depends on this, so it needs its own
confidence score, and it must be re-derived per shot, not cached.

Perspective correction still matters — the ball moves toward or away from the camera and its
apparent size changes. Model it or bound the error.

### Motion blur is the norm, not an edge case

A 146 mph ball travels **27 cm between frames at 240 fps** and 54 cm at 120 fps. At typical phone
shutter speeds the ball is a **streak, not a circle**. Detection must handle streaks — and streak
length in a single frame is itself a speed measurement worth using.

At 120 fps the ball is often out of frame within 1–2 frames of impact. Field of view and camera
distance are as important as fps. Include them in the setup checklist.

---

## The measurement stack — deterministic code, not an LLM

The spec is right and this is the load-bearing rule: **the LLM never produces a number.**

| Layer | Tool | Job |
|---|---|---|
| Pose | MediaPipe Tasks Vision (already a dependency) | Body landmarks, swing sequence |
| Ball / club detection | ONNX Runtime Web or TF.js with a small YOLO | Object detection per frame |
| Tracking, optical flow, calibration | OpenCV.js | Trajectory, perspective, scale |
| Physics | Your own TypeScript module | Speeds, angles, ballistic model |
| Language | Llama 3.2 Vision, local | Explains numbers it is handed. Writes prose only. |

### Bundle budget — this collides with work just completed

The app was just cut toward a 150 KB gzipped main bundle. **OpenCV.js is ~8 MB. A YOLO model is
5–25 MB. MediaPipe adds several MB more.**

Non-negotiable: none of it loads on any route except the launch monitor, all of it behind dynamic
`import()`, and the model download is an explicit user action ("Download analysis pack — 22 MB")
with progress and caching in IndexedDB. **If loading Today gets one byte slower, this is wrong.**

---

## PHASE 1–5 — the MVP

Follow the spec's order. The MVP loop is `RECORD → DETECT → TRACK → CALCULATE → DISPLAY → SAVE`.

**Phase 1 — Capture.** Detect actual fps from the file or stream (do not trust metadata; count
frames against duration). Tier the analysis: 24–60 swing only, 120 launch monitor, 240 high
precision. **Refuse to output launch-monitor numbers below the fps floor** rather than producing
them at low confidence — a wrong ball speed is worse than none.

**Phase 2 — Detection.** Ball, club head, player, hitting area. Setup validation per the spec's
checklist. If Phase 0 forced the upload path, this validates the uploaded clip and reports what was
wrong with the recording.

**Phase 3 — Impact.** Address → Takeaway → Top → Downswing → Impact → Flight, from ball position
discontinuity and club-head velocity. Persist the frames around impact with frame index, timestamp
and fps.

**Phase 4 — Ball tracking.** Multi-frame trajectory with sub-pixel centroid or streak-endpoint
fitting. Reject tracks with fewer than 3 usable post-impact frames.

**Phase 5 — Physics.** Pure TypeScript, no dependencies, **fully unit tested**. Ball speed and
launch from the tracked trajectory and calibration. Carry/total/apex from a documented ballistic
model with the spin assumption stated as an input, not hidden in a constant.

Every output: value, unit, confidence, valid camera angle, and the list of assumptions behind it.

---

## The validation requirement — the most important section here

**A confidence score you invented is itself fabricated data.** "Ball speed 146 mph, confidence 91%"
is meaningless unless 91% was derived from measured error against known truth.

Before shipping any number to any user:

1. Get a session on a real launch monitor — TrackMan, GCQuad, Foresight. A fitting studio or a golf
   shop will sell you an hour.
2. Record 50+ shots simultaneously on the phone and the reference device, across clubs and across
   good and bad strikes.
3. Compute error distribution per metric: mean error, standard deviation, worst case.
4. **Derive the confidence model from that distribution.** Confidence is a calibrated statement
   about observed error, not a vibe.
5. Publish the accuracy honestly in-app: "Ball speed within ±4 mph of a TrackMan in our testing.
   Carry is estimated, not measured."

**Until that dataset exists, the app must label every number `uncalibrated — for relative comparison
only`.** Relative numbers are genuinely useful — a golfer can see today's drive was faster than
yesterday's without knowing the absolute truth. Absolute numbers without validation are a claim you
cannot support, and the product is called a launch monitor.

---

## PHASE 6–10

Build only after Phase 5 validates.

**6 — Virtual range.** Reuse the existing Three.js setup (already lazy-loaded). Dispersion pattern,
landing points, session aggregates.

**7 — Local AI.** Llama 3.2 Vision gets structured JSON plus a few selected frames — never the
video. Reuse the validator already in `src/lib/swing/coach/validate.ts`: every numeral in the
model's output must appear in the input, or the response is discarded. Extend it to this data shape
rather than writing a second one.

**8 — Club database.** Per-club rolling stats. **Weight by confidence** — a 48%-confidence shot must
not move the average like a 94% one. Store shot count and confidence distribution alongside every
average.

**9 — GPS integration.** This is the strongest idea in the spec and it is where the honesty rules
matter most. "Don't hit driver, your carry is 224 and the bunker starts at 230" is only sound if 224
is real. Require a minimum sample size and confidence before a learned distance is allowed to drive
a caddie recommendation, and say what it's based on: "based on 23 measured drives averaging 224
yards."

**10 — Advanced swing analysis.** Merges with the existing swing work in `src/lib/swing/`. Do not
build a second swing pipeline — extend that one, and keep its measured-vs-interpretation split.

---

## Rules that apply to every phase

1. **The LLM never produces a number.** Deterministic code measures; the model explains.
2. **Never present an estimate as a measurement.** Every value carries its confidence, its valid
   camera angle, and its assumptions.
3. **`null` beats a guess.** A metric that cannot be measured from the available footage returns
   nothing and says why.
4. **Never lower a quality threshold to make a feature appear to work.** If 60 fps can't produce
   ball speed, the answer is to say so — not to widen the tolerance until a number appears.
5. **Nothing loads outside the launch monitor route.**
6. Video never leaves the device without explicit consent. All analysis is local.

## Verify, every phase

1. `npx tsc -b --noEmit` passes.
2. `npm run build` succeeds; **report main-bundle gzip size and confirm it is unchanged.**
3. Every existing route loads with no blank screen and no console error.
4. Physics module unit tests pass, including known-input cases computed by hand.
5. Report every metric the current phase can and cannot produce, and at what camera angle.
6. List everything you could not verify rather than marking it done.
