// Worldwide city geocoder for map and Golf location search.
// Open-Meteo is primary; Photon provides an independent OSM fallback.

export const config = { runtime: 'edge' };

interface GeocodeRow {
  display_name: string;
  lat: string;
  lon: string;
  boundingbox?: string[];
}

interface OpenMeteoResult {
  name?: string;
  latitude?: number;
  longitude?: number;
  admin1?: string;
  admin2?: string;
  country?: string;
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

async function openMeteo(q: string, limit: number): Promise<GeocodeRow[]> {
  const params = new URLSearchParams({
    name: q,
    count: String(limit),
    language: 'en',
    format: 'json',
  });
  const res = await fetch(
    `https://geocoding-api.open-meteo.com/v1/search?${params}`,
    { headers: { Accept: 'application/json' } },
  );
  if (!res.ok) throw new Error(`Open-Meteo ${res.status}`);
  const body = (await res.json()) as { results?: OpenMeteoResult[] };
  return (body.results ?? []).flatMap((item) => {
    if (
      !Number.isFinite(item.latitude) ||
      !Number.isFinite(item.longitude)
    ) {
      return [];
    }
    return [{
      display_name: label([
        item.name,
        item.admin2,
        item.admin1,
        item.country,
      ]),
      lat: String(item.latitude),
      lon: String(item.longitude),
    }];
  });
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
    const rows = await openMeteo(q, limit);
    if (rows.length) return json(rows);
  } catch (error) {
    errors.push(error instanceof Error ? error.message : 'Open-Meteo failed');
  }

  try {
    const rows = await photon(q, limit);
    return json(rows);
  } catch (error) {
    errors.push(error instanceof Error ? error.message : 'Photon failed');
  }

  return new Response(JSON.stringify({ error: errors.join(' · ') }), {
    status: 502,
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'no-store',
    },
  });
}
