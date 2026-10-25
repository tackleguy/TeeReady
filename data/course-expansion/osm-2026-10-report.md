# October 2026 course pack expansion

Adds **50 courses / 855 holes** from existing OpenStreetMap snapshots: 45 eighteen-hole courses and five explicitly identified nine-hole courses. Every new hole has a numbered source centerline, an OSM par, a mapped tee polygon, a mapped green polygon, and an intersecting mapped fairway polygon. No existing course pack is replaced.

## Coverage

| Metric | Before | After |
| --- | ---: | ---: |
| Searchable hole packs / compact directory rows | 9,155 | 9,205 |
| Hole pack files on disk | 9,156 | 9,206 |
| OSM snapshots without a hole pack | 8,235 | 8,185 |
| Geographic audit: high-confidence packs | 8,686 | 8,736 |
| Official scorecard packs | 13 | 13 |
| Advertised 3D green packs | 2,686 | 2,686 |

“Complete” here means complete numbered **mapped geometry**, not a complete official scorecard or survey. One legacy hole file was already absent from the manifest; scoped regeneration keeps it unadvertised pending a separate review. The raw OSM and greens inventories remain unchanged.

## Evidence, accuracy, and missing fields

- Sources: cached OSM snapshots retrieved September 9–12, 2026, licensed under [ODbL 1.0](https://opendatacommons.org/licenses/odbl/1-0/) with © OpenStreetMap contributors attribution. These are source-checked community maps, not a field survey or a claim of current course conditions.
- Each pack embeds the original source path, SHA-256, retrieval time, course boundary URL, and every hole/tee/green/fairway way ID. Coordinates and polygon vertices are copied exactly; no snapping, synthesized holes, inferred loop names, or generated tee positions.
- Pars come from the source `golf=hole` tags. `yards` is calculated along the mapped centerline and is explicitly geometric. Official tee-specific yardages, tee labels, handicap indexes, and official scorecards are unavailable for this batch; none are fabricated or promoted from OSM tags. Existing official packs remain unchanged.
- Horizontal survey accuracy is unknown (`horizontalAccuracyMeters: null`). There is no suitable measured elevation source in these snapshots, so no 3D meshes or contours are added. The mesh builder was inspected and its flat-on-error fallback was deliberately not used.
- Tee, fairway, and green polygons render from the opened local pack in Prep/GPS. Lists still use only compact metadata; parsed pack limits remain four hole packs, two green packs, and eight scorecards.

## Selection and rejected candidates

Of 8,235 missing-pack snapshots, 1,055 had exactly one complete numbered 9/18-hole set. The stricter checks accepted 68; 50 were selected and 18 qualified candidates are deferred to keep this batch bounded. Missing official scorecards are recorded as an explicit limitation rather than invented.

Required checks: exact normalized boundary identity, pin and source vertices inside that boundary, consecutive unique hole numbers, OSM pars, agreement with declared hole/par totals, an explicit source hole count for nines, unambiguous tee/green containment, fairway intersection for every hole, no reused green without review, no unexplained extra greens, geographic invariants, and no overlap with an existing or newly selected layout. Declared course counts and source website references were used to prioritize otherwise equivalent candidates; website links alone were not treated as official scorecard evidence.

Rejected examples include Kirtlington (source declares 27 holes), Hartsbourne/Leckford (unresolved facility layouts), Worksop (overlaps the existing College Pines pack), and Memphrémagog (overlaps an existing pack). Full per-candidate reasons are in [the screening record](osm-2026-10-screening.json). No rejected source or existing pack was deleted.

| Rejection reason | Candidates |
| --- | ---: |
| ambiguous course identity | 267 |
| missing or invalid sourced par | 151 |
| hole N: no mapped fairway intersecting source line | 117 |
| nine-hole layout lacks an explicit course hole count | 109 |
| hole N: missing or ambiguous tee/green polygon | 97 |
| course pin outside named boundary | 88 |
| hole outside named boundary | 84 |
| extra greens suggest an unresolved sibling layout | 33 |
| derivation dropped or changed source holes | 11 |
| source declares a different hole count | 11 |
| source par total conflicts with layout | 8 |
| hole N: reused green requires shared-green review | 6 |
| invalid course name | 2 |
| layout overlaps college-pines-golf-club (18 holes) | 1 |
| layout overlaps pine-grove-golf-course (18 holes) | 1 |
| layout overlaps memphremagog-golf-club (16 holes) | 1 |

## Reproduce and resume

All steps use local sources with concurrency one and **zero upstream data requests**. Source hashes must still match; the builder validates the entire selection before writing, atomically installs new files, resumes identical outputs, and refuses to overwrite different existing packs.

```sh
node --import tsx scripts/derive-holes-from-osm.ts --verified-batch=data/course-expansion/osm-2026-10.json --dry-run
node --import tsx scripts/derive-holes-from-osm.ts --verified-batch=data/course-expansion/osm-2026-10.json
node scripts/build-course-asset-packs.mjs --verified-batch=data/course-expansion/osm-2026-10.json
npm run build:course-directory
COURSE_BATCH=data/course-expansion/osm-2026-10.json npm run test:course-assets
node scripts/test-course-pack-batch.mjs
```

The existing backup script supplies the cached OSM source format; it was inspected but no new download was necessary. The derivation uses the existing hole-way pipeline on a strictly selected set of ways, without its nearest-tee pairing or name-based scorecard merging. Manifest generation is scoped to existing advertised packs plus this batch.

## Courses and attribution

| Course | Holes | Par from OSM | Source boundary | Pack bytes |
| --- | ---: | ---: | --- | ---: |
| [Golf d'Étretat](../../public/golf/holes/golf-d-tretat.json) | 18 | 72 | [OSM way 34513467](https://www.openstreetmap.org/way/34513467) | 50,327 |
| [Henley Golf Club](../../public/golf/holes/henley-golf-club.json) | 18 | 70 | [OSM way 379063131](https://www.openstreetmap.org/way/379063131) | 65,395 |
| [Kilworth Springs](../../public/golf/holes/kilworth-springs.json) | 18 | 72 | [OSM way 95132219](https://www.openstreetmap.org/way/95132219) | 95,107 |
| [Maitland Golf Club (NSW)](../../public/golf/holes/maitland-golf-club-nsw.json) | 18 | 71 | [OSM way 31021403](https://www.openstreetmap.org/way/31021403) | 102,748 |
| [The West Berkshire Golf Club](../../public/golf/holes/the-west-berkshire-golf-club.json) | 18 | 73 | [OSM way 96444868](https://www.openstreetmap.org/way/96444868) | 77,867 |
| [Witney Lakes Resort](../../public/golf/holes/witney-lakes-resort.json) | 18 | 71 | [OSM way 115790964](https://www.openstreetmap.org/way/115790964) | 64,776 |
| [Wrag Barn Golf & Country Club](../../public/golf/holes/wrag-barn-golf-and-country-club.json) | 18 | 72 | [OSM way 213838558](https://www.openstreetmap.org/way/213838558) | 136,191 |
| [Golf Club Avoriaz](../../public/golf/holes/golf-club-avoriaz.json) | 9 | 36 | [OSM way 212736932](https://www.openstreetmap.org/way/212736932) | 50,202 |
| [Midgley Lodge Motel & Golf Course](../../public/golf/holes/midgley-lodge-motel-and-golf-course.json) | 9 | 33 | [OSM way 295550817](https://www.openstreetmap.org/way/295550817) | 30,296 |
| [St Medan Golf Club](../../public/golf/holes/st-medan-golf-club.json) | 9 | 32 | [OSM way 264453404](https://www.openstreetmap.org/way/264453404) | 32,224 |
| [Stuart Lake Golf Course](../../public/golf/holes/stuart-lake-golf-course.json) | 9 | 36 | [OSM way 1346893637](https://www.openstreetmap.org/way/1346893637) | 28,714 |
| [Sutton Bridge Golf Club](../../public/golf/holes/sutton-bridge-golf-club.json) | 9 | 35 | [OSM way 200923489](https://www.openstreetmap.org/way/200923489) | 41,520 |
| [Nanaimo Golf Club](../../public/golf/holes/nanaimo-golf-club.json) | 18 | 72 | [OSM way 156412792](https://www.openstreetmap.org/way/156412792) | 151,104 |
| [Club de Golf Lac-St-Jean](../../public/golf/holes/club-de-golf-lac-st-jean.json) | 18 | 72 | [OSM way 593151162](https://www.openstreetmap.org/way/593151162) | 88,757 |
| [Dumbarton Golf Club](../../public/golf/holes/dumbarton-golf-club.json) | 18 | 71 | [OSM way 203462425](https://www.openstreetmap.org/way/203462425) | 63,950 |
| [Dundee Country Club](../../public/golf/holes/dundee-country-club.json) | 18 | 72 | [OSM way 39971105](https://www.openstreetmap.org/way/39971105) | 141,705 |
| [Easter Moffat Golf Club](../../public/golf/holes/easter-moffat-golf-club.json) | 18 | 71 | [OSM way 174827707](https://www.openstreetmap.org/way/174827707) | 72,608 |
| [Fairview Estate](../../public/golf/holes/fairview-estate.json) | 18 | 71 | [OSM way 130812867](https://www.openstreetmap.org/way/130812867) | 83,612 |
| [Fraserglen Golf Course](../../public/golf/holes/fraserglen-golf-course.json) | 18 | 62 | [OSM way 25519733](https://www.openstreetmap.org/way/25519733) | 76,606 |
| [Galway Bay Golf Resort](../../public/golf/holes/galway-bay-golf-resort.json) | 18 | 72 | [OSM way 115712762](https://www.openstreetmap.org/way/115712762) | 77,586 |
| [Garrison Golf Course](../../public/golf/holes/garrison-golf-course.json) | 18 | 72 | [OSM way 19130513](https://www.openstreetmap.org/way/19130513) | 73,075 |
| [Glencorse Golf Club](../../public/golf/holes/glencorse-golf-club.json) | 18 | 64 | [OSM way 52664063](https://www.openstreetmap.org/way/52664063) | 116,385 |
| [Golf de Marseille la Salette](../../public/golf/holes/golf-de-marseille-la-salette.json) | 18 | 71 | [OSM way 466623614](https://www.openstreetmap.org/way/466623614) | 131,725 |
| [Haddington Golf Course](../../public/golf/holes/haddington-golf-course.json) | 18 | 71 | [OSM way 56451887](https://www.openstreetmap.org/way/56451887) | 96,881 |
| [Hartlepool Golf Club](../../public/golf/holes/hartlepool-golf-club.json) | 18 | 70 | [OSM way 165844727](https://www.openstreetmap.org/way/165844727) | 60,996 |
| [Hazlemere Golf Club](../../public/golf/holes/hazlemere-golf-club.json) | 18 | 70 | [OSM way 97686940](https://www.openstreetmap.org/way/97686940) | 64,098 |
| [Heysham Golf Club](../../public/golf/holes/heysham-golf-club.json) | 18 | 70 | [OSM way 94004565](https://www.openstreetmap.org/way/94004565) | 63,541 |
| [Ken-Wo Golf Club](../../public/golf/holes/ken-wo-golf-club.json) | 18 | 70 | [OSM way 203879108](https://www.openstreetmap.org/way/203879108) | 82,688 |
| [Lytham Green Drive Golf Course](../../public/golf/holes/lytham-green-drive-golf-course.json) | 18 | 70 | [OSM way 303052114](https://www.openstreetmap.org/way/303052114) | 35,879 |
| [Pagoda Ridge](../../public/golf/holes/pagoda-ridge.json) | 18 | 72 | [OSM way 592490045](https://www.openstreetmap.org/way/592490045) | 53,172 |
| [Perranporth Golf Club](../../public/golf/holes/perranporth-golf-club.json) | 18 | 72 | [OSM way 578916423](https://www.openstreetmap.org/way/578916423) | 91,812 |
| [St Ives Golf Club](../../public/golf/holes/st-ives-golf-club.json) | 18 | 72 | [OSM way 217129260](https://www.openstreetmap.org/way/217129260) | 93,387 |
| [Sturgeon Valley Golf Club](../../public/golf/holes/sturgeon-valley-golf-club.json) | 18 | 72 | [OSM way 161594270](https://www.openstreetmap.org/way/161594270) | 50,034 |
| [Test Valley Golf Club](../../public/golf/holes/test-valley-golf-club.json) | 18 | 72 | [OSM way 159494671](https://www.openstreetmap.org/way/159494671) | 97,897 |
| [The West Lancashire Golf Club](../../public/golf/holes/the-west-lancashire-golf-club.json) | 18 | 72 | [OSM way 25720491](https://www.openstreetmap.org/way/25720491) | 57,018 |
| [Yass Golf Course](../../public/golf/holes/yass-golf-course.json) | 18 | 67 | [OSM way 27217634](https://www.openstreetmap.org/way/27217634) | 58,575 |
| [Club de golf Lotbinière](../../public/golf/holes/club-de-golf-lotbini-re.json) | 18 | 72 | [OSM way 101913330](https://www.openstreetmap.org/way/101913330) | 70,131 |
| [Club de Golf Saint-Jérôme](../../public/golf/holes/club-de-golf-saint-j-r-me.json) | 18 | 72 | [OSM way 84549387](https://www.openstreetmap.org/way/84549387) | 36,133 |
| [Delhi Golf and Country Club](../../public/golf/holes/delhi-golf-and-country-club.json) | 18 | 72 | [OSM way 687309972](https://www.openstreetmap.org/way/687309972) | 46,777 |
| [Gerrards Cross Golf Club](../../public/golf/holes/gerrards-cross-golf-club.json) | 18 | 69 | [OSM way 708309936](https://www.openstreetmap.org/way/708309936) | 64,746 |
| [Golf d'Evian](../../public/golf/holes/golf-d-evian.json) | 18 | 73 | [OSM way 54949523](https://www.openstreetmap.org/way/54949523) | 83,845 |
| [Golf de Houlgate](../../public/golf/holes/golf-de-houlgate.json) | 18 | 70 | [OSM way 112477210](https://www.openstreetmap.org/way/112477210) | 63,589 |
| [Golf Sainte-Marguerite](../../public/golf/holes/golf-sainte-marguerite.json) | 18 | 72 | [OSM way 72838910](https://www.openstreetmap.org/way/72838910) | 79,322 |
| [Goona Warra Golf Course](../../public/golf/holes/goona-warra-golf-course.json) | 18 | 72 | [OSM way 57547093](https://www.openstreetmap.org/way/57547093) | 69,502 |
| [Greenhills Country Club](../../public/golf/holes/greenhills-country-club.json) | 18 | 72 | [OSM way 190360981](https://www.openstreetmap.org/way/190360981) | 109,454 |
| [Kawartha Golf & Country Club](../../public/golf/holes/kawartha-golf-and-country-club.json) | 18 | 70 | [OSM way 77714595](https://www.openstreetmap.org/way/77714595) | 66,207 |
| [Keilor Public Golf Course](../../public/golf/holes/keilor-public-golf-course.json) | 18 | 70 | [OSM way 27398076](https://www.openstreetmap.org/way/27398076) | 74,616 |
| [Lakeview Par 3](../../public/golf/holes/lakeview-par-3.json) | 18 | 54 | [OSM way 249444643](https://www.openstreetmap.org/way/249444643) | 36,598 |
| [Langland Bay Golf Club](../../public/golf/holes/langland-bay-golf-club.json) | 18 | 70 | [OSM way 22821848](https://www.openstreetmap.org/way/22821848) | 87,433 |
| [Les Vieux-Moulins Golf Club](../../public/golf/holes/les-vieux-moulins-golf-club.json) | 18 | 71 | [OSM way 88219416](https://www.openstreetmap.org/way/88219416) | 80,340 |

## Size and deployment

New packs total **3,727,151 bytes (3.55 MiB)**, or **685,106 bytes** summed across individually gzip-compressed packs. The largest is 151,104 bytes. The hole manifest grows by 12,368 bytes; the compact directory grows by 3,703 bytes (about 1,289 additional gzip bytes). New polygons load only after course selection.

Static deployments must ship all 50 new `/golf/holes/*.json` files and the regenerated hole manifest. The directory is bundled into the app. No new scorecard or green files and no new service or API credentials are required. The raw OSM snapshots remain excluded by `.vercelignore`; the new hole packs are self-contained at runtime. ODbL attribution and source records travel with the packs. The existing full build still copies approximately 4.1 GiB of public assets; this batch adds about 3.6 MiB to that output.

## Validation

- `npm run check`: passed TypeScript, all 29 unit tests, and the existing caddie, swing, launch, and range checks. New tests reproduce every pack from its pinned source and reject missing holes/pars, mismatched identities, missing polygons, displaced pins, and overlapping layouts.
- `npm run build`: passed; existing large-chunk warnings remain. Production preview passed `npm run smoke` (14 routes and five static assets) and `npm run test:browser` (nine routes at mobile and desktop sizes).
- `COURSE_BATCH=data/course-expansion/osm-2026-10.json npm run test:course-assets`: all 50 packs / 855 holes passed, including manifest identity, compact-directory membership, and absence of unsupported 3D flags. No live data calls.
- `node scripts/test-course-pack-batch.mjs`: all 50 courses found and opened in the real mobile Prep component with APIs returning 503. Checked local pack requests, numbered holes, rendered source polygons, last-hole selection, no 3D pack downloads, and no uncaught JavaScript errors.
- `npm run test:course-lists`, `npm run test:map-loading`, `npm run test:prep-ui`, and `npm run test:mobile-performance`: passed at 390px and 1440px. Course-list checks used 4× CPU throttling, with warm opens of 112/200 ms and zero course API or pack requests while browsing. Prep retained GPS handoff; repeated map/green opens respected existing canvas and download limits.
- `npm run test:geo-accuracy`: passed after making the existing fixture path repository-relative. The full data and geographic audits completed with **no new issue counts**. All 50 new packs are `HIGH_CONFIDENCE` under the existing audit, not survey-verified. Existing catalog findings remain 1,783 errors, 2,184 warnings, and 270 informational findings; existing geometry issues include 2,727 fabricated tee holes across 173 older packs. Those legacy issues are outside this batch and were not relabeled or repaired.
- Dry-run manifest regeneration preserved its checksum. Repeated derivation resumed identical files. All previously advertised manifest entries and all existing pack bytes were preserved; exactly 50 directory/manifest entries were added. `git diff --check` passed.

The browser regressions used installed Chromium 154 through Playwright because the pinned browser download is unavailable in this cloud environment. Tests use real MapLibre workers and local packs, with deterministic raster/glyph responses; they do not verify live satellite imagery. The mobile-performance fixture now correctly intercepts HTTPS tile requests and supplies settled mock tiles, matching the existing map regression fixtures.

The offline batch test exposed an unrelated-course 3D lookup: “Dumbarton Golf Club” matched “Barton Golf Club” by substring. Mesh lookup now requires compatible identity and location, and tests cover distant namesakes, mismatched sibling loops, and valid matches. No new course is offered another course’s contours.
