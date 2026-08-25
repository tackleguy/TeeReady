import { useState } from 'react';
import { ArrowLeft, ArrowRight, Check, Sparkles } from 'lucide-react';
import { CourseSearchMultiSelect } from '../golf/CourseSearchMultiSelect';
import { courseLabel } from '../golf/CourseSearchSelect';
import { GoalPicker } from '../coach/GoalPicker';
import type { GolfCourseSummary } from '../../lib/golf';
import {
  DEFAULT_PROFILE,
  saveGolfProfile,
  type MissBias,
} from '../../lib/golfProfile';
import { getGoal, hasAnyGoals, type GoalId } from '../../lib/goals';
import { formatHandicap, MAX_HANDICAP, MIN_HANDICAP } from '../../lib/golfHandicap';

const STEPS = [
  { id: 'account', title: 'Account', subtitle: 'Sign-in details' },
  { id: 'game', title: 'Your game', subtitle: 'Handicap, carry & miss' },
  { id: 'courses', title: 'Courses', subtitle: 'Where you play' },
  { id: 'goals', title: 'Goals', subtitle: 'What you want' },
  { id: 'review', title: 'Review', subtitle: 'Confirm & go' },
] as const;

function FieldLabel({ children }: { children: React.ReactNode }) {
  return (
    <span className="mb-1.5 block font-mono text-[11px] font-semibold uppercase tracking-[0.12em] text-faint">
      {children}
    </span>
  );
}

function inputClassName() {
  return 'w-full rounded-xl border border-line bg-canvas px-3 py-2.5 text-base text-ink outline-none transition-colors placeholder:text-faint focus:border-brand';
}

export type SignupDraft = {
  displayName: string;
  email: string;
  password: string;
  rememberMe: boolean;
  handicap: number;
  miss: MissBias;
  sevenIronYards: number;
  driverYards: number;
  courses: GolfCourseSummary[];
  goals: GoalId[];
  customGoals: string[];
  targetHandicap: number;
};

type Props = {
  busy: boolean;
  error: string | null;
  info: string | null;
  onBackToSignIn: () => void;
  onSubmit: (draft: SignupDraft) => void;
};

export function SignupQuestionnaire({
  busy,
  error,
  info,
  onBackToSignIn,
  onSubmit,
}: Props) {
  const [step, setStep] = useState(0);
  const [localError, setLocalError] = useState<string | null>(null);

  const [displayName, setDisplayName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [rememberMe, setRememberMe] = useState(true);
  const [handicap, setHandicap] = useState(DEFAULT_PROFILE.handicap);
  const [miss, setMiss] = useState<MissBias>(DEFAULT_PROFILE.miss);
  const [sevenIronYards, setSevenIronYards] = useState(
    DEFAULT_PROFILE.sevenIronYards,
  );
  const [driverYards, setDriverYards] = useState(DEFAULT_PROFILE.driverYards);
  const [courses, setCourses] = useState<GolfCourseSummary[]>([]);
  const [goals, setGoals] = useState<GoalId[]>([]);
  const [customGoals, setCustomGoals] = useState<string[]>([]);
  const [targetHandicap, setTargetHandicap] = useState(12);

  const current = STEPS[step]!;
  const isLast = step === STEPS.length - 1;

  const validateStep = (): string | null => {
    switch (current.id) {
      case 'account':
        if (!displayName.trim()) return 'Enter your name.';
        if (!email.trim()) return 'Enter your email.';
        if (password.length < 6) return 'Password needs at least 6 characters.';
        return null;
      case 'game':
        if (!Number.isFinite(handicap)) return 'Enter a valid handicap.';
        if (!Number.isFinite(sevenIronYards) || !Number.isFinite(driverYards)) {
          return 'Enter your 7-iron and driver carry distances.';
        }
        if (driverYards <= sevenIronYards + 15) {
          return 'Driver carry should be at least ~20 yards longer than 7-iron.';
        }
        return null;
      case 'courses':
        if (courses.length === 0) return 'Add at least one course.';
        return null;
      case 'goals':
        if (!hasAnyGoals(goals, customGoals)) {
          return 'Pick a preset goal or type your own.';
        }
        return null;
      default:
        return null;
    }
  };

  const goNext = () => {
    const msg = validateStep();
    if (msg) {
      setLocalError(msg);
      return;
    }
    setLocalError(null);
    setStep((s) => Math.min(s + 1, STEPS.length - 1));
  };

  const goBack = () => {
    setLocalError(null);
    if (step === 0) {
      onBackToSignIn();
      return;
    }
    setStep((s) => Math.max(0, s - 1));
  };

  const finish = () => {
    const msg = validateStep();
    if (msg) {
      setLocalError(msg);
      return;
    }
    setLocalError(null);
    onSubmit({
      displayName,
      email,
      password,
      rememberMe,
      handicap,
      miss,
      sevenIronYards,
      driverYards,
      courses,
      goals,
      customGoals,
      targetHandicap,
    });
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-brand" strokeWidth={2} aria-hidden />
            <span className="text-[12px] font-semibold text-brand">
              Sign up · step {step + 1} of {STEPS.length}
            </span>
          </div>
          <h2 className="mt-1 text-[18px] font-bold text-ink">{current.title}</h2>
          <p className="mt-0.5 text-[13px] text-muted">{current.subtitle}</p>
        </div>
      </div>

      <div className="flex gap-1">
        {STEPS.map((s, i) => (
          <div
            key={s.id}
            className={[
              'h-1 flex-1 rounded-full transition-colors',
              i <= step ? 'bg-brand' : 'bg-line',
            ].join(' ')}
            title={s.title}
          />
        ))}
      </div>

      <div className="min-h-[280px]">
        {current.id === 'account' ? (
          <div className="flex flex-col gap-3">
            <label className="block">
              <FieldLabel>Display name</FieldLabel>
              <input
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                autoComplete="name"
                placeholder="Your name"
                className={inputClassName()}
              />
            </label>
            <label className="block">
              <FieldLabel>Email</FieldLabel>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                autoComplete="email"
                className={inputClassName()}
              />
            </label>
            <label className="block">
              <FieldLabel>Password</FieldLabel>
              <input
                type="password"
                minLength={6}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="new-password"
                className={inputClassName()}
              />
            </label>
          </div>
        ) : null}

        {current.id === 'game' ? (
          <div className="flex flex-col gap-4">
            <p className="text-[14px] leading-relaxed text-muted">
              This calibrates miss lines, club picks, and net scoring in Rounds.
            </p>
            <label className="block">
              <FieldLabel>Current handicap</FieldLabel>
              <input
                type="number"
                step={0.1}
                min={MIN_HANDICAP}
                max={MAX_HANDICAP}
                value={handicap}
                onChange={(e) => setHandicap(Number(e.target.value))}
                className={inputClassName()}
              />
              <span className="mt-1 block text-[11px] text-muted">
                Plus handicaps: enter negative (e.g. −2 for +2).
              </span>
            </label>
            <div>
              <FieldLabel>Typical miss</FieldLabel>
              <div className="grid grid-cols-2 gap-2">
                {(
                  [
                    ['left', 'Left'],
                    ['right', 'Right'],
                    ['both', 'Two-way'],
                    ['straight', 'Straight'],
                  ] as const
                ).map(([id, label]) => (
                  <button
                    key={id}
                    type="button"
                    onClick={() => setMiss(id)}
                    className={
                      miss === id
                        ? 'rounded-xl bg-brand-soft py-3 text-[13px] font-semibold text-brand ring-1 ring-[color-mix(in_srgb,var(--brand)_30%,transparent)]'
                        : 'rounded-xl border border-line bg-surface py-3 text-[13px] font-medium text-muted hover:text-ink'
                    }
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <label className="block">
                <FieldLabel>7-iron carry</FieldLabel>
                <div className="relative">
                  <input
                    type="number"
                    min={80}
                    max={220}
                    value={sevenIronYards}
                    onChange={(e) => setSevenIronYards(Number(e.target.value))}
                    className={`${inputClassName()} pr-10 tabular`}
                  />
                  <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-[11px] text-faint">
                    yd
                  </span>
                </div>
              </label>
              <label className="block">
                <FieldLabel>Driver carry</FieldLabel>
                <div className="relative">
                  <input
                    type="number"
                    min={140}
                    max={360}
                    value={driverYards}
                    onChange={(e) => setDriverYards(Number(e.target.value))}
                    className={`${inputClassName()} pr-10 tabular`}
                  />
                  <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-[11px] text-faint">
                    yd
                  </span>
                </div>
              </label>
            </div>
          </div>
        ) : null}

        {current.id === 'courses' ? (
          <div className="flex flex-col gap-3">
            <p className="text-[14px] leading-relaxed text-muted">
              Search and add every course you play — they become quick picks in
              Rounds and Social.
            </p>
            <CourseSearchMultiSelect value={courses} onChange={setCourses} />
          </div>
        ) : null}

        {current.id === 'goals' ? (
          <div className="flex flex-col gap-3">
            <p className="text-[14px] leading-relaxed text-muted">
              Your coach builds a weekly plan from these. Choose presets, type
              your own, or both.
            </p>
            <GoalPicker
              value={goals}
              onChange={setGoals}
              customGoals={customGoals}
              onCustomGoalsChange={setCustomGoals}
              max={3}
              maxCustom={3}
            />
            {goals.includes('lower-handicap') ? (
              <label className="block">
                <FieldLabel>Target handicap</FieldLabel>
                <input
                  type="number"
                  step={0.1}
                  min={MIN_HANDICAP}
                  max={MAX_HANDICAP}
                  value={targetHandicap}
                  onChange={(e) => setTargetHandicap(Number(e.target.value))}
                  className={inputClassName()}
                />
              </label>
            ) : null}
          </div>
        ) : null}

        {current.id === 'review' ? (
          <div className="flex flex-col gap-4">
            <p className="text-[14px] leading-relaxed text-muted">
              Everything looks good? Your coach will greet you on Today.
            </p>
            <dl className="divide-y divide-line rounded-xl border border-line bg-canvas/50 text-[13px]">
              <ReviewRow label="Name" value={displayName.trim() || '—'} />
              <ReviewRow label="Email" value={email.trim() || '—'} />
              <ReviewRow
                label="Handicap"
                value={formatHandicap(handicap)}
              />
              <ReviewRow label="Miss" value={miss} />
              <ReviewRow
                label="Carry"
                value={`7i ${sevenIronYards} yd · Driver ${driverYards} yd`}
              />
              <ReviewRow
                label="Courses"
                value={courses.map(courseLabel).join(', ') || '—'}
              />
              <ReviewRow
                label="Goals"
                value={
                  [
                    ...goals.map((id) => getGoal(id).label),
                    ...customGoals,
                  ].join(' · ') || '—'
                }
              />
            </dl>
            <label className="flex cursor-pointer items-center gap-2.5">
              <input
                type="checkbox"
                checked={rememberMe}
                onChange={(e) => setRememberMe(e.target.checked)}
                className="h-4 w-4 rounded border-line accent-[var(--brand)]"
              />
              <span className="text-[13px] text-ink">Remember me on this device</span>
            </label>
          </div>
        ) : null}
      </div>

      {localError ? (
        <p id="signup-step-error" role="alert" className="text-[12px] font-medium text-bad">
          {localError}
        </p>
      ) : null}
      {error ? (
        <p id="signup-form-error" role="alert" className="text-[12px] text-bad">
          {error}
        </p>
      ) : null}
      {info ? <p className="text-[12px] font-medium text-brand">{info}</p> : null}

      <div className="flex gap-2 border-t border-line pt-3">
        <button
          type="button"
          onClick={goBack}
          disabled={busy}
          className="inline-flex items-center gap-1 rounded-xl border border-line px-4 py-2.5 text-[13px] font-semibold text-muted hover:text-ink disabled:opacity-40"
        >
          <ArrowLeft className="h-4 w-4" aria-hidden />
          {step === 0 ? 'Sign in' : 'Back'}
        </button>
        {isLast ? (
          <button
            type="button"
            onClick={finish}
            disabled={busy}
            className="inline-flex flex-1 items-center justify-center gap-1 rounded-xl bg-brand px-4 py-2.5 text-[13px] font-bold text-white disabled:opacity-40"
          >
            {busy ? 'Creating…' : 'Create account'}
            <Check className="h-4 w-4" aria-hidden />
          </button>
        ) : (
          <button
            type="button"
            onClick={goNext}
            disabled={busy}
            className="inline-flex flex-1 items-center justify-center gap-1 rounded-xl bg-brand px-4 py-2.5 text-[13px] font-bold text-white disabled:opacity-40"
          >
            Continue
            <ArrowRight className="h-4 w-4" aria-hidden />
          </button>
        )}
      </div>
    </div>
  );
}

function ReviewRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex gap-3 px-4 py-2.5">
      <dt className="w-24 shrink-0 font-medium text-muted">{label}</dt>
      <dd className="min-w-0 flex-1 text-ink">{value}</dd>
    </div>
  );
}

export function persistSignupProfile(draft: SignupDraft): void {
  saveGolfProfile({
    ...DEFAULT_PROFILE,
    handicap: draft.handicap,
    miss: draft.miss,
    sevenIronYards: draft.sevenIronYards,
    driverYards: draft.driverYards,
    commonCourses: draft.courses.map(courseLabel),
    goals: draft.goals,
    customGoals: draft.customGoals,
    targetHandicap: draft.goals.includes('lower-handicap')
      ? draft.targetHandicap
      : undefined,
    questionnaireCompleted: false,
  });
}
