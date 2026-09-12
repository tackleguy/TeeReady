import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  ChevronRight,
  Crosshair,
  MapPin,
  Sparkles,
  Video,
} from 'lucide-react';
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
import {
  hasStoredRound,
  loadRound,
  roundScoreLabel,
  type TrackedRound,
} from '../lib/golfTracker';
import { loadGolfProfile, missLabel } from '../lib/golfProfile';
import { stashCourseFilter } from '../lib/pendingCourse';
import { needsQuestionnaire } from '../lib/questionnaire';
import { defaultSearchLoc } from '../lib/searchLoc';
import {
  aggregateStats,
  loadRoundsForStats,
  type SavedRound,
} from '../lib/roundHistory';
import { loadDisplayProfile } from '../lib/mock';
import { loadSwingHistory } from '../lib/swing/storage';
import { useWorkingCourses } from '../hooks/useWorkingCourses';
import { GROUP } from '../lib/mock';

function greetingForNow(name: string): string {
  const hour = new Date().getHours();
  const first = name.trim().split(/\s+/)[0] || 'golfer';
  if (hour < 12) return `Good morning, ${first}`;
  if (hour < 17) return `Good afternoon, ${first}`;
  return `Good evening, ${first}`;
}

function personalInsight(
  profileMiss: string | undefined,
  stats: ReturnType<typeof aggregateStats>,
  lastRound: SavedRound | null,
): string | null {
  if (profileMiss === 'right' || profileMiss === 'left') {
    return `Your profile shows a ${missLabel(profileMiss as 'left' | 'right' | 'both' | 'straight').toLowerCase()}. Want to analyze your swing?`;
  }
  if (stats.girPct != null && stats.girPct < 35 && stats.rounds >= 2) {
    return 'Greens in regulation are the biggest stroke leak — a short AI Swing check can help.';
  }
  if (lastRound && lastRound.scores.length >= 9) {
    return `Last round at ${lastRound.courseName}: ${roundScoreLabel(lastRound)}. Ready for another?`;
  }
  if (stats.firPct != null && stats.rounds >= 3) {
    return `Fairways at ${stats.firPct}% across recent rounds — keep that tee-shot focus.`;
  }
  return null;
}

function LiveRoundBanner({ round }: { round: TrackedRound }) {
  const hole = round.scores.length
    ? Math.max(...round.scores.map((s) => s.holeNumber))
    : null;
  return (
    <section className="surface-card flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between sm:p-5">
      <div>
        <p className="label text-accent">Round in progress</p>
        <h2 className="mt-1 text-title text-ink">{round.courseName}</h2>
        <p className="mt-1 text-detail text-muted">
          {hole != null ? `Hole ${hole}` : 'Ready on the first tee'}
          {round.scores.length ? ` · ${roundScoreLabel(round)}` : ''}
        </p>
      </div>
      <Link to="/rounds/gps" className="btn-primary inline-flex min-h-[48px] items-center justify-center gap-2 px-5">
        <Crosshair className="h-4 w-4" aria-hidden />
        Continue round
      </Link>
    </section>
  );
}

export function TodayView() {
  const display = useMemo(() => loadDisplayProfile(), []);
  const [showQuestionnaire, setShowQuestionnaire] = useState(false);
  const [showHours, setShowHours] = useState(false);
  const [homeCourses, setHomeCourses] = useState<string[]>([]);
  const [handicap, setHandicap] = useState<number | null>(null);
  const [miss, setMiss] = useState<string | undefined>();
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
  const [recentRounds, setRecentRounds] = useState(() => loadRoundsForStats());
  const [swingCount, setSwingCount] = useState(() => loadSwingHistory().length);
  const [latestSwingSummary, setLatestSwingSummary] = useState<string | null>(
    null,
  );

  const { courses: nearbyCourses, loading: nearbyLoading } = useWorkingCourses(
    loc.lat,
    loc.lon,
    '',
  );

  useEffect(() => {
    const refresh = () => {
      const profile = loadGolfProfile();
      setShowQuestionnaire(profile ? needsQuestionnaire(profile) : true);
      setHomeCourses(profile?.commonCourses?.slice(0, 4) ?? []);
      setHandicap(profile?.handicap ?? null);
      setMiss(profile?.miss);
      const next = defaultSearchLoc();
      setLoc(next);
      const home = profile?.commonCourses[0];
      setCourseSeed(home || next.name);
      setLiveRound(hasStoredRound() ? loadRound() : null);
      setRecentRounds(loadRoundsForStats());
      const swings = loadSwingHistory();
      setSwingCount(swings.length);
      setLatestSwingSummary(swings[0]?.summary ?? null);
    };
    refresh();
    window.addEventListener('teeready-profile-changed', refresh);
    window.addEventListener('teeready-location-changed', refresh);
    window.addEventListener('teeready-round-changed', refresh);
    window.addEventListener('teeready-round-history-changed', refresh);
    window.addEventListener('teeready-swing-history-changed', refresh);
    window.addEventListener('focus', refresh);
    return () => {
      window.removeEventListener('teeready-profile-changed', refresh);
      window.removeEventListener('teeready-location-changed', refresh);
      window.removeEventListener('teeready-round-changed', refresh);
      window.removeEventListener('teeready-round-history-changed', refresh);
      window.removeEventListener('teeready-swing-history-changed', refresh);
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
          const displayHours = toDisplayHours(res.hours);
          setHours(displayHours);
          setAttribution(res.attribution);
          setConfidenceNote(
            confidenceDisplay(res.confidence, res.confidenceNote) || null,
          );
          setConditionsHint(
            res.conditionsHint?.trim() ||
              deriveConditionsHint(displayHours) ||
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

  const stats = useMemo(() => aggregateStats(recentRounds), [recentRounds]);
  const lastRound = recentRounds.find((r) => !r.inProgress) ?? null;
  const insight = personalInsight(miss, stats, lastRound);
  const nearby = nearbyCourses.slice(0, 3);
  const socialPreview = GROUP.activity.slice(0, 2);

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-7 pb-4 md:gap-8">
      <header className="animate-fade-up">
        <p className="label text-brand">Home</p>
        <h1 className="mt-1 font-display text-display text-ink">
          {greetingForNow(display.name)}
        </h1>
        <p className="mt-2 text-body text-muted">Ready to play?</p>
      </header>

      {liveRound ? <LiveRoundBanner round={liveRound} /> : null}

      <section className="animate-fade-up [animation-delay:40ms]">
        <Link
          to="/rounds/gps"
          className="btn-primary flex min-h-[56px] w-full items-center justify-center gap-2 rounded-hero text-[16px] font-bold tracking-[-0.01em] shadow-lift"
          data-tutorial="start-round"
        >
          <Crosshair className="h-5 w-5" aria-hidden />
          Start round
        </Link>
        <div className="mt-3 flex gap-2">
          <Link
            to="/courses"
            className="inline-flex min-h-[44px] flex-1 items-center justify-center rounded-xl border border-line bg-surface px-3 text-[13px] font-semibold text-ink shadow-card"
          >
            Find a course
          </Link>
          <Link
            to="/rounds/prep"
            className="inline-flex min-h-[44px] flex-1 items-center justify-center rounded-xl border border-line bg-surface px-3 text-[13px] font-semibold text-ink shadow-card"
          >
            Prep first
          </Link>
        </div>
      </section>

      {insight ? (
        <section className="animate-fade-up surface-card flex items-start gap-3 p-4 [animation-delay:60ms]">
          <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-brand-soft text-brand">
            <Sparkles className="h-4 w-4" aria-hidden />
          </span>
          <div className="min-w-0">
            <p className="text-[13px] font-semibold text-ink">For you</p>
            <p className="mt-1 text-detail leading-relaxed text-muted">{insight}</p>
            {(miss === 'right' || miss === 'left') && (
              <Link
                to="/swing"
                className="mt-2 inline-flex items-center gap-1 text-[13px] font-semibold text-brand"
              >
                Analyze my swing
                <ChevronRight className="h-3.5 w-3.5" aria-hidden />
              </Link>
            )}
          </div>
        </section>
      ) : null}

      {showQuestionnaire ? (
        <section className="surface-card animate-fade-up p-4 [animation-delay:80ms]">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="text-title text-ink">Finish your player profile</h2>
              <p className="mt-1 text-detail text-muted">
                Goals and rhythm unlock personalized coaching.
              </p>
            </div>
            <Link to="/questionnaire" className="btn-accent shrink-0">
              Take questionnaire
            </Link>
          </div>
        </section>
      ) : null}

      <section className="animate-fade-up grid grid-cols-2 gap-3 [animation-delay:100ms] sm:grid-cols-4">
        <div className="surface-card p-4">
          <p className="text-micro font-semibold uppercase tracking-wide text-muted">
            Handicap
          </p>
          <p className="mt-1 text-stat tabular text-ink">
            {handicap != null ? handicap.toFixed(1) : '—'}
          </p>
        </div>
        <div className="surface-card p-4">
          <p className="text-micro font-semibold uppercase tracking-wide text-muted">
            Last round
          </p>
          <p className="mt-1 text-stat tabular text-ink">
            {lastRound ? roundScoreLabel(lastRound) : '—'}
          </p>
        </div>
        <div className="surface-card p-4">
          <p className="text-micro font-semibold uppercase tracking-wide text-muted">
            Avg (18)
          </p>
          <p className="mt-1 text-stat tabular text-ink">
            {stats.avgGross != null ? stats.avgGross : '—'}
          </p>
        </div>
        <div className="surface-card p-4">
          <p className="text-micro font-semibold uppercase tracking-wide text-muted">
            GIR
          </p>
          <p className="mt-1 text-stat tabular text-ink">
            {stats.girPct != null ? `${stats.girPct}%` : '—'}
          </p>
        </div>
      </section>

      <section className="animate-fade-up [animation-delay:120ms]">
        <div className="mb-3 flex items-end justify-between gap-3">
          <div>
            <h2 className="text-title text-ink">Nearby</h2>
            <p className="mt-0.5 text-detail text-muted">
              Courses ready to play near {loc.name}
            </p>
          </div>
          <Link
            to="/courses"
            className="text-[13px] font-semibold text-brand"
          >
            See all
          </Link>
        </div>
        {nearbyLoading && nearby.length === 0 ? (
          <p className="text-detail text-muted">Finding courses…</p>
        ) : nearby.length === 0 ? (
          <div className="surface-card p-4">
            <p className="text-detail text-muted">
              No map-ready courses nearby yet. Browse the full list or start GPS
              and search.
            </p>
            <Link to="/courses" className="btn-primary mt-3 inline-flex">
              Browse courses
            </Link>
          </div>
        ) : (
          <ul className="flex flex-col gap-2">
            {nearby.map((course) => (
              <li key={course.id}>
                <Link
                  to="/rounds/gps"
                  onClick={() => stashCourseFilter(course.name)}
                  className="surface-card flex min-h-[64px] items-center justify-between gap-3 p-4 transition-colors hover:border-brand/35"
                >
                  <div className="min-w-0">
                    <p className="truncate text-[15px] font-semibold text-ink">
                      {course.name}
                    </p>
                    <p className="mt-0.5 flex items-center gap-1 text-detail text-muted">
                      <MapPin className="h-3 w-3 shrink-0" aria-hidden />
                      {course.holes ? `${course.holes} holes` : 'Course'}
                      {course.distanceMi != null
                        ? ` · ${course.distanceMi} mi`
                        : ''}
                    </p>
                  </div>
                  <span className="shrink-0 rounded-pill bg-brand-soft px-3 py-1.5 text-[12px] font-bold text-brand">
                    Play
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      {homeCourses.length > 0 ? (
        <section className="animate-fade-up [animation-delay:140ms]">
          <h2 className="text-title text-ink">Recently played</h2>
          <p className="mt-1 text-detail text-muted">Your home tracks</p>
          <ul className="mt-3 flex flex-wrap gap-2">
            {homeCourses.map((name) => (
              <li key={name}>
                <Link
                  to="/rounds/gps"
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

      <section className="animate-fade-up [animation-delay:160ms]">
        <Link
          to="/swing"
          className="surface-card flex items-center gap-4 p-4 transition-colors hover:border-brand/35"
        >
          <span className="grid h-12 w-12 shrink-0 place-items-center rounded-full bg-accent-soft text-accent">
            <Video className="h-5 w-5" aria-hidden />
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-[15px] font-semibold text-ink">AI Swing</p>
            <p className="mt-0.5 truncate text-detail text-muted">
              {latestSwingSummary
                ? latestSwingSummary
                : swingCount > 0
                  ? `${swingCount} saved swing${swingCount === 1 ? '' : 's'} on this device`
                  : 'Record or upload — get one clear fix'}
            </p>
          </div>
          <ChevronRight className="h-4 w-4 shrink-0 text-muted" aria-hidden />
        </Link>
      </section>

      <section className="animate-fade-up [animation-delay:180ms]">
        <div className="mb-3 flex items-end justify-between">
          <div>
            <h2 className="text-title text-ink">Social</h2>
            <p className="mt-0.5 text-detail text-muted">Recent group activity</p>
          </div>
          <Link to="/group" className="text-[13px] font-semibold text-brand">
            Open
          </Link>
        </div>
        <ul className="surface-card divide-y divide-line overflow-hidden">
          {socialPreview.map((item) => (
            <li key={item.id} className="flex items-start gap-3 px-4 py-3">
              <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-brand-soft font-mono text-[11px] font-bold text-brand">
                {item.initials}
              </span>
              <div className="min-w-0">
                <p className="text-[13px] text-ink">
                  <span className="font-semibold">{item.name}</span>{' '}
                  {item.text}
                </p>
                <p className="mt-0.5 text-[11px] text-muted">{item.ago}</p>
              </div>
            </li>
          ))}
        </ul>
      </section>

      <section className="animate-fade-up [animation-delay:200ms]">
        <div className="surface-feature relative aspect-[4/3] min-h-[200px] sm:aspect-[16/9] sm:min-h-[240px]">
          <CourseHeroImage
            seed={courseSeed}
            alt={`Golf course near ${loc.name}`}
            loading="eager"
            className="absolute inset-0 h-full w-full object-cover"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-[#061008]/92 via-[#061008]/45 to-[#061008]/25" />
          <div className="relative flex h-full flex-col justify-end p-5 sm:p-7">
            {loading ? (
              <p className="text-title font-medium text-white/95">
                Loading live conditions…
              </p>
            ) : error || !bestHour ? (
              <>
                <p className="text-title font-medium text-white/95">
                  Conditions unavailable
                </p>
                <button
                  type="button"
                  className="btn-primary mt-4 w-fit bg-white text-[#061008] hover:bg-white/95"
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
                <p className="mt-1 text-[1.25rem] font-semibold text-white">
                  {playVerdictLabel(playVerdict(bestHour.score))}
                </p>
                <p className="mt-1 text-detail text-white/80">
                  {bestHour.label}
                  {bestHour.temp > 0 ? ` · ${bestHour.temp}°F` : ''} ·{' '}
                  {bestHour.wind}
                </p>
                <div className="mt-4 flex items-end gap-4">
                  <div>
                    <p className="text-micro text-white/65">Play score</p>
                    <p
                      className="text-hero-num mt-0.5"
                      style={{ color: scoreColor(bestHour.score) }}
                    >
                      {bestHour.score}
                    </p>
                  </div>
                  <Link
                    to="/weather"
                    className="mb-2 inline-flex min-h-[44px] items-center rounded-lg border border-white/35 px-4 text-body font-semibold text-white hover:bg-white/10"
                  >
                    Radar &amp; forecast
                  </Link>
                </div>
                {conditionsHint ? (
                  <p className="mt-3 max-w-lg text-detail text-white/75">
                    {conditionsHint}
                  </p>
                ) : null}
                {confidenceNote || attribution ? (
                  <p className="mt-2 text-micro text-white/55">
                    {[confidenceNote, attribution].filter(Boolean).join(' · ')}
                  </p>
                ) : null}
              </>
            )}
          </div>
        </div>
      </section>

      <section className="animate-fade-up space-y-3 [animation-delay:220ms]">
        <button
          type="button"
          onClick={() => setShowHours((v) => !v)}
          className="flex w-full min-h-[44px] items-center justify-between gap-3 rounded-lg py-1 text-left"
          aria-expanded={showHours}
          disabled={!hours?.length}
        >
          <span className="text-title text-ink">Hourly read</span>
          <span className="text-detail font-medium text-muted">
            {showHours ? 'Hide' : 'Show'}
          </span>
        </button>
        {showHours && hours?.length && bestHour ? (
          <GateBoard rows={gateRows} highlightId={bestHour.short} compact />
        ) : bestHour ? (
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
        ) : null}
      </section>

      <div className="animate-fade-up [animation-delay:240ms]">
        <GoalCoachPanel compact />
      </div>
    </div>
  );
}
