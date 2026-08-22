import { Link } from 'react-router-dom';
import { HOURS, bestWindowLabel, scoreColor } from '../lib/mock';
import { GoalCoachPanel } from '../components/coach/GoalCoachPanel';

export function TodayView() {
  const windowLabel = bestWindowLabel(HOURS);
  const bestHour = HOURS.reduce((a, b) => (b.score > a.score ? b : a));

  return (
    <div className="flex flex-col gap-6">
      <GoalCoachPanel />

      <section className="rounded-2xl border border-line bg-surface p-5 shadow-card">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-[13px] font-medium text-brand">Conditions</p>
            <h2 className="mt-1 text-[22px] font-bold tracking-[-0.03em] text-ink">
              Best window · {bestHour.label}
            </h2>
            <p className="mt-1 text-[14px] text-muted">{bestHour.summary}</p>
          </div>
          <div className="flex items-center gap-3">
            <div className="grid h-14 w-14 place-items-center rounded-full bg-brand-soft">
              <span
                className="text-[20px] font-bold tabular"
                style={{ color: scoreColor(bestHour.score) }}
              >
                {bestHour.score}
              </span>
            </div>
            <Link
              to="/rounds/prep"
              className="rounded-xl bg-brand px-4 py-2.5 text-[13px] font-bold text-white"
            >
              Prep a round
            </Link>
          </div>
        </div>

        <div className="mt-5 border-t border-line pt-5">
          <div className="flex items-baseline justify-between gap-3">
            <h3 className="text-[14px] font-semibold text-ink">By hour</h3>
            {windowLabel ? (
              <span className="text-[11px] font-medium text-brand">
                {windowLabel}
              </span>
            ) : null}
          </div>
          <div className="mt-3 flex h-[120px] items-end gap-2">
            {HOURS.map((h) => (
              <div
                key={h.short}
                className="flex flex-1 flex-col items-center gap-1.5"
                title={h.summary}
              >
                <span className="text-[10px] font-semibold text-muted">
                  {h.score}
                </span>
                <div
                  className="w-full rounded-md transition-opacity hover:opacity-90"
                  style={{
                    height: Math.round(h.score * 1.1),
                    background: scoreColor(h.score),
                  }}
                />
                <span className="text-[10px] font-medium text-faint">
                  {h.short}
                </span>
              </div>
            ))}
          </div>
        </div>
      </section>
    </div>
  );
}
