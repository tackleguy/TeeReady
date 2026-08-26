import { BookOpen, Printer, X } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { bearingCompass } from '../../lib/geo';
import type { GolfCourseSummary, GolfNotebook } from '../../lib/golf';
import {
  bagFromStocks,
  missLabel,
  type GolfPlayerProfile,
} from '../../lib/golfProfile';
import { formatHandicap } from '../../lib/golfHandicap';
import { teeHeightForClub } from '../../lib/yardageNotes';
import { useFocusTrap } from '../../hooks/useFocusTrap';
import { DataProvenanceNote } from './DataProvenanceNote';
import type { ScorecardProvenance } from '../../lib/scorecardProvenance';

interface Props {
  course: GolfCourseSummary;
  profile: GolfPlayerProfile;
  notebook: GolfNotebook | null;
  loading: boolean;
  error: string | null;
  teeKindLabel?: string;
  transferredFromPrep?: boolean;
  /** Hole-data provenance when known from the course map load. */
  provenance?: ScorecardProvenance;
  onClose: () => void;
}

function aspectLabel(aspect: string): string {
  switch (aspect) {
    case 'head':
      return 'Headwind';
    case 'tail':
      return 'Tailwind';
    case 'cross-L':
      return 'Cross L';
    case 'cross-R':
      return 'Cross R';
    case 'quarter-head':
      return 'Into & across';
    case 'quarter-tail':
      return 'Down & across';
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

function noteDate(): string {
  return new Date().toLocaleDateString(undefined, {
    month: 'numeric',
    day: 'numeric',
    year: '2-digit',
  });
}

export function GolfYardageBook({
  course,
  profile,
  notebook,
  loading,
  error,
  teeKindLabel,
  transferredFromPrep = false,
  provenance,
  onClose,
}: Props) {
  const [dayIdx, setDayIdx] = useState(0);
  const dialogRef = useRef<HTMLDivElement>(null);
  useFocusTrap(true, dialogRef, onClose);

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

  return (
    <div
      ref={dialogRef}
      role="dialog"
      aria-modal="true"
      aria-labelledby="yardage-book-title"
      className="fixed inset-0 z-40 flex flex-col bg-[#d4c4a8]"
    >
      <header className="golf-print-hide flex items-center gap-2 border-b border-black/10 bg-[#ebe4d4] px-4 py-3">
        <BookOpen className="h-4 w-4 text-[#1a5c3a]" strokeWidth={2} aria-hidden />
        <div className="min-w-0 flex-1">
          <h2
            id="yardage-book-title"
            className="truncate text-sm font-semibold text-[#1c140c]"
          >
            Yardage book notes
          </h2>
          <p className="truncate text-[11px] text-[#5c4f42]">
            {transferredFromPrep ? 'From Prep · ' : ''}
            {course.name}
            {teeKindLabel ? ` · ${teeKindLabel} tees` : ''}
          </p>
          {provenance ? (
            <DataProvenanceNote
              provenance={provenance}
              className="mt-1 text-[#5c4f42]"
            />
          ) : null}
        </div>
        <button
          type="button"
          onClick={() => window.print()}
          className="inline-flex items-center gap-1.5 rounded-lg border border-black/10 bg-white/70 px-2.5 py-1.5 text-[12px] font-medium text-[#1c140c] hover:bg-white"
        >
          <Printer className="h-3.5 w-3.5" aria-hidden />
          Print
        </button>
        <button
          type="button"
          aria-label="Close yardage book"
          onClick={onClose}
          className="rounded-lg p-1.5 text-[#5c4f42] hover:bg-black/5 hover:text-[#1c140c]"
        >
          <X className="h-4 w-4" aria-hidden />
        </button>
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto px-3 py-4 sm:px-6">
        {loading && !notebook ? (
          <p className="text-center text-sm text-[#5c4f42]">
            Transferring prep into your notebook…
          </p>
        ) : null}
        {error && !notebook ? (
          <p className="text-center text-sm text-[#b44a3a]">{error}</p>
        ) : null}

        {notebook ? (
          <article className="golf-yardage-print notebook-sheet mx-auto max-w-[42rem]">
            {/* Spiral binding */}
            <div className="notebook-spiral golf-print-hide" aria-hidden>
              {Array.from({ length: 18 }).map((_, i) => (
                <span key={i} className="notebook-coil" />
              ))}
            </div>

            {/* DATE / TITLE header */}
            <div className="notebook-header">
              <div className="notebook-date-box">
                <span className="notebook-field-label">Date / No.</span>
                <span className="notebook-field-value tabular">{noteDate()}</span>
              </div>
              <div className="notebook-title-box">
                <span className="notebook-field-label">Title:</span>
                <span className="notebook-field-value">
                  {course.name}
                  {course.region ? ` · ${course.region}` : ''}
                </span>
              </div>
            </div>

            {/* Meta line on first ruled rows */}
            <div className="notebook-ruled">
              <p className="notebook-line notebook-meta">
                HCP {formatHandicap(profile.handicap)} · {missLabel(profile.miss)}{' '}
                · Driver {driverTotal} yd · 7i {sevenTotal} yd
                {teeKindLabel ? ` · ${teeKindLabel} tees` : ''}
              </p>
              <p className="notebook-line notebook-meta">
                Round day:{' '}
                {day
                  ? `${formatDay(day.date)} · ${Math.round(day.windMph)} mph from ${day.windFromDeg}° ${bearingCompass(day.windFromDeg)}`
                  : '—'}
                {' · '}Elev {notebook.elevationFt.toLocaleString()} ft (+
                {notebook.altitudeBonusPct}% carry)
              </p>

              {notebook.days.length > 1 ? (
                <div className="notebook-line golf-print-hide flex flex-wrap items-center gap-1.5 py-1">
                  <span className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[#756658]">
                    Day
                  </span>
                  {notebook.days.map((d, i) => (
                    <button
                      key={d.date}
                      type="button"
                      onClick={() => setDayIdx(i)}
                      className={`rounded px-2 py-0.5 text-[11px] font-medium tabular ${
                        i === dayIdx
                          ? 'bg-[#1a5c3a] text-white'
                          : 'bg-black/[0.04] text-[#5c4f42] hover:bg-black/[0.08]'
                      }`}
                    >
                      {formatDay(d.date).split(',')[0]}
                    </button>
                  ))}
                </div>
              ) : null}

              <p className="notebook-line notebook-section">
                Hole notes — club · tee height · yardages
              </p>

              {notebook.holes.length === 0 ? (
                <p className="notebook-line text-[#5c4f42]">
                  No hole maps yet. Wind and elevation above still apply.
                </p>
              ) : (
                notebook.holes.map((h) => {
                  const dayRow = h.days[dayIdx] ?? h.days[0];
                  const club = dayRow?.recommendedClub ?? '—';
                  const tee = teeHeightForClub(club);
                  const plays = dayRow?.playsLikeYards ?? h.yards;
                  const delta = plays - h.yards;
                  const slopeNote =
                    Math.abs(h.slopeYards) >= 3
                      ? `${Math.abs(h.slopeYards)} yd ${h.slopeYards > 0 ? 'up' : 'down'}`
                      : 'flat';

                  return (
                    <div key={h.number} className="notebook-hole-block">
                      <p className="notebook-line notebook-hole-title">
                        <span className="font-semibold">
                          #{h.number}
                          {h.par != null ? ` · Par ${h.par}` : ''}
                        </span>
                        <span className="mx-2 text-[#a89880]">·</span>
                        <span className="tabular">
                          {h.yards} yd map
                          {plays !== h.yards
                            ? ` → plays ${plays} (${delta > 0 ? '+' : ''}${delta})`
                            : ''}
                        </span>
                        {dayRow ? (
                          <span className="ml-2 text-[11px] uppercase tracking-wide text-[#756658]">
                            {aspectLabel(dayRow.aspect)}
                          </span>
                        ) : null}
                      </p>
                      <p className="notebook-line">
                        <span className="notebook-key">Club</span>
                        {club}
                        {dayRow?.clubHint ? (
                          <span className="text-[#5c4f42]">
                            {' '}
                            — {dayRow.clubHint}
                          </span>
                        ) : null}
                      </p>
                      <p className="notebook-line">
                        <span className="notebook-key">Tee height</span>
                        <span className="font-semibold">{tee.label}</span>
                        <span className="text-[#5c4f42]"> — {tee.detail}</span>
                      </p>
                      <p className="notebook-line notebook-muted">
                        Slope {slopeNote}
                        {h.elevationChangeFt
                          ? ` (${h.elevationChangeFt > 0 ? '+' : ''}${h.elevationChangeFt} ft)`
                          : ''}
                        {' · '}
                        Sea-level {h.seaLevelYards} yd
                        {' · '}
                        {h.bearingDeg}° {bearingCompass(h.bearingDeg)}
                        {h.teeElevationFt != null && h.greenElevationFt != null
                          ? ` · tee/green ${h.teeElevationFt}/${h.greenElevationFt} ft`
                          : ''}
                      </p>
                    </div>
                  );
                })
              )}

              {/* Trailing blank ruled lines for handwritten notes */}
              {Array.from({ length: 6 }).map((_, i) => (
                <p key={`blank-${i}`} className="notebook-line notebook-blank">
                  {i === 0 ? (
                    <span className="text-[#a89880]">Your notes…</span>
                  ) : (
                    '\u00a0'
                  )}
                </p>
              ))}

              <p className="notebook-line notebook-footer">
                {notebook.attribution}. Hole maps from community course data.
                Prep transfer — not a rangefinder.
              </p>
            </div>
          </article>
        ) : null}
      </div>
    </div>
  );
}
