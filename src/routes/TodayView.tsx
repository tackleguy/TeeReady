import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { ChevronDown, ChevronUp, Sparkles } from 'lucide-react';
import { CourseHeroImage } from '../components/golf/CourseHeroImage';
import {
  bestWindowLabel,
  buildHourGateRows,
  confidenceDisplay,
  deriveConditionsHint,
  fetchPlayHours,
  playVerdict,
  playVerdictLabel,
  scoreColor,
  toDisplayHours,
  type Hour,
} from '../lib/playability';
import { GoalCoachPanel } from '../components/coach/GoalCoachPanel';
import { GateBoard } from '../components/ui/GateBoard';
import { hasStoredRound, loadRound } from '../lib/golfTracker';
import { loadGolfProfile } from '../lib/golfProfile';
import { stashCourseFilter } from '../lib/pendingCourse';
import { needsQuestionnaire } from '../lib/questionnaire';
import { defaultSearchLoc } from '../lib/searchLoc';

export function TodayView() {
  const [showQuestionnaire, setShowQuestionnaire] = useState(false);
  const [showHours, setShowHours] = useState(false);
  const [homeCourses, setHomeCourses] = useState<string[]>([]);
  const [liveRound, setLiveRound] = useState(() =>
    hasStoredRound() ? loadRound() : null,
  );
  const [courseSeed, setCourseSeed] = useState(() => defaultSearchLoc().name);
  const [loc, setLoc] = useState(() => defaultSearchLoc());
  const [hours, setHours] = useState<Hour[] | null>(null);
  const [attribution, setAttribution] = useState<string | null>(null);
  const [confidenceNote, setConfidenceNote] = useState<string | null>(null);
  const [conditionsHint, setConditionsHint] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const refresh = () => {
      const profile = loadGolfProfile();
      setShowQuestionnaire(profile ? needsQuestionnaire(profile) : true);
      setHomeCourses(profile?.commonCourses?.slice(0, 4) ?? []);
      const next = defaultSearchLoc();
      setLoc(next);
      const home = profile?.commonCourses[0];
      setCourseSeed(home || next.name);
      setLiveRound(hasStoredRound() ? loadRound() : null);
    };
    refresh();
    window.addEventListener('teeready-profile-changed', refresh);
    window.addEventListener('teeready-location-changed', refresh);
    window.addEventListener('teeready-round-changed', refresh);
    window.addEventListener('focus', refresh);
    return () => {
      window.removeEventListener('teeready-profile-changed', refresh);
      window.removeEventListener('teeready-location-changed', refresh);
      window.removeEventListener('teeready-round-changed', refresh);
      window.removeEventListener('focus', refresh);
    };
  }, []);

  const loadHours = useCallback(
    (signal?: AbortSignal) => {
      setLoading(true);
      setError(null);
      fetchPlayHours(loc.lat, loc.lon, signal)
        .then((res) => {
          if (signal?.aborted) return;
          const display = toDisplayHours(res.hours);
          setHours(display);
          setAttribution(res.attribution);
          setConfidenceNote(
            confidenceDisplay(res.confidence, res.confidenceNote) || null,
          );
          setConditionsHint(
            res.conditionsHint?.trim() ||
              deriveConditionsHint(display) ||
              null,
          );
          setLoading(false);
        })
        .catch((err: unknown) => {
          if (signal?.aborted) return;
          setHours(null);
          setAttribution(null);
          setConfidenceNote(null);
          setConditionsHint(null);
          setError(
            err instanceof Error
              ? err.message
              : 'Could not load playability for this location',
          );
          setLoading(false);
        });
    },
    [loc.lat, loc.lon],
  );

  useEffect(() => {
    const ac = new AbortController();
    loadHours(ac.signal);
    return () => ac.abort();
  }, [loadHours]);

  const bestHour = useMemo(() => {
    if (!hours?.length) return null;
    return hours.reduce((a, b) => (b.score > a.score ? b : a));
  }, [hours]);

  const windowLabel = useMemo(
    () => (hours?.length ? bestWindowLabel(hours) : ''),
    [hours],
  );

  const gateRows = useMemo(() => {
    if (!hours?.length || !bestHour) return [];
    return buildHourGateRows(hours, bestHour.short);
  }, [hours, bestHour]);

  const locationLabel = loc.name;
  const verdict = bestHour ? playVerdict(bestHour.score) : null;

  return (
    <div className="flex flex-col gap-8 md:gap-10">
      <header className="animate-fade-up">
        <h1 className="text-display text-ink">Today</h1>
        <p className="mt-2 max-w-lg text-body text-muted">
          Should you play? Best window near {locationLabel}, then prep when
          you&apos;re ready.
        </p>
      </header>

      {liveRound ? (
        <section className="surface-card animate-fade-up flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between sm:p-5">
          <div>
            <h2 className="text-title text-ink">Round in progress</h2>
            <p className="mt-1 text-detail text-muted">
              {liveRound.courseName}
              {liveRound.scores.length
                ? ` — Hole ${Math.max(
                    ...liveRound.scores.map((s) => s.holeNumber),
                  )}`
                : ''}
            </p>
          </div>
          <Link to="/rounds/gps" className="btn-primary shrink-0">
            Resume GPS
          </Link>
        </section>
      ) : null}

      {showQuestionnaire ? (
        <section className="surface-card animate-fade-up p-4 sm:p-5 [animation-delay:60ms]">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-start gap-3">
              <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-accent-soft text-accent">
                <Sparkles className="h-4 w-4" strokeWidth={2} aria-hidden="true" />
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

      {homeCourses.length > 0 ? (
        <section className="animate-fade-up [animation-delay:80ms]">
          <h2 className="text-title text-ink">Your courses</h2>
          <p className="mt-1 text-detail text-muted">
            Jump straight into prep for a home track.
          </p>
          <ul className="mt-3 flex flex-wrap gap-2">
            {homeCourses.map((name) => (
              <li key={name}>
                <Link
                  to="/rounds/prep"
                  className="inline-flex min-h-[44px] items-center rounded-lg border border-line bg-surface px-3.5 text-body font-medium text-ink hover:border-brand/40 hover:text-brand"
                  onClick={() => stashCourseFilter(name)}
                >
                  {name}
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <section className="animate-fade-up [animation-delay:120ms]">
        <div className="surface-feature relative aspect-[4/3] min-h-[220px] sm:aspect-[16/9] sm:min-h-[260px]">
          <CourseHeroImage
            seed={courseSeed}
            alt={`Golf course near ${locationLabel}`}
            loading="eager"
            className="absolute inset-0 h-full w-full object-cover"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-[#061008]/92 via-[#061008]/45 to-[#061008]/25" />
          <div className="relative flex h-full flex-col justify-end p-5 sm:p-7">
            {loading ? (
              <>
                <p className="text-micro font-semibold uppercase tracking-wide text-white/70">
                  Playability
                </p>
                <p className="mt-1 max-w-md text-title font-medium text-white/95 sm:text-[1.25rem]">
                  Loading live conditions…
                </p>
              </>
            ) : error || !bestHour || !verdict ? (
              <>
                <p className="text-micro font-semibold uppercase tracking-wide text-white/70">
                  Playability
                </p>
                <p className="mt-1 max-w-md text-title font-medium text-white/95 sm:text-[1.25rem]">
                  Conditions unavailable
                </p>
                <p className="mt-2 max-w-lg text-detail leading-relaxed text-white/80">
                  {error || 'No forecast returned for this location.'}
                </p>
                <button
                  type="button"
                  className="btn-primary mt-5 w-fit bg-white text-[#061008] hover:bg-white/95"
                  onClick={() => loadHours()}
                >
                  Retry
                </button>
              </>
            ) : (
              <>
                <p className="text-micro font-semibold uppercase tracking-wide text-white/70">
                  {windowLabel || 'Playability'}
                </p>
                <p className="mt-1 max-w-md text-[1.35rem] font-semibold leading-tight text-white sm:text-[1.5rem]">
                  {playVerdictLabel(verdict)}
                </p>
                <p className="mt-1.5 max-w-md text-title font-medium text-white/90">
                  {bestHour.label}
                  {bestHour.temp > 0 ? ` · ${bestHour.temp}°F` : ''} ·{' '}
                  {bestHour.wind}
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
                </div>
                {conditionsHint ? (
                  <p className="mt-3 max-w-lg text-detail leading-relaxed text-white/75">
                    {conditionsHint}
                  </p>
                ) : null}
                {confidenceNote ? (
                  <p className="mt-2 text-micro text-white/55">
                    {confidenceNote}
                    {attribution ? ` · ${attribution}` : ''}
                  </p>
                ) : attribution ? (
                  <p className="mt-2 text-micro text-white/55">{attribution}</p>
                ) : null}
                <div className="mt-5 flex flex-wrap gap-3">
                  <Link
                    to="/rounds/prep"
                    className="btn-primary w-fit bg-white text-[#061008] hover:bg-white/95"
                  >
                    Prep this window
                  </Link>
                  <Link
                    to="/courses"
                    className="inline-flex min-h-[44px] items-center rounded-lg border border-white/35 px-4 text-body font-semibold text-white hover:bg-white/10"
                  >
                    Find a course
                  </Link>
                </div>
              </>
            )}
          </div>
        </div>
      </section>

      <section className="animate-fade-up space-y-3 [animation-delay:180ms]">
        <button
          type="button"
          onClick={() => setShowHours((v) => !v)}
          className="flex w-full min-h-[44px] items-center justify-between gap-3 rounded-lg py-1 text-left hover:opacity-90"
          aria-expanded={showHours}
          disabled={!hours?.length}
        >
          <span className="text-title text-ink">Hourly read</span>
          <span className="inline-flex items-center gap-1 text-detail font-medium text-muted">
            {showHours ? 'Hide' : 'Show all'}
            {showHours ? (
              <ChevronUp className="h-4 w-4" strokeWidth={2.2} aria-hidden="true" />
            ) : (
              <ChevronDown className="h-4 w-4" strokeWidth={2.2} aria-hidden="true" />
            )}
          </span>
        </button>
        {loading ? (
          <p className="text-detail text-muted">Fetching hourly forecast…</p>
        ) : error || !bestHour ? (
          <p className="text-detail text-muted" role="alert">
            Hourly conditions unavailable.
          </p>
        ) : showHours ? (
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
