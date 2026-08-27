/** Reject caddie text that invents numbers or runs long. */

import { allowedNumbersFromFacts, normalizeNumberToken } from './context';
import { CADDY_MAX_CHARS } from './prompt';
import type { CaddyFacts } from './types';

export type CaddyValidationOk = { ok: true; text: string };
export type CaddyValidationFail = {
  ok: false;
  reason: 'empty' | 'too-long' | 'fabricated-number';
  detail: string;
  fabricated?: number[];
};
export type CaddyValidation = CaddyValidationOk | CaddyValidationFail;

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

export function validateCaddyResponse(
  text: string,
  facts: CaddyFacts,
): CaddyValidation {
  const trimmed = text.trim();
  if (!trimmed) {
    return { ok: false, reason: 'empty', detail: 'Empty caddie response' };
  }
  if (trimmed.length > CADDY_MAX_CHARS) {
    return {
      ok: false,
      reason: 'too-long',
      detail: `Response length ${trimmed.length} exceeds ${CADDY_MAX_CHARS}`,
    };
  }

  const allowed = allowedNumbersFromFacts(facts);
  const found = extractNumbersFromText(trimmed);
  const fabricated = found.filter(
    (n) => !allowed.has(normalizeNumberToken(n)),
  );

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
