/** Collapsible Llama caddie: auto tip on hole/weather + ask box. */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Loader2, MessageCircle, RefreshCw, Send, Sparkles, X } from 'lucide-react';
import {
  askCaddy,
  autoCaddyTip,
  buildCaddyContext,
  type CaddyResult,
} from '../../lib/caddy';
import type { GolfHole, HoleBrief, TurfReport } from '../../lib/golf';
import type { HoleForecast } from '../../lib/golfPredict';
import type { BagClub, GolfPlayerProfile } from '../../lib/golfProfile';
import { GlassPanel } from '../ui/GlassPanel';

type Props = {
  mode: 'prep' | 'gps';
  courseName: string;
  hole: GolfHole;
  profile: GolfPlayerProfile;
  bag: BagClub[];
  brief: HoleBrief | null | undefined;
  turf: TurfReport | null | undefined;
  forecast: HoleForecast | null | undefined;
  remain?: { front: number; mid: number; back: number } | null;
  ensembleSummary?: string | null;
  /** Compact strip for mobile GPS. */
  compact?: boolean;
  onClose?: () => void;
};

type ChatTurn = {
  id: string;
  role: 'caddy' | 'you';
  text: string;
  source?: CaddyResult['source'];
};

export function AiCaddyPanel({
  mode,
  courseName,
  hole,
  profile,
  bag,
  brief,
  turf,
  forecast,
  remain,
  ensembleSummary,
  compact = false,
  onClose,
}: Props) {
  const [open, setOpen] = useState(!compact);
  const [question, setQuestion] = useState('');
  const [busy, setBusy] = useState(false);
  const [tip, setTip] = useState<CaddyResult | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [turns, setTurns] = useState<ChatTurn[]>([]);
  const abortRef = useRef<AbortController | null>(null);
  const tipKeyRef = useRef('');

  const ctx = useMemo(
    () =>
      buildCaddyContext({
        mode,
        courseName,
        hole,
        profile,
        bag,
        brief,
        turf,
        forecast,
        remain,
        ensembleSummary,
      }),
    [
      mode,
      courseName,
      hole,
      profile,
      bag,
      brief,
      turf,
      forecast,
      remain,
      ensembleSummary,
    ],
  );

  const tipKey = useMemo(
    () =>
      [
        mode,
        hole.number,
        brief?.playsLikeYards ?? '',
        brief?.windMph ?? '',
        brief?.recommendedClub ?? '',
        remain?.mid ?? '',
        turf?.fairway ?? '',
        hourBucket(ensembleSummary),
      ].join('|'),
    [mode, hole.number, brief, remain, turf, ensembleSummary],
  );

  const refreshTip = useCallback(async () => {
    abortRef.current?.abort();
    const ac = new AbortController();
    abortRef.current = ac;
    setBusy(true);
    try {
      const result = await autoCaddyTip(ctx, { signal: ac.signal });
      if (ac.signal.aborted) return;
      setTip(result);
      setNotice(result.notice ?? null);
      setTurns((prev) => {
        const withoutAuto = prev.filter((t) => !t.id.startsWith('auto-'));
        const autoTurn: ChatTurn = {
          id: `auto-${tipKey}`,
          role: 'caddy',
          text: result.text,
          source: result.source,
        };
        return [autoTurn, ...withoutAuto].slice(0, 8);
      });
    } finally {
      if (!ac.signal.aborted) setBusy(false);
    }
  }, [ctx, tipKey]);

  useEffect(() => {
    if (tipKeyRef.current === tipKey) return;
    tipKeyRef.current = tipKey;
    void refreshTip();
    return () => {
      abortRef.current?.abort();
    };
  }, [tipKey, refreshTip]);

  const sendAsk = useCallback(async () => {
    const q = question.trim();
    if (!q || busy) return;
    setQuestion('');
      setTurns((prev) => [
      ...prev,
      { id: `you-${Date.now()}`, role: 'you' as const, text: q },
    ]);
    abortRef.current?.abort();
    const ac = new AbortController();
    abortRef.current = ac;
    setBusy(true);
    try {
      const result = await askCaddy(ctx, q, { signal: ac.signal });
      if (ac.signal.aborted) return;
      setNotice(result.notice ?? null);
      setTurns((prev) => {
        const reply: ChatTurn = {
          id: `caddy-${Date.now()}`,
          role: 'caddy',
          text: result.text,
          source: result.source,
        };
        return [...prev, reply].slice(-10);
      });
    } finally {
      if (!ac.signal.aborted) setBusy(false);
    }
  }, [question, busy, ctx]);

  const header = (
    <div className="flex items-center gap-2 px-2.5 py-1.5">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="inline-flex min-w-0 flex-1 items-center gap-1.5 text-left"
        aria-expanded={open}
      >
        <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-brand/25 text-brand">
          <Sparkles className="h-3.5 w-3.5" aria-hidden />
        </span>
        <span className="min-w-0">
          <span className="block text-[11px] font-semibold uppercase tracking-wider text-[var(--ink-3)]">
            AI Caddie · {mode === 'gps' ? 'GPS' : 'Prep'}
          </span>
          {!open && tip ? (
            <span className="block truncate text-[11px] text-[var(--ink-2)]">
              {tip.text}
            </span>
          ) : (
            <span className="block text-[11px] text-[var(--ink-4)]">
              Llama 3.2 · weather + bag
            </span>
          )}
        </span>
      </button>
      <button
        type="button"
        onClick={() => void refreshTip()}
        disabled={busy}
        title="Refresh tip"
        className="rounded-md p-1.5 text-[var(--ink-3)] hover:bg-white/10 hover:text-[var(--ink-1)] disabled:opacity-40"
      >
        {busy ? (
          <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
        ) : (
          <RefreshCw className="h-3.5 w-3.5" aria-hidden />
        )}
      </button>
      {onClose ? (
        <button
          type="button"
          onClick={onClose}
          className="rounded-md p-1.5 text-[var(--ink-3)] hover:bg-white/10"
          aria-label="Close caddie"
        >
          <X className="h-3.5 w-3.5" aria-hidden />
        </button>
      ) : null}
    </div>
  );

  return (
    <GlassPanel
      variant="high"
      className="w-[min(100vw-1.5rem,20rem)] overflow-hidden shadow-xl"
    >
      {header}
      {open ? (
        <div className="border-t border-[var(--line-subtle)]">
          {notice ? (
            <p className="border-b border-[var(--line-subtle)] px-2.5 py-1.5 text-[11px] leading-snug text-amber-200/90">
              {notice}
            </p>
          ) : null}

          <div className="max-h-40 space-y-1.5 overflow-y-auto overscroll-contain px-2.5 py-2">
            {turns.length === 0 && tip ? (
              <CaddyBubble text={tip.text} source={tip.source} />
            ) : null}
            {turns.map((t) =>
              t.role === 'you' ? (
                <div
                  key={t.id}
                  className="ml-6 rounded-lg bg-white/10 px-2 py-1.5 text-[12px] leading-snug text-[var(--ink-1)]"
                >
                  {t.text}
                </div>
              ) : (
                <CaddyBubble key={t.id} text={t.text} source={t.source} />
              ),
            )}
            {busy && turns.length === 0 && !tip ? (
              <p className="text-[11px] text-[var(--ink-4)]">Reading conditions…</p>
            ) : null}
          </div>

          <form
            className="flex items-center gap-1 border-t border-[var(--line-subtle)] px-1.5 py-1.5"
            onSubmit={(e) => {
              e.preventDefault();
              void sendAsk();
            }}
          >
            <MessageCircle
              className="ml-1 h-3.5 w-3.5 shrink-0 text-[var(--ink-4)]"
              aria-hidden
            />
            <input
              type="text"
              value={question}
              onChange={(e) => setQuestion(e.target.value)}
              placeholder={
                mode === 'gps'
                  ? 'Ask: club, wind, commit…'
                  : 'Ask: how it plays, miss, club…'
              }
              className="min-w-0 flex-1 bg-transparent px-1 py-1.5 text-[12px] text-[var(--ink-1)] placeholder:text-[var(--ink-4)] focus:outline-none"
              disabled={busy}
              aria-label="Ask the AI caddie"
            />
            <button
              type="submit"
              disabled={busy || !question.trim()}
              className="rounded-md bg-brand/90 p-1.5 text-white disabled:opacity-40"
              aria-label="Send question"
            >
              <Send className="h-3.5 w-3.5" aria-hidden />
            </button>
          </form>
        </div>
      ) : null}
    </GlassPanel>
  );
}

function CaddyBubble({
  text,
  source,
}: {
  text: string;
  source?: CaddyResult['source'];
}) {
  return (
    <div className="rounded-lg bg-black/25 px-2 py-1.5">
      <p className="text-[12px] leading-snug text-[var(--ink-1)]">{text}</p>
      {source ? (
        <p className="mt-0.5 text-[10px] uppercase tracking-wide text-[var(--ink-4)]">
          {source === 'llm' ? 'Llama 3.2' : 'Rules · offline'}
        </p>
      ) : null}
    </div>
  );
}

function hourBucket(summary: string | null | undefined): string {
  if (!summary) return '';
  return summary.slice(0, 48);
}
