// Three miss lines per shot + discrete hole tree (tee, approach, chip, putt).
// Uses miss bias, wind drift, and fairway/green firmness.

import type { GolfHole, HoleBrief, TurfReport } from './golf';
import { haversineYards } from './golfMeasure';
import type { BagClub, GolfPlayerProfile, MissBias } from './golfProfile';
import { destPoint, type LonLat } from './golfWind';
import { bearingDeg } from './geo';

export type ShotKind = 'tee' | 'approach' | 'chip' | 'putt';
export type LineRole = 'start' | 'miss' | 'more';
export type LineSide = 'left' | 'center' | 'right';

export interface MissSpec {
  label: string;
  side: LineSide;
  role: LineRole;
  latYd: number;
  p: number;
}

export interface ShotLine {
  id: string;
  label: string;
  role: LineRole;
  side: LineSide;
  p: number;
  kind: ShotKind;
  club: string;
  yards: number;
  from: LonLat;
  to: LonLat;
  path: LonLat[];
  color: string;
}

export interface PlannedShot {
  kind: ShotKind;
  club: string;
  note: string;
  lines: ShotLine[];
}

export interface HoleForecast {
  shots: PlannedShot[];
  girPct: number;
  chipPct: number;
  putts: { one: number; two: number; three: number };
  scorePct: {
    eagleBetter: number;
    birdie: number;
    par: number;
    bogey: number;
    doublePlus: number;
  };
  expectedScore: number;
  expectedToPar: number;
  mostLikely: string;
  narrative: string;
}

const GREEN_YD = 16;
const CHIP_YD = 42;
const PUTT_YD = 7;

export function missSpecs(
  miss: MissBias,
  shotYards: number,
  handicap: number,
): MissSpec[] {
  const length = Math.max(0.12, Math.min(1.35, shotYards / 220));
  let spread = (14 + handicap * 1.15) * length;
  if (shotYards <= PUTT_YD) spread = 0.8 + handicap * 0.025;
  else if (shotYards <= CHIP_YD) spread = Math.min(spread, 7 + handicap * 0.15);
  else spread = Math.max(spread, 14);
  const isPutt = shotYards <= PUTT_YD;
  const isChip = !isPutt && shotYards <= CHIP_YD;
  const floor = isPutt ? 0.5 : isChip ? 3 : 12;
  const extra = isPutt ? 0.7 : isChip ? 4 : 10;
  const mild = Math.max(floor, Math.round(spread * 10) / 10);
  const more = Math.max(mild + extra, Math.round(spread * 18) / 10);

  if (miss === 'right') {
    return [
      { label: 'Start', side: 'center', role: 'start', latYd: 0, p: 0.45 },
      { label: 'Right', side: 'right', role: 'miss', latYd: mild, p: 0.35 },
      { label: 'More right', side: 'right', role: 'more', latYd: more, p: 0.2 },
    ];
  }
  if (miss === 'left') {
    return [
      { label: 'Start', side: 'center', role: 'start', latYd: 0, p: 0.45 },
      { label: 'Left', side: 'left', role: 'miss', latYd: -mild, p: 0.35 },
      { label: 'More left', side: 'left', role: 'more', latYd: -more, p: 0.2 },
    ];
  }
  if (miss === 'both') {
    return [
      { label: 'Left', side: 'left', role: 'miss', latYd: -mild, p: 0.3 },
      { label: 'Start', side: 'center', role: 'start', latYd: 0, p: 0.4 },
      { label: 'Right', side: 'right', role: 'miss', latYd: mild, p: 0.3 },
    ];
  }
  const tight = Math.max(1, Math.round(spread * 0.4));
  return [
    { label: 'Left', side: 'left', role: 'miss', latYd: -tight, p: 0.15 },
    { label: 'Start', side: 'center', role: 'start', latYd: 0, p: 0.7 },
    { label: 'Right', side: 'right', role: 'miss', latYd: tight, p: 0.15 },
  ];
}

export function lineColor(side: LineSide, role: LineRole): string {
  if (role === 'start') return '#f8fafc';
  if (side === 'left') return role === 'more' ? '#818cf8' : '#38bdf8';
  if (side === 'right') return role === 'more' ? '#fb7185' : '#facc15';
  return '#e2e8f0';
}

function clamp(n: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, n));
}

function nearestClub(yards: number, bag: BagClub[]): BagClub {
  if (!bag.length) return { key: '7i', label: '7i', yards: Math.round(yards) };
  return bag.reduce((best, club) =>
    Math.abs(club.yards - yards) < Math.abs(best.yards - yards) ? club : best,
  );
}

function clubForKind(kind: ShotKind, yards: number, bag: BagClub[]): string {
  if (kind === 'putt') return 'Putter';
  if (kind === 'chip') {
    const sw = bag.find((c) => c.key === 'sw') ?? bag[bag.length - 1];
    return sw?.label ?? 'SW';
  }
  return nearestClub(yards, bag).label;
}

function shotKind(distYd: number, isFirst: boolean, par: number): ShotKind {
  if (distYd <= PUTT_YD) return 'putt';
  if (distYd <= CHIP_YD) return 'chip';
  if (isFirst && par >= 4 && distYd > 90) return 'tee';
  return 'approach';
}

function extraAlong(
  kind: ShotKind,
  yards: number,
  turf: TurfReport,
): number {
  if (kind === 'putt') return 0;
  if (kind === 'tee') {
    return Math.round(turf.fairwayRollYd * clamp(yards / 240, 0.25, 1));
  }
  if (kind === 'chip') {
    return turf.green === 'firm' ? 6 : turf.green === 'soft' ? 0 : 3;
  }
  return Math.round(turf.greenReleaseYd * clamp(yards / 150, 0.2, 1.15));
}

function windLanding(
  from: LonLat,
  intended: LonLat,
  yards: number,
  axis: number,
  crosswindMph: number,
  headwindMph: number,
  extraYd: number,
): LonLat {
  const carryScale = clamp(1 - headwindMph / 90, 0.72, 1.18);
  const along = destPoint(from, axis, yards * carryScale + extraYd);
  const drift = crosswindMph * (yards / 100) * 1.2;
  const fromIntended = destPoint(intended, axis, extraYd);
  const base = extraYd || carryScale !== 1 ? along : fromIntended;
  return destPoint(base, axis + 90, drift);
}

function curveTo(
  from: LonLat,
  to: LonLat,
  axis: number,
  crosswindMph: number,
): LonLat[] {
  const yards = Math.max(1, haversineYards(from.lat, from.lon, to.lat, to.lon));
  const drift = crosswindMph * (yards / 100) * 1.2;
  const steps = yards < 20 ? 8 : 18;
  const pts: LonLat[] = [];
  for (let i = 0; i <= steps; i += 1) {
    const t = i / steps;
    const along: LonLat = {
      lon: from.lon + (to.lon - from.lon) * t,
      lat: from.lat + (to.lat - from.lat) * t,
    };
    const windShift = destPoint(along, axis + 90, drift * (t * t - t));
    pts.push(windShift);
  }
  pts[pts.length - 1] = to;
  pts[0] = from;
  return pts;
}

function puttMakePct(feet: number, hcp: number): { one: number; two: number; three: number } {
  const skill = clamp(1.15 - hcp / 50, 0.55, 1.15);
  const one = clamp(0.96 * Math.exp(-feet / (7.2 * skill)), 0.02, 0.98);
  const three = clamp((feet / 70) * (0.06 + hcp * 0.004), 0.01, 0.42);
  const two = Math.max(0.04, 1 - one - three);
  const sum = one + two + three;
  return { one: one / sum, two: two / sum, three: three / sum };
}

function pinDist(pt: LonLat, green: LonLat): number {
  return haversineYards(pt.lat, pt.lon, green.lat, green.lon);
}

function onGreen(distYd: number, turf: TurfReport): boolean {
  const hold = turf.green === 'soft' ? 20 : turf.green === 'firm' ? 13 : 16;
  return distYd <= Math.max(GREEN_YD, hold);
}

interface Branch {
  p: number;
  strokes: number;
  gir: boolean;
  chipped: boolean;
  putts: number;
  labels: string[];
}

function finishPutting(
  distYd: number,
  p: number,
  strokes: number,
  gir: boolean,
  chipped: boolean,
  labels: string[],
  hcp: number,
): Branch[] {
  const feet = Math.max(1, distYd * 3);
  const split = puttMakePct(feet, hcp);
  return [
    {
      p: p * split.one,
      strokes: strokes + 1,
      gir,
      chipped,
      putts: 1,
      labels: [...labels, '1-putt'],
    },
    {
      p: p * split.two,
      strokes: strokes + 2,
      gir,
      chipped,
      putts: 2,
      labels: [...labels, '2-putt'],
    },
    {
      p: p * split.three,
      strokes: strokes + 3,
      gir,
      chipped,
      putts: 3,
      labels: [...labels, '3-putt'],
    },
  ];
}

function branchShot(
  from: LonLat,
  aim: LonLat,
  green: LonLat,
  kind: ShotKind,
  p: number,
  strokes: number,
  gir: boolean,
  chipped: boolean,
  labels: string[],
  miss: MissBias,
  hcp: number,
  bag: BagClub[],
  brief: HoleBrief | undefined,
  turf: TurfReport,
  depth: number,
): Branch[] {
  if (depth > 5) {
    return finishPutting(pinDist(from, green), p, strokes, gir, chipped, labels, hcp);
  }
  const dist = Math.max(
    1,
    haversineYards(from.lat, from.lon, aim.lat, aim.lon),
  );
  if (kind === 'putt' || pinDist(from, green) <= PUTT_YD) {
    return finishPutting(pinDist(from, green), p, strokes, gir, chipped, labels, hcp);
  }

  const axis = bearingDeg(from.lat, from.lon, aim.lat, aim.lon);
  const specs = missSpecs(miss, dist, hcp);
  const extra = extraAlong(kind, dist, turf);
  const cross = brief?.crosswindMph ?? 0;
  const head = brief?.headwindMph ?? 0;
  const club = clubForKind(kind, dist, bag);
  const out: Branch[] = [];

  for (const spec of specs) {
    const drifted = windLanding(from, aim, dist, axis, cross, head, extra);
    const landed = destPoint(drifted, axis + 90, spec.latYd);
    const remain = pinDist(landed, green);
    const hitGreen = onGreen(remain, turf);
    const nextKind: ShotKind = hitGreen
      ? 'putt'
      : remain <= CHIP_YD
        ? 'chip'
        : 'approach';
    const nextGir = gir || ((kind === 'tee' || kind === 'approach') && hitGreen);
    const nextChip = chipped || kind === 'chip' || (!hitGreen && nextKind === 'chip');
    out.push(
      ...branchShot(
        landed,
        green,
        green,
        nextKind,
        p * spec.p,
        strokes + 1,
        nextGir,
        nextChip,
        [...labels, `${club} ${spec.label.toLowerCase()}`],
        miss,
        hcp,
        bag,
        brief,
        turf,
        depth + 1,
      ),
    );
  }
  return out;
}

function mapLinesForShot(
  from: LonLat,
  to: LonLat,
  kind: ShotKind,
  miss: MissBias,
  hcp: number,
  bag: BagClub[],
  brief: HoleBrief | undefined,
  turf: TurfReport,
  shotIdx: number,
): PlannedShot {
  const yards = Math.max(
    1,
    Math.round(haversineYards(from.lat, from.lon, to.lat, to.lon)),
  );
  const axis = bearingDeg(from.lat, from.lon, to.lat, to.lon);
  const specs = missSpecs(miss, yards, hcp);
  const extra = extraAlong(kind, yards, turf);
  const cross = brief?.crosswindMph ?? 0;
  const head = brief?.headwindMph ?? 0;
  const club = clubForKind(kind, yards, bag);
  const lines: ShotLine[] = specs.map((spec, i) => {
    const drifted = windLanding(from, to, yards, axis, cross, head, extra);
    const end = destPoint(drifted, axis + 90, spec.latYd);
    return {
      id: `${kind}-${shotIdx}-${i}`,
      label: spec.label,
      role: spec.role,
      side: spec.side,
      p: spec.p,
      kind,
      club,
      yards,
      from,
      to: end,
      path: curveTo(from, end, axis, kind === 'putt' ? 0 : cross),
      color: lineColor(spec.side, spec.role),
    };
  });
  const missNames = specs
    .filter((s) => s.role !== 'start')
    .map((s) => s.label.toLowerCase())
    .join(' / ');
  const note =
    kind === 'putt'
      ? `${club} · ${Math.round(yards * 3)} ft · ${missNames}`
      : `${club} · ${yards} yd · ${missNames}`;
  return { kind, club, note, lines };
}

export function predictHole(input: {
  hole: GolfHole;
  target: LonLat;
  bag: BagClub[];
  profile: GolfPlayerProfile;
  brief?: HoleBrief;
  turf: TurfReport;
}): HoleForecast {
  const { hole, target, bag, profile, brief, turf } = input;
  const tee: LonLat = { lon: hole.tee.lon, lat: hole.tee.lat };
  const green: LonLat = { lon: hole.green.lon, lat: hole.green.lat };
  const par =
    typeof hole.par === 'number' && hole.par > 0 ? hole.par : hole.yards < 230 ? 3 : hole.yards > 470 ? 5 : 4;
  const miss = profile.miss;
  const hcp = profile.handicap;

  const firstDist = haversineYards(tee.lat, tee.lon, target.lat, target.lon);
  const firstKind = shotKind(firstDist, true, par);
  const shots: PlannedShot[] = [
    mapLinesForShot(tee, target, firstKind, miss, hcp, bag, brief, turf, 0),
  ];

  const startLine = shots[0]!.lines.find((l) => l.role === 'start') ?? shots[0]!.lines[0]!;
  let cursor = startLine.to;
  let remain = pinDist(cursor, green);
  let idx = 1;
  while (remain > 0.6 && shots.length < 4) {
    const kind: ShotKind = onGreen(remain, turf) || remain <= PUTT_YD
      ? 'putt'
      : remain <= CHIP_YD
        ? 'chip'
        : 'approach';
    shots.push(mapLinesForShot(cursor, green, kind, miss, hcp, bag, brief, turf, idx));
    const nextStart =
      shots[shots.length - 1]!.lines.find((l) => l.role === 'start') ??
      shots[shots.length - 1]!.lines[0]!;
    cursor = nextStart.to;
    remain = pinDist(cursor, green);
    idx += 1;
    if (kind === 'putt') break;
    if (kind === 'chip') {
      shots.push(mapLinesForShot(cursor, green, 'putt', miss, hcp, bag, brief, turf, idx));
      break;
    }
  }

  const branches = branchShot(
    tee,
    target,
    green,
    firstKind,
    1,
    0,
    false,
    false,
    [],
    miss,
    hcp,
    bag,
    brief,
    turf,
    0,
  );

  const tot = branches.reduce((s, b) => s + b.p, 0) || 1;
  const w = (pred: (b: Branch) => boolean) =>
    branches.reduce((s, b) => s + (pred(b) ? b.p : 0), 0) / tot;
  const wPutts = (n: number) => w((b) => b.putts === n);
  const expectedScore =
    branches.reduce((s, b) => s + b.strokes * b.p, 0) / tot;
  const scorePct = {
    eagleBetter: w((b) => b.strokes <= par - 2),
    birdie: w((b) => b.strokes === par - 1),
    par: w((b) => b.strokes === par),
    bogey: w((b) => b.strokes === par + 1),
    doublePlus: w((b) => b.strokes >= par + 2),
  };

  const top = [...branches].sort((a, b) => b.p - a.p)[0];
  const mostLikely = top
    ? `${top.labels.join(' → ')} · ${top.strokes} (${
        top.strokes === par
          ? 'par'
          : top.strokes < par
            ? `${par - top.strokes} under`
            : `${top.strokes - par} over`
      })`
    : '—';

  const missPhrase =
    miss === 'right'
      ? 'right and more right'
      : miss === 'left'
        ? 'left and more left'
        : miss === 'both'
          ? 'left and right'
          : 'tight left/right';

  const pct = (n: number) => `${Math.round(n * 100)}%`;
  const narrative = [
    turf.note,
    `Every shot shows three lines: start, then ${missPhrase}.`,
    `Most likely: ${mostLikely}.`,
    `GIR ${pct(w((b) => b.gir))} · chip ${pct(w((b) => b.chipped))} · putts 1/2/3 ${pct(wPutts(1))}/${pct(wPutts(2))}/${pct(wPutts(3))}.`,
    `Birdie ${pct(scorePct.birdie)} · par ${pct(scorePct.par)} · bogey ${pct(scorePct.bogey)} · double+ ${pct(scorePct.doublePlus)}. Expected ${expectedScore.toFixed(1)} vs par ${par}.`,
  ].join(' ');

  return {
    shots,
    girPct: w((b) => b.gir),
    chipPct: w((b) => b.chipped),
    putts: { one: wPutts(1), two: wPutts(2), three: wPutts(3) },
    scorePct,
    expectedScore: Math.round(expectedScore * 10) / 10,
    expectedToPar: Math.round((expectedScore - par) * 10) / 10,
    mostLikely,
    narrative,
  };
}

export function playLinesGeoJSON(forecast: HoleForecast | null) {
  if (!forecast) {
    return { type: 'FeatureCollection' as const, features: [] };
  }
  const features = forecast.shots.flatMap((shot) =>
    shot.lines.flatMap((line) => {
      const path = {
        type: 'Feature' as const,
        properties: {
          kind: shot.kind,
          role: line.role,
          side: line.side,
          color: line.color,
          label: line.label,
        },
        geometry: {
          type: 'LineString' as const,
          coordinates: line.path.map((p) => [p.lon, p.lat] as [number, number]),
        },
      };
      const tickAxis = bearingDeg(
        line.from.lat,
        line.from.lon,
        line.to.lat,
        line.to.lon,
      );
      const tick = {
        type: 'Feature' as const,
        properties: {
          kind: 'tick',
          role: line.role,
          side: line.side,
          color: line.color,
          label: line.label,
        },
        geometry: {
          type: 'LineString' as const,
          coordinates: [
            [
            destPoint(line.to, tickAxis + 90, 8).lon,
            destPoint(line.to, tickAxis + 90, 8).lat,
          ],
          [
            destPoint(line.to, tickAxis - 90, 8).lon,
            destPoint(line.to, tickAxis - 90, 8).lat,
          ],
          ] as Array<[number, number]>,
        },
      };
      return [path, tick];
    }),
  );
  return { type: 'FeatureCollection' as const, features };
}
