import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { BarChart3, Flag, Target, TrendingUp } from 'lucide-react';
import {
  aggregateStats,
  loadRoundsForStats,
  type SavedRound,
} from '../lib/roundHistory';
import {
  roundScoreLabel,
  roundTotalPar,
  roundTotalStrokes,
} from '../lib/golfTracker';
import { loadGolfProfile } from '../lib/golfProfile';
import { formatHandicap } from '../lib/golfHandicap';

function StatCard({
  label,
  value,
  hint,
}: {
  label: string;
  value: string;
  hint?: string;
}) {
  return (
    <div className="rounded-2xl border border-line bg-surface p-4 shadow-card">
      <div className="text-[11px] font-medium text-muted">{label}</div>
      <div className="mt-1.5 text-[26px] font-bold tabular tracking-[-0.03em] text-ink">
        {value}
      </div>
      {hint ? <p className="mt-1 text-[11px] text-muted">{hint}</p> : null}
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
  let putts = 0;
  for (const s of round.scores) {
    putts += s.putts ?? 0;
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
          {putts ? ` · ${putts} putts` : ''}
        </div>
      </div>
    </div>
  );
}

function trendValues(rounds: SavedRound[], take = 5): number[] {
  return rounds
    .filter((r) => !r.inProgress && r.scores.length >= 9)
    .slice(0, take)
    .map((r) => {
      const holes = r.scores.length;
      const gross = roundTotalStrokes(r);
      return Math.round((gross / holes) * 18);
    })
    .reverse();
}

function girTrend(rounds: SavedRound[], take = 5): number[] {
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

function parBreakdown(rounds: SavedRound[]) {
  const buckets: Record<3 | 4 | 5, { strokes: number; par: number; n: number }> =
    {
      3: { strokes: 0, par: 0, n: 0 },
      4: { strokes: 0, par: 0, n: 0 },
      5: { strokes: 0, par: 0, n: 0 },
    };
  for (const r of rounds) {
    for (const s of r.scores) {
      const p = s.par as 3 | 4 | 5;
      if (p !== 3 && p !== 4 && p !== 5) continue;
      buckets[p].strokes += s.strokes;
      buckets[p].par += s.par;
      buckets[p].n += 1;
    }
  }
  const rows = ([3, 4, 5] as const).map((p) => {
    const b = buckets[p];
    const toPar = b.n ? (b.strokes - b.par) / b.n : 0;
    return { par: p, toPar, n: b.n };
  });
  const worst = [...rows].sort((a, b) => b.toPar - a.toPar)[0];
  return { rows, worst };
}

function TrendStrip({
  label,
  values,
  suffix = '',
}: {
  label: string;
  values: number[];
  suffix?: string;
}) {
  if (values.length < 2) return null;
  return (
    <div className="rounded-2xl border border-line bg-surface px-4 py-3 shadow-card">
      <p className="text-[12px] font-medium text-muted">{label}</p>
      <p className="mt-1.5 flex flex-wrap items-center gap-2 text-[15px] font-bold tabular text-ink">
        {values.map((v, i) => (
          <span key={`${v}-${i}`} className="inline-flex items-center gap-2">
            {i > 0 ? <span className="text-faint">→</span> : null}
            <span>
              {v}
              {suffix}
            </span>
          </span>
        ))}
      </p>
    </div>
  );
}

export function StatsView() {
  const [rounds, setRounds] = useState<SavedRound[]>(() => loadRoundsForStats());
  const [handicap, setHandicap] = useState<number | null>(
    () => loadGolfProfile()?.handicap ?? null,
  );

  useEffect(() => {
    const refresh = () => {
      setRounds(loadRoundsForStats());
      setHandicap(loadGolfProfile()?.handicap ?? null);
    };
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
  const scores = useMemo(() => trendValues(rounds), [rounds]);
  const girs = useMemo(() => girTrend(rounds), [rounds]);
  const holesByPar = useMemo(() => parBreakdown(rounds), [rounds]);

  const bestScore = useMemo(() => {
    let best: { label: string; toPar: number } | null = null;
    for (const r of rounds) {
      if (r.inProgress || r.scores.length < 9) continue;
      const toPar = roundTotalStrokes(r) - roundTotalPar(r);
      if (!best || toPar < best.toPar) {
        best = { label: roundScoreLabel(r), toPar };
      }
    }
    return best;
  }, [rounds]);

  const avgPutts = useMemo(() => {
    let putts = 0;
    let holes = 0;
    for (const r of rounds) {
      for (const s of r.scores) {
        if (s.putts != null) {
          putts += s.putts;
          holes += 1;
        }
      }
    }
    return holes ? Math.round((putts / holes) * 10) / 10 : null;
  }, [rounds]);

  const pct = (v: number | null) => (v != null ? `${v}%` : '—');
  const num = (v: number | null, suffix = '') =>
    v != null ? `${v}${suffix}` : '—';

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-6 pb-4">
      <div>
        <h1 className="text-[28px] font-bold tracking-[-0.03em] text-ink">
          Stats
        </h1>
        <p className="mt-1 text-[14px] text-muted">
          The numbers that matter — then dive deeper when you want.
        </p>
      </div>

      {rounds.length === 0 ? (
        <section className="rounded-2xl border border-line bg-surface p-8 text-center shadow-card">
          <BarChart3
            className="mx-auto h-10 w-10 text-faint"
            strokeWidth={1.5}
            aria-hidden
          />
          <h2 className="mt-4 text-[17px] font-bold text-ink">No rounds yet</h2>
          <p className="mt-2 text-[14px] text-muted">
            Score on the GPS scorecard, then finish the round to build your
            trends here.
          </p>
          <Link to="/rounds/prep" className="btn-primary mt-5 inline-flex px-5 py-2.5">
            Start a round
          </Link>
        </section>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            <StatCard
              label="Handicap"
              value={handicap != null ? formatHandicap(handicap) : '—'}
              hint="From profile"
            />
            <StatCard
              label="Avg score"
              value={num(stats.avgGross)}
              hint="Projected to 18"
            />
            <StatCard
              label="Best"
              value={bestScore?.label ?? '—'}
              hint="Relative to par"
            />
            <StatCard
              label="Rounds"
              value={String(stats.rounds)}
              hint={`${stats.holes} holes`}
            />
          </div>

          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            <StatCard label="Fairways" value={pct(stats.firPct)} hint="Par 4 & 5" />
            <StatCard label="GIR" value={pct(stats.girPct)} />
            <StatCard
              label="Putts / hole"
              value={num(avgPutts)}
              hint="When logged"
            />
            <StatCard label="Chips / hole" value={num(stats.avgChips)} />
            <StatCard
              label="Sand saves"
              value={pct(stats.sandSavePct)}
              hint="Up & down"
            />
            <StatCard
              label="Penalties"
              value={String(stats.totalPenalties)}
              hint="All rounds"
            />
          </div>

          <section className="flex flex-col gap-2">
            <div className="mb-1 flex items-center gap-2">
              <TrendingUp className="h-4 w-4 text-brand" aria-hidden />
              <h2 className="text-[17px] font-bold text-ink">Trends</h2>
            </div>
            <TrendStrip label="Average score (→ newer)" values={scores} />
            <TrendStrip label="GIR %" values={girs} suffix="%" />
          </section>

          {holesByPar.worst && holesByPar.worst.n > 0 ? (
            <section className="rounded-2xl border border-line bg-surface p-4 shadow-card">
              <div className="flex items-center gap-2">
                <Target className="h-4 w-4 text-brand" aria-hidden />
                <h2 className="text-[15px] font-bold text-ink">Hole performance</h2>
              </div>
              <p className="mt-2 text-[14px] text-ink">
                You lose most strokes on{' '}
                <strong>Par {holesByPar.worst.par}s</strong>
                {holesByPar.worst.toPar > 0
                  ? ` (+${holesByPar.worst.toPar.toFixed(1)} / hole)`
                  : ''}
                .
              </p>
              <ul className="mt-3 grid grid-cols-3 gap-2">
                {holesByPar.rows.map((row) => (
                  <li
                    key={row.par}
                    className="rounded-xl bg-canvas px-2 py-2 text-center"
                  >
                    <p className="text-[11px] text-muted">Par {row.par}</p>
                    <p className="mt-0.5 text-[16px] font-bold tabular text-ink">
                      {row.n
                        ? `${row.toPar > 0 ? '+' : ''}${row.toPar.toFixed(1)}`
                        : '—'}
                    </p>
                  </li>
                ))}
              </ul>
              <p className="mt-3 text-[12px] text-muted">
                Practice mid-irons and approach distance control before your next
                round.
              </p>
            </section>
          ) : null}

          <section className="overflow-hidden rounded-2xl border border-line bg-surface shadow-card">
            <div className="flex items-center gap-2 border-b border-line px-4 py-3">
              <Flag className="h-4 w-4 text-brand" aria-hidden />
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
