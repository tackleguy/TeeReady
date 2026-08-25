/** Section validators for the assembled swing guide. */

import { swingDrillNames } from '../../../data/swingDrills';
import {
  extractNumbersFromText,
  normalizeNumberToken,
} from '../coach/validate';
import { GUIDE_WORD_LIMITS, type GuideSectionId } from './config';

export type GuideRejectReason =
  | 'empty'
  | 'too-long'
  | 'fabricated-number'
  | 'unknown-drill'
  | 'bad-json'
  | 'repetition';

export type GuideSectionValidation =
  | { ok: true; text: string }
  | {
      ok: false;
      reason: GuideRejectReason;
      detail: string;
      fabricated?: number[];
      drills?: string[];
    };

const REJECTION_KEY = 'teeready-swing-guide-rejections-v1';
const MAX_LOG = 80;

export type GuideRejectionLog = {
  at: number;
  section: GuideSectionId | string;
  reason: GuideRejectReason;
  detail: string;
  excerpt: string;
};

export function wordCount(text: string): number {
  return text
    .trim()
    .split(/\s+/)
    .filter(Boolean).length;
}

export function allowedNumbersFromJson(input: unknown): Set<string> {
  const allowed = new Set<string>();
  const walk = (v: unknown) => {
    if (typeof v === 'number' && Number.isFinite(v)) {
      allowed.add(normalizeNumberToken(v));
      return;
    }
    if (Array.isArray(v)) {
      v.forEach(walk);
      return;
    }
    if (v && typeof v === 'object') {
      for (const val of Object.values(v)) walk(val);
    }
  };
  walk(input);
  return allowed;
}

function checkNumbers(
  text: string,
  allowed: Set<string>,
): GuideSectionValidation | null {
  const found = extractNumbersFromText(text);
  const fabricated = found.filter((n) => !allowed.has(normalizeNumberToken(n)));
  if (fabricated.length) {
    return {
      ok: false,
      reason: 'fabricated-number',
      detail: `Fabricated number(s): ${fabricated.join(', ')}`,
      fabricated,
    };
  }
  return null;
}

function checkDrills(text: string, allowedNames: string[]): GuideSectionValidation | null {
  const unknown: string[] = [];
  const guess = text.match(/\b([A-Z][a-z]+(?:\s+[A-Za-z-]+){0,4})\b/g) ?? [];
  for (const g of guess) {
    const looksLikeDrill =
      /drill|swing|hold|gate|pause|whoosh|post|pump|step|mirror|wall|chair|spot|count|width|hinge|feel|compression|pose|turns?/i.test(
        g,
      );
    if (!looksLikeDrill) continue;
    if (
      /\bdrill\b/i.test(g) &&
      !allowedNames.some((n) => n.toLowerCase() === g.toLowerCase())
    ) {
      unknown.push(g);
    }
  }
  if (unknown.length) {
    return {
      ok: false,
      reason: 'unknown-drill',
      detail: `Unknown drill name(s): ${unknown.join(', ')}`,
      drills: unknown,
    };
  }
  return null;
}

/** Stricter drill check: every name in `mentioned` must be in the library. */
export function validateMentionedDrills(
  mentioned: string[],
  libraryNames: string[] = swingDrillNames(),
): GuideSectionValidation | null {
  const unknown = mentioned.filter(
    (m) => !libraryNames.some((n) => n.toLowerCase() === m.toLowerCase()),
  );
  if (unknown.length) {
    return {
      ok: false,
      reason: 'unknown-drill',
      detail: `Unknown drill name(s): ${unknown.join(', ')}`,
      drills: unknown,
    };
  }
  return null;
}

export function validateGuideSection(opts: {
  section: GuideSectionId;
  text: string;
  inputJson: unknown;
  /** Extra allowed numbers (week indexes, etc.). */
  extraNumbers?: number[];
  mentionedDrills?: string[];
  maxWords?: number;
}): GuideSectionValidation {
  const trimmed = opts.text.trim();
  if (!trimmed) {
    return { ok: false, reason: 'empty', detail: 'Empty section' };
  }

  const limit = opts.maxWords ?? GUIDE_WORD_LIMITS[opts.section];
  if (wordCount(trimmed) > limit) {
    return {
      ok: false,
      reason: 'too-long',
      detail: `Word count ${wordCount(trimmed)} exceeds ${limit}`,
    };
  }

  const allowed = allowedNumbersFromJson(opts.inputJson);
  for (const n of opts.extraNumbers ?? []) {
    allowed.add(normalizeNumberToken(n));
  }

  const numFail = checkNumbers(trimmed, allowed);
  if (numFail) return numFail;

  if (opts.mentionedDrills) {
    const drillFail = validateMentionedDrills(opts.mentionedDrills);
    if (drillFail) return drillFail;
  }

  const softDrill = checkDrills(trimmed, swingDrillNames());
  if (softDrill) return softDrill;

  return { ok: true, text: trimmed };
}

/** Detect long shared phrases across sections (small-model loops). */
export function findRepeatedPhrase(
  sections: string[],
  minWords = 8,
): string | null {
  const norms = sections.map((s) => s.toLowerCase().replace(/\s+/g, ' ').trim());
  for (let i = 0; i < norms.length; i++) {
    const words = norms[i]!.split(' ');
    if (words.length < minWords) continue;
    for (let len = Math.min(16, words.length); len >= minWords; len--) {
      for (let start = 0; start + len <= words.length; start++) {
        const phrase = words.slice(start, start + len).join(' ');
        for (let j = 0; j < norms.length; j++) {
          if (i === j) continue;
          if (norms[j]!.includes(phrase)) return phrase;
        }
      }
    }
  }
  return null;
}

export function logGuideRejection(
  entry: Omit<GuideRejectionLog, 'at'>,
): void {
  try {
    const prev = loadGuideRejections();
    const next = [{ ...entry, at: Date.now() }, ...prev].slice(0, MAX_LOG);
    localStorage.setItem(REJECTION_KEY, JSON.stringify(next));
    console.warn('[swing-guide] rejected', entry.section, entry.reason, entry.detail);
  } catch {
    console.warn('[swing-guide] rejected', entry.section, entry.reason, entry.detail);
  }
}

export function loadGuideRejections(): GuideRejectionLog[] {
  try {
    const raw = localStorage.getItem(REJECTION_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as GuideRejectionLog[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function guideRejectionStats(): Record<string, number> {
  const logs = loadGuideRejections();
  const out: Record<string, number> = {};
  for (const l of logs) {
    const key = `${l.section}:${l.reason}`;
    out[key] = (out[key] ?? 0) + 1;
  }
  return out;
}
