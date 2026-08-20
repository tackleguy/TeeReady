# Attributions

TeeReady is MIT-licensed (see `LICENSE`). It bundles open-source software
and consumes public geospatial / weather data services. This file lists
the upstream sources and the licenses under which they are used.

## Data sources

| Source | Use | Terms |
| --- | --- | --- |
| **Open-Meteo** — api.open-meteo.com | Wind ensemble and elevation for plays-like yardage | CC BY 4.0 (`https://open-meteo.com/en/license`). Attribution shown in-app. |
| **OpenStreetMap** — overpass-api.de (+ kumi.systems, private.coffee mirrors) | Golf courses / hole geometry | ODbL; cite © OpenStreetMap contributors. Public instances are rate-limited — cache aggressively and never use regional extracts (`overpass.osm.ch`, `overpass.osm.jp`) which silently return empty results outside their country. |
| **Photon** — photon.komoot.io | Golf course lookup | Free geocoder over OpenStreetMap data (ODbL) by komoot; keep usage light and cache results. |
| **Esri World Imagery** — server.arcgisonline.com | High-detail satellite basemap | Cite Esri, Maxar, Earthstar Geographics, and the GIS User Community. Terms: Esri attribution requirements. |
| **Nominatim** — via `/api/geocode` | Location search | ODbL; usage policy applies (`https://operations.osmfoundation.org/policies/nominatim/`). |

## Bundled JavaScript dependencies

Notable runtime dependencies:

- **MapLibre GL JS** — BSD-3-Clause
- **React / React DOM** — MIT
- **React Router** — MIT
- **Lucide React** — ISC
- **Framer Motion** — MIT
- **Zustand** — MIT
- **SWR** — MIT
