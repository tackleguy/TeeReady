import { useState } from 'react';
import { ArrowRight, Flag, Menu, X } from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';

import { DEFAULT_COURSE_HERO } from '../../lib/courseImages';

const HERO_IMAGE = DEFAULT_COURSE_HERO;

type Props = {
  onSignIn?: () => void;
  onSignUp?: () => void;
};

export function Hero2({ onSignIn, onSignUp }: Props) {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const goSignIn = () => {
    setMobileMenuOpen(false);
    onSignIn?.();
  };
  const goSignUp = () => {
    setMobileMenuOpen(false);
    onSignUp?.();
  };

  return (
    <div className="relative min-h-[92vh] overflow-hidden bg-[#0c1218]">
      <img
        src={HERO_IMAGE}
        alt=""
        aria-hidden
        className="absolute inset-0 h-full w-full object-cover object-center"
      />
      <div className="absolute inset-0 bg-gradient-to-r from-[#0c1218]/95 via-[#0c1218]/75 to-[#0c1218]/35" />
      <div className="bg-noise absolute inset-0 opacity-[0.18]" />

      <div className="relative z-10 flex min-h-[92vh] flex-col">
        <nav className="mx-auto flex w-full max-w-6xl items-center justify-between px-5 py-6 md:px-8">
          <div className="flex items-center gap-2.5">
            <span className="grid h-9 w-9 place-items-center rounded-full border border-white/20 bg-white/10 font-display text-[15px] font-bold text-white backdrop-blur-sm">
              T
            </span>
            <span className="font-display text-[20px] font-semibold text-white">
              TeeReady
            </span>
          </div>

          <div className="hidden items-center gap-8 md:flex">
            <div className="flex items-center gap-6">
              {['Prep', 'GPS', 'Scorecard'].map((label) => (
                <a
                  key={label}
                  href="#features"
                  className="text-[13px] font-medium text-white/70 hover:text-white"
                >
                  {label}
                </a>
              ))}
            </div>
            <button
              type="button"
              onClick={goSignIn}
              className="btn-secondary !border-white/20 !bg-white/10 !text-white hover:!bg-white/15"
            >
              Sign in
            </button>
          </div>

          <button
            type="button"
            className="md:hidden"
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
          >
            <span className="sr-only">
              {mobileMenuOpen ? 'Close menu' : 'Open menu'}
            </span>
            {mobileMenuOpen ? (
              <X className="h-6 w-6 text-white" aria-hidden="true" />
            ) : (
              <Menu className="h-6 w-6 text-white" aria-hidden="true" />
            )}
          </button>
        </nav>

        <AnimatePresence>
          {mobileMenuOpen ? (
            <motion.div
              initial={{ opacity: 0, y: -8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              className="fixed inset-0 z-50 flex flex-col bg-[#0c1218]/98 p-5 md:hidden"
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Flag className="h-5 w-5 text-accent" aria-hidden="true" />
                  <span className="font-display text-lg font-semibold text-white">
                    TeeReady
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => setMobileMenuOpen(false)}
                  aria-label="Close menu"
                >
                  <X className="h-6 w-6 text-white" aria-hidden="true" />
                </button>
              </div>
              <div className="mt-10 flex flex-col gap-4">
                {['Prep', 'GPS', 'Scorecard', 'Account'].map((label) => (
                  <button
                    key={label}
                    type="button"
                    className="flex items-center justify-between border-b border-white/10 pb-3 text-left text-lg text-white"
                    onClick={() => {
                      setMobileMenuOpen(false);
                      document
                        .getElementById(label === 'Account' ? 'auth' : 'features')
                        ?.scrollIntoView({ behavior: 'smooth' });
                    }}
                  >
                    {label}
                    <ArrowRight className="h-4 w-4 text-white/50" aria-hidden="true" />
                  </button>
                ))}
                <button type="button" onClick={goSignUp} className="btn-accent mt-4">
                  Create account
                </button>
              </div>
            </motion.div>
          ) : null}
        </AnimatePresence>

        <div className="mx-auto flex w-full max-w-6xl flex-1 flex-col justify-center px-5 pb-16 pt-8 md:px-8">
          <p className="label !text-accent">Golf weather intelligence</p>
          <h1 className="mt-4 max-w-3xl font-display text-[44px] font-semibold leading-[1.05] tracking-[-0.03em] text-white md:text-[64px] lg:text-[72px]">
            Hole prep that reads the wind before you do
          </h1>
          <p className="mt-6 max-w-xl text-[17px] leading-relaxed text-white/75">
            Miss lines, live GPS ranging that keeps running in the background,
            and a scorecard tuned to your handicap — one account, every round.
          </p>
          <div className="mt-10 flex flex-col gap-3 sm:flex-row sm:items-center">
            <button type="button" onClick={goSignUp} className="btn-accent">
              Create free account
              <ArrowRight className="h-4 w-4" aria-hidden="true" />
            </button>
            <button
              type="button"
              onClick={goSignIn}
              className="btn-secondary !border-white/25 !bg-transparent !text-white hover:!bg-white/10"
            >
              Sign in
            </button>
          </div>

          <div className="mt-14 grid max-w-2xl grid-cols-3 gap-4 border-t border-white/15 pt-8">
            {[
              { n: 'Prep', d: 'Miss-side yardages' },
              { n: 'GPS', d: 'Background live' },
              { n: 'Stats', d: 'FIR · GIR · sand' },
            ].map((item) => (
              <div key={item.n}>
                <div className="stat-num text-[11px] text-accent">{item.n}</div>
                <div className="mt-1 text-[13px] text-white/65">{item.d}</div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

export { Hero2 as default };
