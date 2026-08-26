import type { ScorecardProvenance } from '../../lib/scorecardProvenance';
import {
  scorecardProvenanceLabel,
  scorecardProvenanceNote,
} from '../../lib/scorecardProvenance';

export type { ScorecardProvenance };
export { scorecardProvenanceLabel, scorecardProvenanceNote };

type Props = {
  provenance: ScorecardProvenance;
  /** Compact one-line for HUDs; full note otherwise. */
  compact?: boolean;
  className?: string;
};

/** Visible provenance for hole pars / yardages — not buried in settings. */
export function DataProvenanceNote({
  provenance,
  compact = false,
  className = '',
}: Props) {
  const label = scorecardProvenanceLabel(provenance);
  const note = scorecardProvenanceNote(provenance);
  const isEstimate = provenance !== 'official';

  return (
    <p
      role="status"
      className={`text-[12px] leading-snug ${
        isEstimate ? 'text-muted' : 'text-[var(--ink-3)]'
      } ${className}`}
    >
      {compact ? (
        <>
          <span className="font-semibold text-ink">{label}</span>
          {isEstimate ? (
            <span className="text-muted"> — not an official scorecard</span>
          ) : null}
        </>
      ) : (
        <>
          <span className="font-semibold text-ink">{label}. </span>
          {note}
        </>
      )}
    </p>
  );
}
