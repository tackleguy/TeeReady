/** Prep round plan — keys + hole-by-hole focus checklist. */

import { useMemo, useState } from 'react';
import {
  Check,
  ChevronDown,
  ChevronUp,
  ClipboardList,
  Wind,
} from 'lucide-react';
import type { RoundPrepPlan } from '../../lib/roundPrepPlan';
import { GlassPanel } from '../ui/GlassPanel';

type Props = {
  plan: RoundPrepPlan;
  activeHole: number | null;
  onSelectHole: (n: number) => void;
  compact?: boolean;
};

export function PrepRoundPlan({
  plan,
  activeHole,
  onSelectHole,
  compact = false,
}: Props) {
  const [open, setOpen] = useState(!compact);
  const [checked, setChecked] = useState<Set<number>>(() => new Set());

  const progress = useMemo(() => {
    if (!plan.holes.length) return 0;
    return Math.round((checked.size / plan.holes.length) * 100);
  }, [checked, plan.holes.length]);

  const toggle = (n: number) => {
    setChecked((prev) => {
      const next = new Set(prev);
      if (next.has(n)) next.delete(n);
      else next.add(n);
      return next;
    });
  };

  return (
    <GlassPanel className="overflow-hidden shadow-lg">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center gap-2 px-3 py-2 text-left"
        aria-expanded={open}
      >
        <span className="grid h-7 w-7 shrink-0 place-items-center rounded-lg bg-brand/20 text-brand">
          <ClipboardList className="h-3.5 w-3.5" aria-hidden />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-[11px] font-semibold uppercase tracking-wider text-[var(--ink-3)]">
            Round plan
          </span>
          <span className="block truncate text-[12px] text-[var(--ink-2)]">
            {plan.holeCount} holes
            {plan.avgWindMph != null ? ` · avg wind ${plan.avgWindMph} mph` : ''}
            {checked.size > 0 ? ` · ${progress}% reviewed` : ''}
          </span>
        </span>
        {open ? (
          <ChevronUp className="h-4 w-4 text-[var(--ink-4)]" aria-hidden />
        ) : (
          <ChevronDown className="h-4 w-4 text-[var(--ink-4)]" aria-hidden />
        )}
      </button>

      {open ? (
        <div className="border-t border-[var(--line-subtle)] px-3 pb-3 pt-2">
          <ul className="space-y-1.5">
            {plan.keys.map((k) => (
              <li
                key={k}
                className="flex gap-2 text-[12px] leading-snug text-[var(--ink-2)]"
              >
                <Wind
                  className="mt-0.5 h-3 w-3 shrink-0 text-brand"
                  aria-hidden
                />
                <span>{k}</span>
              </li>
            ))}
          </ul>
          {plan.turfLine ? (
            <p className="mt-2 text-[11px] text-[var(--ink-4)]">{plan.turfLine}</p>
          ) : null}

          <ul className="mt-3 max-h-56 space-y-1 overflow-y-auto overscroll-contain">
            {plan.holes.map((h) => {
              const on = activeHole === h.holeNumber;
              const done = checked.has(h.holeNumber);
              return (
                <li key={h.holeNumber}>
                  <div
                    className={[
                      'flex items-start gap-2 rounded-lg px-2 py-1.5 transition-colors',
                      on ? 'bg-white/10' : 'hover:bg-white/5',
                    ].join(' ')}
                  >
                    <button
                      type="button"
                      aria-label={
                        done
                          ? `Unmark hole ${h.holeNumber}`
                          : `Mark hole ${h.holeNumber} reviewed`
                      }
                      onClick={() => toggle(h.holeNumber)}
                      className={[
                        'mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded border',
                        done
                          ? 'border-brand bg-brand text-white'
                          : 'border-[var(--line-default)] text-transparent',
                      ].join(' ')}
                    >
                      <Check className="h-3 w-3" strokeWidth={3} aria-hidden />
                    </button>
                    <button
                      type="button"
                      onClick={() => onSelectHole(h.holeNumber)}
                      className="min-w-0 flex-1 text-left"
                    >
                      <span className="flex flex-wrap items-baseline gap-x-2 text-[12px] text-[var(--ink-1)]">
                        <span className="font-semibold tabular-nums">
                          {h.holeNumber}
                        </span>
                        <span className="tabular-nums text-[var(--ink-3)]">
                          {h.yards} yd
                          {h.playsLikeDelta != null && h.playsLikeDelta !== 0
                            ? ` · ${h.playsLikeDelta > 0 ? '+' : ''}${h.playsLikeDelta}`
                            : ''}
                        </span>
                        <span className="rounded bg-black/25 px-1 py-px text-[10px] font-medium uppercase tracking-wide text-[var(--ink-3)]">
                          {h.focusLabel}
                        </span>
                        {h.club ? (
                          <span className="text-[11px] text-brand">{h.club}</span>
                        ) : null}
                      </span>
                      <span className="mt-0.5 block text-[11px] leading-snug text-[var(--ink-4)]">
                        {h.tip}
                      </span>
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>
        </div>
      ) : null}
    </GlassPanel>
  );
}
