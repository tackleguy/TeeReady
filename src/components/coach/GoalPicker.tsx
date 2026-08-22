import { GOAL_OPTIONS, type GoalId } from '../../lib/goals';

type Props = {
  value: GoalId[];
  onChange: (goals: GoalId[]) => void;
  max?: number;
};

export function GoalPicker({ value, onChange, max = 3 }: Props) {
  const toggle = (id: GoalId) => {
    if (value.includes(id)) {
      onChange(value.filter((g) => g !== id));
      return;
    }
    if (value.length >= max) return;
    onChange([...value, id]);
  };

  return (
    <div className="flex flex-col gap-2">
      <div className="grid gap-2 sm:grid-cols-2">
        {GOAL_OPTIONS.map((g) => {
          const on = value.includes(g.id);
          const locked = !on && value.length >= max;
          return (
            <button
              key={g.id}
              type="button"
              onClick={() => toggle(g.id)}
              disabled={locked}
              className={[
                'rounded-xl border p-3 text-left transition-colors',
                on
                  ? 'border-brand bg-brand-soft ring-1 ring-[color-mix(in_srgb,var(--brand)_28%,transparent)]'
                  : locked
                    ? 'cursor-not-allowed border-line bg-canvas opacity-50'
                    : 'border-line bg-surface hover:border-[color-mix(in_srgb,var(--brand)_35%,var(--line))]',
              ].join(' ')}
            >
              <div className="flex items-start gap-2">
                <span className="text-base leading-none" aria-hidden>
                  {g.emoji}
                </span>
                <div className="min-w-0">
                  <div className="text-[13px] font-bold text-ink">{g.label}</div>
                  <p className="mt-0.5 text-[11px] leading-snug text-muted">
                    {g.blurb}
                  </p>
                </div>
              </div>
            </button>
          );
        })}
      </div>
      <p className="text-[11px] text-muted">
        Pick up to {max} — your coach prioritizes the first one.
        {value.length > 0 ? ` · ${value.length} selected` : ''}
      </p>
    </div>
  );
}
