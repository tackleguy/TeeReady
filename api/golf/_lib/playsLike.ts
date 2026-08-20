// Shared slope / wind / club / altitude helpers for ensemble + notebook.

export type WindAspect =
  | 'head'
  | 'tail'
  | 'cross-L'
  | 'cross-R'
  | 'quarter-head'
  | 'quarter-tail';

export type MissBias = 'left' | 'right' | 'both' | 'straight';

export interface HoleIn {
  number: number;
  yards: number;
  bearingDeg: number;
  par?: number;
  name?: string;
  teeElevationM?: number;
  greenElevationM?: number;
}

export interface PlayerIn {
  handicap: number;
  miss: MissBias;
  sevenIronYards: number;
  driverYards: number;
}

export const ALTITUDE_PCT_PER_1000_FT = 2;

export function metersToFeet(m: number): number {
  return m * 3.28084;
}

export function altitudeBonusPct(elevFt: number): number {
  if (!Number.isFinite(elevFt) || elevFt <= 0) return 0;
  return (elevFt / 1000) * ALTITUDE_PCT_PER_1000_FT;
}

export function seaLevelYards(mapYards: number, elevFt: number): number {
  const factor = 1 + altitudeBonusPct(elevFt) / 100;
  return Math.max(1, Math.round(mapYards / factor));
}

export function circMeanDeg(degs: number[]): number | null {
  if (!degs.length) return null;
  let sx = 0;
  let sy = 0;
  for (const d of degs) {
    const r = (d * Math.PI) / 180;
    sx += Math.cos(r);
    sy += Math.sin(r);
  }
  return (((Math.atan2(sy, sx) * 180) / Math.PI) + 360) % 360;
}

export function median(nums: number[]): number | null {
  if (!nums.length) return null;
  const a = [...nums].sort((x, y) => x - y);
  const mid = Math.floor(a.length / 2);
  return a.length % 2 ? a[mid]! : (a[mid - 1]! + a[mid]!) / 2;
}

export function stdev(nums: number[]): number {
  if (nums.length < 2) return 0;
  const m = nums.reduce((s, n) => s + n, 0) / nums.length;
  const v = nums.reduce((s, n) => s + (n - m) ** 2, 0) / (nums.length - 1);
  return Math.sqrt(v);
}

export function angDiff(a: number, b: number): number {
  return ((((a - b) % 360) + 540) % 360) - 180;
}

export function aspectFor(relDeg: number): WindAspect {
  const a = Math.abs(relDeg);
  if (a <= 25) return 'head';
  if (a >= 155) return 'tail';
  if (a <= 65) return 'quarter-head';
  if (a >= 115) return 'quarter-tail';
  return relDeg > 0 ? 'cross-L' : 'cross-R';
}

export function windAdjustment(
  headwindMph: number,
  crosswindMph = 0,
): number {
  // Head: ~10 yd / 6 mph. Cross still costs distance (~4 yd / 6 mph).
  return headwindMph * (10 / 6) + Math.abs(crosswindMph) * (4 / 6);
}

export function slopeFor(hole: HoleIn): {
  slopeYards: number;
  elevationChangeFt: number;
} {
  if (
    !Number.isFinite(hole.teeElevationM) ||
    !Number.isFinite(hole.greenElevationM)
  ) {
    return { slopeYards: 0, elevationChangeFt: 0 };
  }
  const deltaM = hole.greenElevationM! - hole.teeElevationM!;
  return {
    slopeYards: Math.round(deltaM * 1.09361),
    elevationChangeFt: Math.round(deltaM * 3.28084),
  };
}

const ROLL_PCT: Record<string, number> = {
  Driver: 0.1,
  '3W': 0.08,
  '5W': 0.06,
  '4i': 0.05,
  '5i': 0.05,
  '6i': 0.04,
  '7i': 0.04,
  '8i': 0.025,
  '9i': 0.025,
  PW: 0.015,
  GW: 0.01,
  SW: 0.01,
};

export function totalAvgYards(carryYards: number, club: string): number {
  const pct = ROLL_PCT[club] ?? 0.03;
  return Math.max(40, Math.round(carryYards * (1 + pct)));
}

export function bagFor(player: PlayerIn): Array<{ label: string; yards: number }> {
  const gap = Math.max(8, Math.min(14, player.sevenIronYards * 0.075));
  const carry: Array<{ label: string; yards: number }> = [
    { label: 'Driver', yards: player.driverYards },
    { label: '3W', yards: Math.round(player.driverYards * 0.9) },
    { label: '5W', yards: Math.round(player.driverYards * 0.82) },
    { label: '4i', yards: Math.round(player.sevenIronYards + gap * 3) },
    { label: '5i', yards: Math.round(player.sevenIronYards + gap * 2) },
    { label: '6i', yards: Math.round(player.sevenIronYards + gap) },
    { label: '7i', yards: player.sevenIronYards },
    { label: '8i', yards: Math.round(player.sevenIronYards - gap) },
    { label: '9i', yards: Math.round(player.sevenIronYards - gap * 2) },
    { label: 'PW', yards: Math.round(player.sevenIronYards - gap * 3) },
    { label: 'GW', yards: Math.round(player.sevenIronYards - gap * 4) },
    { label: 'SW', yards: Math.max(45, Math.round(player.sevenIronYards - gap * 5)) },
  ];
  return carry.map((club) => ({
    label: club.label,
    yards: totalAvgYards(club.yards, club.label),
  }));
}

export function nearestClub(
  yards: number,
  player: PlayerIn,
): { label: string; yards: number } {
  return bagFor(player).reduce((best, club) =>
    Math.abs(club.yards - yards) < Math.abs(best.yards - yards) ? club : best,
  );
}

export function clubPlan(
  hole: HoleIn,
  playsLikeYards: number,
  player: PlayerIn,
): { hint: string; recommended: string } {
  const driverTotal = totalAvgYards(player.driverYards, 'Driver');
  const par =
    typeof hole.par === 'number' && Number.isFinite(hole.par) && hole.par > 0
      ? hole.par
      : 4;
  if (par <= 3 || playsLikeYards <= driverTotal * 0.78) {
    const club = nearestClub(playsLikeYards, player);
    return {
      recommended: club.label,
      hint: `${club.label} ${club.yards} yd total avg · plays ${playsLikeYards}`,
    };
  }

  const conservative =
    player.handicap >= 20 && hole.yards < driverTotal * 1.55;
  const teeClub = conservative
    ? nearestClub(driverTotal * 0.88, player)
    : { label: 'Driver', yards: driverTotal };
  const remaining = Math.max(40, playsLikeYards - teeClub.yards);
  const approach = nearestClub(remaining, player);
  return {
    recommended: `${teeClub.label} → ${approach.label}`,
    hint: `${teeClub.label} ${teeClub.yards} tot avg, then ${approach.label} ${approach.yards} tot avg from ~${Math.round(remaining)} yd`,
  };
}

export function holeWind(
  windFromDeg: number,
  windMph: number,
  bearingDeg: number,
  yards: number,
): {
  headwindMph: number;
  crosswindMph: number;
  driftYards: number;
  aspect: WindAspect;
  windAdjustmentYards: number;
} {
  const rel = angDiff(windFromDeg, bearingDeg);
  const rad = (rel * Math.PI) / 180;
  const headwindMph = windMph * Math.cos(rad);
  const crosswindMph = -windMph * Math.sin(rad);
  const driftYards = crosswindMph * (yards / 100) * 1.2;
  return {
    headwindMph,
    crosswindMph,
    driftYards,
    aspect: aspectFor(rel),
    windAdjustmentYards: windAdjustment(headwindMph, crosswindMph),
  };
}

export function aggregateWinds(
  samples: Array<{ speed: number; dir: number; gust?: number }>,
): {
  windFromDeg: number;
  windMph: number;
  gustMph: number;
  agreement: number;
} {
  if (!samples.length) {
    return { windFromDeg: 0, windMph: 0, gustMph: 0, agreement: 0 };
  }
  let u = 0;
  let v = 0;
  const speeds: number[] = [];
  const gusts: number[] = [];
  const dirs: number[] = [];
  for (const r of samples) {
    const rad = ((r.dir + 180) * Math.PI) / 180;
    u += r.speed * Math.sin(rad);
    v += r.speed * Math.cos(rad);
    speeds.push(r.speed);
    gusts.push(r.gust ?? r.speed);
    dirs.push(r.dir);
  }
  const n = samples.length;
  u /= n;
  v /= n;
  const ensSpeed = Math.hypot(u, v);
  const ensToward = ((Math.atan2(u, v) * 180) / Math.PI + 360) % 360;
  const ensFrom = (ensToward + 180) % 360;
  const medSpeed = median(speeds) ?? ensSpeed;
  const medGust = median(gusts) ?? medSpeed;
  const circ = circMeanDeg(dirs) ?? ensFrom;
  const dirSpread = stdev(dirs.map((d) => angDiff(d, circ)));
  const spdSpread = stdev(speeds);
  // Median speed, not vector magnitude. Disagreeing directions cancel the
  // vector and would make every hole play exactly as card yardage.
  const windMph = medSpeed || ensSpeed;
  const windFromDeg = ensSpeed >= windMph * 0.4 ? ensFrom : circ;
  return {
    windFromDeg,
    windMph,
    gustMph: Math.max(medGust, windMph),
    agreement: Math.max(0, Math.min(1, 1 - dirSpread / 90 - spdSpread / 25)),
  };
}

export function playsLikeYards(
  mapYards: number,
  windAdjYards: number,
  slopeYards: number,
  elevFt: number,
): number {
  return Math.max(
    40,
    Math.round(seaLevelYards(mapYards, elevFt) + windAdjYards + slopeYards),
  );
}
