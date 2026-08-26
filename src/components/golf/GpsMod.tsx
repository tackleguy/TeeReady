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
  /** Phone: mid + actions only until expanded. */
  compact?: boolean;
  expanded?: boolean;
  onToggleExpanded?: () => void;
  /** From useGpsWatch — searching / live / signal lost, etc. */
  statusLabel?: string | null;
  /** Holding last good through a poor fix — yardages are approximate. */
  approximate?: boolean;
  /** Position may be outdated after backgrounding. */
  stale?: boolean;
  /** Wake Lock unavailable — ask user to keep screen on. */
  wakeLockMessage?: string | null;
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
  compact = false,
  expanded = true,
  onToggleExpanded,
  statusLabel = null,
  approximate = false,
  stale = false,
  wakeLockMessage = null,
  className = '',
}: Props) {
  const qColor = gpsQualityColor(quality);
  const farAway =
    !offCourse &&
    distances != null &&
    Number.isFinite(distances.mid) &&
    distances.mid > farThresholdYd;
  const showFull = !compact || expanded;
  const midYd = farAway
    ? holeYards
    : distances?.mid != null
      ? distances.mid
      : null;

  if (compact && !expanded) {
    return (
      <div
        className={`pointer-events-auto hud-card flex items-center gap-1 rounded-full border border-[color-mix(in_srgb,var(--brand)_40%,var(--line))] px-1.5 py-1 ${className}`}
      >
        <button
          type="button"
          onClick={onToggleExpanded}
          className="flex min-h-[44px] min-w-0 flex-1 items-center gap-2 px-2 text-left"
          aria-expanded={false}
          aria-label="Expand GPS yardages"
          title="Expand GPS"
        >
          <span
            className="grid h-7 w-7 shrink-0 place-items-center rounded-full"
            style={{ background: `${qColor}22`, color: qColor }}
          >
            <Satellite className="h-3.5 w-3.5" strokeWidth={2} aria-hidden="true" />
          </span>
          <span className="text-[18px] font-bold tabular-nums text-ink">
            {midYd != null ? midYd : '—'}
            <span className="ml-0.5 text-[13px] font-semibold text-muted">
              yd
            </span>
          </span>
          {approximate || stale ? (
            <span className="truncate text-[11px] font-mono font-semibold uppercase tracking-[0.1em] text-[var(--warn)]">
              {stale ? 'stale' : 'approx'}
            </span>
          ) : null}
          {offCourse ? (
            <span className="truncate text-[11px] font-mono font-semibold uppercase tracking-[0.1em] text-faint">
              tee
            </span>
          ) : null}
        </button>
        <button
          type="button"
          onClick={onLocate}
          disabled={locating}
          className="grid h-11 w-11 shrink-0 place-items-center rounded-full text-muted hover:bg-canvas hover:text-ink disabled:opacity-40"
          aria-label="Refresh GPS fix"
          title="Fix"
        >
          <Crosshair className="h-4 w-4" aria-hidden="true" />
        </button>
        <button
          type="button"
          onClick={onToggleFollow}
          aria-pressed={follow}
          className={
            follow
              ? 'grid h-11 w-11 shrink-0 place-items-center rounded-full bg-[color-mix(in_srgb,#3b82f6_16%,transparent)] text-[#3b82f6]'
              : 'grid h-11 w-11 shrink-0 place-items-center rounded-full text-muted hover:bg-canvas hover:text-ink'
          }
          aria-label={follow ? 'Stop following location' : 'Follow my location'}
          title="Follow"
        >
          <LocateFixed className="h-4 w-4" aria-hidden="true" />
        </button>
        {onClose ? (
          <button
            type="button"
            onClick={onClose}
            className="grid h-11 w-11 shrink-0 place-items-center rounded-full text-muted hover:bg-canvas hover:text-ink"
            aria-label="Close GPS panel"
          >
            <X className="h-4 w-4" strokeWidth={2} aria-hidden="true" />
          </button>
        ) : null}
      </div>
    );
  }

  return (
    <div
      className={`pointer-events-auto hud-card rounded-card border border-[color-mix(in_srgb,var(--brand)_40%,var(--line))] p-2.5 ${className}`}
    >
      <div className="flex items-center justify-between gap-1.5">
        <div className="flex min-w-0 items-center gap-2">
          <div
            className="grid h-9 w-9 shrink-0 place-items-center rounded-full"
            style={{ background: `${qColor}22`, color: qColor }}
          >
            <Satellite className="h-4 w-4" strokeWidth={2} aria-hidden="true" />
          </div>
          <div className="min-w-0">
            <div className="text-[13px] font-bold text-ink">GPS</div>
            <div
              className="truncate font-mono text-[11px] font-semibold uppercase tracking-[0.1em] text-faint"
              role="status"
            >
              {enabled
                ? statusLabel
                  ? statusLabel
                  : locating
                    ? 'Acquiring…'
                    : `${gpsQualityLabel(quality)} · live`
                : 'Off'}
              {enabled && approximate ? ' · approx' : ''}
              {enabled && stale ? ' · stale' : ''}
            </div>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          {farAway ? (
            <span className="rounded-full bg-[color-mix(in_srgb,#3b82f6_16%,transparent)] px-2 py-1 font-mono text-[11px] font-bold uppercase tracking-[0.1em] text-[#3b82f6]">
              Hole yardage
            </span>
          ) : null}
          {compact && onToggleExpanded ? (
            <button
              type="button"
              onClick={onToggleExpanded}
              className="rounded-md px-3 text-[13px] font-semibold text-muted hover:text-ink"
              aria-expanded
            >
              Less
            </button>
          ) : null}
          {onClose ? (
            <button
              type="button"
              onClick={onClose}
              className="grid h-11 w-11 place-items-center rounded-md text-muted hover:text-ink"
              aria-label="Close GPS panel"
              title="Close"
            >
              <X className="h-4 w-4" strokeWidth={2} aria-hidden="true" />
            </button>
          ) : null}
        </div>
      </div>

      {enabled && showFull ? (
        <>
          {farAway ? (
            <div className="mt-2 rounded-lg bg-canvas px-3 py-2.5 text-center">
              <div className="font-mono text-[11px] font-semibold uppercase tracking-[0.08em] text-faint">
                {holeNumber != null ? `Hole ${holeNumber}` : 'Hole'}
              </div>
              <div className="mt-0.5 text-[22px] font-bold tabular text-ink">
                {holeYards != null ? holeYards : '—'}
                <span className="ml-0.5 text-[13px] font-semibold text-muted">
                  yd
                </span>
              </div>
              <p className="mt-1 text-[13px] text-faint">
                Over {farThresholdYd} yd from green · move closer for front /
                mid / back
              </p>
            </div>
          ) : (
            <div className="mt-2 grid grid-cols-3 gap-1.5">
              {offCourse ? (
                <p className="col-span-3 mb-0.5 text-center text-[13px] text-faint">
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
                  className="rounded-lg bg-canvas px-1.5 py-2 text-center"
                >
                  <div className="font-mono text-[11px] font-semibold uppercase tracking-[0.08em] text-faint">
                    {label}
                  </div>
                  <div className="mt-0.5 text-[18px] font-bold tabular text-ink">
                    {yd != null ? yd : '—'}
                    <span className="ml-0.5 text-[13px] font-semibold text-muted">
                      yd
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}

          <div className="mt-2 flex items-center justify-between gap-2 text-[13px] text-muted">
            <span style={{ color: qColor }}>
              {formatAccuracy(position?.accuracyM)}
            </span>
            <span className="tabular">
              {formatHeading(position?.headingDeg ?? bearingToPin)}
            </span>
          </div>

          {quality === 'poor' || quality === 'fair' ? (
            <p className="mt-1.5 text-[13px] leading-snug text-[var(--warn)]" role="status">
              Fix rough — use the F/M/B window, not a single number.
            </p>
          ) : null}

          {error ? (
            <p className="mt-1.5 text-[13px] text-bad" role="alert">
              {error}
            </p>
          ) : null}

          {wakeLockMessage ? (
            <p className="mt-1.5 text-[13px] leading-snug text-[var(--warn)]" role="status">
              {wakeLockMessage}
            </p>
          ) : null}

          <div className="mt-2 flex flex-wrap items-center gap-1.5">
            <button
              type="button"
              onClick={onLocate}
              disabled={locating}
              className="inline-flex items-center gap-1.5 rounded-md border border-line bg-canvas px-3 text-[13px] font-semibold text-muted hover:text-ink disabled:opacity-40"
              aria-label="Refresh GPS fix"
            >
              <Crosshair className="h-3.5 w-3.5" aria-hidden="true" />
              Fix
            </button>
            <button
              type="button"
              onClick={onToggleFollow}
              aria-pressed={follow}
              aria-label={follow ? 'Stop following location' : 'Follow my location'}
              className={
                follow
                  ? 'inline-flex items-center gap-1.5 rounded-md bg-[color-mix(in_srgb,#3b82f6_16%,transparent)] px-3 text-[13px] font-semibold text-[#3b82f6] ring-1 ring-[color-mix(in_srgb,#3b82f6_30%,transparent)]'
                  : 'inline-flex items-center gap-1.5 rounded-md border border-line bg-canvas px-3 text-[13px] font-semibold text-muted hover:text-ink'
              }
            >
              <LocateFixed className="h-3.5 w-3.5" aria-hidden="true" />
              Follow
            </button>
            {onDropShot ? (
              <button
                type="button"
                onClick={onDropShot}
                disabled={!canDropShot}
                className="inline-flex items-center gap-1.5 rounded-md bg-[color-mix(in_srgb,#ec4899_18%,transparent)] px-3 text-[13px] font-bold text-[#db2777] disabled:opacity-40"
                aria-label="Drop shot marker at current location"
              >
                <Navigation className="h-3.5 w-3.5" aria-hidden="true" />
                Drop
              </button>
            ) : null}
          </div>
        </>
      ) : enabled ? null : (
        <p className="mt-1.5 text-[13px] leading-snug text-muted">
          Live front / mid / back green yardages from your phone.
        </p>
      )}
    </div>
  );
}
