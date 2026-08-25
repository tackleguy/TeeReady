import { useEffect, useMemo, useState } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import type { GolfHole } from '../../lib/golf';
import {
  assignStrokeIndexes,
  formatHandicap,
  netStrokes,
  scoreVsParStyle,
  strokesReceived,
  toParLabel,
} from '../../lib/golfHandicap';
import {
  getHoleScore,
  roundTotalPar,
  roundTotalStrokes,
  setHoleScore,
  setHoleStats,
  type HoleStatExtras,
  type TrackedRound,
} from '../../lib/golfTracker';

interface Props {
  holes: GolfHole[];
  round: TrackedRound;
  handicap: number;
  /** Map / GPS hole currently open — keeps scorecard in sync. */
  activeHoleNumber?: number | null;
  onChange: (next: TrackedRound) => void;
  onClose: () => void;
  onFinishRound?: () => void;
  /** Jump map + scorecard to a hole (18Birdies-style flow). */
  onSelectHole?: (holeNumber: number) => void;
  onNextHole?: () => void;
  onPrevHole?: () => void;
}

function scoreName(diff: number): string {
  if (diff <= -3) return 'Albatross';
  if (diff === -2) return 'Eagle';
  if (diff === -1) return 'Birdie';
  if (diff === 0) return 'Par';
  if (diff === 1) return 'Bogey';
  if (diff === 2) return 'Double';
  if (diff >= 3) return `+${diff}`;
  return '';
}

function HoleChip({
  hole,
  strokes,
  par,
  selected,
  onClick,
}: {
  hole: number;
  strokes?: number;
  par: number;
  selected: boolean;
  onClick: () => void;
}) {
  const scored = strokes != null && strokes >= 1;
  const diff = scored ? strokes - par : null;
  const style = diff != null ? scoreVsParStyle(diff) : null;
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex h-11 w-11 shrink-0 flex-col items-center justify-center rounded-lg border text-center transition-colors ${
        selected
          ? 'border-brand bg-brand text-white'
          : scored
            ? 'border-line bg-canvas hover:border-brand/40'
            : 'border-dashed border-line bg-transparent text-muted hover:border-brand/40 hover:text-ink'
      }`}
      aria-current={selected ? 'true' : undefined}
    >
      <span
        className={`text-[11px] font-semibold tabular leading-none ${
          selected ? 'text-white/80' : 'text-faint'
        }`}
      >
        {hole}
      </span>
      <span
        className={`mt-0.5 text-[13px] font-bold tabular leading-none ${
          selected ? 'text-white' : style?.text ?? 'text-ink'
        }`}
      >
        {scored ? strokes : '·'}
      </span>
    </button>
  );
}

export function GolfScorecard({
  holes,
  round,
  handicap,
  activeHoleNumber = null,
  onChange,
  onClose,
  onFinishRound,
  onSelectHole,
  onNextHole,
  onPrevHole,
}: Props) {
  const strokeIndex = useMemo(() => {
    const assigned = assignStrokeIndexes(holes);
    const merged = { ...assigned };
    for (const h of holes) {
      if (h.strokeIndex != null && Number.isFinite(h.strokeIndex)) {
        merged[h.number] = h.strokeIndex;
      }
    }
    return merged;
  }, [holes]);

  const holeCount = Math.max(holes.length, 18);
  const firstUnscored =
    holes.find((h) => !getHoleScore(round, h.number))?.number ??
    holes[holes.length - 1]?.number ??
    1;

  const [focusHole, setFocusHole] = useState(
    () => activeHoleNumber ?? firstUnscored,
  );
  const [view, setView] = useState<'play' | 'card'>('play');

  useEffect(() => {
    if (activeHoleNumber != null) setFocusHole(activeHoleNumber);
  }, [activeHoleNumber]);

  const hole =
    holes.find((h) => h.number === focusHole) ?? holes[0] ?? null;
  const focusIdx = holes.findIndex((h) => h.number === focusHole);
  const canPrev = focusIdx > 0;
  const canNext = focusIdx >= 0 && focusIdx < holes.length - 1;
  const nextHoleObj = canNext ? holes[focusIdx + 1]! : null;

  const goHole = (n: number) => {
    setFocusHole(n);
    onSelectHole?.(n);
  };

  const goNext = () => {
    if (onNextHole) {
      onNextHole();
      return;
    }
    if (nextHoleObj) goHole(nextHoleObj.number);
  };

  const goPrev = () => {
    if (onPrevHole) {
      onPrevHole();
      return;
    }
    if (canPrev) goHole(holes[focusIdx - 1]!.number);
  };

  const onSet = (
    holeNumber: number,
    par: number,
    strokes: number,
    putts: number,
  ) => {
    if (strokes < 1) {
      const scores = round.scores.filter((s) => s.holeNumber !== holeNumber);
      onChange({ ...round, scores });
      return;
    }
    onChange(setHoleScore(round, holeNumber, par, strokes, putts));
  };

  const onStats = (holeNumber: number, extras: HoleStatExtras) => {
    onChange(setHoleStats(round, holeNumber, extras));
  };

  const gross = roundTotalStrokes(round);
  const parTotal = roundTotalPar(round);
  let netTotal = 0;
  let netHoles = 0;
  for (const s of round.scores) {
    const si = strokeIndex[s.holeNumber] ?? s.holeNumber;
    netTotal += netStrokes(s.strokes, strokesReceived(handicap, si, holeCount));
    netHoles += 1;
  }

  if (!hole) {
    return (
      <div className="hud-card flex h-full items-center justify-center p-6 text-sm text-muted">
        No holes on this course map yet.
      </div>
    );
  }

  const par = hole.par ?? 4;
  const si = strokeIndex[hole.number] ?? hole.number;
  const recv = strokesReceived(handicap, si, holeCount);
  const scored = getHoleScore(round, hole.number);
  const strokes = scored?.strokes;
  const putts = scored?.putts ?? 2;
  const net = strokes != null ? netStrokes(strokes, recv) : null;
  const vsPar = strokes != null ? strokes - par : null;
  const vsStyle = vsPar != null ? scoreVsParStyle(vsPar) : null;
  const firEligible = par >= 4;

  const pickStrokes = (n: number) => {
    onSet(hole.number, par, n, putts);
  };

  const scorePicks = Array.from({ length: 8 }, (_, i) => i + 1);

  return (
    <div className="hud-card flex h-full min-h-0 flex-col rounded-card border border-line shadow-lift">
      <div className="flex items-start justify-between gap-3 border-b border-line px-4 py-3">
        <div className="min-w-0">
          <h2 className="text-[16px] font-bold text-ink">Scorecard</h2>
          <p className="mt-0.5 truncate text-[13px] text-muted">
            {round.courseName} · HCP {formatHandicap(handicap)}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-1.5">
          <div className="flex rounded-lg border border-line p-0.5">
            {(
              [
                ['play', 'Hole'],
                ['card', 'Card'],
              ] as const
            ).map(([id, label]) => (
              <button
                key={id}
                type="button"
                onClick={() => setView(id)}
                className={
                  view === id
                    ? 'rounded-md bg-brand-soft px-2.5 py-1 text-[13px] font-semibold text-brand'
                    : 'rounded-md px-2.5 py-1 text-[13px] font-medium text-muted hover:text-ink'
                }
              >
                {label}
              </button>
            ))}
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-line px-2.5 py-1.5 text-[13px] font-semibold text-muted hover:text-ink"
          >
            Close
          </button>
        </div>
      </div>

      <div className="border-b border-line px-3 py-2">
        <div className="flex gap-1.5 overflow-x-auto no-scrollbar pb-0.5">
          {holes.map((h) => {
            const hs = getHoleScore(round, h.number);
            return (
              <HoleChip
                key={h.number}
                hole={h.number}
                strokes={hs?.strokes}
                par={h.par ?? 4}
                selected={h.number === focusHole}
                onClick={() => goHole(h.number)}
              />
            );
          })}
        </div>
        <div className="mt-2 grid grid-cols-3 gap-2">
          <div className="rounded-lg bg-canvas px-2 py-1.5 text-center">
            <div className="font-mono text-[11px] font-semibold uppercase tracking-[0.1em] text-faint">
              Thru
            </div>
            <div className="text-[15px] font-bold tabular text-ink">
              {netHoles}/{holes.length}
            </div>
          </div>
          <div className="rounded-lg bg-canvas px-2 py-1.5 text-center">
            <div className="font-mono text-[11px] font-semibold uppercase tracking-[0.1em] text-faint">
              To par
            </div>
            <div className="text-[15px] font-bold tabular text-ink">
              {netHoles ? toParLabel(gross - parTotal) : 'E'}
            </div>
          </div>
          <div className="rounded-lg bg-canvas px-2 py-1.5 text-center">
            <div className="font-mono text-[11px] font-semibold uppercase tracking-[0.1em] text-faint">
              Gross
            </div>
            <div className="text-[15px] font-bold tabular text-ink">
              {netHoles ? gross : '—'}
            </div>
          </div>
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto">
        {view === 'play' ? (
          <div className="flex flex-col gap-4 px-4 py-4">
            <div className="flex items-center justify-between gap-2">
              <button
                type="button"
                onClick={goPrev}
                disabled={!canPrev}
                className="inline-flex items-center gap-1 rounded-xl border border-line px-2.5 py-2 text-[13px] font-semibold text-muted hover:text-ink disabled:opacity-30"
              >
                <ChevronLeft className="h-4 w-4" />
                Prev
              </button>
              <div className="text-center">
                <p className="section-eyebrow">Hole {hole.number}</p>
                <p className="mt-0.5 text-[20px] font-bold tabular text-ink">
                  Par {par}
                  <span className="mx-1.5 text-faint">·</span>
                  {hole.yards} yd
                </p>
                <p className="mt-0.5 text-[13px] text-muted">
                  SI {si}
                  {recv !== 0
                    ? recv > 0
                      ? ` · ${recv} stroke${recv > 1 ? 's' : ''}`
                      : ` · plus ${Math.abs(recv)}`
                    : ''}
                </p>
              </div>
              <button
                type="button"
                onClick={goNext}
                disabled={!canNext}
                className="inline-flex items-center gap-1 rounded-xl border border-line px-2.5 py-2 text-[13px] font-semibold text-muted hover:text-ink disabled:opacity-30"
              >
                Next
                <ChevronRight className="h-4 w-4" />
              </button>
            </div>

            <div>
              <p className="mb-2 text-center font-mono text-[11px] font-semibold uppercase tracking-[0.12em] text-faint">
                Score
              </p>
              <div className="grid grid-cols-4 gap-2 sm:grid-cols-8">
                {scorePicks.map((n) => {
                  const d = n - par;
                  const on = strokes === n;
                  const s = scoreVsParStyle(d);
                  return (
                    <button
                      key={n}
                      type="button"
                      onClick={() => pickStrokes(n)}
                      className={`flex flex-col items-center rounded-xl border px-1 py-2.5 transition-colors ${
                        on
                          ? `${s.bg} ${s.ring} ring-2 border-transparent`
                          : 'border-line bg-canvas hover:border-brand/35'
                      }`}
                    >
                      <span
                        className={`text-[18px] font-bold tabular ${
                          on ? s.text : 'text-ink'
                        }`}
                      >
                        {n}
                      </span>
                      <span
                        className={`mt-0.5 text-[11px] font-semibold uppercase ${
                          on ? s.text : 'text-faint'
                        }`}
                      >
                        {scoreName(d) || toParLabel(d)}
                      </span>
                    </button>
                  );
                })}
              </div>
              {vsPar != null && vsStyle ? (
                <p className={`mt-2 text-center text-[13px] font-semibold ${vsStyle.text}`}>
                  {scoreName(vsPar) || toParLabel(vsPar)}
                  {net != null ? ` · net ${net}` : ''}
                </p>
              ) : (
                <p className="mt-2 text-center text-[13px] text-muted">
                  Tap a score to mark this hole
                </p>
              )}
            </div>

            {strokes != null ? (
              <>
                <div>
                  <p className="mb-2 font-mono text-[11px] font-semibold uppercase tracking-[0.12em] text-faint">
                    Putts
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {[0, 1, 2, 3, 4].map((n) => {
                      const on = putts === n;
                      return (
                        <button
                          key={n}
                          type="button"
                          onClick={() => onSet(hole.number, par, strokes, n)}
                          className={
                            on
                              ? 'min-w-[2.75rem] rounded-xl bg-brand px-3 py-2 text-[14px] font-bold text-white'
                              : 'min-w-[2.75rem] rounded-xl border border-line bg-canvas px-3 py-2 text-[14px] font-semibold text-ink hover:border-brand/40'
                          }
                        >
                          {n}
                        </button>
                      );
                    })}
                  </div>
                </div>

                <div className="grid gap-3 sm:grid-cols-2">
                  {firEligible ? (
                    <div>
                      <p className="mb-1.5 font-mono text-[11px] font-semibold uppercase tracking-[0.12em] text-faint">
                        Fairway
                      </p>
                      <div className="flex gap-1.5">
                        {(
                          [
                            [true, 'Hit'],
                            [false, 'Miss'],
                            [null, 'Skip'],
                          ] as const
                        ).map(([v, label]) => {
                          const on =
                            scored?.fairwayHit === v ||
                            (scored?.fairwayHit == null && v === null);
                          return (
                            <button
                              key={label}
                              type="button"
                              onClick={() =>
                                onStats(hole.number, { fairwayHit: v })
                              }
                              className={
                                on
                                  ? 'flex-1 rounded-xl bg-brand-soft py-2 text-[13px] font-semibold text-brand'
                                  : 'flex-1 rounded-xl border border-line py-2 text-[13px] font-medium text-muted hover:text-ink'
                              }
                            >
                              {label}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  ) : null}
                  <div>
                    <p className="mb-1.5 font-mono text-[11px] font-semibold uppercase tracking-[0.12em] text-faint">
                      GIR
                    </p>
                    <div className="flex gap-1.5">
                      {(
                        [
                          [true, 'Yes'],
                          [false, 'No'],
                          [null, 'Skip'],
                        ] as const
                      ).map(([v, label]) => {
                        const on =
                          scored?.gir === v ||
                          (scored?.gir == null && v === null);
                        return (
                          <button
                            key={label}
                            type="button"
                            onClick={() => onStats(hole.number, { gir: v })}
                            className={
                              on
                                ? 'flex-1 rounded-xl bg-brand-soft py-2 text-[13px] font-semibold text-brand'
                                : 'flex-1 rounded-xl border border-line py-2 text-[13px] font-medium text-muted hover:text-ink'
                            }
                          >
                            {label}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                </div>
              </>
            ) : null}

            <button
              type="button"
              onClick={goNext}
              disabled={!canNext}
              className="mt-1 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-brand px-4 py-3.5 text-[15px] font-bold text-white disabled:opacity-40"
            >
              {canNext ? (
                <>
                  Next hole
                  <span className="font-medium opacity-90">
                    · {nextHoleObj!.number}
                  </span>
                  <ChevronRight className="h-5 w-5" />
                </>
              ) : (
                'Last hole'
              )}
            </button>
          </div>
        ) : (
          <div className="overflow-x-auto px-2 py-2">
            <table className="w-full min-w-[420px] border-collapse text-left text-[13px]">
              <thead>
                <tr className="border-b border-line font-mono text-[11px] font-semibold uppercase tracking-[0.1em] text-faint">
                  <th className="px-2 py-2">Hole</th>
                  <th className="px-2 py-2 text-right">Par</th>
                  <th className="px-2 py-2 text-right">Yds</th>
                  <th className="px-2 py-2 text-center">Score</th>
                  <th className="px-2 py-2 text-right">Net</th>
                  <th className="px-2 py-2 text-center">Putts</th>
                </tr>
              </thead>
              <tbody>
                {holes.map((h) => {
                  const p = h.par ?? 4;
                  const idx = strokeIndex[h.number] ?? h.number;
                  const r = strokesReceived(handicap, idx, holeCount);
                  const hs = getHoleScore(round, h.number);
                  const g = hs?.strokes;
                  const n =
                    g != null ? netStrokes(g, r) : null;
                  const d = g != null ? g - p : null;
                  const st = d != null ? scoreVsParStyle(d) : null;
                  const on = h.number === focusHole;
                  return (
                    <tr
                      key={h.number}
                      className={`cursor-pointer border-b border-line/80 ${
                        on ? 'bg-brand-soft/60' : 'hover:bg-canvas'
                      }`}
                      onClick={() => {
                        goHole(h.number);
                        setView('play');
                      }}
                    >
                      <td className="px-2 py-2.5 font-semibold tabular text-ink">
                        {h.number}
                      </td>
                      <td className="px-2 py-2.5 text-right tabular text-muted">
                        {p}
                      </td>
                      <td className="px-2 py-2.5 text-right tabular text-muted">
                        {h.yards}
                      </td>
                      <td className="px-2 py-2.5 text-center">
                        <span
                          className={`inline-flex min-w-[2rem] justify-center rounded-md px-1.5 py-0.5 text-[13px] font-bold tabular ${
                            st ? `${st.bg} ${st.text}` : 'text-faint'
                          }`}
                        >
                          {g ?? '—'}
                        </span>
                      </td>
                      <td className="px-2 py-2.5 text-right font-semibold tabular text-ink">
                        {n ?? '—'}
                      </td>
                      <td className="px-2 py-2.5 text-center tabular text-muted">
                        {hs ? hs.putts : '—'}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            <div className="mt-3 grid grid-cols-2 gap-2 px-2 pb-2">
              <div className="rounded-xl bg-canvas px-3 py-2 text-center">
                <div className="font-mono text-[11px] font-semibold uppercase tracking-[0.1em] text-faint">
                  Gross
                </div>
                <div className="text-[18px] font-bold tabular text-ink">
                  {netHoles ? gross : '—'}
                </div>
                <div className="text-[13px] text-muted">
                  {netHoles ? toParLabel(gross - parTotal) : 'vs par'}
                </div>
              </div>
              <div className="rounded-xl bg-canvas px-3 py-2 text-center">
                <div className="font-mono text-[11px] font-semibold uppercase tracking-[0.1em] text-faint">
                  Net
                </div>
                <div className="text-[18px] font-bold tabular text-brand">
                  {netHoles ? netTotal : '—'}
                </div>
                <div className="text-[13px] text-muted">
                  {netHoles ? toParLabel(netTotal - parTotal) : 'hcp adj'}
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      {onFinishRound && round.scores.length > 0 ? (
        <div className="border-t border-line px-4 py-3">
          <button
            type="button"
            onClick={onFinishRound}
            className="w-full rounded-xl border border-line bg-canvas px-4 py-2.5 text-[13px] font-bold text-ink hover:border-brand/40"
          >
            Finish round
          </button>
        </div>
      ) : null}
    </div>
  );
}
