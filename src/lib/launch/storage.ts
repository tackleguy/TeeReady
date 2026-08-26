/** Local-first launch analysis storage. */

import type { LaunchAnalysis } from './types';

const KEY = 'teeready-launch-history-v1';
const MAX = 30;

export function loadLaunchHistory(): LaunchAnalysis[] {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as LaunchAnalysis[];
    return Array.isArray(parsed) ? parsed.filter((a) => a.ok) : [];
  } catch {
    return [];
  }
}

function saveHistory(items: LaunchAnalysis[]): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(items.slice(0, MAX)));
    window.dispatchEvent(new Event('teeready-launch-history-changed'));
  } catch {
    // Quota — ignore.
  }
}

export function saveLaunchAnalysis(analysis: LaunchAnalysis): void {
  const prev = loadLaunchHistory().filter((a) => a.id !== analysis.id);
  saveHistory([analysis, ...prev]);
}

export function getLaunchAnalysis(id: string): LaunchAnalysis | null {
  return loadLaunchHistory().find((a) => a.id === id) ?? null;
}

export function deleteLaunchAnalysis(id: string): void {
  saveHistory(loadLaunchHistory().filter((a) => a.id !== id));
}
