# Course generation: routing intelligence, not procedural holes

> **SCOPE LOCK.** The `/sim` course generator and data model only. Do not touch the real-course
> catalog, GPS, or the main bundle.

The brief is right about the goal and right about the failure mode. This document turns it into
something buildable, and names the two places where the current architecture can't deliver it yet.

---

## The core problem with the current generator

Today a hole is authored, then `terrain.ts` grows terrain around it. The brief asks for the
opposite — *"holes built around the land, rather than the land generated around the holes"* — and
that is the correct instinct. It is also a genuine architectural change, not a tuning pass.

**Invert the pipeline:**

```
1. Generate the property   → a large heightfield, coastline, water table, rock, vegetation zones
2. Read the land           → find ridges, valleys, natural greensites, forced-carry gaps, vistas
3. Route 18 holes over it  → pick tees and greensites that use what the land already does
4. Refine each hole        → widths, hazards, green complex, driven by the land under it
5. Emit the course JSON    → same schema the simulator already plays
```

Step 2 is the piece that doesn't exist and is the whole difference between "procedural golf course"
and "designed golf course." Build it as `src/lib/sim/gen/readLand.ts` — a scorer that walks the
property heightfield and ranks candidate greensites and tee positions:

- **Greensite quality** — a natural bench or shelf, a punchbowl, a promontory, a plateau above a
  fall-away. Score by local flatness surrounded by interesting relief.
- **Tee quality** — elevated, with a view, ideally above the landing zone.
- **Natural hazard lines** — where water already collects, where rock already breaks the surface,
  where a ravine already crosses.
- **Vista score** — how much of the property (and ocean/mountain backdrop) is visible from a point.

A hole is then *found*, not placed: pick a good tee and a good greensite roughly the right distance
apart, and let the land between them determine what kind of hole it is.

---

## The hole-identity system

The brief's list of concepts is the right vocabulary. Encode it as a **catalogue of hole archetypes**,
each with the land conditions it requires. The router matches archetypes to terrain rather than
picking randomly.

```ts
type Archetype = {
  id: 'cliffside-par3' | 'drivable-par4' | 'valley-par5' | 'ridge-fairway'
    | 'split-fairway' | 'punchbowl' | 'blind-approach' | 'cape-hole'
    | 'amphitheatre-green' | 'forced-carry' | 'forest-corridor';
  par: 3|4|5;
  yardage: [number, number];
  requires: {                         // the land must already do this
    tee?: 'elevated'|'level'|'below';
    between?: 'ravine'|'water'|'rising'|'falling'|'ridge'|'flat';
    greensite?: 'bench'|'promontory'|'punchbowl'|'plateau'|'island';
    minRelief?: number;
  };
  memorableBecause: string;           // required. If it can't be filled, it isn't an archetype.
};
```

**The `memorableBecause` field is not documentation — make it a hard requirement.** Every generated
hole must be able to answer the brief's own question. A hole whose answer is "it's a par 4 with
bunkers" fails generation and gets re-routed.

### Composition quota, enforced per course

The brief's 3/3/3/3/9 split is the most useful constraint in it, because it prevents every hole
shouting. Enforce it as a **hard check after routing, before emitting**:

| Role | Count (18) | Rule |
|---|---|---|
| Signature | 3 | Highest combined vista + drama score. Never adjacent. |
| Scenic | 3 | Highest vista, lower drama. |
| Strategic | 3 | Highest option-count score (see below). |
| Risk/reward | 3 | Aggressive line saves ≥ 0.4 strokes and fails ≥ 25% of the time. |
| Supporting | 9 | Everything else, and they must be genuinely quieter. |

A routing that can't hit the quota is rejected and re-rolled with a different seed. **Report the
rejection rate** — if it's above ~40%, the land generator isn't producing enough variety and that's
the thing to fix, not the quota.

---

## Strategy has to be measurable, or it isn't strategy

This is where most procedural golf falls down: bunkers get scattered and called "strategic." The
brief asks the right question — *"what shot do I want the player to attempt, and what happens if they
miss?"* — so make the generator answer it numerically.

**Build a shot-value evaluator.** Sample candidate landing zones across the fairway. For each,
compute expected strokes to hole out, using the club database's real dispersion for a reference
player. Then:

```
optionSpread = strokesFromSafeLine − strokesFromAggressiveLine
riskCost     = P(hazard | aggressive line, that player's dispersion)
```

- A hole is **strategic** when two or more landing zones sit within ~0.15 strokes of each other but
  demand different shots. Genuine choice.
- A hole is **risk/reward** when `optionSpread ≥ 0.4` and `riskCost ≥ 0.25`.
- **A bunker that changes neither number is decoration.** Delete it or move it until it does. Run
  this as a post-pass over every generated hole and report how many bunkers were removed — that
  number is the honest measure of whether the bunkering is designed or scattered.

This is also what makes a drivable par 4 work: at ~310 yards the aggressive line has to be worth
about half a stroke and fail about a third of the time. Those aren't vibes, they're the numbers that
produce the feeling.

---

## Rhythm: score the sequence, not just the holes

18 individually good holes make a mediocre course. After routing, score the *sequence* and re-route
if it fails:

- No three consecutive holes sharing length band, direction, or openness.
- Consecutive holes must alternate dogleg direction (already enforced in the current data — 13 of 13).
- Par 3s spread across the round, never adjacent.
- An "exhale" hole immediately after each signature hole.
- Wind direction (from the environment) must change relative to play at least 6 times per nine —
  otherwise every hole plays the same in the same breeze.
- Open ↔ enclosed alternating at least 5 times per nine.

---

## Green complexes

The current model — radius, tiers, slope percentage — is too thin for what the brief describes.
Replace it with a small heightfield per green, generated from a set of named forms:

```ts
type GreenForm = 'bench'|'punchbowl'|'shelf'|'crowned'|'two-tier'|'redan'|'thumbprint';
type GreenComplex = {
  form: GreenForm;
  falseFront?: boolean;
  backstop?: boolean;
  runoffs: ('front'|'left'|'right'|'back')[];
  collection: ('left'|'right'|'back')[];
  pinZones: { id: 'front'|'middle'|'back'; x: number; y: number;
              difficulty: 1|2|3; note: string }[];   // exactly three, always
  defaultPin: 'front'|'middle'|'back';
};
```

**The rule that makes greens matter: a green must reward one approach angle over another.** After
generating, verify it — simulate approaches from the left, centre and right of the fairway and
confirm expected putts differ by at least 0.15 between the best and worst angle. If they don't, the
green is decorative and gets regenerated. That single check is what connects the green to the tee
shot, which is the whole point of strategic architecture.

---

## Bunkers with shape

Ellipses can't deliver what the brief asks for. Extend the schema — the simulator already supports
`polygon` hazards, they just aren't authored.

Generate outlines by taking a base ellipse and perturbing the radius with low-frequency noise, then
add one or two lobes. Classify by role, and let role drive form:

| Role | Form |
|---|---|
| Pot | 4–7 yd across, near-vertical revetted face, deep. Sparingly — Dye's punctuation. |
| Greenside | Follows the green edge, shallow on the approach side, deeper on the short side |
| Fairway | Broad, angled to the aggressive line, catching a specific miss |
| Waste | Large, irregular, shallow, unraked — a texture not a penalty |
| Cross | Spans part of the corridor — **must always leave a bail-out** |

That last rule is MacKenzie's eighth principle and it is the one most easily broken by a generator.

---

## Environment first

Nothing is placed until the ecosystem is chosen, and everything inherits from it — terrain
character, vegetation species, palette, wind, turf type, sky, backdrop, even the bunker style.

```ts
type Environment = {
  id: 'california-coast'|'florida-oceanfront'|'high-desert'|'pacific-northwest'|'links'|'parkland';
  terrain: { reliefFt: [number,number]; character: 'dunes'|'ridges'|'benches'|'flat-water'|'canyons' };
  water: 'ocean'|'lakes'|'wetland'|'creek'|'none';
  vegetation: VegSpec[];
  palette: Palette;
  wind: { meanMph: number; prevailingDeg: number; variability: number };
  backdrop: 'ocean-horizon'|'mountain-range'|'forest-wall'|'city-skyline'|'dunes';
};
```

**A palm may never appear on the high-desert course.** Enforce it in code — one wrong species is the
strongest tell that a course was generated rather than designed.

---

## Set pieces — rare by construction

Island green, waterfall, split fairway, tunnel of trees, massive exposed ridge. **Cap at 2 per 18 and
never adjacent.** Make the cap a hard constant, not a probability — probabilistic rarity eventually
rolls three in a row, and that's when a course stops feeling special and starts feeling silly.

---

## The driving range

Same generator, one hole's worth of land, but framed for the view rather than for play.

- Hitting line, `bearingDeg`, and target greens at authored distances — the format already supports
  this in `RangeVenue`.
- **Site it for the backdrop.** Use the vista scorer: pick the spot on the property with the highest
  visible backdrop score and aim the hitting line straight at it. That's the whole trick — a range is
  a flat rectangle, so the view is the entire experience.
- Target greens with flags at 50/100/150/200/250, real bunkers, and a shaped landing area so shots
  land on something rather than a plane.
- **A full practice green with three pin positions**, generated by the same `GreenComplex` system as
  the course greens — same forms, tiers, false fronts, runoffs. Not a flat disc with a flag on it.
  The three pins follow the course convention: **front** (difficulty 1, safe), **middle**
  (difficulty 2, everyday), **back** (difficulty 3, tucked and two clubs more than it looks).
  Practising to a real green complex is the point; practising to a plane teaches nothing.
- Reuse the club database dispersion to draw the player's own shot cone on the range surface.

---

## Where this collides with the renderer

Two honest constraints, both from `PROMPT-3d-renderer.md`:

1. **A full-property heightfield is much bigger than one hole corridor.** Generating and storing 18
   holes plus surroundings at 1 m resolution is tens of megabytes. Generate the property at coarse
   resolution (4–8 m) for routing, then refine to 1 m only within the corridor of the hole being
   played. Never hold more than the current hole plus neighbours in memory.
2. **The brief asks for "$100M resort" visual quality.** That is an asset-production target, not a
   code target. The generator's job is good *bones* — sightlines, terrain integration, hole variety.
   Textures, real tree models and shaped bunkers are art, and no amount of generator sophistication
   substitutes for them.

## Verify

1. `npx tsc -b --noEmit` passes; main bundle unchanged.
2. Generate 20 courses from different seeds and report: routing rejection rate, quota compliance,
   bunkers deleted as non-strategic, and greens regenerated for failing the angle test.
3. **No two of the 20 share a signature-hole concept in the same position.**
4. Every hole has a non-empty `memorableBecause`.
4b. Every green — course and range — has exactly three pin zones, all inside the putting surface,
    spanning difficulty 1/2/3, and the back pin genuinely plays longer than the front.
5. Zero species-environment violations across all 20.
6. Set pieces ≤ 2 per course, never adjacent.
7. All 20 pass `scripts/validate-course.mjs`.
8. Report anything you could not verify rather than marking it done.
