// First-run Golf questionnaire — stocks the bag and miss bias for planning.

import { useMemo, useState } from 'react';
import { Flag, Sparkles } from 'lucide-react';
import {
  bagFromStocks,
  DEFAULT_PROFILE,
  missLabel,
  type GolfPlayerProfile,
  type MissBias,
  saveGolfProfile,
} from '../../lib/golfProfile';

interface Props {
  initial?: GolfPlayerProfile | null;
  onComplete: (profile: GolfPlayerProfile) => void;
  onCancel?: () => void;
}

const MISS_OPTIONS: Array<{ value: MissBias; hint: string }> = [
  { value: 'left', hint: 'Start, left, and more left on every shot' },
  { value: 'right', hint: 'Start, right, and more right on every shot' },
  { value: 'both', hint: 'Left, start, and right on every shot' },
  { value: 'straight', hint: 'Tight left / start / right' },
];

export function GolfSetup({ initial, onComplete, onCancel }: Props) {
  const [commonText, setCommonText] = useState(
    (initial?.commonCourses ?? []).join(', '),
  );
  const [handicap, setHandicap] = useState(
    initial?.handicap ?? DEFAULT_PROFILE.handicap,
  );
  const [miss, setMiss] = useState<MissBias>(
    initial?.miss ?? DEFAULT_PROFILE.miss,
  );
  const [sevenIronYards, setSevenIronYards] = useState(
    initial?.sevenIronYards ?? DEFAULT_PROFILE.sevenIronYards,
  );
  const [driverYards, setDriverYards] = useState(
    initial?.driverYards ?? DEFAULT_PROFILE.driverYards,
  );

  const bagPreview = useMemo(
    () => bagFromStocks(driverYards, sevenIronYards),
    [driverYards, sevenIronYards],
  );

  const canSave =
    Number.isFinite(handicap) &&
    Number.isFinite(sevenIronYards) &&
    Number.isFinite(driverYards) &&
    driverYards > sevenIronYards + 15;

  const submit = () => {
    if (!canSave) return;
    const commonCourses = commonText
      .split(/[,;\n]+/)
      .map((s) => s.trim())
      .filter(Boolean)
      .slice(0, 8);
    onComplete(
      saveGolfProfile({
        commonCourses,
        handicap,
        miss,
        sevenIronYards,
        driverYards,
      }),
    );
  };

  return (
    <div className="absolute inset-0 flex min-h-0 flex-col items-center overflow-y-auto overscroll-contain bg-[var(--surface-0)] px-4 py-6 pb-8">
      <div className="w-full max-w-lg">
        <div className="mb-6 flex items-start gap-3">
          <div className="mt-0.5 grid h-10 w-10 place-items-center rounded-xl bg-[var(--accent)]/20 text-[var(--accent)]">
            <Flag className="h-5 w-5" strokeWidth={1.8} />
          </div>
          <div>
            <h1 className="text-lg font-semibold text-[var(--ink-1)]">
              Set up your game
            </h1>
            <p className="mt-1 text-[13px] leading-snug text-[var(--ink-3)]">
              Handicap, miss, and total-average distances (carry + typical
              roll) calibrate hole-by-hole yardages and club picks.
            </p>
          </div>
        </div>

        <label className="mb-4 block">
          <span className="mb-1.5 block text-[11px] font-medium uppercase tracking-wide text-[var(--ink-3)]">
            Common courses
          </span>
          <input
            value={commonText}
            onChange={(e) => setCommonText(e.target.value)}
            placeholder="e.g. Torrey Pines, Rancho Park, Riviera"
            className="w-full rounded-xl border border-[var(--line-default)] bg-black/20 px-3 py-3 text-base text-[var(--ink-1)] placeholder:text-[var(--ink-4)] outline-none focus:border-[var(--accent)] lg:py-2.5 lg:text-[13px]"
          />
          <span className="mt-1 block text-[11px] text-[var(--ink-4)]">
            Comma-separated — shown as quick picks in search.
          </span>
        </label>

        <div className="mb-4 grid grid-cols-2 gap-3">
          <label className="block">
            <span className="mb-1.5 block text-[11px] font-medium uppercase tracking-wide text-[var(--ink-3)]">
              Handicap
            </span>
            <input
              type="number"
              min={0}
              max={54}
              step={0.1}
              value={handicap}
              onChange={(e) => setHandicap(Number(e.target.value))}
              className="w-full rounded-xl border border-[var(--line-default)] bg-black/20 px-3 py-3 text-base tabular-nums text-[var(--ink-1)] outline-none focus:border-[var(--accent)] lg:py-2.5 lg:text-[13px]"
            />
          </label>
          <div>
            <span className="mb-1.5 block text-[11px] font-medium uppercase tracking-wide text-[var(--ink-3)]">
              Typical miss
            </span>
            <div className="grid grid-cols-2 gap-1.5">
              {MISS_OPTIONS.map((opt) => {
                const on = miss === opt.value;
                return (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => setMiss(opt.value)}
                    title={opt.hint}
                    className={[
                      'rounded-lg px-2 py-2 text-[11px] font-medium transition-colors',
                      on
                        ? 'bg-[var(--accent)]/25 text-[var(--ink-1)] ring-1 ring-[var(--accent)]/50'
                        : 'bg-black/20 text-[var(--ink-3)] hover:bg-white/5 hover:text-[var(--ink-1)]',
                    ].join(' ')}
                  >
                    {opt.value === 'straight'
                      ? 'Straight'
                      : opt.value === 'both'
                        ? 'Both'
                        : opt.value === 'left'
                          ? 'Left'
                          : 'Right'}
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        <div className="mb-5 grid grid-cols-2 gap-3">
          <label className="block">
            <span className="mb-1.5 block text-[11px] font-medium uppercase tracking-wide text-[var(--ink-3)]">
              7-iron carry
            </span>
            <div className="relative">
              <input
                type="number"
                min={80}
                max={220}
                value={sevenIronYards}
                onChange={(e) => setSevenIronYards(Number(e.target.value))}
                className="w-full rounded-xl border border-[var(--line-default)] bg-black/20 px-3 py-3 pr-10 text-base tabular-nums text-[var(--ink-1)] outline-none focus:border-[var(--accent)] lg:py-2.5 lg:text-[13px]"
              />
              <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-[11px] text-[var(--ink-4)]">
                yd
              </span>
            </div>
          </label>
          <label className="block">
            <span className="mb-1.5 block text-[11px] font-medium uppercase tracking-wide text-[var(--ink-3)]">
              Driver carry
            </span>
            <div className="relative">
              <input
                type="number"
                min={140}
                max={360}
                value={driverYards}
                onChange={(e) => setDriverYards(Number(e.target.value))}
                className="w-full rounded-xl border border-[var(--line-default)] bg-black/20 px-3 py-3 pr-10 text-base tabular-nums text-[var(--ink-1)] outline-none focus:border-[var(--accent)] lg:py-2.5 lg:text-[13px]"
              />
              <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-[11px] text-[var(--ink-4)]">
                yd
              </span>
            </div>
          </label>
        </div>

        {!canSave && (
          <p className="mb-3 text-[12px] text-amber-200/90">
            Driver should be at least ~20 yards longer than your 7-iron.
          </p>
        )}

        <div className="mb-6 rounded-xl border border-[var(--line-subtle)] bg-black/15 px-3 py-3">
          <div className="mb-2 flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-wide text-[var(--ink-3)]">
            <Sparkles className="h-3 w-3 text-[var(--accent)]" />
            Your bag preview — total avg
          </div>
          <div className="grid grid-cols-4 gap-1.5 sm:grid-cols-6">
            {bagPreview.map((c) => (
              <div
                key={c.key}
                className="rounded-md bg-black/25 px-1.5 py-1 text-center"
              >
                <div className="text-[9px] uppercase tracking-wide text-[var(--ink-4)]">
                  {c.label}
                </div>
                <div className="text-[12px] font-semibold tabular-nums text-[var(--ink-1)]">
                  {c.yards}
                </div>
                {c.carryYards != null && c.carryYards !== c.yards && (
                  <div className="text-[9px] tabular-nums text-[var(--ink-4)]">
                    {c.carryYards} carry
                  </div>
                )}
              </div>
            ))}
          </div>
          <p className="mt-2 text-[11px] text-[var(--ink-4)]">
            {missLabel(miss)} · HCP {handicap} — rings and club picks use
            total avg (where the ball finishes).
          </p>
        </div>

        <button
          type="button"
          disabled={!canSave}
          onClick={submit}
          className="w-full rounded-xl bg-[var(--accent)] px-4 py-3 text-[13px] font-semibold text-white transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
        >
          Save &amp; find courses
        </button>
        {onCancel ? (
          <button
            type="button"
            onClick={onCancel}
            className="mt-2 w-full rounded-xl px-4 py-3 text-[13px] font-medium text-[var(--ink-3)] hover:bg-white/5 hover:text-[var(--ink-1)]"
          >
            Back to courses
          </button>
        ) : null}
      </div>
    </div>
  );
}
