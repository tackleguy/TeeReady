import { useState, type KeyboardEvent } from 'react';
import { Plus, X } from 'lucide-react';
import { GOAL_OPTIONS, type GoalId } from '../../lib/goals';

type Props = {
  value: GoalId[];
  onChange: (goals: GoalId[]) => void;
  customGoals?: string[];
  onCustomGoalsChange?: (goals: string[]) => void;
  max?: number;
  maxCustom?: number;
};

export function GoalPicker({
  value,
  onChange,
  customGoals = [],
  onCustomGoalsChange,
  max = 3,
  maxCustom = 3,
}: Props) {
  const [draft, setDraft] = useState('');
  const showCustom = Boolean(onCustomGoalsChange);
  const customAtMax = customGoals.length >= maxCustom;

  const toggle = (id: GoalId) => {
    if (value.includes(id)) {
      onChange(value.filter((g) => g !== id));
      return;
    }
    if (value.length >= max) return;
    onChange([...value, id]);
  };

  const addCustom = () => {
    if (!onCustomGoalsChange || customAtMax) return;
    const t = draft.trim();
    if (!t) return;
    if (
      customGoals.some((g) => g.toLowerCase() === t.toLowerCase()) ||
      value.some((id) => getGoalLabel(id).toLowerCase() === t.toLowerCase())
    ) {
      setDraft('');
      return;
    }
    onCustomGoalsChange([...customGoals, t.slice(0, 120)]);
    setDraft('');
  };

  const onDraftKey = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      addCustom();
    }
  };

  return (
    <div className="flex flex-col gap-3">
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

      {showCustom ? (
        <div className="rounded-xl border border-line bg-canvas/60 p-3">
          <p className="text-[12px] font-semibold text-ink">Or type your own</p>
          <p className="mt-0.5 text-[11px] text-muted">
            e.g. “Stop three-putting” or “Qualify for club championship”
          </p>
          {customGoals.length > 0 ? (
            <ul className="mt-2 flex flex-wrap gap-1.5">
              {customGoals.map((g) => (
                <li key={g}>
                  <span className="inline-flex max-w-full items-center gap-1 rounded-full border border-line bg-surface py-1 pl-2.5 pr-1 text-[12px] font-medium text-ink">
                    <span className="truncate">{g}</span>
                    <button
                      type="button"
                      aria-label={`Remove ${g}`}
                      onClick={() =>
                        onCustomGoalsChange!(
                          customGoals.filter((x) => x !== g),
                        )
                      }
                      className="rounded-full p-0.5 text-muted hover:bg-[var(--hover-fill)] hover:text-ink"
                    >
                      <X className="h-3.5 w-3.5" strokeWidth={2.2} />
                    </button>
                  </span>
                </li>
              ))}
            </ul>
          ) : null}
          <div className="mt-2 flex gap-2">
            <input
              type="text"
              value={draft}
              disabled={customAtMax}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={onDraftKey}
              placeholder={
                customAtMax
                  ? `${maxCustom} custom goals added`
                  : 'Type a goal and press Enter'
              }
              aria-label="Custom goal"
              className="min-w-0 flex-1 rounded-xl border border-line bg-surface px-3 py-2 text-base text-ink outline-none placeholder:text-faint focus:border-brand focus-visible:ring-2 focus-visible:ring-brand disabled:opacity-50"
            />
            <button
              type="button"
              onClick={addCustom}
              disabled={customAtMax || !draft.trim()}
              className="inline-flex shrink-0 items-center gap-1 rounded-xl border border-line bg-surface px-3 py-2 text-[13px] font-semibold text-muted hover:text-ink disabled:opacity-40"
            >
              <Plus className="h-4 w-4" />
              Add
            </button>
          </div>
        </div>
      ) : null}

      <p className="text-[11px] text-muted">
        Pick up to {max} presets
        {showCustom ? ` and ${maxCustom} custom goals` : ''} — your coach
        prioritizes the first one.
      </p>
    </div>
  );
}

function getGoalLabel(id: GoalId): string {
  return GOAL_OPTIONS.find((g) => g.id === id)?.label ?? id;
}
