import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, Sparkles, Wind } from 'lucide-react';
import { HOURS, bestWindowLabel, scoreColor } from '../lib/mock';
import { GoalCoachPanel } from '../components/coach/GoalCoachPanel';
import { loadGolfProfile } from '../lib/golfProfile';
import { needsQuestionnaire } from '../lib/questionnaire';

export function TodayView() {
  const windowLabel = bestWindowLabel(HOURS);
  const bestHour = HOURS.reduce((a, b) => (b.score > a.score ? b : a));
  const [showQuestionnaire, setShowQuestionnaire] = useState(false);

  useEffect(() => {
    const refresh = () => {
      const profile = loadGolfProfile();
      setShowQuestionnaire(profile ? needsQuestionnaire(profile) : true);
    };
    refresh();
    window.addEventListener('teeready-profile-changed', refresh);
    window.addEventListener('focus', refresh);
    return () => {
      window.removeEventListener('teeready-profile-changed', refresh);
      window.removeEventListener('focus', refresh);
    };
  }, []);

  return (
    <div className="flex flex-col gap-8">
      <header className="animate-fade-up">
        <p className="section-eyebrow">Today</p>
        <h1 className="mt-2 font-display text-[32px] font-semibold leading-[1.1] tracking-[-0.03em] text-ink md:text-[40px]">
          Your tee sheet
        </h1>
        <p className="mt-2 max-w-xl text-[15px] leading-relaxed text-muted">
          Conditions, coaching, and the window to play — everything before you
          pull a club.
        </p>
      </header>

      {showQuestionnaire ? (
        <section className="ledger-card animate-fade-up p-5 [animation-delay:60ms]">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-start gap-3">
              <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-accent-soft text-accent">
                <Sparkles className="h-5 w-5" strokeWidth={2} />
              </span>
              <div>
                <h2 className="font-display text-[18px] font-semibold text-ink">
                  Finish your player profile
                </h2>
                <p className="mt-1 text-[14px] text-muted">
                  Goals, rhythm, and motivation unlock personalized coaching.
                </p>
              </div>
            </div>
            <Link to="/questionnaire" className="btn-accent shrink-0">
              Take questionnaire
            </Link>
          </div>
        </section>
      ) : null}

      <div className="animate-fade-up [animation-delay:120ms]">
        <GoalCoachPanel />
      </div>

      <section className="ledger-card animate-fade-up overflow-hidden [animation-delay:180ms]">
        <div className="grid gap-0 lg:grid-cols-[1fr_1.4fr]">
          <div className="border-b border-line p-6 lg:border-b-0 lg:border-r">
            <div className="flex items-center gap-2">
              <Wind className="h-4 w-4 text-brand" strokeWidth={2} />
              <span className="section-eyebrow">Playability</span>
            </div>
            <h2 className="mt-3 font-display text-[26px] font-semibold tracking-[-0.02em] text-ink">
              Best window · {bestHour.label}
            </h2>
            <p className="mt-2 text-[14px] leading-relaxed text-muted">
              {bestHour.summary}
            </p>
            <div className="mt-6 flex items-end gap-4">
              <div>
                <div className="label">Score</div>
                <div
                  className="stat-num mt-1 text-[48px] leading-none"
                  style={{ color: scoreColor(bestHour.score) }}
                >
                  {bestHour.score}
                </div>
              </div>
              {windowLabel ? (
                <div className="mb-1 rounded-pill border border-line bg-canvas px-3 py-1.5 text-[11px] font-semibold text-brand">
                  {windowLabel}
                </div>
              ) : null}
            </div>
            <Link
              to="/rounds/prep"
              className="btn-primary mt-6 inline-flex"
            >
              Prep a round
              <ArrowRight className="h-4 w-4" />
            </Link>
          </div>

          <div className="bg-[color-mix(in_srgb,var(--canvas)_60%,var(--surface))] p-6">
            <div className="flex items-baseline justify-between gap-3">
              <h3 className="font-display text-[16px] font-semibold text-ink">
                Hourly read
              </h3>
              <span className="label">0–100</span>
            </div>
            <div className="mt-4 grid grid-cols-6 gap-2 sm:grid-cols-12">
              {HOURS.map((h) => {
                const hot = h.score === bestHour.score;
                return (
                  <div
                    key={h.short}
                    className="flex flex-col items-center gap-1.5"
                    title={h.summary}
                  >
                    <span className="stat-num text-[10px] text-muted">
                      {h.score}
                    </span>
                    <div
                      className={`w-full rounded-sm transition-opacity hover:opacity-90 ${
                        hot ? 'ring-1 ring-accent ring-offset-1 ring-offset-[var(--canvas)]' : ''
                      }`}
                      style={{
                        height: Math.max(24, Math.round(h.score * 1.15)),
                        background: scoreColor(h.score),
                      }}
                    />
                    <span className="text-[9px] font-medium text-faint">
                      {h.short}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
