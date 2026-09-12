/**
 * DIRECTION CONTRACT
 * THESIS: Home is a one-hand launchpad — Start Round first, then only the golfer's next useful signal.
 * OWN-WORLD: Fairway Ledger — brand green fields, large tabular yardages/scores, soft surface plates, no dashboard clutter.
 * STORY: Golfer greets by name, starts or continues a round in one tap, glimpses nearby/recent/HCP/swing without hunting menus.
 * FIRST VIEWPORT: Greeting + Ready to play? + giant START ROUND; optional Continue; then Nearby / Recent / AI Swing strips.
 * FORM: Operate shell extension of incumbent Fairway Ledger; bottom-tab IA.
 * FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  ChevronRight,
  MapPin,
  Sparkles,
  TrendingUp,
  Video,
} from 'lucide-react';
import {
  bestWindowLabel,
  fetchPlayHours,
  playVerdict,
  playVerdictLabel,
  toDisplayHours,
  type Hour,
} from '../lib/playability';
import {
  hasStoredRound,
  loadRound,
  roundScoreLabel,
  type TrackedRound,
} from '../lib/golfTracker';
import { loadGolfProfile } from '../lib/golfProfile';
import { formatHandicap } from '../lib/golfHandicap';
import { stashCourseFilter, stashPendingCourse } from '../lib/pendingCourse';
import { needsQuestionnaire } from '../lib/questionnaire';
import { defaultSearchLoc } from '../lib/searchLoc';
import { loadDisplayProfile } from '../lib/mock';
import { loadRoundHistory, type SavedRound } from '../lib/roundHistory';
import { fetchGolfCourses, type GolfCourseSummary } from '../lib/golf';
import { loadSwingHistory } from '../lib/swing';
import { swingDelta, swingScorecard } from '../lib/swingScore';
import { buildSocialFeed } from '../lib/socialFeed';

function greetingForNow(name: string): string {
  const h = new Date().getHours();
  const first = name.trim().split(/\s+/)[0] || 'Golfer';
  if (h < 12) return `Good morning, ${first}`;
  if (h < 17) return `Good afternoon, ${first}`;
  return `Good evening, ${first}`;
}

function lastRoundLabel(round: SavedRound | TrackedRound | null): string | null {
  if (!round?.scores.length) return null;
  return roundScoreLabel(round);
}

export function TodayView() {
  const [displayName, setDisplayName] = useState(
    () => loadDisplayProfile().name,
  );
  const [showQuestionnaire, setShowQuestionnaire] = useState(false);
  const [handicap, setHandicap] = useState<number | null>(null);
  const [miss, setMiss] = useState<string | null>(null);
  const [homeCourses, setHomeCourses] = useState<string[]>([]);
  const [liveRound, setLiveRound] = useState(() =>
    hasStoredRound() ? loadRound() : null,
  );
  const [recentRounds, setRecentRounds] = useState<SavedRound[]>(() =>
    loadRoundHistory().slice(0, 3),
  );
  const [loc, setLoc] = useState(() => defaultSearchLoc());
  const [nearby, setNearby] = useState<GolfCourseSummary[]>([]);
  const [hours, setHours] = useState<Hour[] | null>(null);
  const [feed, setFeed] = useState(() => buildSocialFeed(3));

  const swings = useMemo(() => loadSwingHistory(), [liveRound, recentRounds]);
  const latestSwing = swings[0];
  const swingCard = latestSwing ? swingScorecard(latestSwing) : null;
  const swingImprove =
    latestSwing && swings[1]
      ? swingDelta(swings[1], latestSwing)
      : null;

  const refresh = useCallback(() => {
    const profile = loadGolfProfile();
    setDisplayName(loadDisplayProfile().name);
    setShowQuestionnaire(profile ? needsQuestionnaire(profile) : true);
    setHandicap(profile?.handicap ?? null);
    setMiss(profile?.miss ?? null);
    setHomeCourses(profile?.commonCourses?.slice(0, 3) ?? []);
    setLoc(defaultSearchLoc());
    setLiveRound(hasStoredRound() ? loadRound() : null);
    setRecentRounds(loadRoundHistory().slice(0, 3));
    setFeed(buildSocialFeed(3));
  }, []);

  useEffect(() => {
    refresh();
    window.addEventListener('teeready-profile-changed', refresh);
    window.addEventListener('teeready-location-changed', refresh);
    window.addEventListener('teeready-round-changed', refresh);
    window.addEventListener('teeready-round-history-changed', refresh);
    window.addEventListener('teeready-display-changed', refresh);
    window.addEventListener('teeready-swing-history-changed', refresh);
    window.addEventListener('focus', refresh);
    return () => {
      window.removeEventListener('teeready-profile-changed', refresh);
      window.removeEventListener('teeready-location-changed', refresh);
      window.removeEventListener('teeready-round-changed', refresh);
      window.removeEventListener('teeready-round-history-changed', refresh);
      window.removeEventListener('teeready-display-changed', refresh);
      window.removeEventListener('teeready-swing-history-changed', refresh);
      window.removeEventListener('focus', refresh);
    };
  }, [refresh]);

  useEffect(() => {
    const ac = new AbortController();
    fetchPlayHours(loc.lat, loc.lon, ac.signal)
      .then((res) => {
        if (ac.signal.aborted) return;
        setHours(toDisplayHours(res.hours));
      })
      .catch(() => {
        if (!ac.signal.aborted) setHours(null);
      });
    fetchGolfCourses(loc.lat, loc.lon, { radius: 25000, signal: ac.signal })
      .then((courses) => {
        if (!ac.signal.aborted) setNearby(courses.slice(0, 4));
      })
      .catch(() => {
        if (!ac.signal.aborted) setNearby([]);
      });
    return () => ac.abort();
  }, [loc.lat, loc.lon]);

  const bestHour = useMemo(() => {
    if (!hours?.length) return null;
    return hours.reduce((a, b) => (b.score > a.score ? b : a));
  }, [hours]);

  const windowLabel = useMemo(
    () => (hours?.length ? bestWindowLabel(hours) : ''),
    [hours],
  );

  const lastFinished = recentRounds.find((r) => !r.inProgress) ?? null;
  const lastLabel = lastRoundLabel(lastFinished);
  const startHref = liveRound ? '/rounds/gps' : '/rounds/prep';

  const insight =
    miss === 'right'
      ? 'Your recent profile shows a right-side miss. Want to analyze your swing?'
      : miss === 'left'
        ? 'Your profile shows a left-side miss. A face-on swing check can help.'
        : swingImprove != null && swingImprove > 0
          ? `Your latest swing improved ${swingImprove} points.`
          : null;

  return (
    <div className="home-dash mx-auto flex max-w-lg flex-col gap-7 pb-4 md:max-w-2xl">
      <header className="animate-fade-up">
        <p className="text-[15px] font-medium text-muted">
          {greetingForNow(displayName)}
        </p>
        <h1 className="mt-1 font-display text-[32px] font-bold leading-tight tracking-[-0.03em] text-ink sm:text-[36px]">
          Ready to play?
        </h1>
        {bestHour ? (
          <p className="mt-2 text-[13px] text-muted">
            {playVerdictLabel(playVerdict(bestHour.score))}
            {windowLabel ? ` · best ${windowLabel}` : ''} near {loc.name}
          </p>
        ) : (
          <p className="mt-2 text-[13px] text-muted">
            Pick a course and start ranging in a few taps.
          </p>
        )}
      </header>

      <section className="animate-fade-up flex flex-col gap-3 [animation-delay:40ms]">
        <Link
          to={startHref}
          className="btn-primary flex min-h-[56px] items-center justify-center text-[16px] font-bold tracking-wide"
          data-tutorial="start-round"
        >
          {liveRound ? 'CONTINUE ROUND' : 'START ROUND'}
        </Link>
        {liveRound ? (
          <div className="flex items-center justify-between gap-3 rounded-2xl border border-brand/25 bg-brand-soft px-4 py-3">
            <div className="min-w-0">
              <p className="text-[12px] font-semibold uppercase tracking-[0.08em] text-brand">
                In progress
              </p>
              <p className="truncate text-[14px] font-semibold text-ink">
                {liveRound.courseName}
                {liveRound.scores.length
                  ? ` · Hole ${Math.max(
                      ...liveRound.scores.map((s) => s.holeNumber),
                    )}`
                  : ''}
              </p>
            </div>
            <Link
              to="/rounds/gps"
              className="shrink-0 text-[13px] font-bold text-brand"
            >
              Resume
            </Link>
          </div>
        ) : (
          <div className="flex gap-2">
            <Link
              to="/courses"
              className="btn-secondary flex min-h-[48px] flex-1 items-center justify-center text-[13px] font-semibold"
            >
              Find courses
            </Link>
            <Link
              to="/rounds/prep"
              className="btn-secondary flex min-h-[48px] flex-1 items-center justify-center text-[13px] font-semibold"
            >
              Prep first
            </Link>
          </div>
        )}
      </section>

      <section className="animate-fade-up grid grid-cols-3 gap-2 [animation-delay:80ms]">
        <Link
          to="/profile"
          className="rounded-2xl border border-line bg-surface px-3 py-3 text-center shadow-card"
        >
          <p className="text-[11px] font-medium text-muted">Handicap</p>
          <p className="mt-1 text-[22px] font-bold tabular tracking-[-0.03em] text-ink">
            {handicap != null ? formatHandicap(handicap) : '—'}
          </p>
        </Link>
        <Link
          to="/stats"
          className="rounded-2xl border border-line bg-surface px-3 py-3 text-center shadow-card"
        >
          <p className="text-[11px] font-medium text-muted">Last round</p>
          <p className="mt-1 text-[22px] font-bold tabular tracking-[-0.03em] text-brand">
            {lastLabel ?? '—'}
          </p>
        </Link>
        <Link
          to="/swing"
          className="rounded-2xl border border-line bg-surface px-3 py-3 text-center shadow-card"
        >
          <p className="text-[11px] font-medium text-muted">Swing</p>
          <p className="mt-1 text-[22px] font-bold tabular tracking-[-0.03em] text-ink">
            {swingCard ? `${swingCard.score}` : '—'}
          </p>
        </Link>
      </section>

      {insight ? (
        <Link
          to="/swing"
          className="animate-fade-up flex items-start gap-3 rounded-2xl border border-accent/30 bg-[color-mix(in_srgb,var(--accent)_10%,transparent)] px-4 py-3 [animation-delay:100ms]"
        >
          <Sparkles className="mt-0.5 h-4 w-4 shrink-0 text-accent" aria-hidden />
          <p className="text-[13px] leading-snug text-ink">{insight}</p>
        </Link>
      ) : null}

      {showQuestionnaire ? (
        <section className="animate-fade-up rounded-2xl border border-line bg-surface p-4 shadow-card [animation-delay:110ms]">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h2 className="text-[15px] font-bold text-ink">Finish your profile</h2>
              <p className="mt-1 text-[12px] text-muted">
                Goals unlock personalized coaching.
              </p>
            </div>
            <Link to="/questionnaire" className="btn-accent shrink-0 px-3 py-2 text-[12px]">
              Start
            </Link>
          </div>
        </section>
      ) : null}

      <section className="animate-fade-up [animation-delay:120ms]">
        <div className="mb-3 flex items-end justify-between gap-2">
          <h2 className="text-[17px] font-bold text-ink">Nearby</h2>
          <Link
            to="/courses"
            className="inline-flex items-center gap-0.5 text-[13px] font-semibold text-brand"
          >
            See all <ChevronRight className="h-3.5 w-3.5" aria-hidden />
          </Link>
        </div>
        {nearby.length === 0 && homeCourses.length === 0 ? (
          <p className="text-[13px] text-muted">
            Searching near {loc.name}…
          </p>
        ) : (
          <ul className="flex flex-col gap-2">
            {nearby.slice(0, 3).map((c) => (
              <li key={c.id}>
                <Link
                  to="/rounds/prep"
                  onClick={() => stashPendingCourse(c)}
                  className="flex min-h-[56px] items-center justify-between gap-3 rounded-2xl border border-line bg-surface px-4 py-3 shadow-card active:scale-[0.99]"
                >
                  <div className="min-w-0">
                    <p className="truncate text-[15px] font-semibold text-ink">
                      {c.name}
                    </p>
                    <p className="mt-0.5 flex items-center gap-1 text-[12px] text-muted">
                      <MapPin className="h-3 w-3 shrink-0" aria-hidden />
                      <span className="truncate">
                        {c.region ||
                          (c.distanceMi != null
                            ? `${c.distanceMi.toFixed(1)} mi`
                            : `${c.holes ?? 18} holes`)}
                        {c.holes ? ` · ${c.holes} holes` : ''}
                      </span>
                    </p>
                  </div>
                  <span className="shrink-0 text-[12px] font-bold uppercase tracking-wide text-brand">
                    Play
                  </span>
                </Link>
              </li>
            ))}
            {nearby.length === 0
              ? homeCourses.map((name) => (
                  <li key={name}>
                    <Link
                      to="/rounds/prep"
                      onClick={() => stashCourseFilter(name)}
                      className="flex min-h-[56px] items-center justify-between gap-3 rounded-2xl border border-line bg-surface px-4 py-3 shadow-card"
                    >
                      <p className="truncate text-[15px] font-semibold text-ink">
                        {name}
                      </p>
                      <span className="text-[12px] font-bold text-brand">Play</span>
                    </Link>
                  </li>
                ))
              : null}
          </ul>
        )}
      </section>

      {recentRounds.length > 0 ? (
        <section className="animate-fade-up [animation-delay:140ms]">
          <div className="mb-3 flex items-end justify-between gap-2">
            <h2 className="text-[17px] font-bold text-ink">Recently played</h2>
            <Link to="/stats" className="text-[13px] font-semibold text-brand">
              Stats
            </Link>
          </div>
          <ul className="overflow-hidden rounded-2xl border border-line bg-surface shadow-card">
            {recentRounds.map((r) => (
              <li
                key={r.id}
                className="flex items-center justify-between gap-3 border-b border-line px-4 py-3 last:border-0"
              >
                <div className="min-w-0">
                  <p className="truncate text-[14px] font-semibold text-ink">
                    {r.courseName}
                  </p>
                  <p className="text-[11px] text-muted">
                    {r.inProgress
                      ? 'In progress'
                      : new Date(r.finishedAt).toLocaleDateString(undefined, {
                          month: 'short',
                          day: 'numeric',
                        })}
                  </p>
                </div>
                <p className="shrink-0 text-[16px] font-bold tabular text-brand">
                  {roundScoreLabel(r)}
                </p>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <section className="animate-fade-up [animation-delay:160ms]">
        <div className="mb-3 flex items-end justify-between gap-2">
          <h2 className="text-[17px] font-bold text-ink">AI Swing</h2>
          <Link to="/swing" className="text-[13px] font-semibold text-brand">
            Analyze
          </Link>
        </div>
        <Link
          to="/swing"
          className="flex items-center gap-4 rounded-2xl border border-line bg-surface p-4 shadow-card"
        >
          <span className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-brand-soft text-brand">
            <Video className="h-5 w-5" strokeWidth={2.2} aria-hidden />
          </span>
          <div className="min-w-0 flex-1">
            {swingCard ? (
              <>
                <p className="text-[15px] font-bold text-ink">
                  Swing score {swingCard.score}/100
                </p>
                <p className="mt-0.5 truncate text-[13px] text-muted">
                  {swingImprove != null && swingImprove !== 0
                    ? `${swingImprove > 0 ? '+' : ''}${swingImprove} vs last · `
                    : ''}
                  Focus: {swingCard.biggestIssue}
                </p>
              </>
            ) : (
              <>
                <p className="text-[15px] font-bold text-ink">Analyze my swing</p>
                <p className="mt-0.5 text-[13px] text-muted">
                  Record or upload — results stay on this device.
                </p>
              </>
            )}
          </div>
          <ChevronRight className="h-4 w-4 shrink-0 text-faint" aria-hidden />
        </Link>
      </section>

      {feed.length > 0 ? (
        <section className="animate-fade-up [animation-delay:180ms]">
          <div className="mb-3 flex items-end justify-between gap-2">
            <h2 className="text-[17px] font-bold text-ink">Activity</h2>
            <Link to="/group" className="text-[13px] font-semibold text-brand">
              Social
            </Link>
          </div>
          <ul className="flex flex-col gap-2">
            {feed.map((item) => (
              <li key={item.id}>
                <Link
                  to={item.href ?? '/group'}
                  className="block rounded-2xl border border-line bg-surface px-4 py-3 shadow-card"
                >
                  <p className="text-[14px] font-semibold text-ink">{item.title}</p>
                  <p className="mt-0.5 text-[12px] text-muted">{item.body}</p>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <section className="animate-fade-up pb-2 [animation-delay:200ms]">
        <Link
          to="/stats"
          className="inline-flex items-center gap-2 text-[13px] font-semibold text-muted hover:text-brand"
        >
          <TrendingUp className="h-4 w-4" aria-hidden />
          Open full stats & trends
        </Link>
      </section>
    </div>
  );
}
