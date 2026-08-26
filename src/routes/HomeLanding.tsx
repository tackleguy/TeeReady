import { useState } from 'react';
import { AuthForm } from '../components/AuthForm';
import { Hero2 } from '../components/ui/hero-2-1';

export function HomeLanding() {
  const [authMode, setAuthMode] = useState<'signin' | 'signup'>('signin');

  const scrollToAuth = (mode: 'signin' | 'signup') => {
    setAuthMode(mode);
    window.requestAnimationFrame(() => {
      document.getElementById('auth')?.scrollIntoView({
        behavior: 'smooth',
        block: 'start',
      });
    });
  };

  return (
    <div className="bg-canvas">
      <Hero2
        onSignIn={() => scrollToAuth('signin')}
        onSignUp={() => scrollToAuth('signup')}
      />

      <section id="features" className="border-t border-line px-5 py-20 md:px-8">
        <div className="mx-auto max-w-6xl">
          <p className="section-eyebrow">How it works</p>
          <h2 className="mt-2 font-display text-[32px] font-semibold tracking-[-0.03em] text-ink md:text-[40px]">
            From forecast to final putt
          </h2>
          <div className="mt-10 grid gap-5 md:grid-cols-3">
            {[
              {
                k: '01',
                t: 'Today',
                v: 'Golf-specific playability — wind, rain, and a best window before you drive.',
              },
              {
                k: '02',
                t: 'Prep',
                v: 'Miss lines, wind, and front / mid / back yardages for every hole.',
              },
              {
                k: '03',
                t: 'GPS + card',
                v: 'Live ranging that keeps running while you switch tabs, with net scoring.',
              },
            ].map((item) => (
              <article key={item.k} className="ledger-card p-6">
                <div className="stat-num text-[12px] text-accent">{item.k}</div>
                <h3 className="mt-3 font-display text-[22px] font-semibold text-ink">
                  {item.t}
                </h3>
                <p className="mt-2 text-[15px] leading-relaxed text-muted">
                  {item.v}
                </p>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section
        id="auth"
        className="scroll-mt-8 border-t border-line bg-[color-mix(in_srgb,var(--brand)_4%,var(--canvas))] px-5 py-20 md:px-8"
      >
        <div className="mx-auto max-w-xl">
          <p className="text-center section-eyebrow">Account</p>
          <h2 className="mt-2 text-center font-display text-[32px] font-semibold tracking-[-0.03em] text-ink sm:text-[38px]">
            {authMode === 'signup' ? 'Set up your game' : 'Sign in to tee off'}
          </h2>
          <p className="mx-auto mt-3 max-w-lg text-center text-[15px] leading-relaxed text-muted">
            {authMode === 'signup'
              ? 'Account, game, courses, and goals — your coach takes it from there.'
              : 'Your handicap, bag, and rounds stay with your account.'}
          </p>
          <div className="on-light ledger-card mt-8 p-5 sm:p-6">
            <AuthForm
              key={authMode}
              variant="landing"
              defaultMode={authMode}
            />
          </div>
        </div>
      </section>
    </div>
  );
}
