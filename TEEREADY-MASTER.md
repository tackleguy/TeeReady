# TeeReady — master build document

Everything in one place. State is measured, not remembered — figures below were checked against the
repo at `34ab5fd`.

**How to run this:** paste one workstream at a time. Each ends with a Verify list. Do not paste the
whole document — a single agent given all of it produced a 46-file commit that blanked the app
(`836cb88`), which is why every workstream below is scoped and gated.

---

## 1. Where the project actually is

| | |
|---|---|
| HEAD | `34ab5fd`, in sync with origin |
| Main bundle | **134 KB gzip** (was 331 KB) |
| Typecheck | Passes |
| Catalog | 14,254 courses (cleaned from 14,441) |
| **Green mesh coverage** | **149 — about 1%** |
| Launch monitor | Built. `confidence: 'uncalibrated'` throughout |
| Range | Sessions, dispersion, shot history |
| Club database | **New, uncommitted** — `src/lib/clubs/database.ts` |
| Venues / ranges | **New, uncommitted** — `src/lib/venues/types.ts` |
| Course data pack | **New, uncommitted** — `src/data/venues.*.json` |

### Uncommitted right now

```
src/lib/clubs/database.ts        club database + caddie advice
src/lib/venues/types.ts          course and driving-range types
src/data/venues.scorecards.json  13 courses, real yardages
src/data/venues.courses.json     157 courses, verified geometry
src/data/venues.user.json        empty — your own venues land here
scripts/build-venue.mjs          venue builder, tested
COURSE-DATA-README.md            provenance for the data pack
```

Review and commit these before starting any workstream below.

---

## 2. The rules — every workstream inherits these

These exist because each was violated at least once today.

1. **The LLM never produces a number.** Deterministic code measures and models. The model writes
   prose about numbers it was handed, and a validator rejects any numeral not present in its input.
2. **`measured` and `modelled` are never displayed identically.** Confidence says how sure;
   derivation says where it came from at all.
3. **A value that can't be produced returns `unavailable` with a reason** — never a low-confidence
   guess.
4. **Never lower a threshold to make a feature appear to work.** `impactMetricMinFps` went 60 → 30
   in `dfab5ac`, which didn't improve the data, it just silenced the warning. If something can't be
   measured, say so.
5. **Aggregation reduces noise, not bias.** Fifty `uncalibrated` shots average to an `uncalibrated`
   average. Sample size and calibration are separate axes.
6. **Don't regress the accessibility work.** Contrast audit passes, 44px targets, no text under
   11px, no `maximum-scale`/`user-scalable=no`, no webfont network request.
7. **Don't regress the bundle.** Main stays ~134 KB gzip. Nothing heavy loads outside its own route.
8. **Push only when that workstream's Verify list fully passes.** One commit per workstream, no
   force-push, `git pull --rebase` first. If a check fails, push nothing and report it.
9. **Blank-page check before every push:** build, serve, load all twelve routes. An empty route is a
   failed check.

---

## 3. WORKSTREAM A — Course coverage (background, ~55 min)

**149 greens against 14,254 courses.** The biggest gap in the product.

Meshes average **277 KB**. Anything under `public/` goes into git *and* every deploy, permanently —
1,000 greens is 166 MB, 3,000 is ~500 MB.

**Build to `.greens-out/`, add it to `.gitignore`, commit only `manifest.json`.** Add `--out-dir` to
`scripts/build-green-meshes.mjs` if absent. The hosting decision gets made afterward with real
numbers in hand.

`scripts/run-green-bulk-shards.sh` already shards correctly (`--shard=i/n`, `--skip-existing`,
`--deadline-ms`, 429 backoff with jitter at line 265). Parameterise `SHARDS`, set
`DEADLINE_MS=3300000`.

**Concurrency is measured, not assumed.** The four Overpass endpoints are volunteer-run. Start at 5
shards, measure 5 minutes. Under 10% 429s → try 10 and measure again. Over 25% → scale back. Ten
will not be twice five. **Never shorten the backoff** — a blocked User-Agent costs more than the hour
gains.

Prioritise courses with complete hole data, then by proximity to population. A green nobody opens is
wasted build time.

**Verify:** built / failed / skipped · wall-clock · greens per minute · 429 rate · **the concurrency
that actually maximised throughput** · `manifest.json` count matches file count · 3 new greens
spot-checked for holes 1..N with no gaps and geometry inside the footprint · nothing new in
`public/`.

---

## 4. WORKSTREAM B — Wire in the club database

`src/lib/clubs/database.ts` exists but nothing calls it. This closes the loop the product is built
around: practice → measure → the caddie knows how far you actually hit it.

**Fix first — a bug I introduced:** `shotFromLaunch()` reads metric ids `ballSpeed`, `clubSpeed`,
`launchAngle`, `lateral`. The real ids are `ball_speed`, `launch_direction`, `carry`, `total`.
Correct it, and export the ids as one const object so the mismatch can't recur.

Then:

- Feed every completed range shot through `shotFromLaunch()` into the database.
- Surface `compareToAverage()` on the launch result — *"7 yards farther than your average of 224,
  across 23 shots."* This is the comparison the original spec asked for and the monitor had no
  history to make.
- Wire `clubForCarry()` into the GPS view where distance-to-hazard is already known.

**The gates are already coded in `database.ts` — do not weaken them.** `MIN_SHOTS_FOR_ADVICE = 10`,
confidence inherited and never upgraded by volume, outliers excluded via median-absolute-deviation
and surfaced rather than dropped silently, and `clubForCarry` recommending off the top of the carry
range when a hazard is in play, because half of all shots beat the mean by definition and that's the
half that finds the bunker.

**Verify:** typecheck · build, bundle still ~134 KB · unit tests on weighting, outlier exclusion and
confidence inheritance · caddie provably silent under 10 shots · every route loads.

---

## 5. WORKSTREAM C — Launch metrics: club speed, smash gate, modelled spin

### C1 — Add `derivation` to `LaunchMetric`

```ts
export type MetricDerivation = 'measured' | 'modelled';
```

`measured` comes from pixels — ball speed, launch angle, direction, club speed. `modelled` comes from
physics plus assumptions — carry, total, apex, spin. `carry` and `total` become `modelled`; they
always were. Modelled values are visually distinct in the UI, everywhere, not in a footnote.

### C2 — Camera setup

| Setup | Ball speed | Launch angle | Direction | Club speed |
|---|---|---|---|---|
| **Corner** (~45° off line, 6–10 ft back) | ✅ | ✅ | ✅ | ✅ |
| DTL (behind, on the line) | ⚠️ ball recedes | ❌ foreshortened | ✅ best | ⚠️ |
| Face-on | ✅ best | ✅ best | ❌ | ✅ best |

**Corner is required.** At ~45° both vertical and lateral components project onto the sensor at
measurable magnitude, so one camera can decompose all three. Face-on beats it on any single metric
but is blind to direction, which is half of what a golfer wants.

`corner.ts` assumes `CORNER_AZIMUTH_DEG`. **Estimate the actual azimuth from the setup frame** rather
than trusting the phone to be at exactly 45°, and propagate its error — a 10° azimuth error is a
large direction error.

DTL returns `unavailable.launch_angle` with a reason. Never a guess.

### C3 — Club speed

New `club_speed`, `derivation: 'measured'`. Track the club head over the last ~100 ms before impact
and fit velocity across the pre-impact frames, reusing the ball-diameter scale calibration.

**fps floors are hard gates.** A 100 mph club head travels 75 cm/frame at 60 fps (hopeless),
37 cm at 120 (marginal), 19 cm at 240 (workable). Below 120, `club_speed` is `unavailable` with the
fps named. Do not lower this later.

### C4 — Smash factor as a consistency gate

`smash = ball_speed / club_speed`. The COR limit caps a conforming driver near **1.50**.

- Above 1.52 on any club: **reject the shot.** A smash of 1.7 isn't a great strike, it's proof one of
  the two measurements is wrong.
- Outside the plausible band (driver 1.35–1.50, irons 1.25–1.40, wedges 1.10–1.30) but under the
  ceiling: keep, flag, exclude from the club database.

Log the smash distribution across shots. A systematic bias in it is calibration error, which is
exactly what you want to know before validation day. This is the best free validator in the system —
two independent measurements that must agree.

### C5 — Spin: modelled, never measured

A phone camera cannot see spin on an unmarked ball. Estimate it from club, launch angle and club
speed, in one documented function with named constants.

**The uncertainty is the point.** A driver spin estimate is realistically **±800 rpm**, and carry
moves roughly a yard per 100 rpm near optimum — so **spin alone puts ±8 yards on carry** before any
other error source.

1. `spin` carries `rangeRpm: [low, high]`, never a bare point value.
2. Assumption string: *"Estimated from club and launch angle. Not measured — a phone camera cannot
   see ball spin."*
3. **`carry` widens to include the spin band.** Carry cannot look more certain than the spin behind
   it. Show it as a range.
4. Display as `~2,600 rpm (est. 1,800–3,400)`. Never bare.

**Verify:** typecheck · build, bundle unchanged · unit tests on the spin model against hand-computed
cases, the smash gate at 1.51/1.52/1.7, and the club-speed floor at 60/120/240 · a DTL clip emits no
launch angle · an impossible ball/club speed pair is rejected, not scored · every route loads.

---

## 6. WORKSTREAM D — Venues, ranges, and the course data pack

`src/lib/venues/types.ts` and the data pack are in place. Wire them up.

**Ranges are not courses.** No holes, no par, no scorecard — a hitting line, a bearing, and distance
markers. Those markers are a real-world scale reference in frame, worth more than software
calibration.

**Limited-flight balls matter.** Most ranges use them; they read 10–20% short. Feeding that into the
club database silently teaches the caddie the golfer hits it shorter than they do, then clubs them up
into trouble on the course. `rangeAffectsDistanceTruth()` exists — mark those sessions and keep them
out of the distance model, or flag them clearly.

### Course data tiers — carry these to the UI

| Tier | Count | Yardage source | Present as |
|---|---|---|---|
| 1 | 13 | Official scorecard | Real yardages |
| 2 | 157 | OSM tee→green geometry | "Measured from satellite map — not an official scorecard" |
| 3 | rest | Par template | Not this course's card at all |

Tier 2 straight-line distances run **short** of card yardage on any dogleg. Never label them
scorecard numbers.

Two entries carry `nameNeedsReview: ["nine-combination-parse"]` — `1 At Ponkapoag Golf Club` and
`2 At Ponkapoag Golf Club`. Almost certainly two nines of one facility, mangled on import.
**Flagged, not renamed** — a confidently wrong name is worse than an obviously broken one.

`scripts/build-venue.mjs` adds courses and ranges with validation, into `venues.user.json` so a
catalog rebuild can't wipe them. Its `region-vs-coords` rule catches the real bug from the catalog:
a British Columbia course labelled "Qualicum Beach, NY". It rejects rather than warns.

**Verify:** typecheck · builder `--validate` passes on the shipped pack · tier shown in the UI on
every screen with yardages · limited-flight sessions excluded from the distance model · every route
loads.

---

## 7. WORKSTREAM E — Putting circles on the green view

Concentric rings around the pin showing where a ball has to finish to be a realistic two-putt, and
where three-putt risk takes over. It turns an approach shot from "hit it close" into a target with a
size — and it's the natural payoff for the 3D green meshes already being built.

### The rings

| Ring | Meaning |
|---|---|
| **Make circle** | Inside this, one-putt is the likely outcome |
| **Two-putt circle** | Comfortable two-putt territory — the actual approach target |
| **Three-putt zone** | Beyond the outer ring, three-putt risk climbs sharply |

Draw them on the green view (`Green3DViewer` / `GolfGreen3DLayer`) as ground-projected rings that
follow the contour mesh, not flat circles pasted on screen. A ring that ignores a two-tier green is
worse than no ring, because the whole point is that being above the hole on a slope is not the same
distance as being below it.

### Where the radii come from — this is the part to get right

**Do not hardcode tour numbers and present them as the player's.** Three sources, in priority order,
with the active one always shown:

1. **The player's own putting history.** Rounds already record putts per hole. Once there are enough
   holes with a recorded first-putt distance, fit the player's actual two-putt and three-putt
   thresholds. This is the honest, personal answer and it gets better with every round.
2. **Handicap-banded baseline.** Until there's enough personal data, use a baseline indexed to the
   player's handicap. A 20-handicap's three-putt zone starts far closer than a scratch player's —
   using one set of rings for everyone makes the feature wrong for almost everybody.
3. **Published averages** as the last-resort default, clearly labelled as not the player's own.

**Source the baseline constants from real putting research and cite them in the file** — Broadie's
strokes-gained work is the standard reference. I have not put numbers in this document because I'd be
recalling them rather than reading them, and a putting model built on half-remembered constants is
exactly the failure mode the rest of this document exists to prevent. Look them up, put them in one
named table with the citation, and never scatter them.

### Rules

- Label which source is active: *"Based on your last 42 measured first putts"* vs *"Baseline for a
  14 handicap — hit more rounds to personalise this."*
- Minimum sample before switching to personal data, same principle as `MIN_SHOTS_FOR_ADVICE`.
- Rings are `modelled`, never `measured` — they follow the `derivation` rule from §5.
- **Slope changes the answer.** If green contour data exists for that hole, the rings should be
  asymmetric: uphill putts are easier to leave close than downhill. If contour data is missing, draw
  symmetric rings and say the slope isn't factored in — don't silently pretend flat.

### Tie it to the approach shot

The real value is upstream. Combine the two-putt circle radius with the player's dispersion for the
club in hand — already in `ClubStats.dispersionYd` — and the caddie can say something no yardage app
can:

> "Your 8-iron scatters about 18 yards. Your two-putt circle here is 24 feet. Aim at the centre of
> the green, not the pin — from the short side you're leaving yourself a three-putt."

That is the whole product thesis in one sentence: measured practice data changing an on-course
decision.

**Verify:** typecheck · build, bundle unchanged · rings follow the contour mesh on a green with known
slope · a player with no putting history gets the handicap baseline **and is told so** · a player
with history gets personal radii · rings marked `modelled` · every route loads.

---

## 8. WORKSTREAM F — GPS reliability

`src/hooks/useGpsWatch.ts`, 119 lines. Measured gaps.

1. **`wakeLock` appears 0 times in the entire codebase.** The screen sleeps, the browser suspends
   the watch, the round dies. `PRODUCT.md` says *"losing a live round breaks trust"* and nothing
   prevents it. Request `navigator.wakeLock.request('screen')` while a round is active, **re-acquire
   on `visibilitychange`** (the lock is released when the tab hides and is not restored), release at
   round end, degrade gracefully where absent.
2. **No accuracy filtering.** Every fix is accepted, so a 100 m fix moves the yardage like a 5 m one
   — the number jumps 30 yards while the player stands still. Reject or soften beyond ~25 m; hold the
   last good position and mark it approximate.
3. **No error recovery.** Both handlers set a string and stop. `PERMISSION_DENIED` should explain how
   to re-enable and not retry; `POSITION_UNAVAILABLE` and `TIMEOUT` should retry with backoff. Clear
   stale errors on the next good fix. Separate "searching", "signal lost, showing last known", and
   "GPS off".
4. **Backgrounding.** iOS Safari suspends `watchPosition` when hidden. On return: re-establish, re-
   acquire the lock, mark the position stale until a fresh fix. Never show a minutes-old position as
   current.

**Verify:** typecheck · build · simulated poor fix doesn't move the yardage · all three error paths
reported · every route loads. Note that the screen-lock test needs a real phone — if it wasn't run,
say so.

---

## 9. The validation debt

Everything measured by the launch monitor is `uncalibrated`, and **a confidence score you invented is
itself fabricated data.** "146 mph, 91% confidence" means nothing unless 91% came from measured error
against known truth.

Before any number is presented as absolute:

1. Buy an hour on a real launch monitor — TrackMan, GCQuad, Foresight. A fitting studio will sell it.
2. Record 50+ shots on the phone and the reference device simultaneously, across clubs and across
   good and bad strikes.
3. Compute error distribution per metric — mean, standard deviation, worst case.
4. **Derive the confidence model from that distribution.**
5. Publish it honestly: "Ball speed within ±4 mph of a TrackMan in our testing. Carry is estimated."

Until then everything stays labelled **uncalibrated — for relative comparison only**. Relative is
genuinely useful: a golfer can see today's drive beat yesterday's without knowing absolute truth.
Absolute numbers without validation are a claim you can't support, and the feature is called a launch
monitor.

**Only after this dataset exists may `LaunchConfidence` gain a second member.** Adding metrics does
not earn calibration.

---

## 10. Still open, not yet specified

- **No tests exist anywhere in the repo.** `swingPlan.ts` and now `clubs/database.ts` both hold logic
  that must be right with the AI switched off, with zero coverage.
- **`impactMetricMinFps` was lowered 60 → 30** in `dfab5ac`. The right fix is per-metric, which the
  schema already supports: tempo, top-of-backswing and setup work at 30 fps; impact-position metrics
  don't. Keep those at 60 and let the rest run at 30.
- **`contact@teeready.app` is a placeholder** in the weather User-Agent. MET Norway requires a
  reachable contact.
- Vercel env vars, custom domain, Supabase row-level security, Overpass rate limits, Unsplash
  licensing — all need you or a dashboard.

---

## 11. Final report format

For any workstream run:

1. Commit SHAs pushed.
2. Main bundle gzip before and after.
3. Every check in that workstream's Verify list, with results.
4. **Everything you could not verify, listed explicitly rather than marked done.**
