import { Crosshair, LocateFixed, Navigation, Satellite, X } from 'lucide-react';
import {
  formatAccuracy,
  formatHeading,
  gpsQualityColor,
  gpsQualityLabel,
  type GpsQuality,
} from '../../lib/gps';
import type { GpsPosition } from '../../hooks/useGpsWatch';
import type { GreenDistances } from '../../lib/golfMeasure';

interface Props {
  enabled: boolean;
  follow: boolean;
  position: GpsPosition | null;
  quality: GpsQuality;
  error: string | null;
  locating?: boolean;
  /** Front / mid / back yards from GPS to the green. */
  distances: GreenDistances | null;
  /** When mid is beyond this, show hole yardage only (default 700). */
  farThresholdYd?: number;
  /** GPS fix is far from the course — distances are tee-based fallbacks. */
  offCourse?: boolean;
  /** Scorecard / playing yardage for the active hole. */
  holeYards?: number | null;
  holeNumber?: number | null;
  bearingToPin: number | null;
  onToggleFollow: () => void;
  onLocate: () => void;
  onDropShot?: () => void;
  canDropShot?: boolean;
  onClose?: () => void;
  className?: string;
}

export function GpsMod({
  enabled,
  follow,
  position,
  quality,
  error,
  locating = false,
  distances,
  farThresholdYd = 700,
  offCourse = false,
  holeYards = null,
  holeNumber = null,
  bearingToPin,
  onToggleFollow,
  onLocate,
  onDropShot,
  canDropShot = false,
  onClose,
  className = '',
}: Props) {
  const qColor = gpsQualityColor(quality);
  const farAway =
    !offCourse &&
    distances != null &&
    Number.isFinite(distances.mid) &&
    distances.mid > farThresholdYd;

  return (
    <div
      className={`pointer-events-auto hud-card rounded-card border border-[color-mix(in_srgb,var(--brand)_40%,var(--line))] p-2 ${className}`}
    >
      <div className="flex items-center justify-between gap-1.5">
        <div className="flex min-w-0 items-center gap-1.5">
          <div
            className="grid h-7 w-7 shrink-0 place-items-center rounded-full"
            style={{ background: `${qColor}22`, color: qColor }}
          >
            <Satellite className="h-3.5 w-3.5" strokeWidth={2} />
          </div>
          <div className="min-w-0">
            <div className="text-[11px] font-bold text-ink">GPS</div>
            <div className="truncate font-mono text-[9px] font-semibold uppercase tracking-[0.1em] text-faint">
              {enabled
                ? locating
                  ? 'Acquiring…'
                  : `${gpsQualityLabel(quality)} · live`
                : 'Off'}
            </div>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          {farAway ? (
            <span className="rounded-full bg-[color-mix(in_srgb,#3b82f6_16%,transparent)] px-1.5 py-0.5 font-mono text-[8px] font-bold uppercase tracking-[0.1em] text-[#3b82f6]">
              Hole yardage
            </span>
          ) : null}
          {onClose ? (
            <button
              type="button"
              onClick={onClose}
              className="rounded-md p-0.5 text-muted hover:text-ink"
              aria-label="Close GPS panel"
              title="Close"
            >
              <X className="h-3.5 w-3.5" strokeWidth={2} />
            </button>
          ) : null}
        </div>
      </div>

      {enabled ? (
        <>
          {farAway ? (
            <div className="mt-2 rounded-lg bg-canvas px-3 py-2.5 text-center">
              <div className="font-mono text-[8px] font-semibold uppercase tracking-[0.08em] text-faint">
                {holeNumber != null ? `Hole ${holeNumber}` : 'Hole'}
              </div>
              <div className="mt-0.5 text-[22px] font-bold tabular text-ink">
                {holeYards != null ? holeYards : '—'}
                <span className="ml-0.5 text-[11px] font-semibold text-muted">
                  yd
                </span>
              </div>
              <p className="mt-1 text-[9px] text-faint">
                Over {farThresholdYd} yd from green · move closer for front /
                mid / back
              </p>
            </div>
          ) : (
            <div className="mt-2 grid grid-cols-3 gap-1">
              {offCourse ? (
                <p className="col-span-3 mb-0.5 text-center text-[9px] text-faint">
                  Away from course · tee yardages
                </p>
              ) : null}
              {(
                [
                  ['Front', distances?.front],
                  ['Mid', distances?.mid],
                  ['Back', distances?.back],
                ] as const
              ).map(([label, yd]) => (
                <div
                  key={label}
                  className="rounded-lg bg-canvas px-1.5 py-1.5 text-center"
                >
                  <div className="font-mono text-[8px] font-semibold uppercase tracking-[0.08em] text-faint">
                    {label}
                  </div>
                  <div className="mt-0.5 text-[15px] font-bold tabular text-ink">
                    {yd != null ? yd : '—'}
                    <span className="ml-0.5 text-[9px] font-semibold text-muted">
                      yd
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}

          <div className="mt-1.5 flex items-center justify-between gap-2 text-[10px] text-muted">
            <span style={{ color: qColor }}>
              {formatAccuracy(position?.accuracyM)}
            </span>
            <span className="tabular">
              {formatHeading(position?.headingDeg ?? bearingToPin)}
            </span>
          </div>

          {error ? (
            <p className="mt-1.5 text-[10px] text-bad">{error}</p>
          ) : null}

          <div className="mt-2 flex flex-wrap items-center gap-1">
            <button
              type="button"
              onClick={onLocate}
              disabled={locating}
              className="inline-flex items-center gap-1 rounded-md border border-line bg-canvas px-1.5 py-1 text-[10px] font-semibold text-muted hover:text-ink disabled:opacity-40"
            >
              <Crosshair className="h-3 w-3" />
              Fix
            </button>
            <button
              type="button"
              onClick={onToggleFollow}
              aria-pressed={follow}
              className={
                follow
                  ? 'inline-flex items-center gap-1 rounded-md bg-[color-mix(in_srgb,#3b82f6_16%,transparent)] px-1.5 py-1 text-[10px] font-semibold text-[#3b82f6] ring-1 ring-[color-mix(in_srgb,#3b82f6_30%,transparent)]'
                  : 'inline-flex items-center gap-1 rounded-md border border-line bg-canvas px-1.5 py-1 text-[10px] font-semibold text-muted hover:text-ink'
              }
            >
              <LocateFixed className="h-3 w-3" />
              Follow
            </button>
            {onDropShot ? (
              <button
                type="button"
                onClick={onDropShot}
                disabled={!canDropShot}
                className="inline-flex items-center gap-1 rounded-md bg-[color-mix(in_srgb,#ec4899_18%,transparent)] px-1.5 py-1 text-[10px] font-bold text-[#db2777] disabled:opacity-40"
              >
                <Navigation className="h-3 w-3" />
                Drop
              </button>
            ) : null}
          </div>
        </>
      ) : (
        <p className="mt-1.5 text-[11px] leading-snug text-muted">
          Live front / mid / back green yardages from your phone.
        </p>
      )}
    </div>
  );
}
