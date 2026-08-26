/** Shot list with carry, direction, and lateral offset. */

import { Target } from 'lucide-react';
import { formatDirection } from '../../lib/launch';
import type { RangeLanding } from '../../lib/range';

type Props = {
  landings: RangeLanding[];
  highlightId?: string | null;
  onSelect?: (launchId: string) => void;
  emptyMessage?: string;
};

function formatLateral(yd: number): string {
  if (Math.abs(yd) < 1) return 'On line';
  return yd > 0 ? `${Math.round(yd)} yd R` : `${Math.round(Math.abs(yd))} yd L`;
}

export function ShotHistoryList({
  landings,
  highlightId,
  onSelect,
  emptyMessage = 'No shots with yardage yet.',
}: Props) {
  if (landings.length === 0) {
    return <p className="px-4 py-3 text-[13px] text-muted">{emptyMessage}</p>;
  }

  return (
    <ul className="divide-y divide-line">
      {landings.map((l) => {
        const highlighted = l.launchId === highlightId;
        const inner = (
          <>
            <div className="flex items-center gap-2">
              <Target
                className={`h-3.5 w-3.5 ${highlighted ? 'text-brand' : 'text-faint'}`}
                aria-hidden="true"
              />
              <div>
                <p className="text-[13px] font-semibold tabular text-ink">
                  {l.carryYd} yd
                  {l.totalYd != null ? (
                    <span className="font-normal text-muted"> · {l.totalYd} total</span>
                  ) : null}
                </p>
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
              {new Date(l.createdAt).toLocaleString([], {
                month: 'short',
                day: 'numeric',
                hour: 'numeric',
                minute: '2-digit',
              })}
            </p>
          </>
        );

        if (onSelect) {
          return (
            <li key={l.launchId}>
              <button
                type="button"
                onClick={() => onSelect(l.launchId)}
                className={`flex w-full items-center justify-between gap-3 px-4 py-3 text-left hover:bg-canvas/60 ${
                  highlighted ? 'bg-brand-soft/40' : ''
                }`}
              >
                {inner}
              </button>
            </li>
          );
        }

        return (
          <li
            key={l.launchId}
            className={`flex items-center justify-between gap-3 px-4 py-3 ${
              highlighted ? 'bg-brand-soft/40' : ''
            }`}
          >
            {inner}
          </li>
        );
      })}
    </ul>
  );
}
