import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { ChevronDown, ChevronUp, Sparkles } from 'lucide-react';
import { CourseHeroImage } from '../components/golf/CourseHeroImage';
import {
  HOURS,
  bestWindowLabel,
  buildHourGateRows,
  scoreColor,
} from '../lib/mock';
import { GoalCoachPanel } from '../components/coach/GoalCoachPanel';
import { GateBoard } from '../components/ui/GateBoard';
import { loadGolfProfile } from '../lib/golfProfile';
import { needsQuestionnaire } from '../lib/questionnaire';
import { defaultSearchLoc } from '../lib/searchLoc';

export function TodayView() {
  const windowLabel = bestWindowLabel(HOURS);
  const bestHour = HOURS.reduce((a, b) => (b.score > a.score ? b : a));
  const gateRows = buildHourGateRows(HOURS, bestHour.short);
  const [showQuestionnaire, setShowQuestionnaire] = useState(false);
  const [showHours, setShowHours] = useState(false);
  const [courseSeed, setCourseSeed] = useState(() => defaultSearchLoc().name);

  useEffect(() => {
    const refresh = () => {
      const profile = loadGolfProfile();
      setShowQuestionnaire(profile ? needsQuestionnaire(profile) : true);
      const home = profile?.commonCourses[0];
      setCourseSeed(home || defaultSearchLoc().name);
    };
    refresh();
    window.addEventListener('teeready-profile-changed', refresh);
    window.addEventListener('teeready-location-changed', refresh);
    window.addEventListener('focus', refresh);
    return () => {
      window.removeEventListener('teeready-profile-changed', refresh);
      window.removeEventListener('teeready-location-changed', refresh);
      window.removeEventListener('focus', refresh);
    };
  }, []);

  const locationLabel = useMemo(() => defaultSearchLoc().name, [courseSeed]);

  return (
    <div className="flex flex-col gap-8 md:gap-10">
      <header className="animate-fade-up">
        <h1 className="text-display text-ink">Today</h1>
        <p className="mt-2 max-w-lg text-body text-muted">
          Should you play? Best window near {locationLabel}, then prep when
          you&apos;re ready.
        </p>
      </header>

      {showQuestionnaire ? (
        <section className="surface-card animate-fade-up p-4 sm:p-5 [animation-delay:60ms]">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-start gap-3">
              <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-accent-soft text-accent">
                <Sparkles className="h-4 w-4" strokeWidth={2} />
              </span>
              <div>
                <h2 className="text-title text-ink">Finish your player profile</h2>
                <p className="mt-1 text-detail text-muted">
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

      <section className="animate-fade-up [animation-delay:120ms]">
        <div className="surface-feature relative aspect-[4/3] min-h-[220px] sm:aspect-[16/9] sm:min-h-[260px]">
          <CourseHeroImage
            seed={courseSeed}
            alt=""
            loading="eager"
            className="absolute inset-0 h-full w-full object-cover"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-[#061008]/92 via-[#061008]/45 to-[#061008]/25" />
          <div className="relative flex h-full flex-col justify-end p-5 sm:p-7">
            <p className="text-micro font-semibold uppercase tracking-wide text-white/70">
              {windowLabel || 'Playability'}
            </p>
            <p className="mt-1 max-w-md text-title font-medium text-white/95 sm:text-[1.25rem]">
              {bestHour.label}
            </p>
            <p className="mt-2 max-w-lg text-detail leading-relaxed text-white/80">
              {bestHour.summary}
            </p>
            <div className="mt-5 flex flex-wrap items-end gap-5">
              <div>
                <p className="text-micro text-white/65">Play score</p>
                <p
                  className="text-hero-num mt-0.5"
                  style={{ color: scoreColor(bestHour.score) }}
                >
                  {bestHour.score}
                </p>
              </div>
              <p className="pb-1 text-body text-white/85">
                {bestHour.wind} · {bestHour.temp}°F
              </p>
            </div>
            <Link
              to="/rounds/prep"
              className="btn-primary mt-5 w-fit bg-white text-[#061008] hover:bg-white/95"
            >
              Prep a round
            </Link>
          </div>
        </div>
      </section>

      <section className="animate-fade-up space-y-3 [animation-delay:180ms]">
        <button
          type="button"
          onClick={() => setShowHours((v) => !v)}
          className="flex w-full items-center justify-between gap-3 rounded-lg py-1 text-left hover:opacity-90"
          aria-expanded={showHours}
        >
          <span className="text-title text-ink">Hourly read</span>
          <span className="inline-flex items-center gap-1 text-detail font-medium text-muted">
            {showHours ? 'Hide' : 'Show all'}
            {showHours ? (
              <ChevronUp className="h-4 w-4" strokeWidth={2.2} />
            ) : (
              <ChevronDown className="h-4 w-4" strokeWidth={2.2} />
            )}
          </span>
        </button>
        {showHours ? (
          <GateBoard rows={gateRows} highlightId={bestHour.short} compact />
        ) : (
          <div className="surface-row flex items-center justify-between gap-3 px-0.5">
            <div>
              <p className="text-body font-medium text-ink">{bestHour.short}</p>
              <p className="text-detail text-muted">{bestHour.label}</p>
            </div>
            <p
              className="text-stat tabular"
              style={{ color: scoreColor(bestHour.score) }}
            >
              {bestHour.score}
            </p>
          </div>
        )}
      </section>

      <div className="animate-fade-up [animation-delay:240ms]">
        <GoalCoachPanel compact />
      </div>
    </div>
  );
}
