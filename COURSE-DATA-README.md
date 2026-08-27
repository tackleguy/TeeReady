# TeeReady course data pack

Everything here was **extracted from data already in your repo**. No coordinates, yardages, pars or
hole counts were invented. Provenance is recorded per tier so nothing gets promoted to a confidence
it hasn't earned.

## Local-first packs (holes / greens / OSM)

Static assets under `public/golf/` are the source of truth for offline Prep:

| Path | Role |
|---|---|
| `public/golf/holes/{slug}.json` + `manifest.json` | Tee/green WGS84 + hole lines (map overlays) |
| `public/golf/greens/{slug}.json` + `manifest.json` | 3D green meshes |
| `public/golf/osm/{slug}.json` | Raw OSM map elements (API soft-refresh backup) |

**Load order (client):** memory/session → localStorage backup → static hole pack → live `/api/golf/holes` (soft-refresh when a pack/backup already painted).

### Build / refresh packs

```bash
# Prefer courses that already have green meshes (highest value)
npm run backup:osm -- --skip-existing

# One course
npm run backup:osm -- --only=pebble-beach-golf-links

# Rebuild hole packs from existing OSM JSON only (no Overpass)
npm run backup:osm -- --holes-only --skip-existing

# Regenerate hole + greens manifests after adding files
npm run build:course-assets:manifest
```

`HOLES_API_BASE` (default production) is used when deriving holes from the API.
Point it at local `vercel dev` if you want fully local pack builds:

```bash
HOLES_API_BASE=http://127.0.0.1:3000 npm run backup:osm -- --skip-existing
```

Greens without hole packs (~19 today) are the best next targets for `--skip-existing`.

### Run the app locally

```bash
npm run dev                 # Vite + production /api proxy (default)
npm run dev:api             # Local serverless API on :3000
DEV_API_PROXY=http://127.0.0.1:3000 npm run dev   # Vite → local API
npm run dev:offline         # No /api — packs + client-only AI fallbacks
```

AI (optional local LLM): LM Studio / Ollama at `VITE_SWING_LLM_URL` (default `http://localhost:1234/v1`). Without a model, caddie/coach/guide use rules prose. Force offline coaching with `VITE_SWING_LLM_DISABLED=1`.

---

## Files

### `src/data/venues.scorecards.json` — 13 courses · Tier 1
The only courses in TeeReady with **real per-hole yardages** (`back` / `mid` / `front`), pulled from
`api/golf/_data/scorecards.ts`.

| Course | Holes | Par | Back tee |
|---|---|---|---|
| Torrey Pines South | 18 | 72 | 7,765 |
| Torrey Pines North | 18 | 72 | 7,258 |
| Pebble Beach Golf Links | 18 | 72 | 6,802 |
| Bethpage Black | 18 | 71 | 7,468 |
| Augusta National | 18 | 72 | 7,555 |
| Augusta National Par 3 | 9 | 27 | 1,060 |
| Pinehurst No. 2 | 18 | 72 | 6,961 |
| TPC Sawgrass Stadium | 18 | 72 | 7,352 |
| Whistling Straits | 18 | 72 | 7,790 |
| Kiawah Ocean Course | 18 | 72 | 7,360 |
| Pacific Dunes | 18 | 71 | 6,633 |
| Spyglass Hill | 18 | 72 | 7,026 |
| TPC Scottsdale Stadium | 18 | 71 | 7,261 |

Totals sanity-check against published card yardages, which is why this tier is trustworthy.

### `src/data/venues.courses.json` — 157 courses · Tier 2
Every course with a **built 3D green mesh**, merged with its catalog entry. All 163 mesh courses
matched the catalog; 157 have complete `holes` + `par` + `region`.

Contains verified `lat`/`lon`, `holes`, `par`, `region`, `holeNumbers`, and a derived
`type` (`regulation` | `executive` | `par3` | `unknown`).

- 142 regulation · 13 par-3 · 2 executive · 6 unknown
- 27 states

**These have geometry but no scorecard yardages.** Per-hole distance comes from OSM tee→green
straight lines, which are shorter than card yardage on any dogleg. Do not present them as scorecard
numbers.

### `src/data/venues.user.json`
Empty array — your own courses and ranges land here via the builder. Kept separate so a catalog
rebuild can't wipe them and a bad entry can't corrupt the 14k dataset.

### `scripts/build-venue.mjs`
Adds a course or range from the command line, with validation.

```bash
node scripts/build-venue.mjs --range --name "Aviara Range" --lat 33.09 --lon -117.28 \
  --region "Carlsbad, CA" --bearing 275 --targets 50,100,150,200,250

node scripts/build-venue.mjs --course --name "Papago Golf Course" --lat 33.46 --lon -111.95 \
  --region "Phoenix, AZ" --holes 18 --par 72

node scripts/build-venue.mjs --validate     # re-check everything already added
```

Rejects rather than warns. The rule that matters is `region-vs-coords` — it catches the real bug
found in your catalog, where a British Columbia course was labelled "Qualicum Beach, NY". Verified
working:

```
✗ Bad Course rejected:
    region-vs-coords: coordinates do not fall inside the state named in the region string
```

## Two shots flagged for you

`1 At Ponkapoag Golf Club` and `2 At Ponkapoag Golf Club` carry `nameNeedsReview:
["nine-combination-parse"]`. These are almost certainly the nines of one facility, mangled by the
import. **I flagged them rather than renaming them** — I don't know whether Ponkapoag's nines are
called 1 and 2 or something else, and a confidently wrong name is worse than an obviously broken one.

I also removed my own over-eager rule: "12 Oaks", "1757 Golf Club" and "18 Mile Creek" start with
digits and are real course names. Only the `<number> At <club>` pattern is genuinely a parse artifact.

## Tier discipline

Carry the tier through to the UI. It's the same provenance principle already applied to swing metrics
and launch numbers:

| Tier | Yardage source | How to present it |
|---|---|---|
| 1 (13) | Official scorecard | Real yardages |
| 2 (157) | OSM tee→green geometry | "Measured from satellite map — not an official scorecard" |
| 3 (rest of catalog) | Par template | Not this course's card at all |
