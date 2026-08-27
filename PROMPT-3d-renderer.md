# Simulator renderer: build a course that looks real

> **SCOPE LOCK.** The `/sim` renderer only. Do not touch the GPS view, the real-course catalog, the
> weather layer, or the main bundle. Everything here is lazy-loaded on `/sim` alone.

## First, what actually exists

There is **no course renderer**. Grepped:

| | |
|---|---|
| `Green3DViewer.tsx` + `GolfGreen3DLayer.ts` | 1,067 lines — renders **one green mesh**, not a hole |
| `shadowMap` | **0 references — shadows are off entirely** |
| `toneMapping` | **0 references** |
| `InstancedMesh` | **0 references — no vegetation system** |
| `ShaderMaterial` | **0 references — no grass, no mowing stripes** |
| Lighting | Three untextured directional lights + flat ambient |

So this isn't "upgrade the flat environment." It's **build the renderer**, which is good news — no
legacy architecture to fight. It also means the three cheapest, highest-impact wins in real-time
rendering are all currently missing.

---

## The constraint that shapes every decision

**This is a web app running in a phone browser.** WebGL2, no compute shaders, a hard memory ceiling
before Safari kills the tab, and a mobile GPU with roughly a twentieth of a console's budget.

The spec asks for AAA console rendering. Some of it is reachable in a browser; some of it will cost
the frame rate and deliver almost nothing visually. **Those are not the same list, and treating all
fifteen sections as equal priority is how this ends up beautiful at 12 fps.**

So: build in the order below, which is sorted by *perceived quality per millisecond of GPU time*,
and measure after each step.

---

## Tier 1 — do these first. Together they are most of the way there.

These are cheap, and their absence is exactly why the current render looks flat.

### 1. Shadows

`shadowMap` is off. Nothing casts, nothing receives, so every object floats and the terrain has no
form. Turn on a single directional light with `PCFSoftShadowMap` and a **cascaded shadow map** — one
tight cascade for the near field, one loose for distance. One sun. Not three lights; three lights
from three directions is why nothing currently reads as three-dimensional.

**Put the sun low.** 20–35° elevation. Long raking shadows across mounding is what makes terrain
read as terrain. High noon sun flattens everything, which is what the current setup does.

### 2. Tone mapping and colour grading

No `toneMapping` set, so raw linear output is being clamped. Set `ACESFilmicToneMapping`,
`outputColorSpace = SRGBColorSpace`, and an exposure around 1.0–1.2. This is roughly four lines of
code and it is the difference between "mobile game" and "photograph." Do it before touching a single
texture.

Then **desaturate the greens.** The current palette runs vivid. Real turf photographed in daylight is
far greyer and more olive than people expect. Oversaturated green is the single strongest cartoon tell.

### 3. Aerial perspective

Replace `FogExp2` with height-aware fog tinted toward the sky colour, not toward black. Distant
terrain should wash toward the horizon hue. This is nearly free and it is what creates the sense of
scale the spec asks for in section 6.

### 4. Mowing stripes

A shader that alternates fairway albedo along the mow direction, with the stripe direction following
the hole's centreline. Almost free — it is a `sin()` on the UV — and it is *the* visual signature of
a maintained golf course. Nothing else on this list buys as much recognition for as little.

Stripe the fairway one way, the green another, the fringe not at all.

**Stop here and screenshot.** Tier 1 is maybe two days of work and will change the look more than
everything below it combined. Show me before continuing.

---

## Tier 2 — the terrain system

This is the real architectural work, and there's a gap in the data that must be closed first.

### The missing piece: authored 2D → generated heightfield

The course format authors a centreline, widths, ellipse hazards, and an elevation curve. That is
enough to *play* a hole exactly. It is not enough to *render* one — there's no surface.

**Build `src/lib/sim/terrain.ts`: a generator that turns the authored 2D data into a heightfield and
a splat map.** This preserves the 2D-authoring decision (which is correct — nobody wants to sculpt
18 holes by hand) while giving the renderer real geometry.

Input: the hole JSON. Output: a heightmap grid (start at ~1 m resolution over the hole corridor) plus
per-texel surface weights for fairway / rough / sand / green.

The generator's job is to add everything the author didn't specify:

- **Base elevation** interpolated from the authored `elevationFt` curve along the centreline.
- **Cross-slope** falling away from the centreline, so fairways crown slightly and shed to the rough.
- **Mounding** — layered value noise, amplitude scaled by `visual.terrain.reliefFt`, seeded from the
  hole number so it is deterministic. Same hole always generates the same terrain.
- **Bunkers as real depressions** — the ellipse becomes a smooth basin with a **raised lip on the far
  side** and a steeper face. That lip is what makes a bunker read as constructed rather than painted.
- **Green complexes** — a raised pad, subtle undulation from `green.tiers` and `slopePct`, with
  run-offs at the edges.
- **Tee boxes** — flat, level pads, slightly raised. A flat tee among rolling ground reads as
  man-made instantly.

**Critical separation, and this is the one that will bite:** the heightfield used for *rendering* may
apply `visual.terrain.exaggeration` (Coral Key sets 1.6 because Florida relief is ±22 ft and reads
dead flat). The heightfield used for *ball physics* must not. Two functions, two return values,
named so they can't be confused. If they merge, the simulator starts lying about club selection and
nobody will work out why for a month.

### LOD

Quadtree or concentric rings from the camera: 1 m grid near, halving outward. The hole corridor is
~400 × 100 m, which is small enough that this stays manageable.

---

## Tier 3 — vegetation and grass

### Trees

`InstancedMesh` per species, 3–4 species per course from the `visual.vegetation` block, which already
specifies species, density, placement band, and height range. Randomise scale (±25%), Y-rotation, and
a slight colour-tint variation per instance — uniform tint across instances is the strongest
procedural tell.

Beyond ~120 m, swap to camera-facing billboards rendered from the same models. Beyond ~350 m, a
single merged silhouette strip.

**Placement follows the authored `band`** — `headland`, `rough-edge`, `hole-corridor`. Poisson-disc
sample within the band so spacing looks natural rather than grid-like. Never place inside the fairway
polygon or a hazard.

### Grass

Here is where the spec asks for something that will cost you the frame rate. **Do not build per-blade
geometry across the hole.**

- **Within ~15 m of the camera:** 3–4 shell layers with an alpha-tested grass texture, offset along
  the surface normal, with wind applied as a vertex-shader offset. Cheap, and it is the only place a
  player can perceive individual blades.
- **15–60 m:** a detail-normal map plus the mowing stripes. No geometry.
- **Beyond 60 m:** albedo and stripes only.

Rough gets taller shells and a browner, noisier albedo than fairway. Fringe sits between. This
reads correctly and costs a fraction of what real geometry does.

---

## Tier 4 — water, sky, atmosphere

- **Water:** a normal-map-animated surface with a screen-space reflection of the sky cubemap and a
  depth-based opacity ramp at the shoreline. **Do not build planar reflections on mobile** — they
  double the scene draw. A sky reflection plus refraction fake is convincing at golf-course distances.
- **Sky:** a gradient dome with a sun disc and horizon haze that matches the fog colour. Match
  `visual.sky.timeOfDay` from the course data — Lantern Point specifies golden hour, and that alone
  changes the entire mood.
- **Clouds:** a scrolling texture on the dome. **Skip volumetric clouds and cloud shadows on mobile.**
  Section 6 asks for them; they are not worth their cost here.

---

## What to skip, and why

The spec asks for these. On a phone browser they cost far more than they return:

| Feature | Why not |
|---|---|
| Real-time planar reflections | Doubles scene draws for a surface the player looks at for seconds |
| Volumetric clouds / cloud shadows | Heavy per-pixel work; the sky is mostly out of frame at eye level |
| Per-blade grass beyond ~15 m | Invisible at distance, enormous vertex cost |
| SSAO | Marginal over good shadows; expensive at mobile resolution |
| Occlusion culling | A golf hole has almost no occluders — frustum culling is enough |

If a desktop path is added later, revisit this table. On mobile, spending here means not spending on
shadows and terrain, which is a bad trade.

---

## Performance budget — measured, not assumed

Name a target device and hold to it. Suggested: **iPhone 13, Safari, 60 fps at native resolution.**

| Budget | Ceiling |
|---|---|
| Frame time | 16 ms, with 4 ms headroom for game logic |
| Draw calls | < 150 |
| Triangles | < 900 k |
| Texture memory | < 220 MB |
| Renderer chunk | < 2.5 MB gzip, lazy on `/sim` |

**Report all five after every tier.** A tier that busts the budget gets scaled back before the next
one starts — this is how a renderer stays shippable instead of becoming a beautiful thing that has to
be thrown away.

Main bundle stays ~134 KB gzip. Nothing here loads on Today, Courses, or GPS.

---

## Build order

1. **Tier 1** — shadows, tone mapping, fog, mowing stripes. Screenshot from tee, fairway, bunker,
   green, and a long view. Show me before continuing.
2. **Terrain generator** — heightfield + splat, with the render/physics separation enforced in code.
3. **Terrain rendering + LOD.** Screenshot the same five viewpoints again.
4. **Trees**, instanced with LOD and billboards.
5. **Grass shells** near-field only.
6. **Water, sky, atmosphere.**
7. **Ball and camera** — contact shadow, terrain-aware roll, shot-tracking camera at ~1.7 m eye
   height with a natural 55–65° FOV.

## Verify, every tier

1. `npx tsc -b --noEmit` passes.
2. Main bundle still ~134 KB gzip; report the `/sim` chunk separately.
3. All five performance numbers, measured on the target device, not estimated.
4. Screenshots from all five viewpoints on **Granite Ridge hole 4** (72 ft of drop across a gorge),
   **Lantern Point hole 15** (225 yd over open ocean), and **Coral Key hole 4** (flat Florida, water
   right) — three deliberately different rendering problems.
5. Confirm the physics heightfield is unaffected by `visual.terrain.exaggeration`.
6. Every existing route still loads with no blank screen and no console error.
7. List anything you could not verify rather than marking it done.
