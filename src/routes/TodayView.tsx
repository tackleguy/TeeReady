import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ChevronDown, ChevronUp, Sparkles } from 'lucide-react';
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
  const [showHours, setShowHours] = useState(false);

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
    <div className="flex flex-col gap-6 md:gap-8">
      <header className="animate-fade-up">
        <p className="section-eyebrow">Today</p>
        <h1 className="mt-1.5 font-display text-[28px] font-semibold leading-[1.12] tracking-[-0.03em] text-ink md:text-[36px]">
          Your tee sheet
        </h1>
        <p className="mt-1.5 max-w-lg text-[14px] leading-relaxed text-muted md:text-[15px]">
          Best window to play, then prep when you&apos;re ready.
        </p>
      </header>

      {showQuestionnaire ? (
        <section className="ledger-card animate-fade-up p-4 sm:p-5 [animation-delay:60ms]">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-start gap-3">
              <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-accent-soft text-accent">
                <Sparkles className="h-4 w-4" strokeWidth={2} />
              </span>
              <div>
                <h2 className="text-[15px] font-semibold text-ink">
                  Finish your player profile
                </h2>
                <p className="mt-0.5 text-[13px] text-muted">
                  Goals and rhythm unlock personalized coaching.
                </p>
              </div>
            </div>
            <Link to="/questionnaire" className="btn-accent shrink-0">
              Take questionnaire
            </Link>
          </div>
        </section>
      ) : null}

      <section className="animate-fade-up space-y-3 [animation-delay:120ms]">
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
                <p className="font-mono text-[11px] font-semibold uppercase tracking-[0.14em] text-[var(--pass-muted)]">
                  Score
                </p>
                <p
                  className="stat-num mt-0.5 text-[32px] leading-none md:text-[36px]"
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
          <button
            type="button"
            onClick={() => setShowHours((v) => !v)}
            className="mb-2 flex w-full items-center justify-between gap-3 rounded-lg px-0.5 py-1 text-left hover:opacity-90"
            aria-expanded={showHours}
          >
            <span className="font-display text-[15px] font-semibold text-ink">
              Hourly read
            </span>
            <span className="inline-flex items-center gap-1 text-[12px] font-medium text-muted">
              {showHours ? 'Hide' : 'Show all'}
              {showHours ? (
                <ChevronUp className="h-3.5 w-3.5" strokeWidth={2.2} />
              ) : (
                <ChevronDown className="h-3.5 w-3.5" strokeWidth={2.2} />
              )}
            </span>
          </button>
          {showHours ? (
            <GateBoard rows={gateRows} highlightId={bestHour.short} compact />
          ) : null}
        </div>
      </section>

      <div className="animate-fade-up [animation-delay:180ms]">
        <GoalCoachPanel compact />
      </div>
    </div>
  );
}
