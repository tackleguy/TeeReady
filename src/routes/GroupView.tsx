import { GROUP } from '../lib/mock';

export function GroupView() {
  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-[28px] font-bold tracking-[-0.03em] text-ink">
          {GROUP.name}
        </h1>
        <p className="mt-1 text-[14px] text-muted">
          Live skins board — thru the hole each player has finished.
        </p>
      </div>

      <section className="overflow-hidden rounded-card bg-surface shadow-card">
        <div className="grid grid-cols-[48px_1fr_64px_72px_64px] gap-2 border-b border-line px-5 py-3 font-mono text-[10px] font-semibold uppercase tracking-[0.12em] text-faint">
          <span>#</span>
          <span>Player</span>
          <span className="text-right">Thru</span>
          <span className="text-right">HCP</span>
          <span className="text-right">Score</span>
        </div>
        <ul>
          {GROUP.players.map((player) => (
            <li
              key={player.pos}
              className="grid grid-cols-[48px_1fr_64px_72px_64px] items-center gap-2 border-b border-line px-5 py-3.5 last:border-b-0"
            >
              <span className="font-mono text-[12px] font-semibold text-faint">
                {player.pos}
              </span>
              <div className="flex min-w-0 items-center gap-3">
                <div className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-brand-soft font-mono text-[10px] font-semibold text-brand">
                  {player.initials}
                </div>
                <span className="truncate text-[14px] font-semibold text-ink">
                  {player.name}
                </span>
              </div>
              <span className="text-right text-[13px] tabular text-muted">
                {player.thru}
              </span>
              <span className="text-right text-[13px] tabular text-muted">
                {player.handicap}
              </span>
              <span className="text-right text-[14px] font-bold tabular text-ink">
                {player.score}
              </span>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
