// Worldwide city geocoder for map and Golf location search.
// Photon (primary) + Nominatim (fallback). Open-Meteo geocoding removed.

export const config = { runtime: 'edge' };

interface GeocodeRow {
  display_name: string;
  lat: string;
  lon: string;
  boundingbox?: string[];
}

interface PhotonFeature {
  properties?: {
    name?: string;
    city?: string;
    county?: string;
    state?: string;
    country?: string;
    extent?: number[];
  };
  geometry?: { coordinates?: number[] };
}

interface NominatimHit {
  display_name?: string;
  lat?: string;
  lon?: string;
  boundingbox?: string[];
}

function json(rows: GeocodeRow[], maxAge = 86_400): Response {
  return new Response(JSON.stringify(rows), {
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': `public, max-age=600, s-maxage=${maxAge}, stale-while-revalidate=604800, stale-if-error=604800`,
      'Vercel-CDN-Cache-Control': `public, s-maxage=${maxAge}, stale-while-revalidate=604800, stale-if-error=604800`,
    },
  });
}

function coordinateResult(q: string): GeocodeRow[] | null {
  const match = q
    .trim()
    .match(/^(-?\d{1,2}(?:\.\d+)?)\s*[, ]\s*(-?\d{1,3}(?:\.\d+)?)$/);
  if (!match) return null;
  const lat = Number(match[1]);
  const lon = Number(match[2]);
  if (Math.abs(lat) > 90 || Math.abs(lon) > 180) return [];
  return [
    {
      display_name: `${lat.toFixed(5)}, ${lon.toFixed(5)}`,
      lat: String(lat),
      lon: String(lon),
    },
  ];
}

function label(parts: Array<string | undefined>): string {
  return [...new Set(parts.map((part) => part?.trim()).filter(Boolean))]
    .join(', ');
}

/** Nominatim usage policy: max 1 request/second. */
let nominatimGate = Promise.resolve();
let lastNominatimAt = 0;

async function throttleNominatim<T>(fn: () => Promise<T>): Promise<T> {
  const run = nominatimGate.then(async () => {
    const wait = Math.max(0, 1100 - (Date.now() - lastNominatimAt));
    if (wait) await new Promise((r) => setTimeout(r, wait));
    lastNominatimAt = Date.now();
    return fn();
  });
  nominatimGate = run.then(
    () => undefined,
    () => undefined,
  );
  return run;
}

async function photon(q: string, limit: number): Promise<GeocodeRow[]> {
  const params = new URLSearchParams({
    q,
    limit: String(limit),
    lang: 'en',
  });
  const res = await fetch(`https://photon.komoot.io/api/?${params}`, {
    headers: { Accept: 'application/json' },
  });
  if (!res.ok) throw new Error(`Photon ${res.status}`);
  const body = (await res.json()) as { features?: PhotonFeature[] };
  return (body.features ?? []).flatMap((feature) => {
    const coords = feature.geometry?.coordinates;
    const props = feature.properties;
    if (
      !coords ||
      coords.length < 2 ||
      !Number.isFinite(coords[0]) ||
      !Number.isFinite(coords[1])
    ) {
      return [];
    }
    const extent = props?.extent;
    return [{
      display_name: label([
        props?.name,
        props?.city,
        props?.county,
        props?.state,
        props?.country,
      ]),
      lat: String(coords[1]),
      lon: String(coords[0]),
      boundingbox:
        extent?.length === 4
          ? [
              String(Math.min(extent[1]!, extent[3]!)),
              String(Math.max(extent[1]!, extent[3]!)),
              String(Math.min(extent[0]!, extent[2]!)),
              String(Math.max(extent[0]!, extent[2]!)),
            ]
          : undefined,
    }];
  });
}

async function nominatim(q: string, limit: number): Promise<GeocodeRow[]> {
  return throttleNominatim(async () => {
    const params = new URLSearchParams({
      q,
      format: 'jsonv2',
      limit: String(limit),
      addressdetails: '0',
    });
    const res = await fetch(
      `https://nominatim.openstreetmap.org/search?${params}`,
      {
        headers: {
          Accept: 'application/json',
          'User-Agent':
            process.env.NWS_USER_AGENT ||
            'TeeReady/1.0 (https://tee-ready.vercel.app; contact@teeready.app)',
        },
      },
    );
    if (!res.ok) throw new Error(`Nominatim ${res.status}`);
    const rows = (await res.json()) as NominatimHit[];
    return rows.flatMap((hit) => {
      if (!hit.lat || !hit.lon || !hit.display_name) return [];
      return [
        {
          display_name: hit.display_name,
          lat: hit.lat,
          lon: hit.lon,
          boundingbox: hit.boundingbox,
        },
      ];
    });
  });
}

export default async function handler(req: Request): Promise<Response> {
  const { searchParams } = new URL(req.url);
  const q = searchParams.get('q')?.trim();
  const limit = Math.min(
    Math.max(Number(searchParams.get('limit') ?? 6), 1),
    10,
  );
  if (!q) return new Response('missing q', { status: 400 });

  const coordinates = coordinateResult(q);
  if (coordinates) return json(coordinates);

  const errors: string[] = [];
  try {
    const rows = await photon(q, limit);
    if (rows.length) return json(rows);
  } catch (error) {
    errors.push(error instanceof Error ? error.message : 'Photon failed');
  }

  try {
    const rows = await nominatim(q, limit);
    if (rows.length) return json(rows);
  } catch (error) {
    errors.push(error instanceof Error ? error.message : 'Nominatim failed');
  }

  return new Response(JSON.stringify({ error: errors.join(' · ') || 'no results' }), {
    status: 502,
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'no-store',
    },
  });
}
