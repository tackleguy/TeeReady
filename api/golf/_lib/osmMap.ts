// Direct OSM map.json reads — used when public Overpass mirrors are busy.
// The main map API is authoritative for a small bbox and does not depend on
// Overpass instance health.
//
// When live OSM fails, callers can pass a Request so we load durable backups
// from /golf/osm (see scripts/backup-osm-data.mjs).

import { loadOsmMapBackup } from './osmBackup';
import { UA, type OsmElement } from './overpass';

const OSM_MAP_URLS = [
  'https://api.openstreetmap.org/api/0.6/map.json',
  'https://www.openstreetmap.org/api/0.6/map.json',
];

export type OsmMapBbox = {
  south: number;
  west: number;
  north: number;
  east: number;
};

export function parseMapBbox(raw: string | null): OsmMapBbox | null {
  if (!raw) return null;
  const parts = raw.split(',').map(Number);
  if (parts.length !== 4 || parts.some((n) => !Number.isFinite(n))) return null;
  const [south, west, north, east] = parts as [number, number, number, number];
  if (north <= south || east <= west) return null;
  return { south, west, north, east };
}

export function bboxFromLatLon(
  lat: number,
  lon: number,
  radiusM: number,
): OsmMapBbox {
  const latPad = Math.max(radiusM, 900) / 111_320;
  const lonPad =
    Math.max(radiusM, 900) /
    (111_320 * Math.max(0.2, Math.cos((lat * Math.PI) / 180)));
  return {
    south: lat - latPad,
    west: lon - lonPad,
    north: lat + latPad,
    east: lon + lonPad,
  };
}

export function padBbox(bbox: OsmMapBbox, factor = 0.35): OsmMapBbox {
  const dLat = (bbox.north - bbox.south) * factor;
  const dLon = (bbox.east - bbox.west) * factor;
  return {
    south: bbox.south - dLat,
    west: bbox.west - dLon,
    north: bbox.north + dLat,
    east: bbox.east + dLon,
  };
}

export function bboxArea(bbox: OsmMapBbox): number {
  return Math.max(0, bbox.north - bbox.south) * Math.max(0, bbox.east - bbox.west);
}

export function bboxQuery(bbox: OsmMapBbox): string {
  // OSM map API wants west,south,east,north
  return `${bbox.west},${bbox.south},${bbox.east},${bbox.north}`;
}

export function holesBboxKey(bbox: OsmMapBbox): string {
  // Golf holes API uses south,west,north,east
  return `${bbox.south},${bbox.west},${bbox.north},${bbox.east}`;
}

export type OsmMapFetchResult =
  | { kind: 'ok'; elements: OsmElement[] }
  /** OSM rejected the bbox (usually >50k nodes). Caller should shrink. */
  | { kind: 'too-large' }
  /** Transport / timeout / non-size upstream failure. */
  | { kind: 'error' };

/** Shrink a bbox toward its center (factor < 1). */
export function shrinkBbox(bbox: OsmMapBbox, factor = 0.72): OsmMapBbox {
  const f = Math.min(Math.max(factor, 0.35), 0.95);
  const midLat = (bbox.south + bbox.north) / 2;
  const midLon = (bbox.west + bbox.east) / 2;
  const halfLat = ((bbox.north - bbox.south) / 2) * f;
  const halfLon = ((bbox.east - bbox.west) / 2) * f;
  return {
    south: midLat - halfLat,
    west: midLon - halfLon,
    north: midLat + halfLat,
    east: midLon + halfLon,
  };
}

/**
 * Fetch raw OSM elements for a small bbox.
 * Distinguishes "too many nodes" (shrink + retry) from transport errors
 * (fall through to Overpass).
 * When live OSM fails and `opts.req` is set, tries /golf/osm course backups.
 */
export async function fetchOsmMapElements(
  bbox: OsmMapBbox,
  opts?: {
    timeoutMs?: number;
    attempts?: number;
    /** When set, load durable /golf/osm backups after live OSM fails. */
    req?: Request;
    courseName?: string;
  },
): Promise<OsmMapFetchResult> {
  if (bboxArea(bbox) > 0.12) return { kind: 'error' };

  // Dense coastal clubs (Pebble, Torrey) routinely return 4–8 MB; 3s was
  // aborting healthy downloads and leaving Prep with a blank satellite map.
  const timeoutMs = opts?.timeoutMs ?? 10_000;
  const attempts = opts?.attempts ?? 2;
  let sawTooLarge = false;

  for (let attempt = 0; attempt < attempts; attempt += 1) {
    const url = OSM_MAP_URLS[attempt % OSM_MAP_URLS.length]!;
    const ac = new AbortController();
    const timer = setTimeout(() => ac.abort(), timeoutMs);
    try {
      const res = await fetch(`${url}?bbox=${bboxQuery(bbox)}`, {
        headers: { 'User-Agent': UA, Accept: 'application/json' },
        signal: ac.signal,
      });
      if (!res.ok) {
        const detail = await res.text().catch(() => '');
        if (
          res.status === 400 &&
          /too many nodes|smaller area|bbox/i.test(detail)
        ) {
          sawTooLarge = true;
          return { kind: 'too-large' };
        }
        continue;
      }
      const body = (await res.json()) as {
        elements?: Array<{
          type: 'node' | 'way' | 'relation';
          id: number;
          lat?: number;
          lon?: number;
          nodes?: number[];
          tags?: Record<string, string>;
        }>;
      };
      return {
        kind: 'ok',
        elements: reconstructGolfElements(body.elements ?? []),
      };
    } catch {
      // try next mirror / attempt
    } finally {
      clearTimeout(timer);
    }
  }

  // Transport failure → durable course backup (never for "too large"; caller shrinks).
  if (!sawTooLarge && opts?.req) {
    const lat = (bbox.south + bbox.north) / 2;
    const lon = (bbox.west + bbox.east) / 2;
    const backup = await loadOsmMapBackup(opts.req, {
      lat,
      lon,
      courseName: opts.courseName,
    });
    if (backup?.elements?.length) {
      return { kind: 'ok', elements: backup.elements };
    }
  }

  return { kind: 'error' };
}

function reconstructGolfElements(
  raw: Array<{
    type: 'node' | 'way' | 'relation';
    id: number;
    lat?: number;
    lon?: number;
    nodes?: number[];
    tags?: Record<string, string>;
  }>,
): OsmElement[] {
  const keepNodeIds = new Set<number>();
  const keepWayIds = new Set<number>();
  for (const el of raw) {
    if (el.type !== 'way') continue;
    const tags = el.tags ?? {};
    if (!tags.golf && tags.leisure !== 'golf_course') continue;
    keepWayIds.add(el.id);
    for (const id of el.nodes ?? []) keepNodeIds.add(id);
  }

  const nodeById = new Map<number, { lat: number; lon: number }>();
  for (const el of raw) {
    if (
      el.type === 'node' &&
      typeof el.lat === 'number' &&
      typeof el.lon === 'number' &&
      (keepNodeIds.has(el.id) || Boolean(el.tags?.golf))
    ) {
      nodeById.set(el.id, { lat: el.lat, lon: el.lon });
    }
  }

  const elements: OsmElement[] = [];
  for (const el of raw) {
    if (el.type === 'node') {
      if (!el.tags?.golf) continue;
      if (typeof el.lat !== 'number' || typeof el.lon !== 'number') continue;
      elements.push({
        type: 'node',
        id: el.id,
        lat: el.lat,
        lon: el.lon,
        tags: el.tags,
      });
      continue;
    }
    if (el.type !== 'way' || !keepWayIds.has(el.id)) continue;
    const geometry = (el.nodes ?? [])
      .map((id) => nodeById.get(id))
      .filter((point): point is { lat: number; lon: number } => Boolean(point));
    elements.push({
      type: 'way',
      id: el.id,
      nodes: el.nodes,
      tags: el.tags,
      geometry,
    });
  }
  return elements;
}
