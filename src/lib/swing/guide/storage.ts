/** Local-first swing guide cycles + checklist progress. */

import type { SwingGuideDocument } from './assemble';
import type { SwingMetric } from '../types';

const KEY = 'teeready-swing-guides-v1';
const CHECKLIST_KEY = 'teeready-swing-guide-checklist-v1';
const MAX = 30;

export type CycleOutcome = 'active' | 'improved' | 'stalled' | 'closed';

export type StoredSwingGuide = SwingGuideDocument & {
  outcome: CycleOutcome;
  /** Prior checkpoint comparison when re-measured. */
  progress?: {
    metricId: string;
    previous: number;
    current: number;
    target: number;
    unit: string;
    improved: boolean;
    delta: number;
  };
};

export function loadSwingGuides(): StoredSwingGuide[] {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as StoredSwingGuide[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function saveAll(guides: StoredSwingGuide[]): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(guides.slice(0, MAX)));
    window.dispatchEvent(new Event('teeready-swing-guides-changed'));
  } catch {
    // ignore quota
  }
}

export function saveSwingGuide(guide: StoredSwingGuide): void {
  const prev = loadSwingGuides().filter((g) => g.id !== guide.id);
  saveAll([guide, ...prev]);
}

export function getSwingGuide(id: string): StoredSwingGuide | null {
  return loadSwingGuides().find((g) => g.id === id) ?? null;
}

export function getActiveSwingGuide(): StoredSwingGuide | null {
  return loadSwingGuides().find((g) => g.outcome === 'active') ?? null;
}

export type ChecklistState = Record<string, boolean>;

export function loadGuideChecklist(guideId: string): ChecklistState {
  try {
    const raw = localStorage.getItem(CHECKLIST_KEY);
    if (!raw) return {};
    const all = JSON.parse(raw) as Record<string, ChecklistState>;
    return all[guideId] ?? {};
  } catch {
    return {};
  }
}

export function setGuideChecklistItem(
  guideId: string,
  itemId: string,
  done: boolean,
): void {
  try {
    const raw = localStorage.getItem(CHECKLIST_KEY);
    const all = raw ? (JSON.parse(raw) as Record<string, ChecklistState>) : {};
    const cur = { ...(all[guideId] ?? {}) };
    cur[itemId] = done;
    all[guideId] = cur;
    localStorage.setItem(CHECKLIST_KEY, JSON.stringify(all));
    window.dispatchEvent(new Event('teeready-swing-guides-changed'));
  } catch {
    // ignore
  }
}

/**
 * Compare a new analysis against the active cycle checkpoint.
 * Improved → close cycle. Full cycle elapsed without movement → stalled.
 */
export function evaluateCycleProgress(opts: {
  active: StoredSwingGuide;
  newMetrics: SwingMetric[];
  /** Rough weeks since cycle start. */
  weeksElapsed: number;
}): StoredSwingGuide {
  const cp = opts.active.plan.checkpoints[0];
  if (!cp) {
    return { ...opts.active, outcome: 'active' };
  }
  const metric = opts.newMetrics.find((m) => m.id === cp.metricId);
  if (!metric || metric.confidence === 'low') {
    return { ...opts.active, outcome: 'active' };
  }

  const previous = cp.currentValue;
  const current = metric.value;
  const target = cp.targetValue;
  const lowerIsBetter = target < previous;
  const improved = lowerIsBetter ? current <= target : current >= target;
  const moved =
    lowerIsBetter ? current < previous - Math.abs(previous - target) * 0.15 : current > previous + Math.abs(target - previous) * 0.15;

  const progress = {
    metricId: cp.metricId,
    previous,
    current,
    target,
    unit: cp.unit,
    improved,
    delta: Math.round((current - previous) * 1000) / 1000,
  };

  if (improved) {
    return { ...opts.active, outcome: 'improved', progress };
  }
  if (opts.weeksElapsed >= opts.active.plan.cycleWeeks && !moved) {
    return { ...opts.active, outcome: 'stalled', progress };
  }
  return { ...opts.active, outcome: 'active', progress };
}
