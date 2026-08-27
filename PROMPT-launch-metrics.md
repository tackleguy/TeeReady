# Launch monitor: club speed, spin estimate, and the measured/modelled split

> **SCOPE LOCK.** Launch monitor measurement layer only. No UI redesign, no performance work.
> Autonomous: commit and push per workstream when its Verify list fully passes; push nothing if any
> check fails.

## What already exists — do not rebuild it

- `src/lib/launch/corner.ts` — 3D decomposition from a corner setup, already produces
  `ballSpeedMph`, `launchAngleDeg`, `directionDeg` via `CornerFlight`, with `CORNER_ASSUMPTIONS`
  documented and `CORNER_AZIMUTH_DEG` as a constant.
- `src/lib/launch/physics.ts` — `carry`, `total`.
- `src/lib/launch/directionMetric.ts` — `launch_direction`.
- `LaunchMetric` already carries `confidence`, `validForAngle`, `assumptions`.
- `LaunchConfidence = 'uncalibrated'` — a single-member union. Keep it that way until real
  validation data exists.

## Three new files were just added — wire them in

`src/lib/clubs/database.ts`, `src/lib/venues/types.ts`, `scripts/build-venue.mjs`.

**Fix first: `shotFromLaunch()` in `src/lib/clubs/database.ts` reads the wrong metric ids.** It looks
for `ballSpeed`, `clubSpeed`, `launchAngle`, `lateral`. The real ids are `ball_speed`,
`launch_direction`, `carry`, `total`. Correct the adapter to the ids that actually exist, and add the
new ones from this document. Export the id strings as a single const object so this class of bug
can't recur.

---

## §1 — The central change: `derivation`

Add to `LaunchMetric` in `src/lib/launch/types.ts`:

```ts
export type MetricDerivation = 'measured' | 'modelled';
```

- **`measured`** — comes from pixels. Ball speed, launch angle, direction, club speed.
- **`modelled`** — comes from physics plus assumptions. Carry, total, apex, spin.

`confidence` says *how sure are we*. `derivation` says *where did this come from at all*. They are
different questions and the UI must show both. A modelled carry and a measured ball speed sitting in
the same list at the same visual weight is the product implying it measured something it computed.

Every existing metric gets a `derivation`. `carry` and `total` are `modelled` — they always were.

**UI rule:** modelled values are visually distinct from measured ones, everywhere. Not a footnote.

---

## §2 — Camera setup: corner required, DTL as fallback

A single camera sees a 2D projection. What you can get depends entirely on where it stands.

| Setup | Ball speed | Launch angle | Direction | Club speed |
|---|---|---|---|---|
| **Corner** (~45° off target line, 6–10 ft behind ball) | ✅ | ✅ | ✅ | ✅ |
| **DTL** (directly behind, on target line) | ⚠️ poor — ball recedes from camera | ❌ foreshortened | ✅ best | ⚠️ |
| **Face-on** (perpendicular) | ✅ best | ✅ best | ❌ ball moves toward/away | ✅ best |

**Corner is the required primary setup** and the reason is worth stating in the code comments: at
~45° both the vertical and lateral components project onto the sensor at measurable magnitude, so one
camera can decompose all three. Face-on is better for any single metric but blind to direction, which
is half of what a golfer wants to know.

The corner decomposition's accuracy depends entirely on the azimuth being what it claims. `corner.ts`
assumes `CORNER_AZIMUTH_DEG`. **Estimate the actual azimuth from the setup frame** rather than
trusting the golfer to place the phone at exactly 45° — use the ball, the target line if visible, and
the player's stance direction. Feed the estimated angle into the decomposition and propagate its
error. A 10° azimuth error is a large direction error.

**Refuse to produce metrics from an angle that cannot support them.** DTL must return
`unavailable.launch_angle = 'Launch angle cannot be measured from down-the-line — the ball moves
almost directly away from the camera. Use a corner setup.'` Do not emit a low-confidence guess.

---

## §3 — Club speed

New metric `club_speed`, `derivation: 'measured'`.

Track the club head through the last ~100 ms before impact, fit velocity over the frames immediately
pre-impact, and take the speed at the impact frame. Reuse the existing tracking and the ball-diameter
scale calibration — the club head is in roughly the same plane as the ball at impact, which is what
makes this tractable.

**Frame-rate floors are hard gates, not warnings.** A 100 mph club head travels:

| fps | Distance per frame |
|---|---|
| 60 | ~75 cm — hopeless |
| 120 | ~37 cm — marginal, 2–3 usable frames |
| 240 | ~19 cm — workable |

Below 120 fps, `club_speed` is `unavailable` with a reason naming the fps. Do not lower this
threshold later to make the feature appear to work on more phones.

---

## §4 — Smash factor as a consistency gate

`smash = ball_speed / club_speed`. Add it as a metric — and more importantly, **use it to invalidate
bad measurements.**

The COR limit on a conforming driver caps smash at roughly **1.50**. A computed smash of 1.7 is not a
great strike; it is proof that one of the two measurements is wrong.

| Club | Plausible smash |
|---|---|
| Driver | 1.35 – 1.50 |
| Irons | 1.25 – 1.40 |
| Wedges | 1.10 – 1.30 |

- Above the physical ceiling (>1.52 any club): **reject the shot**, with a message saying the ball
  and club speeds are inconsistent, not a number.
- Outside the plausible band but under the ceiling: keep the shot, flag it, and exclude it from the
  club database.

This is the best free validator in the whole system — two independent measurements that must agree.
Log the smash distribution across shots; a systematic bias in it means the calibration is off, which
is exactly what you need to know before validation day.

---

## §5 — Spin: modelled, never measured

**A phone camera cannot measure spin on an unmarked ball.** Radar or high-speed stereo with a marked
ball is what does that. So this is an *estimate from a model*, and it must be labelled that way
everywhere it appears.

Estimate from club type, launch angle, and club speed. Spin loft is the real driver; without dynamic
loft and attack angle, use launch angle relative to typical loft for the club as the proxy. Put the
model in one documented function with its constants named and sourced, not scattered constants.

**State the uncertainty honestly, because it is large.** A driver spin estimate is realistically
±800 rpm. Carry sensitivity near optimum is roughly 1 yard per 100 rpm — so **spin estimation alone
contributes about ±8 yards of carry uncertainty**, before any other error source.

Requirements:

1. `spin` metric: `derivation: 'modelled'`, with an explicit `rangeRpm: [low, high]`, not a point
   value pretending to precision.
2. The assumption string names it plainly: *"Estimated from club and launch angle. Not measured — a
   phone camera cannot see ball spin."*
3. **Carry inherits it.** `carry` must widen its own uncertainty to include the spin band. A carry
   number cannot look more certain than the spin it was computed from. Show carry as a range too.
4. `unavailable.spin_measured` always set, explaining what would be needed to actually measure it.
5. Never show a bare "Spin: 2,600 rpm". It is `~2,600 rpm (est. 1,800–3,400)`.

---

## §6 — Feed the club database

Once `club_speed`, `smash` and the spin estimate exist:

- Update `shotFromLaunch()` for the corrected and new metric ids.
- Shots failing the smash gate never reach `aggregateClub()`.
- `ClubStats.avgClubSpeedMph` starts populating, which makes `compareToAverage()` able to say
  *"same club speed, better launch"* — the comparison from the original spec.

---

## Rules

1. The LLM produces no numbers. Deterministic code measures and models.
2. `measured` and `modelled` are never displayed identically.
3. A metric the setup cannot support returns `unavailable` with a reason, never a low-confidence
   guess.
4. Never widen a tolerance or lower an fps floor to make a feature appear to work.
5. `confidence` stays `'uncalibrated'` until there is real validation data. Adding metrics does not
   earn calibration.

## Verify

1. `npx tsc -b --noEmit` passes.
2. `npm run build` succeeds; main bundle still ~134 KB gzip.
3. Unit tests on: the spin model against hand-computed cases, the smash gate at 1.51/1.52/1.7, and
   the club-speed fps floor at 60/120/240.
4. A DTL clip returns `unavailable.launch_angle` and does **not** emit a launch angle.
5. A synthetic shot with impossible ball/club speeds is rejected, not scored.
6. Every route loads with no blank screen and no console error.
7. Report each new metric with its `derivation`, valid angles, and fps floor.
8. List anything you could not verify rather than marking it done.
