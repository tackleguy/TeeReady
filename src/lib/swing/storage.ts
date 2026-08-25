/** Local-first swing analysis storage (same pattern as round history). */

import type { SwingAnalysis } from './types';

const KEY = 'teeready-swing-history-v1';
const MAX = 20;

export function loadSwingHistory(): SwingAnalysis[] {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as SwingAnalysis[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function saveHistory(items: SwingAnalysis[]): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(items.slice(0, MAX)));
    window.dispatchEvent(new Event('teeready-swing-history-changed'));
  } catch {
    // Quota or private mode — ignore.
  }
}

export function saveSwingAnalysis(analysis: SwingAnalysis): void {
  // Drop landmark series from older entries if storage is tight — keep latest full.
  const prev = loadSwingHistory().filter((a) => a.id !== analysis.id);
  const next = [analysis, ...prev].slice(0, MAX);
  try {
    localStorage.setItem(KEY, JSON.stringify(next));
    window.dispatchEvent(new Event('teeready-swing-history-changed'));
  } catch {
    // Retry without keyframe images on older rows.
    const slim = next.map((a, i) =>
      i === 0
        ? a
        : {
            ...a,
            keyframes: { p1: '', p4: '', p7: '', p10: '' },
            frames: [],
          },
    );
    try {
      localStorage.setItem(KEY, JSON.stringify(slim));
      window.dispatchEvent(new Event('teeready-swing-history-changed'));
    } catch {
      saveHistory([
        {
          ...analysis,
          frames: analysis.frames,
          keyframes: analysis.keyframes,
        },
      ]);
    }
  }
}

export function getSwingAnalysis(id: string): SwingAnalysis | null {
  return loadSwingHistory().find((a) => a.id === id) ?? null;
}

export function deleteSwingAnalysis(id: string): void {
  saveHistory(loadSwingHistory().filter((a) => a.id !== id));
}
