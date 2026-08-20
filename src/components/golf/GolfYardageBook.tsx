import { BookOpen, Printer, X } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { bearingCompass } from '../../lib/geo';
import type { GolfCourseSummary, GolfNotebook } from '../../lib/golf';
import { missLabel, bagFromStocks, type GolfPlayerProfile } from '../../lib/golfProfile';

interface Props {
  course: GolfCourseSummary;
  profile: GolfPlayerProfile;
  notebook: GolfNotebook | null;
  loading: boolean;
  error: string | null;
  onClose: () => void;
}

function aspectLabel(aspect: string): string {
  switch (aspect) {
    case 'head':
      return 'Headwind';
    case 'tail':
      return 'Tailwind';
    case 'cross-L':
      return 'Cross left';
    case 'cross-R':
      return 'Cross right';
    case 'quarter-head':
      return '¼ Head';
    case 'quarter-tail':
      return '¼ Tail';
    default:
      return aspect;
  }
}

function formatDay(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number);
  if (!y || !m || !d) return iso;
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    timeZone: 'UTC',
  });
}

function defaultDayIndex(dates: string[]): number {
  const today = new Date().toISOString().slice(0, 10);
  const next = dates.findIndex((d) => d > today);
  if (next >= 0) return next;
  const todayIdx = dates.findIndex((d) => d === today);
  return todayIdx >= 0 ? todayIdx : 0;
}

export function GolfYardageBook({
  course,
  profile,
  notebook,
  loading,
  error,
  onClose,
}: Props) {
  const [dayIdx, setDayIdx] = useState(0);

  useEffect(() => {
    if (!notebook?.days.length) return;
    setDayIdx(defaultDayIndex(notebook.days.map((d) => d.date)));
  }, [notebook]);

  const day = notebook?.days[dayIdx] ?? null;
  const bag = useMemo(
    () => bagFromStocks(profile.driverYards, profile.sevenIronYards),
    [profile.driverYards, profile.sevenIronYards],
  );
  const driverTotal = bag[0]?.yards ?? profile.driverYards;
  const sevenTotal =
    bag.find((c) => c.key === '7i')?.yards ?? profile.sevenIronYards;
  const generated = useMemo(() => {
    if (!notebook?.generatedAt) return '';
    try {
      return new Date(notebook.generatedAt).toLocaleString();
    } catch {
      return notebook.generatedAt;
    }
  }, [notebook]);

  return (
    <div className="fixed inset-0 z-40 flex flex-col bg-[var(--surface-0)]">
      <header className="golf-print-hide flex items-center gap-2 border-b border-[var(--line-subtle)] px-4 py-3">
        <BookOpen className="h-4 w-4 text-[var(--accent)]" />
        <div className="min-w-0 flex-1">
          <h2 className="truncate text-sm font-semibold text-[var(--ink-1)]">
            Yardage notebook
          </h2>
          <p className="truncate text-[11px] text-[var(--ink-3)]">
            {course.name}
            {course.region ? ` · ${course.region}` : ''}
          </p>
        </div>
        <button
          type="button"
          onClick={() => window.print()}
          className="inline-flex items-center gap-1.5 rounded-lg bg-white/10 px-2.5 py-1.5 text-[12px] font-medium text-[var(--ink-1)] hover:bg-white/15"
        >
          <Printer className="h-3.5 w-3.5" />
          Print
        </button>
        <button
          type="button"
          aria-label="Close yardage book"
          onClick={onClose}
          className="rounded-lg p-1.5 text-[var(--ink-3)] hover:bg-white/10 hover:text-[var(--ink-1)]"
        >
          <X className="h-4 w-4" />
        </button>
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4">
        {loading && !notebook ? (
          <p className="text-sm text-[var(--ink-3)]">Building your prep document…</p>
        ) : null}
        {error && !notebook ? (
          <p className="text-sm text-red-300">{error}</p>
        ) : null}

        {notebook ? (
          <article className="golf-yardage-print mx-auto max-w-4xl space-y-5 text-[var(--ink-1)]">
            <div>
              <h1 className="text-xl font-semibold">{course.name}</h1>
              <p className="mt-0.5 text-[12px] text-[var(--ink-3)]">
                {course.region ?? 'Golf course'} · HCP {profile.handicap} ·{' '}
                {missLabel(profile.miss)} · Driver {driverTotal} yd tot avg · 7i{' '}
                {sevenTotal} yd tot avg
              </p>
              <p className="text-[11px] text-[var(--ink-4)]">
                Prepared {generated}
              </p>
            </div>

            <section className="grid gap-3 sm:grid-cols-3">
              <div className="rounded-xl border border-[var(--line-subtle)] bg-black/20 px-3 py-3">
                <div className="text-[10px] uppercase tracking-wide text-[var(--ink-4)]">
                  Course elevation
                </div>
                <div className="text-2xl font-semibold tabular-nums">
                  {notebook.elevationFt.toLocaleString()} ft
                </div>
                <div className="text-[11px] text-[var(--ink-3)]">
                  above sea level
                </div>
              </div>
              <div className="rounded-xl border border-[var(--line-subtle)] bg-black/20 px-3 py-3">
                <div className="text-[10px] uppercase tracking-wide text-[var(--ink-4)]">
                  vs sea level
                </div>
                <div className="text-2xl font-semibold tabular-nums">
                  +{notebook.altitudeBonusPct}%
                </div>
                <div className="text-[11px] text-[var(--ink-3)]">
                  extra carry (~2% / 1,000 ft)
                </div>
              </div>
              <div className="rounded-xl border border-[var(--line-subtle)] bg-black/20 px-3 py-3">
                <div className="text-[10px] uppercase tracking-wide text-[var(--ink-4)]">
                  Round day
                </div>
                <div className="text-lg font-semibold">
                  {day ? formatDay(day.date) : '—'}
                </div>
                <div className="text-[11px] text-[var(--ink-3)]">
                  {day
                    ? `${Math.round(day.windMph)} mph from ${day.windFromDeg}°`
                    : 'No wind days'}
                </div>
              </div>
            </section>

            <section>
              <h3 className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-[var(--ink-3)]">
                7-day afternoon wind
              </h3>
              <div className="flex gap-1.5 overflow-x-auto pb-1">
                {notebook.days.map((d, i) => (
                  <button
                    key={d.date}
                    type="button"
                    onClick={() => setDayIdx(i)}
                    className={[
                      'min-w-[92px] shrink-0 rounded-lg border px-2 py-2 text-left',
                      i === dayIdx
                        ? 'border-[var(--accent)] bg-[var(--accent)]/15'
                        : 'border-[var(--line-subtle)] bg-black/15 hover:bg-white/5',
                    ].join(' ')}
                  >
                    <div className="text-[10px] text-[var(--ink-3)]">
                      {formatDay(d.date)}
                    </div>
                    <div className="text-[13px] font-semibold tabular-nums">
                      {Math.round(d.windMph)} mph
                    </div>
                    <div className="text-[10px] text-[var(--ink-4)]">
                      {d.windFromDeg}° · gust {Math.round(d.gustMph)}
                    </div>
                  </button>
                ))}
              </div>
            </section>

            {notebook.holes.length === 0 ? (
              <p className="text-sm text-[var(--ink-3)]">
                No hole geometry in OSM for this course yet. Wind and elevation
                above still apply to the round.
              </p>
            ) : (
              <>
                <section>
                  <h3 className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-[var(--ink-3)]">
                    Hole yardages · {day ? formatDay(day.date) : 'selected day'}
                  </h3>
                  <div className="overflow-x-auto rounded-xl border border-[var(--line-subtle)]">
                    <table className="w-full min-w-[720px] border-collapse text-left text-[12px]">
                      <thead className="bg-black/30 text-[10px] uppercase tracking-wide text-[var(--ink-4)]">
                        <tr>
                          <th className="px-2 py-2">#</th>
                          <th className="px-2 py-2">Par</th>
                          <th className="px-2 py-2">Map</th>
                          <th className="px-2 py-2">Sea-level</th>
                          <th className="px-2 py-2">Plays</th>
                          <th className="px-2 py-2">Slope</th>
                          <th className="px-2 py-2">Tee / Green</th>
                          <th className="px-2 py-2">Dir</th>
                          <th className="px-2 py-2">Club</th>
                        </tr>
                      </thead>
                      <tbody>
                        {notebook.holes.map((h) => {
                          const dayRow = h.days[dayIdx] ?? h.days[0];
                          return (
                            <tr
                              key={h.number}
                              className="border-t border-[var(--line-subtle)]"
                            >
                              <td className="px-2 py-1.5 font-semibold tabular-nums">
                                {h.number}
                              </td>
                              <td className="px-2 py-1.5 tabular-nums text-[var(--ink-3)]">
                                {h.par ?? '—'}
                              </td>
                              <td className="px-2 py-1.5 tabular-nums">
                                {h.yards} yd
                              </td>
                              <td className="px-2 py-1.5 tabular-nums">
                                {h.seaLevelYards} yd
                              </td>
                              <td className="px-2 py-1.5 font-medium tabular-nums">
                                {dayRow?.playsLikeYards ?? h.yards} yd
                                {dayRow &&
                                dayRow.playsLikeYards !== h.yards
                                  ? ` (${dayRow.playsLikeYards - h.yards > 0 ? '+' : ''}${dayRow.playsLikeYards - h.yards})`
                                  : ''}
                              </td>
                              <td className="px-2 py-1.5 tabular-nums">
                                {h.slopeYards > 0 ? '+' : ''}
                                {h.slopeYards} yd
                                {h.elevationChangeFt
                                  ? ` (${h.elevationChangeFt > 0 ? '+' : ''}${h.elevationChangeFt} ft)`
                                  : ''}
                              </td>
                              <td className="px-2 py-1.5 tabular-nums text-[var(--ink-3)]">
                                {h.teeElevationFt ?? '—'} / {h.greenElevationFt ?? '—'} ft
                              </td>
                              <td className="px-2 py-1.5 text-[var(--ink-3)]">
                                {h.bearingDeg}° {bearingCompass(h.bearingDeg)}
                              </td>
                              <td className="px-2 py-1.5 text-[var(--ink-2)]">
                                {dayRow?.recommendedClub ?? '—'}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </section>

                <section className="space-y-2">
                  <h3 className="text-[11px] font-semibold uppercase tracking-wider text-[var(--ink-3)]">
                    Hole notes
                  </h3>
                  <div className="grid gap-2 sm:grid-cols-2">
                    {notebook.holes.map((h) => {
                      const dayRow = h.days[dayIdx] ?? h.days[0];
                      const slope =
                        Math.abs(h.slopeYards) >= 3
                          ? `${Math.abs(h.slopeYards)} yd ${h.slopeYards > 0 ? 'uphill' : 'downhill'}`
                          : 'flat';
                      return (
                        <div
                          key={h.number}
                          className="rounded-lg border border-[var(--line-subtle)] bg-black/15 px-3 py-2"
                        >
                          <div className="flex items-baseline justify-between gap-2">
                            <span className="text-[13px] font-semibold">
                              #{h.number}
                              {h.par != null ? ` par ${h.par}` : ''} · {h.yards} yd
                            </span>
                            <span className="text-[10px] uppercase tracking-wide text-[var(--ink-4)]">
                              {dayRow ? aspectLabel(dayRow.aspect) : ''}
                            </span>
                          </div>
                          <p className="mt-1 text-[11px] leading-snug text-[var(--ink-3)]">
                            Slope {slope}. Sea-level {h.seaLevelYards} yd.
                            {dayRow
                              ? ` ${dayRow.clubHint}`
                              : ''}
                          </p>
                        </div>
                      );
                    })}
                  </div>
                </section>
              </>
            )}

            <p className="text-[10px] text-[var(--ink-4)]">
              {notebook.attribution}. Hole geometry © OpenStreetMap contributors
              (ODbL). Not a rangefinder — distances are tee-to-green from OSM.
            </p>
          </article>
        ) : null}
      </div>
    </div>
  );
}
