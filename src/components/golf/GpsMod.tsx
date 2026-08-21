import { Crosshair, LocateFixed, Navigation, Satellite } from 'lucide-react';
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
  bearingToPin: number | null;
  onToggleFollow: () => void;
  onLocate: () => void;
  onDropShot?: () => void;
  canDropShot?: boolean;
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
  bearingToPin,
  onToggleFollow,
  onLocate,
  onDropShot,
  canDropShot = false,
  className = '',
}: Props) {
  const qColor = gpsQualityColor(quality);

  return (
    <div
      className={`pointer-events-auto rounded-card border border-[color-mix(in_srgb,#3b82f6_35%,var(--line))] bg-[color-mix(in_srgb,var(--surface)_95%,transparent)] p-3 shadow-lift backdrop-blur ${className}`}
    >
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <div
            className="grid h-8 w-8 place-items-center rounded-full"
            style={{ background: `${qColor}22`, color: qColor }}
          >
            <Satellite className="h-4 w-4" strokeWidth={2} />
          </div>
          <div>
            <div className="text-[12px] font-bold text-ink">GPS</div>
            <div className="font-mono text-[10px] font-semibold uppercase tracking-[0.12em] text-faint">
              {enabled
                ? locating
                  ? 'Acquiring…'
                  : `${gpsQualityLabel(quality)} · live ranging`
                : 'Off'}
            </div>
          </div>
        </div>
        <span className="rounded-full bg-[color-mix(in_srgb,#3b82f6_16%,transparent)] px-2 py-0.5 font-mono text-[9px] font-bold uppercase tracking-[0.12em] text-[#3b82f6]">
          No misses
        </span>
      </div>

      {enabled ? (
        <>
          <div className="mt-3 grid grid-cols-3 gap-2">
            {(
              [
                ['Front', distances?.front],
                ['Mid', distances?.mid],
                ['Back', distances?.back],
              ] as const
            ).map(([label, yd]) => (
              <div
                key={label}
                className="rounded-xl bg-canvas px-2 py-2 text-center"
              >
                <div className="font-mono text-[9px] font-semibold uppercase tracking-[0.1em] text-faint">
                  {label}
                </div>
                <div className="mt-0.5 text-[18px] font-bold tabular text-ink">
                  {yd != null ? yd : '—'}
                  <span className="ml-0.5 text-[10px] font-semibold text-muted">
                    yd
                  </span>
                </div>
              </div>
            ))}
          </div>

          <div className="mt-2 flex items-center justify-between gap-2 text-[11px] text-muted">
            <span style={{ color: qColor }}>
              {formatAccuracy(position?.accuracyM)}
            </span>
            <span className="tabular">
              {formatHeading(position?.headingDeg ?? bearingToPin)}
            </span>
          </div>

          {error ? (
            <p className="mt-2 text-[11px] text-bad">{error}</p>
          ) : null}

          <div className="mt-3 flex flex-wrap items-center gap-1.5">
            <button
              type="button"
              onClick={onLocate}
              disabled={locating}
              className="inline-flex items-center gap-1 rounded-lg border border-line bg-canvas px-2 py-1.5 text-[11px] font-semibold text-muted hover:text-ink disabled:opacity-40"
            >
              <Crosshair className="h-3.5 w-3.5" />
              Fix
            </button>
            <button
              type="button"
              onClick={onToggleFollow}
              aria-pressed={follow}
              className={
                follow
                  ? 'inline-flex items-center gap-1 rounded-lg bg-[color-mix(in_srgb,#3b82f6_16%,transparent)] px-2 py-1.5 text-[11px] font-semibold text-[#3b82f6] ring-1 ring-[color-mix(in_srgb,#3b82f6_30%,transparent)]'
                  : 'inline-flex items-center gap-1 rounded-lg border border-line bg-canvas px-2 py-1.5 text-[11px] font-semibold text-muted hover:text-ink'
              }
            >
              <LocateFixed className="h-3.5 w-3.5" />
              Follow
            </button>
            {onDropShot ? (
              <button
                type="button"
                onClick={onDropShot}
                disabled={!canDropShot}
                className="inline-flex items-center gap-1 rounded-lg bg-[color-mix(in_srgb,#ec4899_18%,transparent)] px-2 py-1.5 text-[11px] font-bold text-[#db2777] disabled:opacity-40"
              >
                <Navigation className="h-3.5 w-3.5" />
                Drop shot
              </button>
            ) : null}
          </div>
        </>
      ) : (
        <p className="mt-2 text-[12px] leading-snug text-muted">
          Live front / mid / back green yardages from your phone — no miss
          lines.
        </p>
      )}
    </div>
  );
}
