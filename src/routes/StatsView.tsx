import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { BarChart3, Flag, Target, TrendingUp } from 'lucide-react';
import {
  aggregateStats,
  loadRoundsForStats,
  type SavedRound,
} from '../lib/roundHistory';
import { roundScoreLabel } from '../lib/golfTracker';

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

export function StatsView() {
  const [rounds, setRounds] = useState<SavedRound[]>(() => loadRoundsForStats());

  useEffect(() => {
    const refresh = () => setRounds(loadRoundsForStats());
    window.addEventListener('teeready-round-history-changed', refresh);
    window.addEventListener('teeready-round-changed', refresh);
    window.addEventListener('focus', refresh);
    return () => {
      window.removeEventListener('teeready-round-history-changed', refresh);
      window.removeEventListener('teeready-round-changed', refresh);
      window.removeEventListener('focus', refresh);
    };
  }, []);

  const stats = useMemo(() => aggregateStats(rounds), [rounds]);

  const pct = (v: number | null) => (v != null ? `${v}%` : '—');
  const num = (v: number | null, suffix = '') =>
    v != null ? `${v}${suffix}` : '—';

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-6">
      <div>
        <h1 className="text-[28px] font-bold tracking-[-0.03em] text-ink">
          Stats
        </h1>
        <p className="mt-1 text-[14px] text-muted">
          Fairways, greens, short game, and penalties across finished rounds.
        </p>
        <p className="mt-2 text-[13px] text-muted">
          Rounds and swing history stay on this device until you clear site
          data.
        </p>
      </div>

      {rounds.length === 0 ? (
        <section className="rounded-card bg-surface p-8 text-center shadow-card">
          <BarChart3 className="mx-auto h-10 w-10 text-faint" strokeWidth={1.5} />
          <h2 className="mt-4 text-[17px] font-bold text-ink">No rounds yet</h2>
          <p className="mt-2 text-[14px] text-muted">
            Enter scores on the scorecard (Scoring or Stats tab), then tap{' '}
            <strong className="font-semibold text-ink">Finish round</strong> to
            save FIR, GIR, chips, penalties, and sand saves here.
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
              label="Rounds"
              value={String(stats.rounds)}
              hint={`${stats.holes} holes scored`}
              icon={Flag}
            />
            <StatCard
              label="Avg gross (18)"
              value={num(stats.avgGross)}
              hint="Projected from holes played"
              icon={TrendingUp}
            />
            <StatCard
              label="Fairways hit"
              value={pct(stats.firPct)}
              hint="Par 4 & 5 only"
              icon={Target}
            />
            <StatCard
              label="Greens in reg"
              value={pct(stats.girPct)}
              icon={Target}
            />
            <StatCard
              label="Avg chips / hole"
              value={num(stats.avgChips)}
              icon={BarChart3}
            />
            <StatCard
              label="Penalties"
              value={String(stats.totalPenalties)}
              hint="Total across all rounds"
              icon={BarChart3}
            />
            <StatCard
              label="Sand saves"
              value={pct(stats.sandSavePct)}
              hint="Up & down from bunkers"
              icon={Target}
            />
          </div>

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
