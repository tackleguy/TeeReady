import { useState } from 'react';
import { ArrowRight, Flag, Menu, X } from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';

const HERO_IMAGE =
  'https://images.unsplash.com/photo-1535131749006-b7f58c99034b?auto=format&fit=crop&w=1920&q=80';

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
    <div className="relative min-h-screen overflow-hidden bg-[#0a120c]">
      {/* Gradient background with grain effect — TeeReady greens / dawn sky */}
      <div className="absolute -right-60 -top-10 z-0 flex flex-col items-end blur-xl">
        <div className="z-[1] h-[10rem] w-[60rem] rounded-full bg-gradient-to-b from-emerald-600 to-sky-700 blur-[6rem]" />
        <div className="z-[1] h-[10rem] w-[90rem] rounded-full bg-gradient-to-b from-lime-800 to-amber-500 blur-[6rem]" />
        <div className="z-[1] h-[10rem] w-[60rem] rounded-full bg-gradient-to-b from-teal-600 to-sky-500 blur-[6rem]" />
      </div>
      <div className="bg-noise absolute inset-0 z-0 opacity-30" />

      <div className="relative z-10">
        <nav className="container mx-auto mt-6 flex items-center justify-between px-4 py-4">
          <div className="flex items-center">
            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-white text-[#0a120c]">
              <Flag className="h-4 w-4" strokeWidth={2.4} aria-hidden />
            </div>
            <span className="ml-2 text-xl font-bold text-white">TeeReady</span>
          </div>

          <div className="hidden items-center space-x-6 md:flex">
            <div className="flex items-center space-x-6">
              <NavItem label="Prep" href="#features" />
              <NavItem label="GPS" href="#features" />
              <NavItem label="Scorecard" href="#features" />
              <NavItem label="Account" href="#auth" />
            </div>
            <div className="flex items-center space-x-3">
              <button
                type="button"
                onClick={goSignIn}
                className="h-12 rounded-full bg-white px-8 text-base font-medium text-black hover:bg-white/90"
              >
                Sign in
              </button>
            </div>
          </div>

          <button
            type="button"
            className="md:hidden"
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
          >
            <span className="sr-only">Toggle menu</span>
            {mobileMenuOpen ? (
              <X className="h-6 w-6 text-white" />
            ) : (
              <Menu className="h-6 w-6 text-white" />
            )}
          </button>
        </nav>

        <AnimatePresence>
          {mobileMenuOpen ? (
            <motion.div
              initial={{ y: '-100%' }}
              animate={{ y: 0 }}
              exit={{ y: '-100%' }}
              transition={{ duration: 0.3 }}
              className="fixed inset-0 z-50 flex flex-col bg-black/95 p-4 md:hidden"
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center">
                  <div className="flex h-8 w-8 items-center justify-center rounded-full bg-white text-[#0a120c]">
                    <Flag className="h-4 w-4" strokeWidth={2.4} aria-hidden />
                  </div>
                  <span className="ml-2 text-xl font-bold text-white">
                    TeeReady
                  </span>
                </div>
                <button type="button" onClick={() => setMobileMenuOpen(false)}>
                  <X className="h-6 w-6 text-white" />
                </button>
              </div>
              <div className="mt-8 flex flex-col space-y-6">
                <MobileNavItem
                  label="Prep"
                  onClick={() => {
                    setMobileMenuOpen(false);
                    document.getElementById('features')?.scrollIntoView({
                      behavior: 'smooth',
                    });
                  }}
                />
                <MobileNavItem
                  label="GPS"
                  onClick={() => {
                    setMobileMenuOpen(false);
                    document.getElementById('features')?.scrollIntoView({
                      behavior: 'smooth',
                    });
                  }}
                />
                <MobileNavItem
                  label="Scorecard"
                  onClick={() => {
                    setMobileMenuOpen(false);
                    document.getElementById('features')?.scrollIntoView({
                      behavior: 'smooth',
                    });
                  }}
                />
                <div className="pt-4">
                  <button
                    type="button"
                    onClick={goSignIn}
                    className="w-full rounded-full border border-gray-700 px-6 py-3 text-left text-white"
                  >
                    Sign in
                  </button>
                </div>
                <button
                  type="button"
                  onClick={goSignUp}
                  className="h-12 rounded-full bg-white px-8 text-base font-medium text-black hover:bg-white/90"
                >
                  Create account
                </button>
              </div>
            </motion.div>
          ) : null}
        </AnimatePresence>

        <div className="mx-auto mt-6 flex max-w-fit items-center justify-center space-x-2 rounded-full bg-white/10 px-4 py-2 backdrop-blur-sm">
          <span className="text-sm font-medium text-white">
            Weather-aware golf. Ready for every hole.
          </span>
          <ArrowRight className="h-4 w-4 text-white" />
        </div>

        <div className="container mx-auto mt-12 px-4 text-center">
          <h1 className="mx-auto max-w-4xl text-5xl font-bold leading-tight tracking-[-0.03em] text-white md:text-6xl lg:text-7xl">
            Show up ready for every hole
          </h1>
          <p className="mx-auto mt-6 max-w-2xl text-lg text-gray-300">
            Hole plans with miss lines, live GPS ranging, and a scorecard that
            knows your handicap — synced to your account.
          </p>
          <div className="mt-10 flex flex-col items-center justify-center space-y-4 sm:flex-row sm:space-x-4 sm:space-y-0">
            <button
              type="button"
              onClick={goSignUp}
              className="h-12 rounded-full bg-white px-8 text-base font-medium text-black hover:bg-white/90"
            >
              Create free account
            </button>
            <button
              type="button"
              onClick={goSignIn}
              className="h-12 rounded-full border border-gray-600 px-8 text-base font-medium text-white hover:bg-white/10"
            >
              Sign in
            </button>
          </div>

          <div className="relative mx-auto my-20 w-full max-w-6xl">
            <div className="bg-grainy absolute inset-0 rounded bg-white opacity-20 blur-[10rem]" />
            <img
              src={HERO_IMAGE}
              alt="Golfer on a fairway at dawn"
              width={1920}
              height={1080}
              className="relative h-auto w-full rounded shadow-md"
            />
          </div>
        </div>
      </div>
    </div>
  );
}

function NavItem({ label, href }: { label: string; href: string }) {
  return (
    <a
      href={href}
      className="flex items-center text-sm text-gray-300 hover:text-white"
    >
      <span>{label}</span>
    </a>
  );
}

function MobileNavItem({
  label,
  onClick,
}: {
  label: string;
  onClick?: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex w-full items-center justify-between border-b border-gray-800 pb-2 text-lg text-white"
    >
      <span>{label}</span>
      <ArrowRight className="h-4 w-4 text-gray-400" />
    </button>
  );
}

export { Hero2 as default };
