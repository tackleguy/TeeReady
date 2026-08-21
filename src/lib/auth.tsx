import {
  createContext,
  createElement,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import type { Session, User } from '@supabase/supabase-js';
import { syncProfileOnSignIn } from './accountProfile';
import { supabase, supabaseConfigured } from './supabase';

export type AuthState = {
  configured: boolean;
  loading: boolean;
  session: Session | null;
  user: User | null;
  error: string | null;
  signIn: (email: string, password: string) => Promise<{ error: string | null }>;
  signUp: (
    email: string,
    password: string,
    displayName: string,
  ) => Promise<{ error: string | null; needsEmailConfirm: boolean }>;
  signOut: () => Promise<void>;
  clearError: () => void;
};

const AuthContext = createContext<AuthState | null>(null);

function friendlyAuthError(message: string): string {
  const m = message.toLowerCase();
  if (m.includes('invalid login')) return 'Wrong email or password.';
  if (m.includes('already registered')) return 'That email already has an account.';
  if (m.includes('password')) return message;
  if (m.includes('rate limit')) return 'Too many attempts — try again shortly.';
  return message || 'Something went wrong.';
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(supabaseConfigured);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!supabase) {
      setLoading(false);
      return;
    }
    let cancelled = false;
    supabase.auth.getSession().then(({ data }) => {
      if (cancelled) return;
      setSession(data.session);
      setLoading(false);
    });
    const { data: sub } = supabase.auth.onAuthStateChange(
      async (event, next) => {
        setSession(next);
        setLoading(false);
        if (
          (event === 'SIGNED_IN' || event === 'USER_UPDATED') &&
          next?.user?.id
        ) {
          try {
            await syncProfileOnSignIn(next.user.id);
            window.dispatchEvent(new Event('teeready-display-changed'));
            window.dispatchEvent(new Event('teeready-profile-changed'));
          } catch {
            // Local settings still work if sync fails.
          }
        }
      },
    );
    return () => {
      cancelled = true;
      sub.subscription.unsubscribe();
    };
  }, []);

  const signIn = useCallback(async (email: string, password: string) => {
    if (!supabase) {
      return { error: 'Accounts are not configured for this build.' };
    }
    setError(null);
    const { error: err } = await supabase.auth.signInWithPassword({
      email: email.trim(),
      password,
    });
    if (err) {
      const msg = friendlyAuthError(err.message);
      setError(msg);
      return { error: msg };
    }
    return { error: null };
  }, []);

  const signUp = useCallback(
    async (email: string, password: string, displayName: string) => {
      if (!supabase) {
        return {
          error: 'Accounts are not configured for this build.',
          needsEmailConfirm: false,
        };
      }
      setError(null);
      const name = displayName.trim() || email.split('@')[0] || 'Golfer';
      const { data, error: err } = await supabase.auth.signUp({
        email: email.trim(),
        password,
        options: {
          data: { display_name: name },
        },
      });
      if (err) {
        const msg = friendlyAuthError(err.message);
        setError(msg);
        return { error: msg, needsEmailConfirm: false };
      }
      const needsEmailConfirm = Boolean(data.user) && !data.session;
      return { error: null, needsEmailConfirm };
    },
    [],
  );

  const signOut = useCallback(async () => {
    if (!supabase) return;
    setError(null);
    await supabase.auth.signOut();
  }, []);

  const clearError = useCallback(() => setError(null), []);

  const value = useMemo<AuthState>(
    () => ({
      configured: supabaseConfigured,
      loading,
      session,
      user: session?.user ?? null,
      error,
      signIn,
      signUp,
      signOut,
      clearError,
    }),
    [
      loading,
      session,
      error,
      signIn,
      signUp,
      signOut,
      clearError,
    ],
  );

  return createElement(AuthContext.Provider, { value }, children);
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error('useAuth must be used within AuthProvider');
  }
  return ctx;
}
