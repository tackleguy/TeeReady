import type { TurfReport } from '../../lib/golf';
import type { HoleForecast } from '../../lib/golfPredict';
import { missLabel, type MissBias } from '../../lib/golfProfile';

interface Props {
  forecast: HoleForecast;
  turf: TurfReport;
  miss: MissBias;
}

function pct(n: number): string {
  return `${Math.round(n * 100)}%`;
}

function firmLabel(v: TurfReport['fairway']): string {
  if (v === 'firm') return 'Firm';
  if (v === 'soft') return 'Soft';
  return 'Medium';
}

export function GolfHoleIntel({ forecast, turf, miss }: Props) {
  const first = forecast.shots[0];
  return (
    <div className="border-t border-[var(--line-subtle)] px-3 py-2.5">
      <div className="flex items-center justify-between gap-2">
        <span className="text-[10px] font-semibold uppercase tracking-wider text-[var(--ink-3)]">
          Play AI
        </span>
        <span className="text-[10px] text-[var(--ink-4)]">
          {missLabel(miss)}
        </span>
      </div>
      <div className="mt-1.5 grid grid-cols-2 gap-1.5 text-[11px]">
        <div className="rounded-md bg-black/25 px-2 py-1.5">
          <div className="text-[9px] uppercase tracking-wide text-[var(--ink-4)]">
            Fairway
          </div>
          <div className="font-semibold text-[var(--ink-1)]">
            {firmLabel(turf.fairway)}
            {turf.fairwayRollYd ? ` · +${turf.fairwayRollYd} yd roll` : ''}
          </div>
        </div>
        <div className="rounded-md bg-black/25 px-2 py-1.5">
          <div className="text-[9px] uppercase tracking-wide text-[var(--ink-4)]">
            Green
          </div>
          <div className="font-semibold text-[var(--ink-1)]">
            {firmLabel(turf.green)}
            {turf.green === 'soft'
              ? ' · holds'
              : ` · +${turf.greenReleaseYd} yd release`}
          </div>
        </div>
      </div>
      {first && (
        <div className="mt-1.5 flex flex-wrap gap-1.5">
          {first.lines.map((line) => (
            <span
              key={line.id}
              className="inline-flex items-center gap-1 rounded-md bg-black/25 px-1.5 py-0.5 text-[10px] text-[var(--ink-2)]"
            >
              <span
                className="h-1.5 w-3 rounded-sm"
                style={{ background: line.color }}
              />
              {line.label} {pct(line.p)}
            </span>
          ))}
        </div>
      )}
      <ul className="mt-1.5 space-y-0.5 text-[10px] text-[var(--ink-3)]">
        {forecast.shots.map((shot, i) => (
          <li key={`${shot.kind}-${i}`}>
            <span className="font-medium uppercase tracking-wide text-[var(--ink-4)]">
              {shot.kind}
            </span>{' '}
            {shot.note}
          </li>
        ))}
      </ul>
      <p className="mt-1.5 text-[11px] leading-snug text-[var(--ink-2)]">
        {forecast.narrative}
      </p>
      <div className="mt-2 grid grid-cols-5 gap-1 text-center">
        {(
          [
            ['Bird', forecast.scorePct.birdie],
            ['Par', forecast.scorePct.par],
            ['Bogey', forecast.scorePct.bogey],
            ['Dbl+', forecast.scorePct.doublePlus],
            [`E ${forecast.expectedScore}`, 1],
          ] as Array<[string, number]>
        ).map(([label, n]) => (
          <div key={label} className="rounded-md bg-black/25 px-0.5 py-1">
            <div className="text-[9px] uppercase tracking-wide text-[var(--ink-4)]">
              {label.startsWith('E ') ? 'Exp' : label}
            </div>
            <div className="text-[11px] font-semibold tabular-nums text-[var(--ink-1)]">
              {label.startsWith('E ') ? label.slice(2) : pct(n)}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
