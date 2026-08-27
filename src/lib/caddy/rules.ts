/** Deterministic caddie prose when the local LLM is offline or rejected. */

import { missLabel } from '../golfProfile';
import type { CaddyContext, CaddyResult } from './types';

export function rulesCaddyTip(ctx: CaddyContext): CaddyResult {
  const { facts } = ctx;
  const parts: string[] = [];

  if (facts.mode === 'gps' && facts.remainMidYd != null) {
    const club = facts.bagClubForRemain ?? facts.recommendedClub ?? 'your stock club';
    const wind =
      facts.windMph != null
        ? ` Wind about ${facts.windMph} mph${facts.aspect ? ` (${facts.aspect})` : ''}.`
        : '';
    parts.push(
      `${facts.remainMidYd} to the middle — ${club} fits your bag for this number.${wind}`,
    );
    if (facts.playsLikeYards != null && facts.playsLikeYards !== facts.yards) {
      const delta = facts.playsLikeYards - facts.yards;
      parts.push(
        `Hole plays like ${facts.playsLikeYards} (${delta > 0 ? '+' : ''}${delta} vs card).`,
      );
    }
  } else {
    if (facts.tip) parts.push(facts.tip);
    else if (facts.forecastNarrative) parts.push(facts.forecastNarrative);
    else {
      parts.push(
        `Hole ${facts.holeNumber}${facts.par != null ? ` · par ${facts.par}` : ''} · ${facts.yards} yd.`,
      );
    }
    if (facts.clubHint) {
      parts.push(
        facts.clubHint.endsWith('.') ? facts.clubHint : `${facts.clubHint}.`,
      );
    } else if (facts.recommendedClub) {
      parts.push(`Stock call: ${facts.recommendedClub}.`);
    }
    if (facts.playsLikeYards != null && facts.playsLikeYards !== facts.yards) {
      const delta = facts.playsLikeYards - facts.yards;
      parts.push(
        `Plays like ${facts.playsLikeYards} (${delta > 0 ? '+' : ''}${delta}).`,
      );
    }
    if (facts.fairway || facts.green) {
      parts.push(
        `Turf: fairways ${facts.fairway ?? 'medium'}, greens ${facts.green ?? 'medium'}.`,
      );
    }
  }

  const miss = missLabel(facts.miss);
  if (facts.miss !== 'straight' && !parts.some((p) => p.toLowerCase().includes('miss'))) {
    parts.push(`Plan for your ${miss.toLowerCase()} miss.`);
  }

  return {
    text: parts.filter(Boolean).join(' ').replace(/\s+/g, ' ').trim() || 'Pick a target and commit.',
    source: 'rules',
  };
}

export function rulesCaddyAsk(ctx: CaddyContext, question: string): CaddyResult {
  const tip = rulesCaddyTip(ctx);
  const q = question.trim().toLowerCase();
  let extra = '';
  if (q.includes('club') || q.includes('hit') || q.includes('what')) {
    const club =
      ctx.facts.bagClubForRemain ??
      ctx.facts.recommendedClub ??
      ctx.facts.clubHint;
    if (club) extra = ` Club call from the numbers: ${club}.`;
  } else if (q.includes('wind') || q.includes('weather')) {
    if (ctx.facts.windMph != null) {
      extra = ` Wind is ${ctx.facts.windMph} mph${ctx.facts.aspect ? ` · ${ctx.facts.aspect}` : ''}.`;
    }
  } else if (q.includes('how long') || q.includes('plays')) {
    if (ctx.facts.playsLikeYards != null) {
      extra = ` Plays like ${ctx.facts.playsLikeYards}.`;
    }
  }
  return {
    text: `${tip.text}${extra}`.trim(),
    source: 'rules',
  };
}
