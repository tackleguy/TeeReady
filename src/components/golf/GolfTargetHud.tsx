import type { BagClub } from '../../lib/golfProfile';
import {
  distancesToGreen,
  greenMarks,
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

  const from: LonLat =
    mode === 'approach'
      ? target
      : { lon: hole.tee.lon, lat: hole.tee.lat };
  const greenYds = distancesToGreen(from, greenMarks(hole));

  return (
      <div
        className="w-[min(100vw-1.5rem,360px)] rounded-xl border border-[color-mix(in_srgb,var(--brand)_40%,transparent)] px-2.5 py-2 shadow-xl backdrop-blur-[28px]"
        style={{ background: 'var(--glass-hi)' }}
      >
        <div className="mb-1.5 flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <span className="rounded-full bg-brand-soft px-2 py-0.5 font-mono text-[11px] font-bold uppercase tracking-[0.12em] text-brand">
              Prep
            </span>
            <span className="text-[11px] font-semibold uppercase tracking-wider text-[var(--ink-3)]">
              {mode === 'approach'
                ? 'Approach · miss lines on'
                : 'Tee plan · miss lines on'}
            </span>
          </div>
          <button
            type="button"
            onClick={onReset}
            className="control-compact rounded-md px-1.5 py-0.5 text-[13px] text-[var(--ink-3)] hover:bg-white/10 hover:text-[var(--ink-1)]"
          >
            Reset landing
          </button>
        </div>

        <div className="mb-2 grid grid-cols-3 gap-1.5">
          {(
            [
              ['Front', greenYds.front],
              ['Mid', greenYds.mid],
              ['Back', greenYds.back],
            ] as const
          ).map(([label, yd]) => (
            <div
              key={label}
              className="rounded-lg bg-black/25 px-2 py-1.5 text-center"
            >
              <div className="text-[11px] uppercase tracking-wide text-[var(--ink-4)]">
                {label}
              </div>
              <div className="text-[16px] font-semibold tabular-nums text-[var(--ink-1)]">
                {yd}
                <span className="ml-0.5 text-[13px] font-medium text-[var(--ink-3)]">
                  yd
                </span>
              </div>
            </div>
          ))}
        </div>

        <div className="grid grid-cols-2 gap-2">
          <div className="rounded-lg bg-black/30 px-2.5 py-2">
            <div className="text-[11px] uppercase tracking-wide text-[var(--ink-4)]">
              {mode === 'approach' ? 'Start → mid' : 'Tee → target'}
            </div>
            <div className="text-[22px] font-semibold tabular-nums leading-tight text-[var(--ink-1)]">
              {mode === 'approach' ? split.remainYards : split.carryYards}
              <span className="ml-0.5 text-[13px] font-medium text-[var(--ink-3)]">
                yd
              </span>
            </div>
            <div className="mt-0.5 text-[13px] text-[var(--accent)]">
              {(mode === 'approach' ? remainClub : carryClub)
                ? `${(mode === 'approach' ? remainClub : carryClub)!.label} · ${
                    (mode === 'approach' ? remainClub : carryClub)!.yards
                  } tot avg`
                : '—'}
              {' · '}plays {mode === 'approach' ? remainPlays : carryPlays}
            </div>
          </div>
          <div className="rounded-lg bg-black/30 px-2.5 py-2">
            <div className="text-[11px] uppercase tracking-wide text-[var(--ink-4)]">
              {mode === 'approach' ? 'Tee → start' : 'Target → mid'}
            </div>
            <div className="text-[22px] font-semibold tabular-nums leading-tight text-[var(--ink-1)]">
              {mode === 'approach' ? split.carryYards : split.remainYards}
              <span className="ml-0.5 text-[13px] font-medium text-[var(--ink-3)]">
                yd
              </span>
            </div>
            <div className="mt-0.5 text-[13px] text-[var(--accent)]">
              {mode === 'approach'
                ? 'Set the tee-shot finish or your current lie'
                : `${remainClub ? `${remainClub.label} · ${remainClub.yards} tot avg` : '—'} · plays ${remainPlays}`}
            </div>
          </div>
        </div>
        {turf && (
          <div className="mt-1.5 flex flex-wrap gap-x-3 gap-y-0.5 text-[13px] text-[var(--ink-3)]">
            <span>
              Fairway {turf.fairway}
              {turf.fairwayRollYd ? ` +${turf.fairwayRollYd} yd` : ''}
            </span>
            <span>
              Green {turf.green}
              {turf.green === 'soft' ? ' holds' : ` +${turf.greenReleaseYd} yd`}
            </span>
            {turf.confidence === 'partial' ? (
              <span className="text-[var(--ink-4)]">Firmness from precip</span>
            ) : null}
          </div>
        )}
        {forecast?.shots[0] && (
          <div className="mt-1 flex flex-wrap gap-1.5">
            {forecast.shots[0].lines.map((line) => (
              <span
                key={line.id}
                className="inline-flex items-center gap-1 text-[13px] text-[var(--ink-3)]"
              >
                <span
                  className="h-1 w-3 rounded-sm"
                  style={{ background: line.color }}
                />
                {line.label}
              </span>
            ))}
            <span className="text-[13px] text-[var(--ink-4)]">
              {forecast.shots.length} shots · GIR{' '}
              {Math.round(forecast.girPct * 100)}%
            </span>
          </div>
        )}
      </div>
  );
}
