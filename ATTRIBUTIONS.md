# Attributions

TeeReady is proprietary closed-source software (see `LICENSE`). It bundles
open-source software and consumes public geospatial / weather data services.
This file lists the upstream sources and the licenses under which they are
used.

## Data sources

| Source | Use | Terms |
| --- | --- | --- |
| **OpenGolfAPI bulk** — github.com/opengolfapi/data | Free US course scorecards (par + stroke index); ODbL | `https://github.com/opengolfapi/data` (imported via `npm run import:golf-scorecards`) |
| **NWS** — api.weather.gov | US wind / precip / humidity for golf briefs | Free public API; requires identifying User-Agent. |
| **MET Norway** — api.met.no | Global wind / precip fallback | CC BY 4.0; honour `Expires` / `If-Modified-Since`; identifying User-Agent required (`https://api.met.no/doc/TermsOfService`). |
| **USGS EPQS** — epqs.nationalmap.gov | US tee/green elevation for plays-like | Public USGS elevation service; cache permanently. |
| **Open-Meteo** — api.open-meteo.com | Optional multi-model ensemble (off by default) | CC BY 4.0; free tier is non-commercial — enable only via `OPEN_METEO_ENABLED=true`. |
| **OpenStreetMap** — overpass-api.de (+ kumi.systems, private.coffee mirrors) | Golf courses / hole geometry | ODbL; cite © OpenStreetMap contributors. Public instances are rate-limited — cache aggressively and never use regional extracts (`overpass.osm.ch`, `overpass.osm.jp`) which silently return empty results outside their country. |
| **Photon** — photon.komoot.io | Place + golf course lookup | Free geocoder over OpenStreetMap data (ODbL) by komoot; keep usage light and cache results. |
| **Esri World Imagery** — server.arcgisonline.com | High-detail satellite basemap | Cite Esri, Maxar, Earthstar Geographics, and the GIS User Community. Terms: Esri attribution requirements. |
| **Nominatim** — via `/api/geocode` | Location search fallback | ODbL; usage policy applies (`https://operations.osmfoundation.org/policies/nominatim/`) — max 1 req/sec. |

## Bundled JavaScript dependencies

Notable runtime dependencies:

- **MapLibre GL JS** — BSD-3-Clause
- **React / React DOM** — MIT
- **React Router** — MIT
- **Lucide React** — ISC
- **Framer Motion** — MIT
- **Zustand** — MIT
- **SWR** — MIT
