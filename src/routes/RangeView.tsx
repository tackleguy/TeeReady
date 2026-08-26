/** Driving range — session dispersion from launch monitor shots. */

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { AlertTriangle, Flag, Plus, Upload, X } from 'lucide-react';
import { RangeDispersionCanvas } from '../components/range/RangeDispersionCanvas';
import { ShotHistoryList } from '../components/range/ShotHistoryList';
import { FeatureGuide } from '../components/tutorial/FeatureGuide';
import { formatLaunchClubLabel, LAUNCH_CLUBS, loadLaunchHistory } from '../lib/launch';
import {
  computeDispersionBand,
  computeSessionStats,
  endRangeSession,
  getActiveSession,
  landingsForSession,
  landingsFromHistory,
  loadRangeSessions,
  RANGE_HISTORY_EVENT,
  startRangeSession,
  type RangeLanding,
  type RangeSession,
} from '../lib/range';
import { RANGE_HOWTO_STEPS } from '../lib/range/howto';
import { RANGE_GUIDE_KEY } from '../lib/featureGuide';

type HistoryFilter = 'active' | 'all' | string;

function StatPill({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-line bg-canvas/80 px-3 py-2.5 text-center">
      <p className="font-mono text-[10px] font-semibold uppercase tracking-[0.12em] text-faint">
        {label}
      </p>
      <p className="mt-0.5 font-display text-[18px] font-bold tabular text-brand">{value}</p>
    </div>
  );
}

function filterLabel(
  filter: HistoryFilter,
  active: RangeSession | null,
  sessions: RangeSession[],
): string {
  if (filter === 'active') return active ? `${active.club} (live)` : 'Active';
  if (filter === 'all') return 'All shots';
  const s = sessions.find((x) => x.id === filter);
  if (!s) return 'Session';
  return `${s.club} · ${new Date(s.createdAt).toLocaleDateString([], { month: 'short', day: 'numeric' })}`;
}

export function RangeView() {
  const [sessions, setSessions] = useState<RangeSession[]>(() => loadRangeSessions());
  const [active, setActive] = useState<RangeSession | null>(() => getActiveSession());
  const [club, setClub] = useState(() => getActiveSession()?.club ?? 'driver');
  const [historyVersion, setHistoryVersion] = useState(0);
  const [historyFilter, setHistoryFilter] = useState<HistoryFilter>(() =>
    getActiveSession() ? 'active' : 'all',
  );
  const [highlightId, setHighlightId] = useState<string | null>(null);

  const refresh = useCallback(() => {
    setSessions(loadRangeSessions());
    setActive(getActiveSession());
  }, []);

  useEffect(() => {
    const onLaunchHistory = () => setHistoryVersion((v) => v + 1);
    window.addEventListener(RANGE_HISTORY_EVENT, refresh);
    window.addEventListener('teeready-launch-history-changed', onLaunchHistory);
    return () => {
      window.removeEventListener(RANGE_HISTORY_EVENT, refresh);
      window.removeEventListener('teeready-launch-history-changed', onLaunchHistory);
    };
  }, [refresh]);

  const launchHistory = useMemo(() => loadLaunchHistory(), [historyVersion]);
  const allLandings = useMemo(() => landingsFromHistory(launchHistory), [launchHistory]);

  const displayedLandings: RangeLanding[] = useMemo(() => {
    if (historyFilter === 'all') return allLandings;
    if (historyFilter === 'active') {
      if (!active) return allLandings;
      return landingsForSession(active.shotIds, launchHistory);
    }
    const session = sessions.find((s) => s.id === historyFilter);
    if (!session) return allLandings;
    return landingsForSession(session.shotIds, launchHistory);
  }, [historyFilter, active, allLandings, sessions, launchHistory]);

  const stats = useMemo(() => computeSessionStats(displayedLandings), [displayedLandings]);
  const band = useMemo(() => computeDispersionBand(displayedLandings), [displayedLandings]);

  const endedSessions = sessions.filter((s) => s.endedAt || (active && s.id !== active.id));

  const onStartSession = () => {
    const session = startRangeSession(club);
    setActive(session);
    setSessions(loadRangeSessions());
    setHistoryFilter('active');
    setHighlightId(null);
  };

  const onEndSession = () => {
    if (!active) return;
    endRangeSession(active.id);
    setActive(null);
    setSessions(loadRangeSessions());
    setHistoryFilter('all');
  };

  return (
    <div className="mx-auto w-full max-w-lg px-5 pb-16 pt-6">
      <header className="mb-6">
        <p className="font-mono text-[11px] font-semibold uppercase tracking-[0.14em] text-faint">
          Practice
        </p>
        <h1 className="mt-1 font-display text-[28px] font-bold tracking-[-0.03em] text-ink">
          Driving range
        </h1>
        <p className="mt-2 text-[14px] text-muted">
          Shot history and dispersion from Launch — compare sessions and track your pattern on-device.
        </p>
      </header>

      <FeatureGuide
        storageKey={RANGE_GUIDE_KEY}
        title="Driving range"
        steps={RANGE_HOWTO_STEPS}
        className="mt-5"
      />

      <div className="mt-5 rounded-card border border-amber-500/40 bg-[color-mix(in_srgb,#f59e0b_8%,transparent)] px-4 py-3">
        <div className="flex gap-2">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" aria-hidden="true" />
          <p className="text-[12px] text-ink">
            <span className="font-semibold">Uncalibrated yardage</span>
            <span className="text-muted">
              {' '}
              — dashed ellipse is typical spread; compare relative to your own history.
            </span>
          </p>
        </div>
      </div>

      {active ? (
        <div className="mt-5 flex items-center justify-between gap-3 rounded-card bg-surface px-4 py-3 shadow-card">
          <div>
            <p className="font-mono text-[11px] font-semibold uppercase tracking-[0.12em] text-faint">
              Live session
            </p>
            <p className="mt-0.5 text-[15px] font-semibold capitalize text-ink">{active.club}</p>
          </div>
          <div className="flex items-center gap-2">
            <Link
              to="/launch"
              className="inline-flex items-center gap-1.5 rounded-xl bg-brand px-3 py-2 text-[12px] font-bold text-white"
            >
              <Upload className="h-3.5 w-3.5" aria-hidden="true" />
              Add shot
            </Link>
            <button
              type="button"
              onClick={onEndSession}
              className="inline-flex items-center gap-1.5 rounded-xl border border-line bg-canvas px-3 py-2 text-[12px] font-semibold text-muted"
            >
              <X className="h-3.5 w-3.5" aria-hidden="true" />
              End
            </button>
          </div>
        </div>
      ) : (
        <section className="mt-5 rounded-card bg-surface p-4 shadow-card">
          <p className="font-mono text-[11px] font-semibold uppercase tracking-[0.12em] text-faint">
            New session
          </p>
          <select
            value={club}
            onChange={(e) => setClub(e.target.value)}
            className="mt-3 w-full rounded-xl border border-line bg-canvas px-3 py-2.5 text-[13px] text-ink"
          >
            {LAUNCH_CLUBS.map((c) => (
              <option key={c} value={c}>
                {formatLaunchClubLabel(c)}
              </option>
            ))}
          </select>
          <button
            type="button"
            onClick={onStartSession}
            className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-brand px-4 py-3 text-[14px] font-bold text-white"
          >
            <Flag className="h-4 w-4" strokeWidth={2.2} aria-hidden="true" />
            Start range session
          </button>
        </section>
      )}

      <section className="mt-5 space-y-4">
        <div>
          <p className="font-mono text-[11px] font-semibold uppercase tracking-[0.12em] text-faint">
            Dispersion
          </p>
          <p className="mt-0.5 text-[12px] text-muted">
            Viewing: {filterLabel(historyFilter, active, sessions)}
          </p>
          <div className="mt-2 flex flex-wrap gap-2">
            {active ? (
              <button
                type="button"
                onClick={() => {
                  setHistoryFilter('active');
                  setHighlightId(null);
                }}
                className={`rounded-full border px-3 py-1.5 text-[12px] font-semibold capitalize ${
                  historyFilter === 'active'
                    ? 'border-brand bg-brand-soft text-brand'
                    : 'border-line text-muted'
                }`}
              >
                Live session
              </button>
            ) : null}
            <button
              type="button"
              onClick={() => {
                setHistoryFilter('all');
                setHighlightId(null);
              }}
              className={`rounded-full border px-3 py-1.5 text-[12px] font-semibold ${
                historyFilter === 'all'
                  ? 'border-brand bg-brand-soft text-brand'
                  : 'border-line text-muted'
              }`}
            >
              All shots ({allLandings.length})
            </button>
            {endedSessions.slice(0, 6).map((s) => {
              const count = landingsForSession(s.shotIds, launchHistory).length;
              if (count === 0) return null;
              return (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => {
                    setHistoryFilter(s.id);
                    setHighlightId(null);
                  }}
                  className={`rounded-full border px-3 py-1.5 text-[12px] font-semibold capitalize ${
                    historyFilter === s.id
                      ? 'border-brand bg-brand-soft text-brand'
                      : 'border-line text-muted'
                  }`}
                >
                  {s.club} ({count})
                </button>
              );
            })}
          </div>
        </div>

        <div className="overflow-hidden rounded-card bg-surface p-3 shadow-card">
          <RangeDispersionCanvas
            landings={[...displayedLandings].reverse()}
            highlightId={highlightId ?? displayedLandings[0]?.launchId}
            band={band}
          />
          {displayedLandings.length === 0 ? (
            <p className="mt-2 text-center text-[12px] text-muted">
              No shots yet — start a session and analyze clips in Launch.
            </p>
          ) : band ? (
            <p className="mt-2 text-center text-[10px] text-faint">
              Dashed ellipse ≈ typical spread (3+ shots)
            </p>
          ) : null}
        </div>

        {displayedLandings.length > 0 ? (
          <>
            <div className="grid grid-cols-3 gap-2">
              <StatPill label="Shots" value={String(stats.shotCount)} />
              <StatPill
                label="Avg carry"
                value={stats.avgCarryYd != null ? `${stats.avgCarryYd} yd` : '—'}
              />
              <StatPill
                label="Spread"
                value={
                  stats.lateralSpreadYd != null && stats.carrySpreadYd != null
                    ? `${stats.lateralSpreadYd} / ${stats.carrySpreadYd}`
                    : '—'
                }
              />
            </div>
            <p className="-mt-2 text-center text-[10px] text-faint">Lateral / carry spread (yd)</p>
          </>
        ) : null}

        <div className="overflow-hidden rounded-card bg-surface shadow-card">
          <p className="border-b border-line px-4 py-3 font-mono text-[11px] font-semibold uppercase tracking-[0.12em] text-faint">
            Shot history
          </p>
          <ShotHistoryList
            landings={displayedLandings}
            highlightId={highlightId ?? displayedLandings[0]?.launchId}
            onSelect={setHighlightId}
            emptyMessage="Analyze a slow-mo clip in Launch to build your history."
          />
        </div>
      </section>

      {active ? (
        <button
          type="button"
          onClick={onStartSession}
          className="mt-5 inline-flex w-full items-center justify-center gap-2 rounded-xl border border-line bg-surface px-4 py-3 text-[14px] font-semibold text-ink shadow-card"
        >
          <Plus className="h-4 w-4" strokeWidth={2.2} aria-hidden="true" />
          New session ({club})
        </button>
      ) : null}
    </div>
  );
}
