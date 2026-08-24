/**
 * Shared golf catalog validation + scorecard synthesis helpers.
 */

import type { CourseScorecard, ScorecardHole } from '../_data/scorecards';
import { US_CATALOG, type UsCatalogEntry } from '../_data/usCatalog';

const PAR3_SLOTS_18 = [2, 7, 11, 16];
const PAR5_SLOTS_18 = [4, 13, 17];
const PAR3_SLOTS_9 = [2, 7];
const PAR5_SLOTS_9 = [4];

export function validParForHoles(holes: number, par: number): boolean {
  if (holes === 9) return par >= 27 && par <= 40;
  if (holes === 18) return par >= 54 && par <= 74;
  return false;
}

export function validYardageForHoles(holes: number, yards?: number): boolean {
  if (yards == null) return true;
  if (holes === 9) return yards >= 900 && yards <= 3_800;
  return yards >= 4_500 && yards <= 8_800;
}

export function isVerifiedCatalogEntry(entry: UsCatalogEntry): boolean {
  if (!entry.ci || !entry.st) return false;
  if (entry.h !== 9 && entry.h !== 18) return false;
  if (!entry.p || !validParForHoles(entry.h, entry.p)) return false;
  if (!validYardageForHoles(entry.h, entry.y)) return false;
  return parTemplate(entry.h, entry.p).reduce((sum, par) => sum + par, 0) === entry.p;
}

export function parTemplate(holeCount: number, totalPar: number): number[] {
  if (holeCount === 18 && totalPar === 72) {
    return [4, 4, 3, 4, 5, 4, 4, 3, 5, 4, 4, 3, 4, 5, 4, 4, 3, 5];
  }
  if (holeCount === 9 && totalPar === 36) {
    return [4, 4, 3, 4, 5, 4, 4, 3, 4];
  }
  if (holeCount === 9 && totalPar === 27) {
    return [3, 3, 3, 3, 3, 3, 3, 3, 3];
  }

  const pars = Array<number>(holeCount).fill(4);
  let sum = holeCount * 4;
  const par3Slots = holeCount === 18 ? PAR3_SLOTS_18 : PAR3_SLOTS_9;
  const par5Slots = holeCount === 18 ? PAR5_SLOTS_18 : PAR5_SLOTS_9;

  for (const idx of par3Slots) {
    if (idx < holeCount && sum - 1 >= totalPar) {
      pars[idx] = 3;
      sum -= 1;
    }
  }
  for (const idx of par5Slots) {
    if (idx < holeCount && sum + 1 <= totalPar) {
      pars[idx] = 5;
      sum += 1;
    }
  }

  let guard = 0;
  while (sum < totalPar && guard++ < holeCount * 4) {
    const idx = pars.findIndex((p) => p === 4);
    if (idx < 0) break;
    pars[idx] = 5;
    sum += 1;
  }
  while (sum > totalPar && guard++ < holeCount * 4) {
    const idx5 = pars.findIndex((p) => p === 5);
    if (idx5 >= 0) {
      pars[idx5] = 4;
      sum -= 1;
      continue;
    }
    const idx4 = pars.findIndex((p) => p === 4);
    if (idx4 >= 0) {
      pars[idx4] = 3;
      sum -= 1;
      continue;
    }
    break;
  }

  return pars;
}

function distributeYardages(holes: ScorecardHole[], totalYards: number): void {
  const parSum = holes.reduce((sum, hole) => sum + hole.par, 0);
  if (!parSum) return;
  for (const hole of holes) {
    const yards = Math.round((hole.par / parSum) * totalYards);
    hole.back = yards;
    hole.mid = yards;
  }
}

function completeHints(
  entry: UsCatalogEntry,
): Map<number, [number, number, number?]> | null {
  const holeCount = entry.h;
  if (holeCount !== 9 && holeCount !== 18) return null;
  const hints = entry.sc ?? [];
  if (hints.length !== holeCount) return null;

  const byHole = new Map<number, [number, number, number?]>();
  for (const row of hints) {
    byHole.set(row[0], row);
  }
  if (byHole.size !== holeCount) return null;

  const ordered = [...byHole.values()].sort((a, b) => a[0] - b[0]);
  const parSum = ordered.reduce((sum, row) => sum + row[1], 0);
  if (entry.p != null && Math.abs(parSum - entry.p) > 1) return null;
  return byHole;
}

function holesFromCompleteHints(
  byHole: Map<number, [number, number, number?]>,
): ScorecardHole[] {
  return [...byHole.values()]
    .sort((a, b) => a[0] - b[0])
    .map((row, index) => {
      const hole: ScorecardHole = { hole: index + 1, par: row[1] };
      if (row[2] != null) hole.hcp = row[2];
      return hole;
    });
}

function holesFromTemplate(entry: UsCatalogEntry): ScorecardHole[] | null {
  const holeCount = entry.h!;
  const totalPar = entry.p!;
  const template = parTemplate(holeCount, totalPar);
  const templateSum = template.reduce((sum, par) => sum + par, 0);
  if (templateSum !== totalPar) return null;

  return template.map((par, index) => ({
    hole: index + 1,
    par,
  }));
}

export function scorecardFromCatalogEntry(
  entry: UsCatalogEntry,
): CourseScorecard | null {
  if (!isVerifiedCatalogEntry(entry)) return null;

  const complete = completeHints(entry);
  const holes = complete
    ? holesFromCompleteHints(complete)
    : holesFromTemplate(entry);
  if (!holes) return null;

  const totalPar = holes.reduce((sum, hole) => sum + hole.par, 0);
  if (totalPar !== entry.p) return null;

  const card: CourseScorecard = {
    name: entry.n,
    totalPar,
    osmIds: entry.o ? [entry.o] : undefined,
    holes,
  };
  if (entry.y) distributeYardages(holes, entry.y);
  return card;
}

export function normalizeCourseName(name: string): string {
  return name
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^\w\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function findCatalogScorecard(opts: {
  courseName?: string;
  osmId?: number;
}): CourseScorecard | null {
  if (opts.osmId != null) {
    const match = US_CATALOG.find((entry) => entry.o === opts.osmId);
    if (match) {
      const card = scorecardFromCatalogEntry(match);
      if (card) return card;
    }
  }

  const courseName = opts.courseName?.trim();
  if (!courseName) return null;
  const target = normalizeCourseName(courseName);
  if (!target) return null;

  let best: UsCatalogEntry | null = null;
  for (const entry of US_CATALOG) {
    if (!isVerifiedCatalogEntry(entry)) continue;
    const name = normalizeCourseName(entry.n);
    if (name === target) return scorecardFromCatalogEntry(entry);
    if (
      name.length >= 8 &&
      target.length >= 8 &&
      (name.includes(target) || target.includes(name))
    ) {
      if (!best || name.length < normalizeCourseName(best.n).length) best = entry;
    }
  }
  return best ? scorecardFromCatalogEntry(best) : null;
}
