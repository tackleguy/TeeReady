import { useCallback, useEffect, useLayoutEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { useLocation, useNavigate } from 'react-router-dom';
import { AnimatePresence, motion } from 'motion/react';
import { Flag, X } from 'lucide-react';
import {
  TUTORIAL_START_EVENT,
  hasCompletedTutorial,
  markTutorialDone,
} from '../../lib/tutorial';

type StepId = 'welcome' | 'today' | 'courses' | 'rounds' | 'ready';

type Step = {
  id: StepId;
  /** Matches data-tutorial on TopNav; null = centered card */
  target: string | null;
  title: string;
  body: string;
  primary: string;
};

const STEPS: Step[] = [
  {
    id: 'welcome',
    target: null,
    title: 'Your round, from conditions to the pin',
    body: 'TeeReady is your caddie: check when to play, prep miss lines, then range live on GPS — without losing the round when you switch tabs.',
    primary: 'Show me around',
  },
  {
    id: 'today',
    target: 'today',
    title: 'Start with Today',
    body: 'Playability by the hour — wind, wetness, and the best window before you tee off.',
    primary: 'Next',
  },
  {
    id: 'courses',
    target: 'courses',
    title: 'Find your course',
    body: 'Browse nearby layouts, open the map, or jump straight into Prep for the one you’re playing.',
    primary: 'Next',
  },
  {
    id: 'rounds',
    target: 'rounds',
    title: 'Prep, then GPS',
    body: 'Rounds opens Prep (miss lines, wind-adjusted yardages) and GPS (live ranging that keeps running in the background). That’s the core of TeeReady.',
    primary: 'Next',
  },
  {
    id: 'ready',
    target: null,
    title: 'You’re ready to prep',
    body: 'Open Prep for a hole plan tied to your bag and miss. Replay this tour anytime from Settings.',
    primary: 'Open Prep',
  },
];

const PAD = 8;
const AUTO_START_MS = 700;

function visibleTutorialTarget(id: string): HTMLElement | null {
  const nodes = Array.from(
    document.querySelectorAll<HTMLElement>(`[data-tutorial="${id}"]`),
  );
  return (
    nodes.find((el) => {
      const r = el.getBoundingClientRect();
      if (r.width < 2 || r.height < 2) return false;
      const style = window.getComputedStyle(el);
      if (style.visibility === 'hidden' || style.display === 'none') return false;
      if (Number(style.opacity) === 0) return false;
      return true;
    }) ?? null
  );
}

type Spot = { top: number; left: number; width: number; height: number };

function measureSpot(el: HTMLElement): Spot {
  const r = el.getBoundingClientRect();
  return {
    top: Math.max(0, r.top - PAD),
    left: Math.max(0, r.left - PAD),
    width: r.width + PAD * 2,
    height: r.height + PAD * 2,
  };
}

type CardPos = { top?: number; bottom?: number; left: number; maxWidth: number };

function placeCard(spot: Spot | null): CardPos {
  const maxWidth = Math.min(340, window.innerWidth - 24);
  const left = Math.max(12, (window.innerWidth - maxWidth) / 2);

  if (!spot) {
    return {
      top: Math.max(88, window.innerHeight * 0.28),
      left,
      maxWidth,
    };
  }

  const cardH = 200;
  const spaceBelow = window.innerHeight - (spot.top + spot.height);
  const preferBelow = spaceBelow >= cardH + 24;

  if (preferBelow) {
    return {
      top: spot.top + spot.height + 14,
      left,
      maxWidth,
    };
  }

  return {
    bottom: Math.max(16, window.innerHeight - spot.top + 14),
    left,
    maxWidth,
  };
}

export function AppTutorial({ active }: { active: boolean }) {
  const navigate = useNavigate();
  const location = useLocation();
  const [open, setOpen] = useState(false);
  const [stepIndex, setStepIndex] = useState(0);
  const [spot, setSpot] = useState<Spot | null>(null);
  const [card, setCard] = useState<CardPos>(() => placeCard(null));

  const finish = useCallback((kind: 'completed' | 'skipped') => {
    markTutorialDone(kind);
    setOpen(false);
    setStepIndex(0);
  }, []);

  const start = useCallback(() => {
    setStepIndex(0);
    setOpen(true);
  }, []);

  useEffect(() => {
    if (!active) {
      setOpen(false);
      return;
    }

    const onReplay = () => start();
    window.addEventListener(TUTORIAL_START_EVENT, onReplay);

    if (hasCompletedTutorial()) {
      return () => window.removeEventListener(TUTORIAL_START_EVENT, onReplay);
    }

    // Don’t fight the questionnaire flow.
    if (location.pathname.startsWith('/questionnaire')) {
      return () => window.removeEventListener(TUTORIAL_START_EVENT, onReplay);
    }

    const t = window.setTimeout(() => {
      if (!hasCompletedTutorial()) start();
    }, AUTO_START_MS);

    return () => {
      window.clearTimeout(t);
      window.removeEventListener(TUTORIAL_START_EVENT, onReplay);
    };
  }, [active, location.pathname, start]);

  const step = STEPS[stepIndex]!;

  const refreshLayout = useCallback(() => {
    if (!open) return;
    const el = step.target ? visibleTutorialTarget(step.target) : null;
    const nextSpot = el ? measureSpot(el) : null;
    setSpot(nextSpot);
    setCard(placeCard(nextSpot));
  }, [open, step.target]);

  useLayoutEffect(() => {
    refreshLayout();
  }, [refreshLayout, stepIndex]);

  useEffect(() => {
    if (!open) return;
    const onResize = () => refreshLayout();
    window.addEventListener('resize', onResize);
    window.addEventListener('scroll', onResize, true);
    return () => {
      window.removeEventListener('resize', onResize);
      window.removeEventListener('scroll', onResize, true);
    };
  }, [open, refreshLayout]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') finish('skipped');
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, finish]);

  const goNext = () => {
    if (stepIndex >= STEPS.length - 1) {
      finish('completed');
      navigate('/rounds/prep');
      return;
    }
    setStepIndex((i) => i + 1);
  };

  if (!active || typeof document === 'undefined') return null;

  return createPortal(
    <AnimatePresence>
      {open ? (
        <motion.div
          key="tutorial"
          className="pointer-events-none fixed inset-0 z-[70]"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
          role="dialog"
          aria-modal="true"
          aria-labelledby="teeready-tutorial-title"
        >
          {/* Dim layer — four panels so the spotlight stays clickable */}
          <div className="pointer-events-none absolute inset-0" aria-hidden>
            {spot ? (
              <>
                <div
                  className="pointer-events-auto absolute left-0 right-0 top-0 bg-[rgba(8,14,12,0.62)]"
                  style={{ height: Math.max(0, spot.top) }}
                />
                <div
                  className="pointer-events-auto absolute bottom-0 left-0 right-0 bg-[rgba(8,14,12,0.62)]"
                  style={{
                    top: spot.top + spot.height,
                  }}
                />
                <div
                  className="pointer-events-auto absolute left-0 bg-[rgba(8,14,12,0.62)]"
                  style={{
                    top: spot.top,
                    height: spot.height,
                    width: Math.max(0, spot.left),
                  }}
                />
                <div
                  className="pointer-events-auto absolute right-0 bg-[rgba(8,14,12,0.62)]"
                  style={{
                    top: spot.top,
                    height: spot.height,
                    left: spot.left + spot.width,
                  }}
                />
                <div
                  className="pointer-events-none absolute rounded-xl ring-2 ring-[color-mix(in_srgb,var(--accent)_75%,white)] transition-[top,left,width,height] duration-300 ease-out"
                  style={{
                    top: spot.top,
                    left: spot.left,
                    width: spot.width,
                    height: spot.height,
                  }}
                />
              </>
            ) : (
              <div className="pointer-events-auto absolute inset-0 bg-[rgba(8,14,12,0.62)]" />
            )}
          </div>

          <motion.div
            key={step.id}
            className="pointer-events-auto absolute"
            style={{
              top: card.top,
              bottom: card.bottom,
              left: card.left,
              width: card.maxWidth,
            }}
            initial={{ opacity: 0, y: 10, filter: 'blur(4px)' }}
            animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
            exit={{ opacity: 0, y: -6 }}
            transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
          >
            <div className="overflow-hidden rounded-2xl border border-[color-mix(in_srgb,var(--brand)_35%,var(--line))] bg-surface shadow-lift">
              <div className="flex items-start justify-between gap-3 px-4 pb-0 pt-4">
                <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-brand text-white shadow-card">
                  <Flag className="h-3.5 w-3.5" strokeWidth={2.4} />
                </span>
                <button
                  type="button"
                  aria-label="Skip tutorial"
                  onClick={() => finish('skipped')}
                  className="grid h-8 w-8 place-items-center rounded-full text-muted hover:bg-canvas hover:text-ink"
                >
                  <X className="h-4 w-4" strokeWidth={2.2} />
                </button>
              </div>

              <div className="px-4 pb-4 pt-3">
                <h2
                  id="teeready-tutorial-title"
                  className="font-display text-[20px] font-semibold leading-snug tracking-[-0.02em] text-ink"
                >
                  {step.title}
                </h2>
                <p className="mt-2 text-[14px] leading-relaxed text-muted">
                  {step.body}
                </p>

                <div className="mt-5 flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={goNext}
                    className="rounded-xl bg-brand px-4 py-2.5 text-[13px] font-bold text-white shadow-card transition-transform hover:-translate-y-px"
                  >
                    {step.primary}
                  </button>
                  {stepIndex === 0 ||
                  (stepIndex > 0 && stepIndex < STEPS.length - 1) ? (
                    <button
                      type="button"
                      onClick={() => finish('skipped')}
                      className="rounded-xl px-3 py-2.5 text-[13px] font-semibold text-muted hover:text-ink"
                    >
                      {stepIndex === 0 ? 'I’ll explore' : 'Skip'}
                    </button>
                  ) : null}
                  <span className="ml-auto font-mono text-[11px] tabular-nums text-faint">
                    {stepIndex + 1}/{STEPS.length}
                  </span>
                </div>

                <div className="mt-4 flex gap-1.5" aria-hidden>
                  {STEPS.map((s, i) => (
                    <span
                      key={s.id}
                      className={`h-1 flex-1 rounded-full transition-colors ${
                        i <= stepIndex ? 'bg-brand' : 'bg-line'
                      }`}
                    />
                  ))}
                </div>
              </div>
            </div>
          </motion.div>
        </motion.div>
      ) : null}
    </AnimatePresence>,
    document.body,
  );
}
