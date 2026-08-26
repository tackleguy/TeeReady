import { scoreColor } from '../../lib/playability';

export type GateRow = {
  id: string;
  time: string;
  label: string;
  score: number;
  summary: string;
  status?: 'open' | 'best' | 'closed';
};

type Props = {
  rows: GateRow[];
  highlightId?: string;
  compact?: boolean;
};

export function GateBoard({ rows, highlightId, compact = false }: Props) {
  return (
    <div className="hour-table">
      <div className="hour-table-head">
        <span>Time</span>
        <span>Window</span>
        <span className="text-right">Score</span>
        <span className="text-right">Play</span>
      </div>
      <ul className="divide-y divide-line">
        {rows.map((row) => {
          const isBest = row.status === 'best' || row.id === highlightId;
          const score = row.score;
          return (
            <li
              key={row.id}
              className={`grid grid-cols-[4.5rem_1fr_3.5rem_5rem] items-center gap-2 px-3 sm:grid-cols-[5rem_1fr_4rem_5.5rem] sm:px-4 ${
                compact ? 'py-2' : 'py-2.5 sm:py-3'
              } ${isBest ? 'bg-brand-soft/60' : ''}`}
              title={row.summary}
            >
              <span
                className={`text-detail tabular font-semibold ${
                  isBest ? 'text-brand' : 'text-muted'
                }`}
              >
                {row.time}
              </span>
              <span
                className={`min-w-0 truncate text-body ${
                  isBest ? 'font-semibold text-ink' : 'text-muted'
                }`}
              >
                {row.label}
              </span>
              <span
                className="text-right text-stat tabular"
                style={{ color: isBest ? scoreColor(score) : 'var(--faint)' }}
              >
                {score}
              </span>
              <span className="text-right text-micro font-semibold">
                {isBest ? (
                  <span className="inline-block rounded-md bg-brand px-1.5 py-0.5 text-white">
                    Go
                  </span>
                ) : row.status === 'closed' ? (
                  <span className="text-faint">Skip</span>
                ) : (
                  <span className="text-faint">OK</span>
                )}
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
