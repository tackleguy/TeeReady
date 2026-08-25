import { Link } from 'react-router-dom';
import { Sparkles } from 'lucide-react';
import { useEffect, useState } from 'react';
import { DraggableBox } from '../ui/DraggableBox';
import {
  DEFAULT_PROFILE,
  loadGolfProfile,
} from '../../lib/golfProfile';
import { buildCoachPlan } from '../../lib/goalCoach';
import { getGoal } from '../../lib/goals';
import { loadDisplayProfile } from '../../lib/mock';

const DISMISS_KEY = 'teeready-goal-coach-dismissed';

export function GoalCoachBanner() {
  const [open, setOpen] = useState(() => {
    try {
      return localStorage.getItem(DISMISS_KEY) !== '1';
    } catch {
      return true;
    }
  });
  const [tick, setTick] = useState(0);

  useEffect(() => {
    const onChange = () => setTick((n) => n + 1);
    window.addEventListener('teeready-profile-changed', onChange);
    return () =>
      window.removeEventListener('teeready-profile-changed', onChange);
  }, []);

  const profile = loadGolfProfile() ?? DEFAULT_PROFILE;
  const display = loadDisplayProfile();
  const plan = buildCoachPlan(profile, display.name);
  void tick;

  if (!plan || !open) return null;

  const dismiss = () => {
    setOpen(false);
    try {
      localStorage.setItem(DISMISS_KEY, '1');
    } catch {
      // ignore
    }
  };

  return (
    <DraggableBox
      id="goal-coach-v2"
      title="Your coach"
      defaultAnchor={{ left: 12, top: 56 }}
      defaultSize={{ width: 280, height: 148 }}
      minSize={{ width: 220, height: 100 }}
      maxSize={{ width: 400, height: 320 }}
      resizable
      zIndex={26}
      onClose={dismiss}
    >
      <div className="flex h-full flex-col overflow-y-auto bg-surface px-3 py-2.5">
        <div className="flex items-start gap-2">
          <Sparkles
            className="mt-0.5 h-4 w-4 shrink-0 text-brand"
            strokeWidth={2}
          />
          <div className="min-w-0 flex-1">
            <p className="text-[13px] font-semibold leading-snug text-ink">
              {plan.headline}
            </p>
            <p className="mt-1 text-[12px] leading-relaxed text-muted">
              {plan.summary}
            </p>
          </div>
        </div>

        {plan.steps[0] ? (
          <p className="mt-2 border-t border-line pt-2 text-[12px] leading-snug text-ink">
            <span className="font-semibold">{plan.steps[0].title}</span>
            {' — '}
            {plan.steps[0].detail}
          </p>
        ) : null}

        <div className="mt-2 flex flex-wrap items-center gap-2">
          <div className="h-1.5 min-w-[80px] flex-1 overflow-hidden rounded-full bg-line">
            <div
              className="h-full rounded-full bg-brand transition-all"
              style={{ width: `${plan.progressPct}%` }}
            />
          </div>
          <span className="text-[11px] font-medium tabular text-muted">
            {plan.progressPct}%
          </span>
        </div>

        {(profile.goals.length > 0 || profile.customGoals.length > 0) && (
          <div className="mt-2 flex flex-wrap gap-1">
            {profile.goals.map((id) => (
              <span
                key={id}
                className="rounded-md border border-line bg-canvas px-1.5 py-0.5 text-[11px] font-medium text-muted"
              >
                {getGoal(id).label}
              </span>
            ))}
            {profile.customGoals.map((g) => (
              <span
                key={g}
                className="rounded-md border border-line bg-canvas px-1.5 py-0.5 text-[11px] font-medium text-muted"
              >
                {g}
              </span>
            ))}
          </div>
        )}

        <Link
          to="/today"
          className="mt-2 inline-block text-[11px] font-semibold text-brand"
        >
          Full plan on Today →
        </Link>
      </div>
    </DraggableBox>
  );
}
