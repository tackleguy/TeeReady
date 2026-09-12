import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  BarChart3,
  Flag,
  Target,
  TrendingDown,
  TrendingUp,
} from 'lucide-react';
import {
  aggregateStats,
  loadRoundsForStats,
  type SavedRound,
} from '../lib/roundHistory';
import { roundScoreLabel } from '../lib/golfTracker';
import { loadGolfProfile } from '../lib/golfProfile';

function StatCard({
  label,
  value,
  hint,
  icon: Icon,
}: {
  label: string;
  value: string;
  hint?: string;
  icon: typeof BarChart3;
}) {
  return (
    <div className="surface-card p-4">
      <div className="flex items-start justify-between gap-2">
        <div className="text-detail font-medium text-muted">{label}</div>
        <Icon className="h-4 w-4 shrink-0 text-brand" strokeWidth={2} />
      </div>
      <div className="mt-2 text-stat tabular tracking-[-0.03em] text-ink">
        {value}
      </div>
      {hint ? <p className="mt-1 text-[12px] text-muted">{hint}</p> : null}
    </div>
  );
}

function RoundRow({ round }: { round: SavedRound }) {
  const holes = round.scores.length;
  const date = round.inProgress
    ? 'In progress'
    : new Date(round.finishedAt).toLocaleDateString(undefined, {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
      });
  let fir = 0;
  let firOpps = 0;
  let gir = 0;
  let girOpps = 0;
  for (const s of round.scores) {
    if (s.fairwayHit != null) {
      firOpps += 1;
      if (s.fairwayHit) fir += 1;
    }
    if (s.gir != null) {
      girOpps += 1;
      if (s.gir) gir += 1;
    }
  }

  return (
    <div className="flex items-center justify-between gap-3 border-b border-line px-4 py-3 last:border-0">
      <div className="min-w-0">
        <div className="truncate text-[14px] font-semibold text-ink">
          {round.courseName}
        </div>
        <div className="mt-0.5 text-[12px] text-muted">
          {date} · {holes} holes
        </div>
      </div>
      <div className="shrink-0 text-right">
        <div className="text-[15px] font-bold tabular text-brand">
          {roundScoreLabel(round)}
        </div>
        <div className="mt-0.5 text-[11px] tabular text-muted">
          {firOpps ? `FIR ${Math.round((fir / firOpps) * 100)}%` : '—'}
          {' · '}
          {girOpps ? `GIR ${Math.round((gir / girOpps) * 100)}%` : '—'}
        </div>
      </div>
    </div>
  );
}

function projectedScores(rounds: SavedRound[], take = 3): number[] {
  return rounds
    .filter((r) => !r.inProgress && r.scores.length >= 9)
    .slice(0, take)
    .map((r) => {
      const strokes = r.scores.reduce((sum, h) => sum + h.strokes, 0);
      return Math.round((strokes / r.scores.length) * 18 * 10) / 10;
    })
    .reverse();
}

function girSeries(rounds: SavedRound[], take = 3): number[] {
  return rounds
    .filter((r) => !r.inProgress && r.scores.length >= 9)
    .slice(0, take)
    .map((r) => {
      let hit = 0;
      let opps = 0;
      for (const s of r.scores) {
        if (s.gir != null) {
          opps += 1;
          if (s.gir) hit += 1;
        }
      }
      return opps ? Math.round((hit / opps) * 100) : 0;
    })
    .reverse();
}

function parPerformance(rounds: SavedRound[]) {
  const byPar: Record<
    3 | 4 | 5,
    { strokes: number; par: number; holes: number }
  > = {
    3: { strokes: 0, par: 0, holes: 0 },
    4: { strokes: 0, par: 0, holes: 0 },
    5: { strokes: 0, par: 0, holes: 0 },
  };
  for (const r of rounds) {
    if (r.inProgress) continue;
    for (const s of r.scores) {
      if (s.par === 3 || s.par === 4 || s.par === 5) {
        byPar[s.par].strokes += s.strokes;
        byPar[s.par].par += s.par;
        byPar[s.par].holes += 1;
      }
    }
  }
  const rows = ([3, 4, 5] as const).map((par) => {
    const row = byPar[par];
    const toPar =
      row.holes > 0
        ? Math.round(((row.strokes - row.par) / row.holes) * 100) / 100
        : null;
    return { par, holes: row.holes, toPar };
  });
  const worst = [...rows]
    .filter((r) => r.toPar != null)
    .sort((a, b) => (b.toPar ?? 0) - (a.toPar ?? 0))[0];
  return { rows, worst };
}

export function StatsView() {
  const [rounds, setRounds] = useState<SavedRound[]>(() => loadRoundsForStats());
  const [handicap, setHandicap] = useState<number | null>(null);

  useEffect(() => {
    const refresh = () => {
      setRounds(loadRoundsForStats());
      setHandicap(loadGolfProfile()?.handicap ?? null);
    };
    refresh();
    window.addEventListener('teeready-round-history-changed', refresh);
    window.addEventListener('teeready-round-changed', refresh);
    window.addEventListener('teeready-profile-changed', refresh);
    window.addEventListener('focus', refresh);
    return () => {
      window.removeEventListener('teeready-round-history-changed', refresh);
      window.removeEventListener('teeready-round-changed', refresh);
      window.removeEventListener('teeready-profile-changed', refresh);
      window.removeEventListener('focus', refresh);
    };
  }, []);

  const stats = useMemo(() => aggregateStats(rounds), [rounds]);
  const scoreTrend = useMemo(() => projectedScores(rounds), [rounds]);
  const greensTrend = useMemo(() => girSeries(rounds), [rounds]);
  const holePerf = useMemo(() => parPerformance(rounds), [rounds]);

  const pct = (v: number | null) => (v != null ? `${v}%` : '—');
  const num = (v: number | null, suffix = '') =>
    v != null ? `${v}${suffix}` : '—';

  const bestLabel = useMemo(() => {
    const finished = rounds.filter(
      (r) => !r.inProgress && r.scores.length >= 9,
    );
    if (!finished.length) return null;
    let best = finished[0]!;
    let bestProj = Infinity;
    for (const r of finished) {
      const strokes = r.scores.reduce((sum, h) => sum + h.strokes, 0);
      const proj = (strokes / r.scores.length) * 18;
      if (proj < bestProj) {
        bestProj = proj;
        best = r;
      }
    }
    return roundScoreLabel(best);
  }, [rounds]);

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-6 pb-4">
      <div>
        <p className="label text-brand">Stats</p>
        <h1 className="mt-1 text-[28px] font-bold tracking-[-0.03em] text-ink">
          Your game
        </h1>
        <p className="mt-1 text-[14px] text-muted">
          Most important numbers first — trends and hole leaks when you want
          more.
        </p>
      </div>

      {rounds.length === 0 ? (
        <section className="rounded-card bg-surface p-8 text-center shadow-card">
          <BarChart3
            className="mx-auto h-10 w-10 text-faint"
            strokeWidth={1.5}
            aria-hidden="true"
          />
          <h2 className="mt-4 text-[17px] font-bold text-ink">No rounds yet</h2>
          <p className="mt-2 text-[14px] text-muted">
            Finish a round on the scorecard to unlock FIR, GIR, trends, and hole
            performance.
          </p>
          <Link
            to="/rounds/gps"
            className="mt-5 inline-block rounded-xl bg-brand px-5 py-2.5 text-[13px] font-bold text-white"
          >
            Start a round
          </Link>
        </section>
      ) : (
        <>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            <StatCard
              label="Handicap"
              value={handicap != null ? handicap.toFixed(1) : '—'}
              hint="From your player profile"
              icon={Flag}
            />
            <StatCard
              label="Avg score"
              value={num(stats.avgGross)}
              hint="Projected to 18 holes"
              icon={TrendingUp}
            />
            <StatCard
              label="Best round"
              value={bestLabel ?? '—'}
              icon={Target}
            />
            <StatCard
              label="Fairways"
              value={pct(stats.firPct)}
              hint="Par 4 & 5"
              icon={Target}
            />
            <StatCard label="GIR" value={pct(stats.girPct)} icon={Target} />
            <StatCard
              label="Sand saves"
              value={pct(stats.sandSavePct)}
              hint="Up & down from bunkers"
              icon={BarChart3}
            />
            <StatCard
              label="Avg chips / hole"
              value={num(stats.avgChips)}
              icon={BarChart3}
            />
            <StatCard
              label="Penalties"
              value={String(stats.totalPenalties)}
              hint="Across all rounds"
              icon={BarChart3}
            />
            <StatCard
              label="Rounds"
              value={String(stats.rounds)}
              hint={`${stats.holes} holes scored`}
              icon={Flag}
            />
          </div>

          {scoreTrend.length >= 2 ? (
            <section className="surface-card p-4">
              <div className="flex items-center justify-between gap-2">
                <h2 className="text-[15px] font-bold text-ink">Trends</h2>
                {scoreTrend[scoreTrend.length - 1]! <= scoreTrend[0]! ? (
                  <span className="inline-flex items-center gap-1 text-[12px] font-semibold text-brand">
                    <TrendingDown className="h-3.5 w-3.5" aria-hidden />
                    Improving
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1 text-[12px] font-semibold text-muted">
                    <TrendingUp className="h-3.5 w-3.5" aria-hidden />
                    Watch this
                  </span>
                )}
              </div>
              <div className="mt-4 grid gap-4 sm:grid-cols-2">
                <div>
                  <p className="text-micro font-semibold uppercase tracking-wide text-muted">
                    Avg score
                  </p>
                  <p className="mt-1 text-[18px] font-bold tabular text-ink">
                    {scoreTrend.join(' → ')}
                  </p>
                </div>
                {greensTrend.length >= 2 ? (
                  <div>
                    <p className="text-micro font-semibold uppercase tracking-wide text-muted">
                      GIR %
                    </p>
                    <p className="mt-1 text-[18px] font-bold tabular text-ink">
                      {greensTrend.map((n) => `${n}%`).join(' → ')}
                    </p>
                  </div>
                ) : null}
              </div>
            </section>
          ) : null}

          {holePerf.worst?.toPar != null ? (
            <section className="surface-card p-4">
              <h2 className="text-[15px] font-bold text-ink">
                Hole performance
              </h2>
              <p className="mt-1 text-[13px] text-muted">
                You lose most strokes on Par {holePerf.worst.par}s
                {holePerf.worst.toPar > 0
                  ? ` (+${holePerf.worst.toPar}/hole)`
                  : ''}
                .
              </p>
              <div className="mt-4 grid grid-cols-3 gap-2">
                {holePerf.rows.map((row) => (
                  <div
                    key={row.par}
                    className="rounded-xl bg-canvas px-3 py-3 text-center"
                  >
                    <p className="text-micro font-semibold uppercase tracking-wide text-muted">
                      Par {row.par}
                    </p>
                    <p className="mt-1 text-[18px] font-bold tabular text-ink">
                      {row.toPar == null
                        ? '—'
                        : row.toPar === 0
                          ? 'E'
                          : row.toPar > 0
                            ? `+${row.toPar}`
                            : String(row.toPar)}
                    </p>
                    <p className="mt-0.5 text-[11px] text-muted">
                      {row.holes ? `${row.holes} holes` : 'No data'}
                    </p>
                  </div>
                ))}
              </div>
              <p className="mt-3 text-[13px] text-muted">
                {holePerf.worst.par === 4
                  ? 'Focus approach distance control and GIR on mid-length par 4s.'
                  : holePerf.worst.par === 3
                    ? 'Dial in one stock iron distance and commit to the center of the green.'
                    : 'Play for position off the tee — a smart layup beats a hero double.'}
              </p>
            </section>
          ) : null}

          <section className="surface-card overflow-hidden">
            <div className="border-b border-line px-4 py-3">
              <h2 className="text-[15px] font-bold text-ink">Round history</h2>
            </div>
            {rounds.map((r) => (
              <RoundRow key={r.id} round={r} />
            ))}
          </section>
        </>
      )}
    </div>
  );
}
