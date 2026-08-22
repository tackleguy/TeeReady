import { useState, type FormEvent } from 'react';
import { useAuth } from '../lib/auth';
import { getRememberMe } from '../lib/authStorage';
import { CourseSearchMultiSelect } from './golf/CourseSearchMultiSelect';
import type { GolfCourseSummary } from '../lib/golf';
import {
  DEFAULT_PROFILE,
  saveGolfProfile,
  type MissBias,
} from '../lib/golfProfile';
import { courseLabel } from './golf/CourseSearchSelect';
import { GoalPicker } from './coach/GoalPicker';
import type { GoalId } from '../lib/goals';

function FieldLabel({ children }: { children: React.ReactNode }) {
  return (
    <span className="mb-1.5 block font-mono text-[10px] font-semibold uppercase tracking-[0.12em] text-faint">
      {children}
    </span>
  );
}

function inputClassName() {
  return 'w-full rounded-xl border border-line bg-canvas px-3 py-2.5 text-[14px] text-ink outline-none transition-colors placeholder:text-faint focus:border-brand';
}

type Props = {
  /** Compact card vs large landing form */
  variant?: 'card' | 'landing';
  defaultMode?: 'signin' | 'signup';
  onSuccess?: () => void;
};

export function AuthForm({
  variant = 'card',
  defaultMode = 'signin',
  onSuccess,
}: Props) {
  const { configured, error, signIn, signUp, clearError } = useAuth();
  const [mode, setMode] = useState<'signin' | 'signup'>(defaultMode);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [rememberMe, setRememberMeState] = useState(() => getRememberMe());
  const [busy, setBusy] = useState(false);
  const [info, setInfo] = useState<string | null>(null);
  const [handicap, setHandicap] = useState(DEFAULT_PROFILE.handicap);
  const [miss, setMiss] = useState<MissBias>(DEFAULT_PROFILE.miss);
  const [signupCourses, setSignupCourses] = useState<GolfCourseSummary[]>([]);
  const [goals, setGoals] = useState<GoalId[]>([]);
  const [targetHandicap, setTargetHandicap] = useState(12);

  if (!configured) {
    return (
      <p className="text-[13px] text-muted">
        Accounts are not configured for this build. Add Supabase env vars to
        enable sign-in.
      </p>
    );
  }

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    clearError();
    setInfo(null);
    setBusy(true);
    try {
      if (mode === 'signin') {
        const res = await signIn(email, password, rememberMe);
        if (!res.error) {
          setInfo('Signed in');
          onSuccess?.();
        }
      } else {
        if (signupCourses.length === 0) {
          setInfo('Add at least one course you play.');
          setBusy(false);
          return;
        }
        if (goals.length === 0) {
          setInfo('Pick at least one goal for your coach.');
          setBusy(false);
          return;
        }
        const res = await signUp(email, password, displayName, rememberMe);
        if (!res.error) {
          saveGolfProfile({
            ...DEFAULT_PROFILE,
            handicap,
            miss,
            commonCourses: signupCourses.map(courseLabel),
            goals,
            targetHandicap: goals.includes('lower-handicap')
              ? targetHandicap
              : undefined,
          });
          if (res.needsEmailConfirm) {
            setInfo(
              'Check spam for a confirm link — or sign in if you already have an account. Built-in Supabase email only reaches team addresses.',
            );
          } else {
            setInfo('Account created — you are signed in.');
            onSuccess?.();
          }
        }
      }
    } finally {
      setBusy(false);
    }
  };

  const toggleClass = (on: boolean) =>
    on
      ? 'rounded-md bg-brand-soft px-2.5 py-1 text-[12px] font-semibold text-brand'
      : 'rounded-md px-2.5 py-1 text-[12px] font-medium text-muted';

  return (
    <div className={variant === 'landing' ? 'on-light' : undefined}>
      <div className="flex items-start justify-between gap-3">
        {variant === 'landing' ? (
          <div>
            <h2 className="text-[18px] font-bold text-ink">
              {mode === 'signin' ? 'Welcome back' : 'Create your account'}
            </h2>
            <p className="mt-1 text-[13px] text-muted">
              {mode === 'signin'
                ? 'Sign in to open Today, Rounds, and your synced bag.'
                : 'One account keeps handicap, bag, and rounds ready.'}
            </p>
          </div>
        ) : (
          <div>
            <h2 className="text-[15px] font-bold text-ink">Account</h2>
            <p className="mt-1 text-[13px] text-muted">
              Sign in to sync settings across devices.
            </p>
          </div>
        )}
        <div className="flex shrink-0 rounded-lg border border-line p-0.5">
          <button
            type="button"
            onClick={() => {
              setMode('signin');
              clearError();
              setInfo(null);
            }}
            className={toggleClass(mode === 'signin')}
          >
            Sign in
          </button>
          <button
            type="button"
            onClick={() => {
              setMode('signup');
              clearError();
              setInfo(null);
            }}
            className={toggleClass(mode === 'signup')}
          >
            Sign up
          </button>
        </div>
      </div>

      <form className="mt-4 flex flex-col gap-3" onSubmit={onSubmit}>
        {mode === 'signup' ? (
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
        ) : null}

        <label className="block">
          <FieldLabel>Email</FieldLabel>
          <input
            type="email"
            required
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
            required
            minLength={6}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete={
              mode === 'signin' ? 'current-password' : 'new-password'
            }
            className={inputClassName()}
          />
        </label>

        {mode === 'signup' ? (
          <div className="rounded-xl border border-line bg-canvas/80 p-3.5">
            <p className="text-[13px] font-semibold text-ink">
              Quick golf profile
            </p>
            <p className="mt-0.5 text-[12px] text-muted">
              Your AI coach builds a plan from this — handicap, courses, and
              goals.
            </p>

            <div className="mt-3 grid grid-cols-2 gap-3">
              <label className="block">
                <FieldLabel>Handicap</FieldLabel>
                <input
                  type="number"
                  step={0.1}
                  min={-10}
                  max={54}
                  value={handicap}
                  onChange={(e) => setHandicap(Number(e.target.value))}
                  className={inputClassName()}
                />
              </label>
              <div className="block">
                <FieldLabel>Miss tendency</FieldLabel>
                <div className="grid grid-cols-2 gap-1">
                  {(
                    [
                      ['left', 'Left'],
                      ['right', 'Right'],
                      ['both', 'Both'],
                      ['straight', 'Straight'],
                    ] as const
                  ).map(([id, label]) => (
                    <button
                      key={id}
                      type="button"
                      onClick={() => setMiss(id)}
                      className={
                        miss === id
                          ? 'rounded-lg bg-brand-soft py-2 text-[11px] font-semibold text-brand'
                          : 'rounded-lg border border-line bg-surface py-2 text-[11px] font-medium text-muted hover:text-ink'
                      }
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            <div className="mt-3">
              <FieldLabel>Your courses</FieldLabel>
              <CourseSearchMultiSelect
                value={signupCourses}
                onChange={setSignupCourses}
              />
            </div>

            <div className="mt-4">
              <FieldLabel>Your goals</FieldLabel>
              <GoalPicker value={goals} onChange={setGoals} max={3} />
            </div>

            {goals.includes('lower-handicap') ? (
              <label className="mt-3 block">
                <FieldLabel>Target handicap</FieldLabel>
                <input
                  type="number"
                  step={0.1}
                  min={-10}
                  max={54}
                  value={targetHandicap}
                  onChange={(e) => setTargetHandicap(Number(e.target.value))}
                  className={inputClassName()}
                />
              </label>
            ) : null}
          </div>
        ) : null}

        <label className="flex cursor-pointer items-center gap-2.5 py-0.5">
          <input
            type="checkbox"
            checked={rememberMe}
            onChange={(e) => setRememberMeState(e.target.checked)}
            className="h-4 w-4 rounded border-line accent-[var(--brand)]"
          />
          <span className="text-[13px] text-ink">
            Remember me
            <span className="mt-0.5 block text-[11px] text-faint">
              {rememberMe
                ? 'Stay signed in on this device'
                : 'Sign out when you close the browser'}
            </span>
          </span>
        </label>

        {error ? <p className="text-[12px] text-bad">{error}</p> : null}
        {info ? (
          <p
            className={`text-[12px] font-medium ${info.includes('Add at least') || info.includes('Pick at least') ? 'text-bad' : 'text-brand'}`}
          >
            {info}
          </p>
        ) : null}

        <button
          type="submit"
          disabled={
            busy ||
            !email.trim() ||
            password.length < 6 ||
            (mode === 'signup' && signupCourses.length === 0) ||
            (mode === 'signup' && goals.length === 0)
          }
          className="mt-1 rounded-xl bg-brand px-5 py-2.5 text-[13px] font-bold text-white disabled:cursor-not-allowed disabled:opacity-40"
        >
          {busy
            ? 'Working…'
            : mode === 'signin'
              ? 'Sign in'
              : 'Create account'}
        </button>
      </form>
    </div>
  );
}
