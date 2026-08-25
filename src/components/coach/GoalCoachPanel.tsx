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

type Props = {
  /** One focus step + progress — for quieter Today layout. */
  compact?: boolean;
};

export function GoalCoachPanel({ compact = false }: Props) {
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
      <section className="surface-card p-4 sm:p-5">
        <div className="flex items-start gap-3">
          <div className="grid h-9 w-9 place-items-center rounded-full bg-brand-soft text-brand">
            <Sparkles className="h-4 w-4" strokeWidth={2} />
          </div>
          <div>
            <h2 className="text-[15px] font-semibold text-ink">Your coach</h2>
            <p className="mt-1 text-[13px] text-muted">
              Add goals in your profile and TeeReady will build a plan around
              them.
            </p>
            <Link
              to="/profile"
              className="mt-2 inline-flex items-center gap-1 text-[13px] font-semibold text-brand"
            >
              Set goals
              <ArrowRight className="h-3.5 w-3.5" />
            </Link>
          </div>
        </div>
      </section>
    );
  }

  const focusStep = plan.steps[0];
  const focus = plan.focusGoal ? getGoal(plan.focusGoal) : null;

  if (compact) {
    return (
      <section className="surface-card p-4 sm:p-5">
        <div className="flex items-start gap-3">
          <div className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-brand text-white">
            <Sparkles className="h-4 w-4" strokeWidth={2} />
          </div>
          <div className="min-w-0 flex-1">
            <h2 className="text-title text-ink">{plan.headline}</h2>
            <p className="mt-1 text-[13px] leading-relaxed text-muted">
              {plan.summary}
            </p>

            <div className="mt-3">
              <div className="mb-1 flex items-center justify-between text-[11px] font-medium text-muted">
                <span>{plan.progressLabel}</span>
                <span>{plan.progressPct}%</span>
              </div>
              <div className="h-1.5 overflow-hidden rounded-full bg-line">
                <div
                  className="h-full rounded-full bg-brand transition-all duration-500"
                  style={{ width: `${plan.progressPct}%` }}
                />
              </div>
            </div>

            {focusStep ? (
              <div className="mt-3 border-t border-line pt-3">
                <p className="text-[13px] font-semibold text-ink">
                  {focusStep.title}
                </p>
                <p className="mt-0.5 text-[12px] leading-relaxed text-muted">
                  {focusStep.detail}
                </p>
                {focusStep.href && focusStep.cta ? (
                  <Link
                    to={focusStep.href}
                    className="mt-2 inline-flex items-center gap-1 text-[13px] font-semibold text-brand"
                  >
                    {focusStep.cta}
                    <ArrowRight className="h-3.5 w-3.5" />
                  </Link>
                ) : null}
              </div>
            ) : null}

            {focus ? (
              <p className="mt-2 text-[11px] text-muted">
                Focus · {focus.label}
              </p>
            ) : null}
          </div>
        </div>
      </section>
    );
  }

  return (
    <section className="ledger-card overflow-hidden">
      <div className="border-b border-line bg-[color-mix(in_srgb,var(--brand)_6%,var(--surface))] px-5 py-4">
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-start gap-3">
            <div className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-brand text-white">
              <Sparkles className="h-5 w-5" strokeWidth={2} />
            </div>
            <div>
              <p className="section-eyebrow !text-brand">Your coach</p>
              <h2 className="mt-1 font-display text-[22px] font-semibold tracking-[-0.02em] text-ink">
                {plan.headline}
              </h2>
              <p className="mt-1 max-w-xl text-[14px] leading-relaxed text-muted">
                {plan.summary}
              </p>
            </div>
          </div>
          {focus ? (
            <span className="hidden shrink-0 text-2xl sm:block" aria-hidden>
              {focus.emoji}
            </span>
          ) : plan.focusCustom ? (
            <span className="hidden shrink-0 rounded-full bg-brand-soft px-2.5 py-1 text-[11px] font-semibold text-brand sm:block">
              Custom
            </span>
          ) : null}
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
