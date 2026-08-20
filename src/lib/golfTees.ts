import type { GolfHole, GolfTeeBox, TeeKind } from './golf';
import { haversineYards } from './golfMeasure';

function loopsMatch(a: string, b: string): boolean {
  const x = a.trim().toLowerCase();
  const y = b.trim().toLowerCase();
  if (!x || !y) return false;
  if (x === y) return true;
  return x.includes(y) || y.includes(x);
}

export function loopNames(holes: GolfHole[]): string[] {
  const names = [
    ...new Set(
      holes.map((h) => h.loop).filter((loop): loop is string => Boolean(loop)),
    ),
  ];
  return names.sort((a, b) => a.localeCompare(b));
}

export function holesOnLoop(holes: GolfHole[], loop: string | null): GolfHole[] {
  const loops = loopNames(holes);
  if (!loop) {
    if (loops.length <= 1) return holes;
    return holes.filter((h) => !h.loop);
  }
  return holes.filter((h) => loopsMatch(h.loop ?? '', loop));
}

function fallbackTee(hole: GolfHole): GolfTeeBox {
  return {
    id: 'card',
    label: 'Card',
    kind: 'mid',
    yards: hole.yards,
    bearingDeg: hole.bearingDeg,
    tee: hole.tee,
    path: hole.path,
    teeElevationM: hole.teeElevationM,
  };
}

export function teesOnHole(hole: GolfHole): GolfTeeBox[] {
  return hole.tees?.length ? hole.tees : [fallbackTee(hole)];
}

export function pickTee(hole: GolfHole, kind: TeeKind): GolfTeeBox {
  const tees = teesOnHole(hole);
  const matching = tees.filter((t) => t.kind === kind);
  if (matching.length === 1) return matching[0]!;
  if (matching.length > 1) {
    const sorted = [...matching].sort((a, b) => b.yards - a.yards);
    return sorted[Math.floor(sorted.length / 2)]!;
  }
  const sorted = [...tees].sort((a, b) => b.yards - a.yards);
  if (kind === 'back') return sorted[0]!;
  if (kind === 'front') return sorted[sorted.length - 1]!;
  return sorted[Math.floor(sorted.length / 2)]!;
}

export function applyTee(hole: GolfHole, kind: TeeKind): GolfHole {
  const tee = pickTee(hole, kind);
  const path = [...(tee.path ?? [tee.tee, hole.green])];
  const start = path[0];
  if (
    !start ||
    haversineYards(start.lat, start.lon, tee.tee.lat, tee.tee.lon) > 8
  ) {
    path.unshift(tee.tee);
  }
  const end = path[path.length - 1]!;
  if (haversineYards(end.lat, end.lon, hole.green.lat, hole.green.lon) > 10) {
    path.push(hole.green);
  }
  return {
    ...hole,
    yards: tee.yards,
    bearingDeg: tee.bearingDeg,
    tee: tee.tee,
    green: hole.green,
    path,
    teeElevationM: tee.teeElevationM,
  };
}

export function teeKindLabel(kind: TeeKind): string {
  if (kind === 'back') return 'Back';
  if (kind === 'front') return 'Front';
  return 'Middle';
}

const TEE_ORDER: TeeKind[] = ['back', 'mid', 'front'];

export function availableTeeKinds(holes: GolfHole[]): TeeKind[] {
  const kinds = new Set<TeeKind>();
  for (const hole of holes) {
    for (const tee of teesOnHole(hole)) kinds.add(tee.kind);
  }
  return TEE_ORDER.filter((kind) => kinds.has(kind));
}

export function pickLoopForCourse(courseName: string, loops: string[]): string | null {
  if (!loops.length) return null;
  const n = courseName.toLowerCase();
  const byLen = [...loops].sort((a, b) => b.length - a.length);
  const named = byLen.find((loop) => n.includes(loop.toLowerCase()));
  if (named) return named;
  const dirs = [
    'north',
    'south',
    'east',
    'west',
    'ocean',
    'valley',
    'black',
    'red',
    'blue',
    'gold',
    'white',
    'green',
    'yellow',
    'championship',
  ];
  for (const dir of dirs) {
    if (!new RegExp(`\\b${dir}\\b`, 'i').test(n)) continue;
    const hit = loops.find((loop) => loop.toLowerCase().includes(dir));
    if (hit) return hit;
  }
  if (loops.length === 1) return loops[0]!;
  return null;
}
