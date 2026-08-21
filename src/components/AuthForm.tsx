import { useState, type FormEvent } from 'react';
import { useAuth } from '../lib/auth';
import { getRememberMe } from '../lib/authStorage';

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
        const res = await signUp(email, password, displayName, rememberMe);
        if (!res.error) {
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
    <div>
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
          <p className="text-[12px] font-medium text-brand">{info}</p>
        ) : null}

        <button
          type="submit"
          disabled={busy || !email.trim() || password.length < 6}
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
