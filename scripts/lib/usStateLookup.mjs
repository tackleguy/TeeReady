/**
 * Point-in-polygon US state lookup from us-atlas states-10m (TopoJSON).
 * Used by audit-course-data — not a bounding-box approximation.
 */

import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const TOPO_PATH = join(ROOT, 'data/states-10m.json');

/** Census FIPS → USPS abbreviation (50 states + DC). */
const FIPS_TO_ST = {
  '01': 'AL',
  '02': 'AK',
  '04': 'AZ',
  '05': 'AR',
  '06': 'CA',
  '08': 'CO',
  '09': 'CT',
  '10': 'DE',
  '11': 'DC',
  '12': 'FL',
  '13': 'GA',
  '15': 'HI',
  '16': 'ID',
  '17': 'IL',
  '18': 'IN',
  '19': 'IA',
  '20': 'KS',
  '21': 'KY',
  '22': 'LA',
  '23': 'ME',
  '24': 'MD',
  '25': 'MA',
  '26': 'MI',
  '27': 'MN',
  '28': 'MS',
  '29': 'MO',
  '30': 'MT',
  '31': 'NE',
  '32': 'NV',
  '33': 'NH',
  '34': 'NJ',
  '35': 'NM',
  '36': 'NY',
  '37': 'NC',
  '38': 'ND',
  '39': 'OH',
  '40': 'OK',
  '41': 'OR',
  '42': 'PA',
  '44': 'RI',
  '45': 'SC',
  '46': 'SD',
  '47': 'TN',
  '48': 'TX',
  '49': 'UT',
  '50': 'VT',
  '51': 'VA',
  '53': 'WA',
  '54': 'WV',
  '55': 'WI',
  '56': 'WY',
};

const US_ST = new Set(Object.values(FIPS_TO_ST));

function decodeArcs(rawArcs, transform) {
  const [sx, sy] = transform.scale ?? [1, 1];
  const [tx, ty] = transform.translate ?? [0, 0];
  return rawArcs.map((arc) => {
    const ring = [];
    let x = 0;
    let y = 0;
    for (const [dx, dy] of arc) {
      x += dx;
      y += dy;
      ring.push([x * sx + tx, y * sy + ty]);
    }
    return ring;
  });
}

function stitchArcs(arcIndexes, arcs) {
  const ring = [];
  for (const arcIndex of arcIndexes) {
    const idx = arcIndex >= 0 ? arcIndex : ~arcIndex;
    const segment = arcs[idx];
    if (!segment) continue;
    const points = arcIndex >= 0 ? segment : [...segment].reverse();
    for (let i = 0; i < points.length; i += 1) {
      if (i === 0 && ring.length) {
        const last = ring[ring.length - 1];
        const first = points[0];
        if (last[0] === first[0] && last[1] === first[1]) continue;
      }
      ring.push(points[i]);
    }
  }
  return ring;
}

function ringsFromGeometry(geometry, arcs) {
  const rings = [];
  if (geometry.type === 'Polygon') {
    for (const arcGroup of geometry.arcs) {
      rings.push(stitchArcs(arcGroup, arcs));
    }
  } else if (geometry.type === 'MultiPolygon') {
    for (const polygon of geometry.arcs) {
      for (const arcGroup of polygon) {
        rings.push(stitchArcs(arcGroup, arcs));
      }
    }
  }
  return rings;
}

/** Ray-casting; ring is [lon, lat][] */
export function pointInRing(lon, lat, ring) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const xi = ring[i][0];
    const yi = ring[i][1];
    const xj = ring[j][0];
    const yj = ring[j][1];
    const intersect =
      yi > lat !== yj > lat &&
      lon < ((xj - xi) * (lat - yi)) / (yj - yi + 0.0) + xi;
    if (intersect) inside = !inside;
  }
  return inside;
}

let statePolygons = null;

function loadStatePolygons() {
  if (statePolygons) return statePolygons;
  const topo = JSON.parse(readFileSync(TOPO_PATH, 'utf8'));
  const arcs = decodeArcs(topo.arcs, topo.transform ?? {});
  statePolygons = [];

  for (const geom of topo.objects.states.geometries) {
    const fips = String(geom.id ?? '').padStart(2, '0');
    const st = FIPS_TO_ST[fips];
    if (!st) continue;
    const rings = ringsFromGeometry(geom, arcs);
    statePolygons.push({ st, rings });
  }
  return statePolygons;
}

/** @returns {string | null} USPS state code if inside US states/DC, else null */
export function stateAtPoint(lat, lon) {
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;
  for (const { st, rings } of loadStatePolygons()) {
    for (const ring of rings) {
      if (pointInRing(lon, lat, ring)) return st;
    }
  }
  return null;
}

export function isInUnitedStates(lat, lon) {
  return stateAtPoint(lat, lon) != null;
}

export function isValidUsStateCode(st) {
  return US_ST.has(String(st ?? '').toUpperCase());
}

export { US_ST };
