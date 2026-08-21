import { useNavigate } from 'react-router-dom';
import { AuthForm } from './AuthForm';
import { useAuth } from '../lib/auth';

export function AccountPanel() {
  const navigate = useNavigate();
  const { configured, loading, user, signOut } = useAuth();

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
          onClick={() => {
            void signOut().then(() => navigate('/', { replace: true }));
          }}
          className="mt-4 rounded-xl border border-line px-4 py-2.5 text-[13px] font-semibold text-muted hover:text-ink"
        >
          Sign out
        </button>
      </section>
    );
  }

  return (
    <section className="rounded-card bg-surface p-5 shadow-card">
      <AuthForm variant="card" />
    </section>
  );
}
