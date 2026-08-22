/** Lightweight round history for coach progress (local only). */

const KEY = 'teeready-round-log-v1';
const MAX = 40;

export type RoundLogEntry = {
  at: number;
  courseName: string;
};

export function loadRoundLog(): RoundLogEntry[] {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as RoundLogEntry[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function logRoundStart(courseName: string): void {
  try {
    const prev = loadRoundLog();
    const next = [{ at: Date.now(), courseName }, ...prev].slice(0, MAX);
    localStorage.setItem(KEY, JSON.stringify(next));
    window.dispatchEvent(new Event('teeready-round-log-changed'));
  } catch {
    // ignore
  }
}

export function roundsThisMonth(): number {
  const now = new Date();
  const y = now.getFullYear();
  const m = now.getMonth();
  return loadRoundLog().filter((e) => {
    const d = new Date(e.at);
    return d.getFullYear() === y && d.getMonth() === m;
  }).length;
}
