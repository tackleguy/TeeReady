import { useState, type FormEvent } from 'react';
import { useAuth } from '../lib/auth';

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

export function AccountPanel() {
  const { configured, loading, user, error, signIn, signUp, signOut, clearError } =
    useAuth();
  const [mode, setMode] = useState<'signin' | 'signup'>('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [busy, setBusy] = useState(false);
  const [info, setInfo] = useState<string | null>(null);

  if (!configured) {
    return (
      <section className="rounded-card bg-surface p-5 shadow-card">
        <h2 className="text-[15px] font-bold text-ink">Account</h2>
        <p className="mt-1 text-[13px] text-muted">
          Set <code className="text-[12px]">VITE_SUPABASE_URL</code> and{' '}
          <code className="text-[12px]">VITE_SUPABASE_ANON_KEY</code> to enable
          sign-in.
        </p>
      </section>
    );
  }

  if (loading) {
    return (
      <section className="rounded-card bg-surface p-5 shadow-card">
        <h2 className="text-[15px] font-bold text-ink">Account</h2>
        <p className="mt-2 text-[13px] text-muted">Checking session…</p>
      </section>
    );
  }

  if (user) {
    return (
      <section className="rounded-card bg-surface p-5 shadow-card">
        <h2 className="text-[15px] font-bold text-ink">Account</h2>
        <p className="mt-1 text-[13px] text-muted">
          Signed in — handicap, bag, and display name sync to this account.
        </p>
        <div className="mt-4 rounded-xl border border-line bg-canvas px-3 py-3">
          <div className="font-mono text-[10px] font-semibold uppercase tracking-[0.12em] text-faint">
            Email
          </div>
          <div className="mt-1 text-[14px] font-medium text-ink">
            {user.email}
          </div>
        </div>
        <button
          type="button"
          onClick={() => void signOut()}
          className="mt-4 rounded-xl border border-line px-4 py-2.5 text-[13px] font-semibold text-muted hover:text-ink"
        >
          Sign out
        </button>
      </section>
    );
  }

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    clearError();
    setInfo(null);
    setBusy(true);
    try {
      if (mode === 'signin') {
        const res = await signIn(email, password);
        if (!res.error) setInfo('Signed in');
      } else {
        const res = await signUp(email, password, displayName);
        if (!res.error) {
          setInfo(
            res.needsEmailConfirm
              ? 'Check your email to confirm, then sign in.'
              : 'Account created — you are signed in.',
          );
        }
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="rounded-card bg-surface p-5 shadow-card">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-[15px] font-bold text-ink">Account</h2>
          <p className="mt-1 text-[13px] text-muted">
            Save your game settings across devices. Guest mode still works
            offline on this device.
          </p>
        </div>
        <div className="flex shrink-0 rounded-lg border border-line p-0.5">
          <button
            type="button"
            onClick={() => {
              setMode('signin');
              clearError();
              setInfo(null);
            }}
            className={
              mode === 'signin'
                ? 'rounded-md bg-brand-soft px-2.5 py-1 text-[12px] font-semibold text-brand'
                : 'rounded-md px-2.5 py-1 text-[12px] font-medium text-muted'
            }
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
            className={
              mode === 'signup'
                ? 'rounded-md bg-brand-soft px-2.5 py-1 text-[12px] font-semibold text-brand'
                : 'rounded-md px-2.5 py-1 text-[12px] font-medium text-muted'
            }
          >
            Create
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

        {error ? (
          <p className="text-[12px] text-bad">{error}</p>
        ) : null}
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
    </section>
  );
}
