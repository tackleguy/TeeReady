/** Assemble a full swing guide: deterministic plan + short validated LLM sections. */

import { getSwingFault } from '../../../data/swingFaults';
import type { GolfPlayerProfile } from '../../golfProfile';
import { buildSwingPlan, type SwingPlan } from '../../swingPlan';
import { buildContactSheet } from '../coach/contactSheet';
import { swingLlmBaseUrl } from '../coach/config';
import type { SwingAnalysis } from '../types';
import {
  GUIDE_SYSTEM_BASE,
  modelForGuideSection,
  type GuideSectionId,
} from './config';
import {
  findRepeatedPhrase,
  logGuideRejection,
  validateGuideSection,
  validateMentionedDrills,
  type GuideSectionValidation,
} from './validate';

export type ProseSource = 'llm' | 'fallback';

export type GuideProseBlock = {
  text: string;
  source: ProseSource;
  model?: string;
  elapsedMs?: number;
  rejectionReason?: string;
};

export type SwingGuideDocument = {
  id: string;
  analysisId: string;
  createdAt: number;
  plan: SwingPlan;
  prose: {
    assessment: GuideProseBlock;
    rootCause: GuideProseBlock;
    whyDrills: GuideProseBlock;
    weeklyFraming: GuideProseBlock[];
    visualRead: GuideProseBlock;
  };
  /** Wall-clock for all LLM section calls. */
  totalLlmMs: number;
  usedLlm: boolean;
};

export type BuildGuideOptions = {
  analysis: SwingAnalysis;
  profile: GolfPlayerProfile;
  /** Force authored fallbacks (LLM off). */
  disableLlm?: boolean;
  signal?: AbortSignal;
  onSection?: (section: GuideSectionId, status: 'start' | 'ok' | 'fallback') => void;
};

async function requestSection(opts: {
  section: GuideSectionId;
  systemExtra: string;
  userPayload: unknown;
  imageDataUrl?: string;
  signal?: AbortSignal;
}): Promise<{ raw: string; elapsedMs: number; model: string } | null> {
  const model = modelForGuideSection(opts.section);
  const base = swingLlmBaseUrl();
  const url = `${base}/chat/completions`;
  const content: Array<
    | { type: 'text'; text: string }
    | { type: 'image_url'; image_url: { url: string } }
  > = [{ type: 'text', text: JSON.stringify(opts.userPayload, null, 2) }];
  if (opts.imageDataUrl) {
    content.push({ type: 'image_url', image_url: { url: opts.imageDataUrl } });
  }

  const started = performance.now();
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model,
        temperature: 0.3,
        max_tokens: 280,
        messages: [
          {
            role: 'system',
            content: `${GUIDE_SYSTEM_BASE}\n${opts.systemExtra}`,
          },
          { role: 'user', content },
        ],
      }),
      signal: opts.signal,
    });
    const elapsedMs = Math.round(performance.now() - started);
    if (!res.ok) return null;
    const data = (await res.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
    };
    const raw = data.choices?.[0]?.message?.content?.trim() ?? '';
    if (!raw) return null;
    return { raw, elapsedMs, model };
  } catch {
    return null;
  }
}

function parseJsonObject(raw: string): Record<string, unknown> | null {
  const trimmed = raw.trim();
  const start = trimmed.indexOf('{');
  const end = trimmed.lastIndexOf('}');
  if (start < 0 || end < start) return null;
  try {
    return JSON.parse(trimmed.slice(start, end + 1)) as Record<string, unknown>;
  } catch {
    return null;
  }
}

function fallbackBlock(text: string, reason?: string): GuideProseBlock {
  return { text, source: 'fallback', rejectionReason: reason };
}

function acceptOrFallback(
  section: GuideSectionId,
  validation: GuideSectionValidation,
  fallback: string,
  meta?: { model?: string; elapsedMs?: number; excerpt?: string },
): GuideProseBlock {
  if (validation.ok) {
    return {
      text: validation.text,
      source: 'llm',
      model: meta?.model,
      elapsedMs: meta?.elapsedMs,
    };
  }
  logGuideRejection({
    section,
    reason: validation.reason,
    detail: validation.detail,
    excerpt: (meta?.excerpt ?? '').slice(0, 240),
  });
  return fallbackBlock(fallback, validation.detail);
}

export async function buildSwingGuide(
  opts: BuildGuideOptions,
): Promise<SwingGuideDocument | null> {
  const plan = buildSwingPlan({
    metrics: opts.analysis.metrics,
    angle: opts.analysis.angle,
    profile: opts.profile,
  });
  if (!plan) return null;

  const fault = getSwingFault(plan.primary.faultId);
  const assessmentFb = fault?.assessmentFallback ?? opts.analysis.summary;
  const rootFb = fault?.rootCauseFallback ?? plan.causeChainNarrative;
  const whyFb = `These library drills target ${plan.primary.label.toLowerCase()} and fit your ${opts.profile.practiceFocus} practice focus with about ${opts.profile.roundsPerMonthGoal} rounds per month. Follow the authored setup and execution — do not invent new drills.`;
  const weeklyFb = Array.from({ length: plan.cycleWeeks }, (_, i) =>
    fallbackBlock(
      `Week ${i + 1}: stay on one feel for ${plan.primary.label.toLowerCase()} and tick the sessions.`,
    ),
  );
  const visualFb = fallbackBlock(
    'Use the contact sheet for a qualitative look at grip, posture, and alignment only — no invented angles. Trust the measured metrics table for numbers.',
  );

  let totalLlmMs = 0;
  let usedLlm = false;
  let contactSheet: string | undefined;
  if (!opts.disableLlm) {
    try {
      contactSheet = await buildContactSheet(opts.analysis.keyframes);
    } catch {
      contactSheet = undefined;
    }
  }

  const run = !opts.disableLlm;

  opts.onSection?.('assessment', 'start');
  let assessment = fallbackBlock(assessmentFb);
  if (run) {
    const input = {
      angle: opts.analysis.angle,
      fps: opts.analysis.fps,
      primary: plan.primary,
      secondary: plan.secondary,
      metrics: opts.analysis.metrics.map((m) => ({
        id: m.id,
        label: m.label,
        value: m.value,
        unit: m.unit,
        confidence: m.confidence,
      })),
    };
    const res = await requestSection({
      section: 'assessment',
      systemExtra:
        'Return JSON {"text":"..."} — narrate what the measurements show in ≤120 words. Numbers only from JSON.',
      userPayload: input,
      signal: opts.signal,
    });
    if (res) {
      totalLlmMs += res.elapsedMs;
      usedLlm = true;
      const obj = parseJsonObject(res.raw);
      const text = typeof obj?.text === 'string' ? obj.text : res.raw;
      assessment = acceptOrFallback(
        'assessment',
        validateGuideSection({
          section: 'assessment',
          text,
          inputJson: input,
          extraNumbers: [opts.analysis.fps, plan.cycleWeeks],
        }),
        assessmentFb,
        { ...res, excerpt: text },
      );
    }
  }
  opts.onSection?.('assessment', assessment.source === 'llm' ? 'ok' : 'fallback');

  opts.onSection?.('rootCause', 'start');
  let rootCause = fallbackBlock(rootFb);
  if (run) {
    const input = {
      primary: plan.primary,
      causeChain: plan.causeChain,
      causeChainNarrative: plan.causeChainNarrative,
    };
    const res = await requestSection({
      section: 'rootCause',
      systemExtra:
        'Return JSON {"text":"..."} — explain the authored cause chain in ≤100 words. Do not invent new causes.',
      userPayload: input,
      signal: opts.signal,
    });
    if (res) {
      totalLlmMs += res.elapsedMs;
      usedLlm = true;
      const obj = parseJsonObject(res.raw);
      const text = typeof obj?.text === 'string' ? obj.text : res.raw;
      rootCause = acceptOrFallback(
        'rootCause',
        validateGuideSection({
          section: 'rootCause',
          text,
          inputJson: input,
        }),
        rootFb,
        { ...res, excerpt: text },
      );
    }
  }
  opts.onSection?.('rootCause', rootCause.source === 'llm' ? 'ok' : 'fallback');

  opts.onSection?.('whyDrills', 'start');
  let whyDrills = fallbackBlock(whyFb);
  if (run) {
    const input = {
      goal: opts.profile.goals[0] ?? null,
      customGoals: opts.profile.customGoals,
      miss: opts.profile.miss,
      biggestLeak: opts.profile.biggestLeak,
      practiceFocus: opts.profile.practiceFocus,
      roundsPerMonthGoal: opts.profile.roundsPerMonthGoal,
      primaryFault: plan.primary.label,
      drills: plan.drillLibrary.map((d) => ({ id: d.id, name: d.name })),
    };
    const res = await requestSection({
      section: 'whyDrills',
      systemExtra:
        'Return JSON {"text":"...","drillNames":["..."]} — ≤80 words connecting selected drills to goal/miss. drillNames must be subset of input drills.',
      userPayload: input,
      signal: opts.signal,
    });
    if (res) {
      totalLlmMs += res.elapsedMs;
      usedLlm = true;
      const obj = parseJsonObject(res.raw);
      const text = typeof obj?.text === 'string' ? obj.text : res.raw;
      const mentioned = Array.isArray(obj?.drillNames)
        ? (obj.drillNames as unknown[]).filter((x): x is string => typeof x === 'string')
        : plan.drillLibrary.map((d) => d.name);
      const drillCheck = validateMentionedDrills(mentioned);
      const base = validateGuideSection({
        section: 'whyDrills',
        text,
        inputJson: input,
        mentionedDrills: mentioned,
        extraNumbers: [opts.profile.roundsPerMonthGoal],
      });
      const validation =
        drillCheck && !drillCheck.ok ? drillCheck : base;
      whyDrills = acceptOrFallback('whyDrills', validation, whyFb, {
        ...res,
        excerpt: text,
      });
    }
  }
  opts.onSection?.('whyDrills', whyDrills.source === 'llm' ? 'ok' : 'fallback');

  opts.onSection?.('weeklyFraming', 'start');
  const weeklyFraming: GuideProseBlock[] = [...weeklyFb];
  if (run) {
    for (let w = 1; w <= plan.cycleWeeks; w++) {
      const input = {
        week: w,
        cycleWeeks: plan.cycleWeeks,
        primaryFault: plan.primary.label,
        severity: plan.primary.severity,
        checkpoint: plan.checkpoints.find((c) => c.week === w) ?? null,
      };
      const res = await requestSection({
        section: 'weeklyFraming',
        systemExtra:
          'Return JSON {"text":"..."} — one encouraging line ≤25 words for this week.',
        userPayload: input,
        signal: opts.signal,
      });
      if (!res) continue;
      totalLlmMs += res.elapsedMs;
      usedLlm = true;
      const obj = parseJsonObject(res.raw);
      const text = typeof obj?.text === 'string' ? obj.text : res.raw;
      weeklyFraming[w - 1] = acceptOrFallback(
        'weeklyFraming',
        validateGuideSection({
          section: 'weeklyFraming',
          text,
          inputJson: input,
          extraNumbers: [w, plan.cycleWeeks],
          maxWords: 25,
        }),
        weeklyFb[w - 1]!.text,
        { ...res, excerpt: text },
      );
    }
  }
  opts.onSection?.(
    'weeklyFraming',
    weeklyFraming.some((w) => w.source === 'llm') ? 'ok' : 'fallback',
  );

  opts.onSection?.('visualRead', 'start');
  let visualRead = visualFb;
  if (run && contactSheet) {
    const input = {
      angle: opts.analysis.angle,
      note: 'Qualitative only: grip, posture, alignment, shaft look. No degrees or inches.',
    };
    const res = await requestSection({
      section: 'visualRead',
      systemExtra:
        'Return JSON {"text":"..."} — ≤80 words qualitative visual read from the image. No numbers.',
      userPayload: input,
      imageDataUrl: contactSheet,
      signal: opts.signal,
    });
    if (res) {
      totalLlmMs += res.elapsedMs;
      usedLlm = true;
      const obj = parseJsonObject(res.raw);
      const text = typeof obj?.text === 'string' ? obj.text : res.raw;
      const validation = validateGuideSection({
        section: 'visualRead',
        text,
        inputJson: {},
        extraNumbers: [],
      });
      visualRead = acceptOrFallback('visualRead', validation, visualFb.text, {
        ...res,
        excerpt: text,
      });
    }
  }
  opts.onSection?.('visualRead', visualRead.source === 'llm' ? 'ok' : 'fallback');

  const proseTexts = [
    assessment.text,
    rootCause.text,
    whyDrills.text,
    visualRead.text,
  ];
  const repeated = findRepeatedPhrase(proseTexts);
  if (repeated) {
    logGuideRejection({
      section: 'assessment',
      reason: 'repetition',
      detail: `Repeated phrase: "${repeated}"`,
      excerpt: repeated,
    });
    if (rootCause.text.toLowerCase().includes(repeated)) {
      rootCause = fallbackBlock(rootFb, 'repetition');
    }
    if (whyDrills.text.toLowerCase().includes(repeated)) {
      whyDrills = fallbackBlock(whyFb, 'repetition');
    }
  }

  return {
    id: `guide-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`,
    analysisId: opts.analysis.id,
    createdAt: Date.now(),
    plan,
    prose: {
      assessment,
      rootCause,
      whyDrills,
      weeklyFraming,
      visualRead,
    },
    totalLlmMs,
    usedLlm,
  };
}

export type { SwingPlan };
