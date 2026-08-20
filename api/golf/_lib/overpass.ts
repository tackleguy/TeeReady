// Shared Overpass helpers for OSM golf course / hole geometry.
//
// Overpass instances rate-limit aggressive clients, so we never fan out to
// every mirror at once. Instead we hedge: start one mirror, and only add the
// next if it has not answered within `hedgeMs`. That keeps median latency low
// while using ~1 query per request in the common case.
//
// Local backend (when public mirrors fail):
//   OVERPASS_URL=http://127.0.0.1:12345/api/interpreter
//   OVERPASS_URLS=http://127.0.0.1:12345/api/interpreter,http://127.0.0.1:8080/api/interpreter
//   OVERPASS_PREFER_LOCAL=1  → try local endpoints before public mirrors

// Planet-wide instances only. Regional extracts (overpass.osm.ch,
// overpass.osm.jp) answer 200 with zero elements outside their country, which
// looks exactly like "no golf here" — never add them.
const PUBLIC_OVERPASS_URLS = [
  'https://overpass.kumi.systems/api/interpreter',
  'https://overpass-api.de/api/interpreter',
  'https://lz4.overpass-api.de/api/interpreter',
  'https://overpass.private.coffee/api/interpreter',
  'https://maps.mail.ru/osm/tools/overpass/api/interpreter',
];

function localOverpassUrls(): string[] {
  const raw = [
    process.env.OVERPASS_URL,
    ...(process.env.OVERPASS_URLS ?? '').split(','),
  ]
    .map((s) => s?.trim())
    .filter((s): s is string => Boolean(s));
  const seen = new Set<string>();
  const out: string[] = [];
  for (const url of raw) {
    try {
      // Validate absolute URL (localhost / private host allowed).
      new URL(url);
    } catch {
      continue;
    }
    if (seen.has(url)) continue;
    seen.add(url);
    out.push(url);
  }
  return out;
}

function buildMirrorOrder(): string[] {
  const local = localOverpassUrls();
  const preferLocal =
    process.env.OVERPASS_PREFER_LOCAL === '1' ||
    process.env.OVERPASS_PREFER_LOCAL === 'true';
  const publicCount = PUBLIC_OVERPASS_URLS.length;
  const rotatedPublic = PUBLIC_OVERPASS_URLS.map(
    (_, i) => PUBLIC_OVERPASS_URLS[(cursor + i) % publicCount]!,
  );
  cursor = (cursor + 1) % publicCount;
  if (!local.length) return rotatedPublic;
  return preferLocal
    ? [...local, ...rotatedPublic]
    : [...rotatedPublic, ...local];
}

export const UA =
  process.env.NWS_USER_AGENT ??
  'weather-stop/1.0 (golf; contact@example.com)';

/** Rotate the starting public mirror so load spreads across instances. */
let cursor = 0;

interface OverpassOpts {
  /** Overall deadline for the whole hedged attempt. */
  timeoutMs?: number;
  /** How long to wait before bringing another mirror into the race. */
  hedgeMs?: number;
}

async function askMirror(
  url: string,
  query: string,
  signal: AbortSignal,
): Promise<unknown> {
  const host = new URL(url).host;
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'User-Agent': UA,
      Accept: 'application/json',
    },
    body: `data=${encodeURIComponent(query)}`,
    signal,
  });
  // 429 = rate limited, 504 = query timed out, 502/503 = instance busy.
  if (!res.ok) throw new Error(`overpass ${res.status} @ ${host}`);

  const data = (await res.json()) as {
    remark?: string;
    elements?: unknown[];
  };
  // A loaded instance answers 200 with a `remark` and empty/partial elements.
  // Treating that as success is what made whole cities look course-less.
  if (data.remark && /error|timed out|too (many|much)/i.test(data.remark)) {
    throw new Error(`overpass busy @ ${host}`);
  }
  return data;
}

export async function overpass(
  query: string,
  opts?: OverpassOpts,
): Promise<unknown> {
  const timeoutMs = opts?.timeoutMs ?? 14_000;
  const hedgeMs = opts?.hedgeMs ?? 2_500;

  const ac = new AbortController();
  const deadline = setTimeout(() => ac.abort(), timeoutMs);
  const start = Date.now();
  const attempts: Array<Promise<unknown>> = [];
  const errors: string[] = [];
  const order = buildMirrorOrder();

  try {
    for (let i = 0; i < order.length; i += 1) {
      attempts.push(
        askMirror(order[i]!, query, ac.signal).catch((err: unknown) => {
          const msg = err instanceof Error ? err.message : 'overpass failed';
          errors.push(msg);
          throw err;
        }),
      );

      const remaining = timeoutMs - (Date.now() - start);
      if (remaining <= 0) break;
      const isLast = i === order.length - 1;
      const inFlight = [...attempts];

      // Three ways to leave the wait: someone answered, everyone in flight
      // failed (advance immediately), or the hedge window elapsed (add one).
      const success = Promise.any(inFlight).then((data) => ({ data }));
      const allFailed = Promise.allSettled(inFlight).then(() => 'advance' as const);
      const hedge = new Promise<'advance'>((resolve) => {
        setTimeout(() => resolve('advance'), Math.min(hedgeMs, remaining));
      });

      const outcome = await Promise.race(
        isLast ? [success, allFailed] : [success, allFailed, hedge],
      ).catch(() => 'advance' as const);

      if (typeof outcome === 'object' && 'data' in outcome) {
        ac.abort(); // cancel any still-pending mirrors
        return outcome.data;
      }
      // 'advance' → next loop iteration brings another mirror into the race.
    }

    // Everything queued has now been given a chance.
    try {
      const data = await Promise.any(attempts);
      ac.abort();
      return data;
    } catch {
      throw new Error(
        errors[0] ?? 'every OpenStreetMap mirror is busy right now',
      );
    }
  } finally {
    clearTimeout(deadline);
  }
}

export interface OsmTags {
  [k: string]: string | undefined;
}

export interface OsmElement {
  type: 'node' | 'way' | 'relation' | 'area';
  id: number;
  lat?: number;
  lon?: number;
  center?: { lat: number; lon: number };
  tags?: OsmTags;
  nodes?: number[];
  geometry?: Array<{ lat: number; lon: number }>;
  members?: Array<{
    type: string;
    ref: number;
    role: string;
    lat?: number;
    lon?: number;
    geometry?: Array<{ lat: number; lon: number }>;
  }>;
}

export function centerOf(el: OsmElement): { lat: number; lon: number } | null {
  if (typeof el.lat === 'number' && typeof el.lon === 'number') {
    return { lat: el.lat, lon: el.lon };
  }
  if (el.center) return el.center;
  const geom = el.geometry;
  if (geom && geom.length) {
    let lat = 0;
    let lon = 0;
    for (const p of geom) {
      lat += p.lat;
      lon += p.lon;
    }
    return { lat: lat / geom.length, lon: lon / geom.length };
  }
  return null;
}

/** Quantize coords so nearby requests share CDN / memory cache keys. */
export function quantizeCoord(n: number, decimals = 3): number {
  const f = 10 ** decimals;
  return Math.round(n * f) / f;
}

export function jsonResponse(
  body: unknown,
  maxAge = 3600,
  sMaxAge = 86_400,
): Response {
  return new Response(JSON.stringify(body), {
    headers: {
      'Content-Type': 'application/json',
      // Browser keeps a warm copy; Vercel CDN keeps a longer shared copy.
      // stale-if-error keeps Golf usable while Overpass is overloaded.
      'Cache-Control': `public, max-age=${maxAge}, s-maxage=${sMaxAge}, stale-while-revalidate=86400, stale-if-error=604800`,
      'CDN-Cache-Control': `public, s-maxage=${sMaxAge}, stale-while-revalidate=86400, stale-if-error=604800`,
      'Vercel-CDN-Cache-Control': `public, s-maxage=${sMaxAge}, stale-while-revalidate=86400, stale-if-error=604800`,
    },
  });
}

export function errResponse(message: string, status = 502): Response {
  return new Response(JSON.stringify({ error: message }), {
    status,
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'no-store',
    },
  });
}
