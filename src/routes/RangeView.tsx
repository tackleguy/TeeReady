/** Driving range — session dispersion from launch monitor shots. */

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { AlertTriangle, Flag, Plus, Target, Upload, X } from 'lucide-react';
import { RangeDispersionCanvas } from '../components/range/RangeDispersionCanvas';
import { formatDirection } from '../lib/launch';
import { loadLaunchHistory } from '../lib/launch';
import {
  computeSessionStats,
  endRangeSession,
  getActiveSession,
  landingsForSession,
  loadRangeSessions,
  RANGE_HISTORY_EVENT,
  startRangeSession,
  type RangeLanding,
  type RangeSession,
} from '../lib/range';

const CLUBS = ['driver', '3-wood', '5-wood', 'hybrid', '4-iron', '7-iron', 'wedge'] as const;

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

function formatLateral(yd: number): string {
  if (Math.abs(yd) < 1) return 'On line';
  return yd > 0 ? `${Math.round(yd)} yd R` : `${Math.round(Math.abs(yd))} yd L`;
}

export function RangeView() {
  const [sessions, setSessions] = useState<RangeSession[]>(() => loadRangeSessions());
  const [active, setActive] = useState<RangeSession | null>(() => getActiveSession());
  const [club, setClub] = useState(() => getActiveSession()?.club ?? 'driver');
  const [historyVersion, setHistoryVersion] = useState(0);

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

  const landings: RangeLanding[] = useMemo(() => {
    if (!active) return [];
    return landingsForSession(active.shotIds, launchHistory);
  }, [active, launchHistory]);

  const stats = useMemo(() => computeSessionStats(landings), [landings]);

  const pastSessions = sessions.filter((s) => s.endedAt || s.id !== active?.id);

  const onStartSession = () => {
    const session = startRangeSession(club);
    setActive(session);
    setSessions(loadRangeSessions());
  };

  const onEndSession = () => {
    if (!active) return;
    endRangeSession(active.id);
    setActive(null);
    setSessions(loadRangeSessions());
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
          Start a session, analyze shots in Launch, and see your dispersion pattern build on-device.
        </p>
      </header>

      <div className="rounded-card border border-amber-500/40 bg-[color-mix(in_srgb,#f59e0b_8%,transparent)] px-4 py-3">
        <div className="flex gap-2">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" aria-hidden="true" />
          <p className="text-[12px] text-ink">
            <span className="font-semibold">Uncalibrated yardage</span>
            <span className="text-muted">
              {' '}
              — compare shot-to-shot and session-to-session, not vs a launch monitor.
            </span>
          </p>
        </div>
      </div>

      {!active ? (
        <div className="mt-5 space-y-4">
          <section className="rounded-card bg-surface p-4 shadow-card">
            <p className="font-mono text-[11px] font-semibold uppercase tracking-[0.12em] text-faint">
              New session
            </p>
            <select
              value={club}
              onChange={(e) => setClub(e.target.value)}
              className="mt-3 w-full rounded-xl border border-line bg-canvas px-3 py-2.5 text-[13px] text-ink"
            >
              {CLUBS.map((c) => (
                <option key={c} value={c}>
                  {c}
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

          {pastSessions.length > 0 ? (
            <section>
              <p className="font-mono text-[11px] font-semibold uppercase tracking-[0.12em] text-faint">
                Past sessions
              </p>
              <ul className="mt-2 divide-y divide-line overflow-hidden rounded-card bg-surface shadow-card">
                {pastSessions.slice(0, 8).map((s) => {
                  const shots = landingsForSession(s.shotIds, launchHistory);
                  const st = computeSessionStats(shots);
                  return (
                    <li key={s.id} className="px-4 py-3">
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <p className="text-[13px] font-semibold capitalize text-ink">{s.club}</p>
                          <p className="text-[11px] text-muted">
                            {new Date(s.createdAt).toLocaleString()} · {st.shotCount} shot
                            {st.shotCount === 1 ? '' : 's'}
                          </p>
                        </div>
                        <p className="shrink-0 text-[13px] font-bold tabular text-brand">
                          {st.avgCarryYd != null ? `${st.avgCarryYd} yd avg` : '—'}
                        </p>
                      </div>
                    </li>
                  );
                })}
              </ul>
            </section>
          ) : null}
        </div>
      ) : (
        <div className="mt-5 space-y-5">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="font-mono text-[11px] font-semibold uppercase tracking-[0.12em] text-faint">
                Active session
              </p>
              <p className="mt-0.5 text-[15px] font-semibold capitalize text-ink">{active.club}</p>
            </div>
            <button
              type="button"
              onClick={onEndSession}
              className="inline-flex items-center gap-1.5 rounded-xl border border-line bg-surface px-3 py-2 text-[12px] font-semibold text-muted shadow-card"
            >
              <X className="h-3.5 w-3.5" aria-hidden="true" />
              End
            </button>
          </div>

          <div className="overflow-hidden rounded-card bg-surface p-3 shadow-card">
            <RangeDispersionCanvas
              landings={landings}
              highlightId={landings.at(-1)?.launchId}
            />
            {landings.length === 0 ? (
              <p className="mt-2 text-center text-[12px] text-muted">
                No shots yet — analyze a clip in Launch to plot your first ball.
              </p>
            ) : null}
          </div>

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
          <p className="-mt-3 text-center text-[10px] text-faint">Lateral / carry spread (yd)</p>

          <Link
            to="/launch"
            className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-brand px-4 py-3 text-[14px] font-bold text-white"
          >
            <Upload className="h-4 w-4" strokeWidth={2.2} aria-hidden="true" />
            Analyze shot in Launch
          </Link>

          {landings.length > 0 ? (
            <section>
              <p className="font-mono text-[11px] font-semibold uppercase tracking-[0.12em] text-faint">
                Session shots
              </p>
              <ul className="mt-2 divide-y divide-line overflow-hidden rounded-card bg-surface shadow-card">
                {[...landings].reverse().map((l) => (
                  <li key={l.launchId} className="flex items-center justify-between gap-3 px-4 py-3">
                    <div className="flex items-center gap-2">
                      <Target className="h-3.5 w-3.5 text-faint" aria-hidden="true" />
                      <div>
                        <p className="text-[13px] font-semibold tabular text-ink">{l.carryYd} yd</p>
                        <p className="text-[11px] text-muted">
                          {l.directionDeg != null
                            ? formatDirection({
                                id: 'launch_direction',
                                label: 'Direction',
                                value: l.directionDeg,
                                unit: '°',
                                confidence: 'uncalibrated',
                                validForAngle: 'corner',
                                assumptions: [],
                              })
                            : 'Straight'}{' '}
                          · {formatLateral(l.lateralYd)}
                        </p>
                      </div>
                    </div>
                    <p className="text-[11px] text-faint">
                      {new Date(l.createdAt).toLocaleTimeString([], {
                        hour: 'numeric',
                        minute: '2-digit',
                      })}
                    </p>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}

          <button
            type="button"
            onClick={onStartSession}
            className="inline-flex w-full items-center justify-center gap-2 rounded-xl border border-line bg-surface px-4 py-3 text-[14px] font-semibold text-ink shadow-card"
          >
            <Plus className="h-4 w-4" strokeWidth={2.2} aria-hidden="true" />
            New session ({club})
          </button>
        </div>
      )}
    </div>
  );
}
