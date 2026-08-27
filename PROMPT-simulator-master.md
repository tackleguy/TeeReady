# TeeReady Simulator — designed courses, course designer, sim play

Hit into a net, the launch monitor measures the shot, the ball flies on a course you designed. Home
Tee Hero / FSX territory.

**Designed courses have one enormous advantage over the 14,254 real ones: they're fictional by
construction.** No OSM gaps, no wrong coordinates, no synthesized par templates, no provenance
tiers. What you author is what's true. Every data-integrity problem in the rest of TeeReady simply
doesn't exist here.

> **SCOPE LOCK.** Simulator only. Separate route, separate data. Do not touch the real-course
> catalog, the GPS view, or the weather layer. Nothing here loads outside `/sim`.

---

## The architecture call: 2D authoring, 3D generation

PGA 2K's designer is a full 3D terrain sculptor with splines, brushes, and object painting. Building
that in a browser is a multi-month project and it is **not** what makes a course fun to play.

**Author in 2D top-down plus an elevation profile. Generate the 3D from that data.**

A hole is: a centreline spline, a fairway width, an elevation curve along the centreline, hazard
polygons, and a green with tiers. That is enough to compute every shot outcome exactly — lie,
carry, roll, penalty, stance. The 3D view is then *derived* for looks, not authored for accuracy.

You get ~90% of the playable value for ~10% of the work, and — this is the part that matters — the
simulation is driven by the authored data, not by a mesh someone sculpted by eye. A ball that lands
in a bunker does so because it's inside the bunker polygon, not because it collided with geometry.

---

## 1. The course format

`src/data/courses/*.json`. Reference implementation attached: **`cedar-hollow.json`** — a complete,
validated 9-hole design, par 36, 3,518 yards from the back.

Coordinates are **local yards, not lat/lon**. `y` = downrange from the tee, `x` = lateral, positive
right. Elevation in feet relative to the tee. No geodesy, no projection — a designed course doesn't
live anywhere.

```jsonc
{
  "id": "cedar-hollow",
  "fictional": true,                    // always. Never present a design as a real course.
  "par": 36,
  "tees": [{ "name": "Back", "yards": 3518, "rating": 36.4, "slope": 128 }],
  "defaultWind": { "speedMph": 8, "fromDeg": 225 },
  "surface": { "fairwayFirmness": "medium", "greenSpeedStimp": 10.5 },
  "holesData": [{
    "number": 1, "par": 4, "handicap": 5,
    "tees": [{ "name": "Back", "yards": 412 }],
    "centerline": [[0,0],[2,180],[10,300],[18,412]],   // spline control points
    "elevationFt": [[0,0],[180,-3],[300,0],[412,6]],   // downrange → feet
    "widthYd": { "fairway": 38, "rough": 62 },
    "hazards": [
      { "type":"bunker","name":"right fairway","shape":"ellipse",
        "center":[22,255],"radiusYd":[9,14],"penaltyStrokes":0 },
      { "type":"water","shape":"ellipse","center":[26,500],
        "radiusYd":[18,22],"penaltyStrokes":1 },
      { "type":"ob","side":"left","fromYd":0,"toYd":445,"penaltyStrokes":1 }
    ],
    "green": { "center":[18,412], "radiusYd":15, "tiers":1, "slopePct":2.0 },
    "pin": [21,415],
    "designNotes": "Fairway bunker punishes the aggressive line right."
  }]
}
```

Hazards are `ellipse` or `polygon`. Ellipses cover most real bunkering and are far easier to author;
polygons exist for the shapes that need them.

### Validation — build this as `scripts/validate-course.mjs`

Cedar Hollow passes all of these. Any designed course must:

- Par 3 between 100–260 yd, par 4 between 280–500, par 5 between 460–650.
- Tee yardages strictly descending Back → Forward.
- Centreline final point within 25 yd of the stated hole yardage.
- Stroke-index handicaps a complete set — 1..17 odd for nine holes, 1..18 for eighteen, no repeats.
- Green centre coincident with the centreline endpoint; pin inside the green radius.
- No hazard overlapping the tee box.
- Total par matching the sum of hole pars.

Reject, don't warn. A course that fails validation is unplayable in ways that surface as weird
scoring three holes in.

---

## 2. The course designer

New route `/sim/design`. Lazy-loaded — nothing ships to any other route.

### Canvas

Top-down 2D, one hole at a time, on a yard grid.

- **Centreline** — click to place control points, drag to adjust. Catmull-Rom spline through them.
  Fairway and rough render as offsets of the spline at the configured widths, so a dogleg needs no
  special handling.
- **Hazards** — drop an ellipse, drag to size and rotate. Polygon mode for the awkward ones.
- **Green** — position, radius, tier count, slope percentage. Pin placeable anywhere inside.
- **Tees** — one marker per tee set; yardage computes from the spline automatically rather than
  being typed. Typed yardages drift from the geometry and then nothing agrees.

### Elevation

A second panel: a simple curve editor, downrange yards on the x-axis, feet on the y. Drag points.
This is the whole terrain system, and it is enough — elevation along the line of play is what
changes club selection. Cross-slope is a detail; treat it as a per-hole constant if you want it at
all.

### Live feedback while designing

This is what makes a designer usable rather than a drawing tool. As the hole is edited, show:

- **Carry requirements** to clear each hazard from each tee.
- **The player's own shot cone** for the club they'd hit, using `ClubStats.dispersionYd` from the
  club database. A designer who can see that their 250-yard carry bunker is unreachable for this
  player is designing a hole, not a picture.
- **Estimated difficulty** from the geometry: forced-carry length, landing-area width, hazard
  proximity to the ideal line.

### Persistence

Designs save to IndexedDB, export as JSON. Import validates before accepting. Bundled courses live
in `src/data/courses/` and are read-only in the editor — duplicate to edit.

---

## 3. The simulator

New route `/sim/play`.

### The loop

```
tee shot → measure → flight model → resolve landing → determine lie
   → next shot from that lie → ... → on green → putting → hole out
```

### Flight model

Extend `src/lib/launch/physics.ts` from carry/total into a stepped 3D trajectory: launch vector +
spin estimate + wind, integrated forward, terminated by intersection with the ground surface derived
from the elevation curve.

**The spin problem follows you here.** The simulator's ball flight is only as good as the spin
estimate, which is ±800 rpm — meaning where the ball finishes carries several yards of uncertainty
the player never sees. In a simulator that's acceptable, because the number isn't claiming to be a
measurement of the real world. **But do not let simulator use launder the estimate into looking
precise.** The shot readout still shows what was measured and what was modelled.

### Landing, roll, and lie

1. Compute carry from the flight model. Land the ball.
2. Roll: direction from slope and landing angle, distance scaled by surface firmness and descent
   angle. A high wedge stops; a low driver runs.
3. Determine lie by testing the final position against the authored geometry, innermost first:
   green → fairway → bunker → water → rough → OB.
4. Apply the lie to the *next* shot rather than fudging this one — rough reduces carry and increases
   dispersion, sand more so, and both should be visible to the player as a stated penalty before
   they swing.

### Putting

Don't require a putting stroke through the launch monitor — it's the least reliable measurement and
the most tedious to hit into a net. Offer both:

- **Auto-putt**, using the putting model from the green-reading work: distance to pin plus green
  slope and stimp gives an expected putt count.
- **Manual**, for players with a mat who want it.

### Scoring

Standard stroke play with hole-by-hole scoring, plus penalty accounting. Feed completed rounds into
the existing round history so simulator rounds and real rounds live together — **tagged distinctly**,
because a simulator score is not a real score and a handicap built from both is meaningless.

---

## 4. What connects it to the rest of TeeReady

- **The club database is the shot engine.** When the launch monitor is unavailable or the player
  wants a quick round, `ClubStats` supplies carry and dispersion for a simulated swing. The
  simulator works with no camera at all.
- **Range practice teaches the simulator.** More measured shots → better dispersion model → more
  honest simulated outcomes.
- **The designer uses real dispersion** for its shot cones, as above.
- Sim rounds stay tagged and never contribute to a handicap index.

---

## 5. Build order

1. Format + validator + Cedar Hollow loading and rendering read-only. **Prove the data model before
   building an editor for it.**
2. Simulator play loop with manual shot entry (type "7-iron, 155") — playable end to end, no camera.
3. Flight model, roll, and lie resolution.
4. Launch monitor wired in as the shot source.
5. Designer: centreline, widths, hazards, green.
6. Designer: elevation, live feedback, export/import.

Steps 1–2 give a playable round. Everything after is improvement on something that already works.

---

## Rules

1. `fictional: true` on every designed course, surfaced in the UI. Never present a design as a real
   course, and never mix designed courses into the real catalog.
2. Simulator rounds are tagged and never feed a handicap.
3. Measured and modelled stay visually distinct, exactly as in the launch monitor.
4. Nothing in `/sim` loads on any other route. Main bundle stays ~134 KB gzip.
5. Courses that fail validation are rejected, not warned about.

## Verify

1. `npx tsc -b --noEmit` passes.
2. `npm run build` — main bundle unchanged at ~134 KB.
3. `node scripts/validate-course.mjs` passes on Cedar Hollow and rejects a deliberately broken copy.
4. A full 9-hole round completes with manual shot entry and produces a correct score.
5. A ball hit into the water on hole 2 takes the penalty and replays from the right spot.
6. Designer export → re-import → validate round-trips without loss.
7. Every existing route still loads with no blank screen and no console error.
8. List anything you could not verify rather than marking it done.
