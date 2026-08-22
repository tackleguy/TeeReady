import { Link } from 'react-router-dom';
import { ArrowRight, Sparkles } from 'lucide-react';
import { useEffect, useState } from 'react';
import {
  DEFAULT_PROFILE,
  loadGolfProfile,
} from '../../lib/golfProfile';
import { buildCoachPlan } from '../../lib/goalCoach';
import { getGoal } from '../../lib/goals';
import { loadDisplayProfile } from '../../lib/mock';

export function GoalCoachPanel() {
  const [tick, setTick] = useState(0);

  useEffect(() => {
    const onChange = () => setTick((n) => n + 1);
    window.addEventListener('teeready-profile-changed', onChange);
    window.addEventListener('teeready-round-log-changed', onChange);
    return () => {
      window.removeEventListener('teeready-profile-changed', onChange);
      window.removeEventListener('teeready-round-log-changed', onChange);
    };
  }, []);

  const profile = loadGolfProfile() ?? DEFAULT_PROFILE;
  const display = loadDisplayProfile();
  const plan = buildCoachPlan(profile, display.name);
  void tick;

  if (!plan) {
    return (
      <section className="rounded-2xl border border-line bg-surface p-5 shadow-card">
        <div className="flex items-start gap-3">
          <div className="grid h-10 w-10 place-items-center rounded-xl bg-brand-soft text-brand">
            <Sparkles className="h-5 w-5" strokeWidth={2} />
          </div>
          <div>
            <h2 className="text-[17px] font-bold text-ink">Your coach</h2>
            <p className="mt-1 text-[14px] text-muted">
              Add goals in Settings and TeeReady will build a weekly plan around
              them.
            </p>
            <Link
              to="/settings"
              className="mt-3 inline-flex items-center gap-1 text-[13px] font-semibold text-brand"
            >
              Set goals
              <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
        </div>
      </section>
    );
  }

  const focus = getGoal(plan.focusGoal);

  return (
    <section className="overflow-hidden rounded-2xl border border-line bg-surface shadow-card">
      <div className="border-b border-line bg-gradient-to-br from-brand-soft/80 to-canvas px-5 py-4">
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-start gap-3">
            <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-brand text-white">
              <Sparkles className="h-5 w-5" strokeWidth={2} />
            </div>
            <div>
              <p className="text-[12px] font-medium text-brand">Your coach</p>
              <h2 className="mt-0.5 text-[20px] font-bold tracking-[-0.03em] text-ink">
                {plan.headline}
              </h2>
              <p className="mt-1 max-w-xl text-[14px] leading-relaxed text-muted">
                {plan.summary}
              </p>
            </div>
          </div>
          <span className="hidden shrink-0 text-2xl sm:block" aria-hidden>
            {focus.emoji}
          </span>
        </div>

        <div className="mt-4">
          <div className="mb-1.5 flex items-center justify-between text-[11px] font-medium text-muted">
            <span>{plan.progressLabel}</span>
            <span>{plan.progressPct}%</span>
          </div>
          <div className="h-2 overflow-hidden rounded-full bg-line">
            <div
              className="h-full rounded-full bg-brand transition-all duration-500"
              style={{ width: `${plan.progressPct}%` }}
            />
          </div>
        </div>

        {profile.goals.length > 1 ? (
          <div className="mt-3 flex flex-wrap gap-1.5">
            {profile.goals.map((id) => (
              <span
                key={id}
                className="rounded-full border border-line bg-surface/80 px-2 py-0.5 text-[11px] font-medium text-muted"
              >
                {getGoal(id).label}
              </span>
            ))}
          </div>
        ) : null}
      </div>

      <ol className="divide-y divide-line">
        {plan.steps.map((step, i) => (
          <li key={step.id} className="flex gap-4 px-5 py-4">
            <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-canvas text-[12px] font-bold text-brand">
              {i + 1}
            </span>
            <div className="min-w-0 flex-1">
              <h3 className="text-[14px] font-semibold text-ink">{step.title}</h3>
              <p className="mt-1 text-[13px] leading-relaxed text-muted">
                {step.detail}
              </p>
              {step.href && step.cta ? (
                <Link
                  to={step.href}
                  className="mt-2 inline-flex items-center gap-1 text-[13px] font-semibold text-brand"
                >
                  {step.cta}
                  <ArrowRight className="h-3.5 w-3.5" />
                </Link>
              ) : null}
            </div>
          </li>
        ))}
      </ol>
    </section>
  );
}
