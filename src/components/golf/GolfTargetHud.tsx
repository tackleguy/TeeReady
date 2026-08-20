import type { BagClub } from '../../lib/golfProfile';
import {
  measureFromTee,
  nearestBagClub,
  segmentPlaysLike,
  type MeasureSplit,
} from '../../lib/golfMeasure';
import type { GolfHole, HoleBrief, TurfReport } from '../../lib/golf';
import type { HoleForecast } from '../../lib/golfPredict';
import type { LonLat } from '../../lib/golfWind';

interface Props {
  hole: GolfHole;
  target: LonLat;
  bag: BagClub[];
  brief?: HoleBrief;
  elevFt: number;
  turf?: TurfReport;
  forecast?: HoleForecast | null;
  onReset: () => void;
  mode?: 'tee' | 'approach';
}

export function GolfTargetHud({
  hole,
  target,
  bag,
  brief,
  elevFt,
  turf,
  forecast,
  onReset,
  mode = 'tee',
}: Props) {
  const split: MeasureSplit = measureFromTee(hole, target);
  const windAdj = brief?.windAdjustmentYards ?? 0;
  const slope = brief?.slopeYards ?? 0;
  const carryPlays = segmentPlaysLike(
    split.carryYards,
    hole.yards,
    windAdj,
    slope,
    elevFt,
  );
  const remainPlays = segmentPlaysLike(
    split.remainYards,
    hole.yards,
    windAdj,
    slope,
    elevFt,
  );
  const carryClub = nearestBagClub(carryPlays, bag);
  const remainClub = nearestBagClub(remainPlays, bag);

  return (
    <div className="pointer-events-none absolute inset-x-0 top-16 z-10 flex justify-center px-3 lg:top-auto lg:bottom-4 lg:right-[352px] lg:left-3 lg:inset-x-auto lg:justify-start">
      <div
        className="pointer-events-auto w-full max-w-[420px] rounded-xl border border-white/15 px-3 py-2.5 shadow-xl backdrop-blur-[28px]"
        style={{ background: 'var(--glass-hi)' }}
      >
        <div className="mb-1.5 flex items-center justify-between gap-2">
          <span className="text-[10px] font-semibold uppercase tracking-wider text-[var(--ink-3)]">
            {mode === 'approach'
              ? 'Approach mode · tap your ball spot'
              : 'Tee planner · tap the map'}
          </span>
          <button
            type="button"
            onClick={onReset}
            className="rounded-md px-1.5 py-0.5 text-[10px] text-[var(--ink-3)] hover:bg-white/10 hover:text-[var(--ink-1)]"
          >
            Reset landing
          </button>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <div className="rounded-lg bg-black/30 px-2.5 py-2">
            <div className="text-[9px] uppercase tracking-wide text-[var(--ink-4)]">
              {mode === 'approach' ? 'Start → green' : 'Tee → target'}
            </div>
            <div className="text-[22px] font-semibold tabular-nums leading-tight text-[var(--ink-1)]">
              {mode === 'approach' ? split.remainYards : split.carryYards}
              <span className="ml-0.5 text-[11px] font-medium text-[var(--ink-3)]">
                yd
              </span>
            </div>
            <div className="mt-0.5 text-[11px] text-[var(--accent)]">
              {(mode === 'approach' ? remainClub : carryClub)
                ? `${(mode === 'approach' ? remainClub : carryClub)!.label} · ${
                    (mode === 'approach' ? remainClub : carryClub)!.yards
                  } tot avg`
                : '—'}
              {' · '}plays {mode === 'approach' ? remainPlays : carryPlays}
            </div>
          </div>
          <div className="rounded-lg bg-black/30 px-2.5 py-2">
            <div className="text-[9px] uppercase tracking-wide text-[var(--ink-4)]">
              {mode === 'approach' ? 'Tee → start' : 'Target → green'}
            </div>
            <div className="text-[22px] font-semibold tabular-nums leading-tight text-[var(--ink-1)]">
              {mode === 'approach' ? split.carryYards : split.remainYards}
              <span className="ml-0.5 text-[11px] font-medium text-[var(--ink-3)]">
                yd
              </span>
            </div>
            <div className="mt-0.5 text-[11px] text-[var(--accent)]">
              {mode === 'approach'
                ? 'Set the tee-shot finish or your current lie'
                : `${remainClub ? `${remainClub.label} · ${remainClub.yards} tot avg` : '—'} · plays ${remainPlays}`}
            </div>
          </div>
        </div>
        {turf && (
          <div className="mt-1.5 flex flex-wrap gap-x-3 gap-y-0.5 text-[10px] text-[var(--ink-3)]">
            <span>
              Fairway {turf.fairway}
              {turf.fairwayRollYd ? ` +${turf.fairwayRollYd} yd` : ''}
            </span>
            <span>
              Green {turf.green}
              {turf.green === 'soft' ? ' holds' : ` +${turf.greenReleaseYd} yd`}
            </span>
          </div>
        )}
        {forecast?.shots[0] && (
          <div className="mt-1 flex flex-wrap gap-1.5">
            {forecast.shots[0].lines.map((line) => (
              <span
                key={line.id}
                className="inline-flex items-center gap-1 text-[10px] text-[var(--ink-3)]"
              >
                <span
                  className="h-1 w-3 rounded-sm"
                  style={{ background: line.color }}
                />
                {line.label}
              </span>
            ))}
            <span className="text-[10px] text-[var(--ink-4)]">
              {forecast.shots.length} shots · GIR{' '}
              {Math.round(forecast.girPct * 100)}%
            </span>
          </div>
        )}
      </div>
    </div>
  );
}
