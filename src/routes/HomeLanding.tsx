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
    <div>
      <Hero2
        onSignIn={() => scrollToAuth('signin')}
        onSignUp={() => scrollToAuth('signup')}
      />

      <section
        id="features"
        className="border-t border-white/10 bg-[#0a120c] px-5 py-16 md:px-8"
      >
        <div className="mx-auto grid max-w-6xl gap-6 sm:grid-cols-3">
          {[
            {
              k: 'Prep',
              v: 'Miss lines, wind, and front / mid / back yardages for every hole.',
            },
            {
              k: 'GPS',
              v: 'Live ranging that keeps running while you switch tabs.',
            },
            {
              k: 'Card',
              v: 'Net scoring with plus handicaps, synced to your account.',
            },
          ].map((item) => (
            <div
              key={item.k}
              className="rounded-2xl border border-white/10 bg-white/5 px-5 py-5 backdrop-blur-sm"
            >
              <div className="font-mono text-[10px] font-semibold uppercase tracking-[0.14em] text-emerald-300/80">
                {item.k}
              </div>
              <p className="mt-2 text-[15px] leading-relaxed text-gray-200">
                {item.v}
              </p>
            </div>
          ))}
        </div>
      </section>

      <section
        id="auth"
        className="scroll-mt-8 border-t border-white/10 bg-[#07100a] px-5 py-16 md:px-8"
      >
        <div className="mx-auto grid max-w-6xl items-start gap-10 lg:grid-cols-[1fr_420px]">
          <div>
            <h2 className="text-[28px] font-bold tracking-[-0.03em] text-white sm:text-[34px]">
              Sign in to tee off
            </h2>
            <p className="mt-3 max-w-md text-[15px] leading-relaxed text-gray-300">
              Your handicap, bag stocks, and rounds stay with your account —
              including Remember me on this device.
            </p>
          </div>
          <div className="rounded-2xl border border-white/10 bg-white p-5 shadow-2xl sm:p-6">
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
