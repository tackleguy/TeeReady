/** Archived rounds for stats — FIR, GIR, chips, penalties, sand. */

import type { TrackedRound } from './golfTracker';
import { loadRound, clearRound } from './golfTracker';

export type { HoleScore } from './golfTracker';

const KEY = 'teeready-round-history-v1';
const MAX = 50;

export type SavedRound = TrackedRound & {
  finishedAt: number;
};

export function loadRoundHistory(): SavedRound[] {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as SavedRound[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function saveHistory(rounds: SavedRound[]): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(rounds.slice(0, MAX)));
    window.dispatchEvent(new Event('teeready-round-history-changed'));
  } catch {
    // ignore
  }
}

/** Archive current live round and clear it. */
export function finishAndArchiveRound(
  live?: TrackedRound | null,
): SavedRound | null {
  const toSave = live ?? loadRound();
  if (!toSave || toSave.scores.length === 0) return null;
  const saved: SavedRound = { ...toSave, finishedAt: Date.now() };
  const next = [saved, ...loadRoundHistory()].slice(0, MAX);
  saveHistory(next);
  clearRound();
  return saved;
}

export function archiveRound(round: TrackedRound): void {
  if (!round.scores.length) return;
  const saved: SavedRound = { ...round, finishedAt: Date.now() };
  const next = [saved, ...loadRoundHistory()].slice(0, MAX);
  saveHistory(next);
}

export type RoundStatSummary = {
  rounds: number;
  holes: number;
  avgGross: number | null;
  firPct: number | null;
  girPct: number | null;
  avgChips: number | null;
  totalPenalties: number;
  sandSavePct: number | null;
};

export function aggregateStats(rounds: SavedRound[]): RoundStatSummary {
  let holes = 0;
  let grossSum = 0;
  let firHit = 0;
  let firOpps = 0;
  let girHit = 0;
  let girOpps = 0;
  let chipsSum = 0;
  let chipsHoles = 0;
  let penalties = 0;
  let sandMade = 0;
  let sandOpps = 0;

  for (const r of rounds) {
    for (const s of r.scores) {
      holes += 1;
      grossSum += s.strokes;
      if (s.fairwayHit != null) {
        firOpps += 1;
        if (s.fairwayHit) firHit += 1;
      }
      if (s.gir != null) {
        girOpps += 1;
        if (s.gir) girHit += 1;
      }
      if (s.chips != null) {
        chipsSum += s.chips;
        chipsHoles += 1;
      }
      penalties += s.penalties ?? 0;
      if (s.sandSave != null) {
        sandOpps += 1;
        if (s.sandSave) sandMade += 1;
      }
    }
  }

  return {
    rounds: rounds.length,
    holes,
    avgGross: holes ? Math.round((grossSum / holes) * 18 * 10) / 10 : null,
    firPct: firOpps ? Math.round((firHit / firOpps) * 100) : null,
    girPct: girOpps ? Math.round((girHit / girOpps) * 100) : null,
    avgChips: chipsHoles ? Math.round((chipsSum / chipsHoles) * 10) / 10 : null,
    totalPenalties: penalties,
    sandSavePct: sandOpps ? Math.round((sandMade / sandOpps) * 100) : null,
  };
}
