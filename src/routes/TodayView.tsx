import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Sparkles } from 'lucide-react';
import {
  HOURS,
  bestWindowLabel,
  buildHourGateRows,
  scoreColor,
} from '../lib/mock';
import { GoalCoachPanel } from '../components/coach/GoalCoachPanel';
import { BoardingPassStrip } from '../components/ui/BoardingPassStrip';
import { GateBoard } from '../components/ui/GateBoard';
import { loadGolfProfile } from '../lib/golfProfile';
import { needsQuestionnaire } from '../lib/questionnaire';

export function TodayView() {
  const windowLabel = bestWindowLabel(HOURS);
  const bestHour = HOURS.reduce((a, b) => (b.score > a.score ? b : a));
  const gateRows = buildHourGateRows(HOURS, bestHour.short);
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

      <section className="animate-fade-up space-y-4 [animation-delay:180ms]">
        <BoardingPassStrip
          flight={windowLabel || 'PLAYABILITY'}
          gate={bestHour.short.toUpperCase()}
          destination={`Best window · ${bestHour.label}`}
          detail={bestHour.summary}
          cta="Prep a round"
          href="/rounds/prep"
          footer={
            <div className="flex flex-wrap items-end gap-4">
              <div>
                <p className="font-mono text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--pass-muted)]">
                  Score
                </p>
                <p
                  className="stat-num mt-0.5 text-[36px] leading-none"
                  style={{ color: scoreColor(bestHour.score) }}
                >
                  {bestHour.score}
                </p>
              </div>
              <p className="text-[13px] leading-relaxed text-[var(--pass-muted)]">
                {bestHour.wind} · {bestHour.temp}°F
              </p>
            </div>
          }
        />

        <div>
          <div className="mb-3 flex items-baseline justify-between gap-3 px-0.5">
            <h2 className="font-display text-[16px] font-semibold text-ink">
              Hourly read
            </h2>
            <span className="label">0–100</span>
          </div>
          <GateBoard rows={gateRows} highlightId={bestHour.short} />
        </div>
      </section>
    </div>
  );
}
