import { Link } from 'react-router-dom';
import {
  HOURS,
  NEXT_TEE_TIME,
  bestWindowLabel,
  scoreColor,
} from '../lib/mock';

export function TodayView() {
  const t = NEXT_TEE_TIME;
  const windowLabel = bestWindowLabel(HOURS);

  return (
    <div className="flex flex-col gap-6">
      <section className="relative overflow-hidden rounded-hero bg-hero shadow-lift">
        <div className="h-[300px] w-full bg-[repeating-linear-gradient(135deg,#1d2a1c_0_14px,#182317_14px_28px)] sm:h-[340px]" />
        <div className="pointer-events-none absolute inset-0 bg-gradient-to-r from-[rgba(8,14,6,0.78)] via-[rgba(8,14,6,0.25)] to-transparent" />

        <div className="absolute left-5 top-8 flex max-w-[430px] flex-col gap-3.5 sm:left-8 sm:top-9">
          <span className="font-mono text-[10px] font-semibold uppercase tracking-[0.16em] text-white/70">
            Your next tee time · {t.time}
          </span>
          <h1 className="text-[32px] font-bold leading-[1.05] tracking-[-0.03em] text-white text-pretty sm:text-[40px]">
            {t.courseName} plays well this morning
          </h1>
          <p className="text-[14px] leading-relaxed text-white/80 text-pretty">
            {t.summary}
          </p>
          <div className="flex flex-wrap items-center gap-2.5">
            <Link
              to="/rounds/prep"
              className="rounded-xl bg-white px-4 py-2.5 text-[13px] font-bold text-ink"
            >
              Open hole plan
            </Link>
            <Link
              to="/rounds/prep"
              className="rounded-xl border border-white/50 px-4 py-2.5 text-[13px] font-semibold text-white"
            >
              Add to round
            </Link>
          </div>
        </div>

        <div className="absolute right-5 top-6 grid h-[120px] w-[120px] place-items-center rounded-full bg-white/95 sm:right-8 sm:top-8 sm:h-[150px] sm:w-[150px]">
          <div className="flex flex-col items-center">
            <span
              className="text-[38px] font-bold leading-none tracking-[-0.03em] sm:text-[46px]"
              style={{ color: scoreColor(t.playScore) }}
            >
              {t.playScore}
            </span>
            <span className="label">Play score</span>
          </div>
        </div>
      </section>

      <section className="rounded-card bg-surface p-5 shadow-card">
        <div className="flex items-baseline justify-between gap-3">
          <h2 className="text-[16px] font-bold text-ink">Playability by hour</h2>
          {windowLabel ? (
            <span className="font-mono text-[11px] font-semibold text-brand">
              {windowLabel}
            </span>
          ) : null}
        </div>
        <div className="mt-4 flex h-[150px] items-end gap-2 sm:gap-2.5">
          {HOURS.map((h) => (
            <div
              key={h.short}
              className="flex flex-1 flex-col items-center gap-2"
              title={h.summary}
            >
              <span className="text-[11px] font-semibold text-muted">
                {h.score}
              </span>
              <div
                className="w-full rounded-[7px]"
                style={{
                  height: Math.round(h.score * 1.35),
                  background: scoreColor(h.score),
                }}
              />
              <span className="font-mono text-[10px] font-medium text-faint">
                {h.short}
              </span>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
