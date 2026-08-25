import { scoreColor } from '../../lib/mock';

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
    <div className="tower-board overflow-hidden">
      <div className="tower-board-head grid grid-cols-[4.5rem_1fr_3.5rem_5rem] gap-2 border-b border-[var(--tower-line)] px-3 py-2 font-mono text-[11px] font-semibold uppercase tracking-[0.14em] text-[var(--tower-dim)] sm:grid-cols-[5rem_1fr_4rem_5.5rem] sm:px-4">
        <span>Time</span>
        <span>Window</span>
        <span className="text-right">Score</span>
        <span className="text-right">Status</span>
      </div>
      <ul className="divide-y divide-[var(--tower-line)]">
        {rows.map((row) => {
          const isBest = row.status === 'best' || row.id === highlightId;
          const score = row.score;
          return (
            <li
              key={row.id}
              className={`grid grid-cols-[4.5rem_1fr_3.5rem_5rem] items-center gap-2 px-3 py-2.5 transition-colors sm:grid-cols-[5rem_1fr_4rem_5.5rem] sm:px-4 sm:py-3 ${
                isBest
                  ? 'bg-[var(--tower-highlight)] text-[var(--tower-ink)]'
                  : 'text-[var(--tower-muted)] hover:bg-[var(--tower-hover)]'
              } ${compact ? 'py-2 sm:py-2' : ''}`}
              title={row.summary}
            >
              <span
                className={`font-mono text-[13px] tabular sm:text-[14px] ${
                  isBest ? 'text-[var(--phosphor)]' : ''
                }`}
              >
                {row.time}
              </span>
              <span
                className={`min-w-0 truncate text-[13px] sm:text-[14px] ${
                  isBest ? 'font-semibold text-[var(--tower-ink)]' : ''
                }`}
              >
                {row.label}
              </span>
              <span
                className="text-right font-mono text-[14px] font-bold tabular sm:text-[15px]"
                style={{ color: isBest ? scoreColor(score) : 'var(--tower-dim)' }}
              >
                {score}
              </span>
              <span className="text-right">
                {isBest ? (
                  <span className="inline-block rounded-sm bg-[var(--amber)] px-1.5 py-0.5 font-mono text-[11px] font-bold uppercase tracking-wider text-[#1a1200] sm:text-[11px]">
                    Open
                  </span>
                ) : row.status === 'closed' ? (
                  <span className="font-mono text-[11px] uppercase text-[var(--tower-dim)]">
                    —
                  </span>
                ) : (
                  <span className="font-mono text-[11px] uppercase text-[var(--tower-dim)]">
                    Wait
                  </span>
                )}
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
