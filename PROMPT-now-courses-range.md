# Run now: course coverage, the club database, range polish

Autonomous. No approval gates. Three workstreams — one background build, two code streams that run
while it goes.

> Run in a terminal on the Mac with network access. The green build needs Overpass and USGS.

## Current state, measured just now — do not redo this work

| | |
|---|---|
| Main bundle | **134 KB gzip** (was 331 KB — target met) |
| Route chunks | Split correctly; `Green3DViewer` is its own chunk |
| Blank-page bug | Fixed at `2ce13a3` |
| Typecheck | Passes |
| Catalog | 14,254 courses (cleaned from 14,441) |
| Launch metrics | Built, and correctly carry `confidence: 'uncalibrated'` |
| Range | `src/routes/RangeView.tsx`, `src/lib/range/*` — sessions, dispersion, shot history |
| **Green mesh coverage** | **149 of 14,254 — 1%** |
| **Club database** | **Does not exist** |

## Standing rules

Push to `main` without asking, but only when that workstream's Verify list fully passes. One commit
per workstream. `git pull --rebase` before pushing. No force-push. If a check fails, that workstream
pushes nothing and says so in the report — it must not block the others.

After the final push: build from a clean checkout, load every route, confirm none is blank and the
console is clean. If it fails, revert that commit, push the revert, and report it.

---

# STREAM 1 — Course coverage (background, start first)

**149 greens of 14,254 courses is 1%.** This is the biggest gap in the product. Everything else in
the app assumes course data that mostly isn't there.

Meshes average **277 KB**. Anything under `public/` goes into git *and* every Vercel deploy forever —
1,000 greens would be 166 MB, 3,000 would be ~500 MB.

**So: build to `.greens-out/`, add it to `.gitignore`, commit nothing but `manifest.json`.** The
hosting decision gets made afterward with real counts and sizes in hand. Add `--out-dir` to
`scripts/build-green-meshes.mjs` if it isn't there yet.

`scripts/run-green-bulk-shards.sh` already shards cleanly (`--shard=i/n`, `--skip-existing`,
`--deadline-ms`, 429 backoff with jitter). Parameterise `SHARDS`, set `DEADLINE_MS=3300000` (55 min).

**Concurrency: measure, don't assume.** The four Overpass endpoints are volunteer-run and rate-limit
hard. Start at 5 shards, measure 5 minutes. Under 10% 429s → go to 10 and measure again. Over 25% →
scale back. Ten shards will not be twice five. **Never shorten the existing backoff** — getting
TeeReady's User-Agent blocked costs more than the hour gains.

Prioritise by likely use: courses in the catalog with complete hole data first, then by proximity to
population centres. A green for a course nobody opens is wasted build time.

**Verify:** greens built / failed / skipped · wall-clock · greens per minute · 429 rate · **the shard
concurrency that actually maximised throughput** · `manifest.json` regenerated with a matching count
· 3 new greens spot-checked for hole numbers 1..N with no gaps and geometry inside the course
footprint · confirm nothing new landed in `public/`.

---

# STREAM 2 — The club database and the GPS caddie link

**This is the missing half of the product.** The range records shots and draws dispersion, but
nothing learns from it. `clubDatabase`, `clubStats`, `learnedCarry` — none of them exist anywhere in
`src/`.

Right now the loop dead-ends: a golfer hits 20 shots, sees a pretty plot, and the app forgets. Your
own spec describes the loop as *practice → measure → improve → play → GPS learns*. Stream 2 is the
part that closes it, and it's what separates TeeReady from a GPS app with a yardage table.

## 2.1 — `src/lib/clubs/database.ts`

Per club, accumulated across every range session:

```ts
type ClubStats = {
  club: string;
  shotCount: number;
  avgCarryYd: number;
  carryRangeYd: [number, number];   // ~1σ, the "normal range"
  bestCarryYd: number;
  avgLateralYd: number;             // + = right
  dispersionYd: number;
  avgBallSpeedMph: number | null;
  avgClubSpeedMph: number | null;
  avgLaunchDeg: number | null;
  confidence: LaunchConfidence;     // inherited, never upgraded
  updatedAt: number;
};
```

Rules that matter:

- **Confidence is inherited and never improves by aggregation.** Averaging 50 `uncalibrated` shots
  gives an `uncalibrated` average. More data reduces *noise*, not *bias* — if the measurement is
  systematically off, the average is confidently off. Do not let sample size promote confidence.
- **Weight by shot confidence.** A low-confidence shot must not move the average like a clean one.
- **Discard outliers explicitly and visibly.** A shanked 60-yard drive shouldn't drag the average,
  but silently dropping data is worse — show "3 shots excluded as outliers" and let the player
  restore them.
- Follow the existing local-first pattern (`src/lib/range/storage.ts`). Anything over ~100 KB goes to
  IndexedDB, not `localStorage`.

## 2.2 — Feeding the GPS caddie

Where the GPS view already knows distance-to-hazard and distance-to-pin, use the club database to
make a recommendation:

> "Bunker starts at 230. Your driver carries 224 on average, range 218–230 — you'd need to catch it
> flush. 3-wood at 205 leaves a full wedge in."

**The honesty gates, all required:**

1. **Minimum sample.** Under ~10 measured shots for that club, the caddie stays quiet. Do not advise
   off three swings.
2. **Say what it's based on.** "Based on 23 measured drives averaging 224 yards" — never a bare
   number presented as fact.
3. **Carry the uncalibrated caveat through.** These distances come from a phone camera with an
   assumed spin rate, not a launch monitor. The recommendation must not read as measured truth.
   Once shots are validated against a real launch monitor, the caveat can be dropped — not before.
4. **Use the range, not just the mean.** "Carries 224" invites a golfer to treat 224 as reliable.
   "218–230" is the honest shape of the data and is what actually informs a club choice.
5. Never recommend the aggressive line off low-confidence data. When uncertain, the advice is the
   safer club.

## 2.3 — Fall back to the profile

`GolfPlayerProfile` already stores `sevenIronYards`, `driverYards` and bag distances the player typed
in. When measured data is thin, use those — labelled as self-reported. Measured data supersedes them
once the sample threshold is met, and the UI should show which source is in play.

**Verify:** typecheck · build succeeds, main bundle still ~134 KB · unit tests on the aggregation
including weighting, outliers, and the confidence-inheritance rule · caddie stays silent below
threshold (test it) · every route loads, no blank screens.

---

# STREAM 3 — Range polish

Runs after Stream 2's types exist. Keep it small.

1. **Session summary** on end, in the format from the spec: average carry, best carry, average ball
   and club speed, average direction, dispersion. Feed it into the club database.
2. **Progress over time** — carry and dispersion per club across sessions. This is the reason to
   come back; a single session's plot isn't.
3. **Manual shot entry.** The range should work with no camera at all — a golfer types "7-iron, 155"
   and gets dispersion and a club database from it. Mark those `source: 'manual'` and keep them
   distinct from measured shots everywhere they surface.

That last one matters more than it sounds: it makes the range useful **today**, for every golfer,
without depending on the launch monitor being accurate. The camera then becomes an upgrade to a
feature that already works rather than a prerequisite for it.

**Verify:** typecheck · build · main bundle unchanged · manual and measured shots visibly distinct
throughout · every route loads.

---

# Final report

1. Commit SHAs pushed, per stream.
2. Green coverage before and after — count and % of 14,254 — plus total size in `.greens-out/` so the
   hosting call can be made.
3. Optimal shard concurrency and greens/minute.
4. Main bundle gzip before and after.
5. Club database: metrics tracked, and confirmation the confidence-inheritance rule is enforced in
   code, not just documented.
6. Any stream that failed and pushed nothing.
7. **Everything you could not verify, listed rather than marked done.**
