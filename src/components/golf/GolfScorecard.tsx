import { useMemo, useState } from 'react';
import type { GolfHole } from '../../lib/golf';
import {
  assignStrokeIndexes,
  formatHandicap,
  netStrokes,
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
  onChange: (next: TrackedRound) => void;
  onClose: () => void;
  onFinishRound?: () => void;
}

function TriToggle({
  value,
  onChange,
  labels,
}: {
  value: boolean | null | undefined;
  onChange: (v: boolean | null) => void;
  labels: [string, string, string];
}) {
  return (
    <div className="inline-flex overflow-hidden rounded-lg border border-line">
      {(
        [
          [true, labels[0]],
          [false, labels[1]],
          [null, labels[2]],
        ] as const
      ).map(([v, label]) => {
        const on = value === v || (value == null && v === null);
        return (
          <button
            key={label}
            type="button"
            onClick={() => onChange(v)}
            className={
              on
                ? 'bg-brand-soft px-2 py-1 text-[10px] font-semibold text-brand'
                : 'bg-canvas px-2 py-1 text-[10px] font-medium text-muted hover:text-ink'
            }
          >
            {label}
          </button>
        );
      })}
    </div>
  );
}

function ScoreTable({
  holes,
  round,
  handicap,
  strokeIndex,
  holeCount,
  onSet,
}: {
  holes: GolfHole[];
  round: TrackedRound;
  handicap: number;
  strokeIndex: Record<number, number>;
  holeCount: number;
  onSet: (holeNumber: number, par: number, strokes: number, putts: number) => void;
}) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[520px] border-collapse text-left text-[12px]">
        <thead>
          <tr className="border-b border-line font-mono text-[10px] font-semibold uppercase tracking-[0.1em] text-faint">
            <th className="px-2 py-2">Hole</th>
            <th className="px-2 py-2 text-right">Par</th>
            <th className="px-2 py-2 text-right">Yds</th>
            <th className="px-2 py-2 text-right">SI</th>
            <th className="px-2 py-2 text-right">Str</th>
            <th className="px-2 py-2 text-center">Score</th>
            <th className="px-2 py-2 text-right">Net</th>
            <th className="px-2 py-2 text-center">Putts</th>
          </tr>
        </thead>
        <tbody>
          {holes.map((h) => {
            const par = h.par ?? 4;
            const si = strokeIndex[h.number] ?? h.number;
            const recv = strokesReceived(handicap, si, holeCount);
            const scored = getHoleScore(round, h.number);
            const gross = scored?.strokes;
            const putts = scored?.putts ?? 2;
            const net =
              gross != null ? netStrokes(gross, recv) : null;
            return (
              <tr key={h.number} className="border-b border-line/80">
                <td className="px-2 py-2 font-semibold tabular text-ink">
                  {h.number}
                </td>
                <td className="px-2 py-2 text-right tabular text-muted">{par}</td>
                <td className="px-2 py-2 text-right tabular text-muted">
                  {h.yards}
                </td>
                <td className="px-2 py-2 text-right tabular text-muted">{si}</td>
                <td className="px-2 py-2 text-right tabular text-brand">
                  {recv === 0 ? '—' : recv > 0 ? `●${recv > 1 ? recv : ''}` : `+${Math.abs(recv)}`}
                </td>
                <td className="px-2 py-2 text-center">
                  <input
                    type="number"
                    min={1}
                    max={15}
                    value={gross ?? ''}
                    placeholder="—"
                    onChange={(e) => {
                      const v = Number(e.target.value);
                      if (!Number.isFinite(v) || v < 1) {
                        onSet(h.number, par, 0, putts);
                        return;
                      }
                      onSet(h.number, par, v, putts);
                    }}
                    className="w-14 rounded-lg border border-line bg-canvas px-2 py-1.5 text-center tabular text-ink outline-none focus:border-brand"
                  />
                </td>
                <td className="px-2 py-2 text-right font-semibold tabular text-ink">
                  {net ?? '—'}
                </td>
                <td className="px-2 py-2 text-center">
                  <input
                    type="number"
                    min={0}
                    max={6}
                    value={scored ? putts : ''}
                    placeholder="—"
                    disabled={gross == null}
                    onChange={(e) => {
                      if (gross == null) return;
                      const v = Number(e.target.value);
                      onSet(
                        h.number,
                        par,
                        gross,
                        Number.isFinite(v) ? Math.max(0, v) : 0,
                      );
                    }}
                    className="w-12 rounded-lg border border-line bg-canvas px-2 py-1.5 text-center tabular text-ink outline-none focus:border-brand disabled:opacity-40"
                  />
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function StatsTable({
  holes,
  round,
  onStats,
}: {
  holes: GolfHole[];
  round: TrackedRound;
  onStats: (holeNumber: number, extras: HoleStatExtras) => void;
}) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[640px] border-collapse text-left text-[12px]">
        <thead>
          <tr className="border-b border-line font-mono text-[10px] font-semibold uppercase tracking-[0.1em] text-faint">
            <th className="px-2 py-2">Hole</th>
            <th className="px-2 py-2 text-right">Par</th>
            <th className="px-2 py-2 text-center">FIR</th>
            <th className="px-2 py-2 text-center">GIR</th>
            <th className="px-2 py-2 text-center">Chips</th>
            <th className="px-2 py-2 text-center">Pen</th>
            <th className="px-2 py-2 text-center">Sand</th>
          </tr>
        </thead>
        <tbody>
          {holes.map((h) => {
            const par = h.par ?? 4;
            const scored = getHoleScore(round, h.number);
            const hasScore = scored != null && scored.strokes >= 1;
            const firEligible = par >= 4;
            return (
              <tr key={h.number} className="border-b border-line/80">
                <td className="px-2 py-2 font-semibold tabular text-ink">
                  {h.number}
                </td>
                <td className="px-2 py-2 text-right tabular text-muted">{par}</td>
                <td className="px-2 py-2 text-center">
                  {firEligible && hasScore ? (
                    <TriToggle
                      value={scored.fairwayHit}
                      labels={['Hit', 'Miss', '—']}
                      onChange={(v) =>
                        onStats(h.number, { fairwayHit: v })
                      }
                    />
                  ) : (
                    <span className="text-[11px] text-faint">n/a</span>
                  )}
                </td>
                <td className="px-2 py-2 text-center">
                  {hasScore ? (
                    <TriToggle
                      value={scored.gir}
                      labels={['Yes', 'No', '—']}
                      onChange={(v) => onStats(h.number, { gir: v })}
                    />
                  ) : (
                    <span className="text-[11px] text-faint">—</span>
                  )}
                </td>
                <td className="px-2 py-2 text-center">
                  <input
                    type="number"
                    min={0}
                    max={5}
                    disabled={!hasScore}
                    value={hasScore && scored.chips != null ? scored.chips : ''}
                    placeholder="—"
                    onChange={(e) => {
                      const v = Number(e.target.value);
                      onStats(h.number, {
                        chips: Number.isFinite(v) ? Math.max(0, v) : undefined,
                      });
                    }}
                    className="w-12 rounded-lg border border-line bg-canvas px-2 py-1.5 text-center tabular text-ink outline-none focus:border-brand disabled:opacity-40"
                  />
                </td>
                <td className="px-2 py-2 text-center">
                  <input
                    type="number"
                    min={0}
                    max={3}
                    disabled={!hasScore}
                    value={
                      hasScore && scored.penalties != null ? scored.penalties : ''
                    }
                    placeholder="—"
                    onChange={(e) => {
                      const v = Number(e.target.value);
                      onStats(h.number, {
                        penalties: Number.isFinite(v) ? Math.max(0, v) : 0,
                      });
                    }}
                    className="w-12 rounded-lg border border-line bg-canvas px-2 py-1.5 text-center tabular text-ink outline-none focus:border-brand disabled:opacity-40"
                  />
                </td>
                <td className="px-2 py-2 text-center">
                  {hasScore ? (
                    <TriToggle
                      value={scored.sandSave}
                      labels={['Up', 'No', '—']}
                      onChange={(v) =>
                        onStats(h.number, { sandSave: v })
                      }
                    />
                  ) : (
                    <span className="text-[11px] text-faint">—</span>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

export function GolfScorecard({
  holes,
  round,
  handicap,
  onChange,
  onClose,
  onFinishRound,
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
  const front = holes.filter((h) => h.number <= 9);
  const back = holes.filter((h) => h.number > 9);
  const [tab, setTab] = useState<'front' | 'back' | 'all'>(
    back.length ? 'front' : 'all',
  );
  const [mode, setMode] = useState<'score' | 'stats'>('score');

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

  const shown =
    tab === 'front' ? front : tab === 'back' ? back : holes;

  return (
    <div className="hud-card flex h-full min-h-0 flex-col rounded-card border border-line shadow-lift">
      <div className="flex items-start justify-between gap-3 border-b border-line px-4 py-3">
        <div>
          <h2 className="text-[16px] font-bold text-ink">Scorecard</h2>
          <p className="mt-0.5 text-[12px] text-muted">
            {round.courseName} · HCP {formatHandicap(handicap)}
          </p>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="rounded-lg border border-line px-2.5 py-1.5 text-[12px] font-semibold text-muted hover:text-ink"
        >
          Close
        </button>
      </div>

      <div className="flex flex-wrap items-center gap-2 border-b border-line px-4 py-2">
        <div className="flex gap-1 rounded-lg border border-line p-0.5">
          {(
            [
              ['score', 'Scoring'],
              ['stats', 'Stats'],
            ] as const
          ).map(([id, label]) => (
            <button
              key={id}
              type="button"
              onClick={() => setMode(id)}
              className={
                mode === id
                  ? 'rounded-md bg-brand-soft px-3 py-1 text-[12px] font-semibold text-brand'
                  : 'rounded-md px-3 py-1 text-[12px] font-medium text-muted hover:text-ink'
              }
            >
              {label}
            </button>
          ))}
        </div>
        <div className="flex gap-2">
          {(
            [
              ['front', 'Out'],
              ['back', 'In'],
              ['all', 'All'],
            ] as const
          ).map(([id, label]) => (
            <button
              key={id}
              type="button"
              onClick={() => setTab(id)}
              className={
                tab === id
                  ? 'rounded-lg bg-brand-soft px-3 py-1.5 text-[12px] font-semibold text-brand'
                  : 'rounded-lg px-3 py-1.5 text-[12px] font-medium text-muted hover:text-ink'
              }
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-2 py-2">
        {mode === 'score' ? (
          <ScoreTable
            holes={shown}
            round={round}
            handicap={handicap}
            strokeIndex={strokeIndex}
            holeCount={holeCount}
            onSet={onSet}
          />
        ) : (
          <StatsTable holes={shown} round={round} onStats={onStats} />
        )}
      </div>

      <div className="border-t border-line px-4 py-3">
        <div className="grid grid-cols-3 gap-2">
          <div className="rounded-xl bg-canvas px-3 py-2 text-center">
            <div className="font-mono text-[9px] font-semibold uppercase tracking-[0.1em] text-faint">
              Gross
            </div>
            <div className="text-[18px] font-bold tabular text-ink">
              {netHoles ? gross : '—'}
            </div>
            <div className="text-[11px] text-muted">
              {netHoles ? toParLabel(gross - parTotal) : 'vs par'}
            </div>
          </div>
          <div className="rounded-xl bg-canvas px-3 py-2 text-center">
            <div className="font-mono text-[9px] font-semibold uppercase tracking-[0.1em] text-faint">
              Net
            </div>
            <div className="text-[18px] font-bold tabular text-brand">
              {netHoles ? netTotal : '—'}
            </div>
            <div className="text-[11px] text-muted">
              {netHoles ? toParLabel(netTotal - parTotal) : 'hcp adj'}
            </div>
          </div>
          <div className="rounded-xl bg-canvas px-3 py-2 text-center">
            <div className="font-mono text-[9px] font-semibold uppercase tracking-[0.1em] text-faint">
              Thru
            </div>
            <div className="text-[18px] font-bold tabular text-ink">
              {netHoles}/{holes.length}
            </div>
            <div className="text-[11px] text-muted">holes</div>
          </div>
        </div>
        {onFinishRound && round.scores.length > 0 ? (
          <button
            type="button"
            onClick={onFinishRound}
            className="mt-3 w-full rounded-xl bg-brand px-4 py-2.5 text-[13px] font-bold text-white"
          >
            Finish round
          </button>
        ) : null}
      </div>
    </div>
  );
}
