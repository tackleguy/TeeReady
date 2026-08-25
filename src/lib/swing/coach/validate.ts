/** Reject coach text that invents numbers or runs long. */

import { COACH_MAX_CHARS } from './config';
import type { SwingMetric } from '../types';

export type CoachValidationOk = { ok: true; text: string };
export type CoachValidationFail = {
  ok: false;
  reason: 'empty' | 'too-long' | 'fabricated-number';
  detail: string;
  fabricated?: number[];
};
export type CoachValidation = CoachValidationOk | CoachValidationFail;

const REJECTION_KEY = 'teeready-swing-coach-rejections-v1';
const MAX_LOG = 50;

export type CoachRejectionLog = {
  at: number;
  reason: CoachValidationFail['reason'];
  detail: string;
  fabricated?: number[];
  excerpt: string;
};

/** Normalise a number for set membership (trim trailing zeros). */
export function normalizeNumberToken(n: number): string {
  if (!Number.isFinite(n)) return '';
  const rounded = Math.round(n * 1e6) / 1e6;
  let s = String(rounded);
  if (s.includes('e') || s.includes('E')) {
    s = rounded.toFixed(6);
  }
  if (s.includes('.')) {
    s = s.replace(/\.?0+$/, '');
  }
  return s;
}

/** Collect every numeric token allowed by the ground-truth metrics JSON. */
export function allowedNumbersFromMetrics(
  metrics: SwingMetric[],
  extra: number[] = [],
): Set<string> {
  const allowed = new Set<string>();
  const add = (n: number) => {
    const tok = normalizeNumberToken(n);
    if (tok) allowed.add(tok);
  };
  for (const m of metrics) {
    add(m.value);
    add(m.validAtFps);
  }
  for (const n of extra) add(n);
  return allowed;
}

/**
 * Extract numeric literals from coach prose.
 * Skips lone zeros used as placeholders rarely; keeps decimals and integers.
 */
export function extractNumbersFromText(text: string): number[] {
  const out: number[] = [];
  const re = /\d+(?:\.\d+)?/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    const n = Number(m[0]);
    if (Number.isFinite(n)) out.push(n);
  }
  return out;
}

export function validateCoachResponse(
  text: string,
  metrics: SwingMetric[],
  extras: number[] = [],
): CoachValidation {
  const trimmed = text.trim();
  if (!trimmed) {
    return { ok: false, reason: 'empty', detail: 'Empty coach response' };
  }
  if (trimmed.length > COACH_MAX_CHARS) {
    return {
      ok: false,
      reason: 'too-long',
      detail: `Response length ${trimmed.length} exceeds ${COACH_MAX_CHARS}`,
    };
  }

  const allowed = allowedNumbersFromMetrics(metrics, extras);
  const found = extractNumbersFromText(trimmed);
  const fabricated = found.filter((n) => !allowed.has(normalizeNumberToken(n)));

  if (fabricated.length > 0) {
    return {
      ok: false,
      reason: 'fabricated-number',
      detail: `Fabricated number(s): ${fabricated.join(', ')}`,
      fabricated,
    };
  }

  return { ok: true, text: trimmed };
}

export function logCoachRejection(entry: Omit<CoachRejectionLog, 'at'>): void {
  try {
    const prev = loadCoachRejections();
    const next = [{ ...entry, at: Date.now() }, ...prev].slice(0, MAX_LOG);
    localStorage.setItem(REJECTION_KEY, JSON.stringify(next));
    console.warn('[swing-coach] response rejected:', entry.reason, entry.detail);
  } catch {
    console.warn('[swing-coach] response rejected:', entry.reason, entry.detail);
  }
}

export function loadCoachRejections(): CoachRejectionLog[] {
  try {
    const raw = localStorage.getItem(REJECTION_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as CoachRejectionLog[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}
