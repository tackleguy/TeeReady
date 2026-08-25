/** Full swing improvement guide — assembled plan + validated prose. */

import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import {
  AlertTriangle,
  Check,
  ChevronDown,
  Loader2,
  Printer,
  Target,
} from 'lucide-react';
import { DEFAULT_PROFILE, loadGolfProfile } from '../lib/golfProfile';
import {
  buildSwingGuide,
  evaluateCycleProgress,
  getActiveSwingGuide,
  loadGuideChecklist,
  loadSwingGuides,
  saveSwingGuide,
  setGuideChecklistItem,
  type StoredSwingGuide,
} from '../lib/swing/guide';
import { getSwingAnalysis, loadSwingHistory } from '../lib/swing';
import type { SwingAnalysis } from '../lib/swing/types';

function Measured({ children }: { children: ReactNode }) {
  return (
    <span className="rounded bg-[color-mix(in_srgb,var(--brand)_14%,transparent)] px-1.5 py-0.5 font-mono text-[12px] font-semibold tabular text-brand">
      {children}
    </span>
  );
}

function Prose({
  block,
}: {
  block: { text: string; source: 'llm' | 'fallback' };
}) {
  return (
    <div>
      <p className="text-[14px] leading-relaxed text-ink">{block.text}</p>
      <p className="mt-1.5 font-mono text-[10px] uppercase tracking-[0.1em] text-faint">
        {block.source === 'llm' ? 'Caddie prose (local model)' : 'Authored fallback'}
      </p>
    </div>
  );
}

function Section({
  title,
  eyebrow,
  defaultOpen = true,
  children,
}: {
  title: string;
  eyebrow?: string;
  defaultOpen?: boolean;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <section className="overflow-hidden rounded-card bg-surface shadow-card">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left"
      >
        <div>
          {eyebrow ? (
            <p className="font-mono text-[10px] font-semibold uppercase tracking-[0.12em] text-faint">
              {eyebrow}
            </p>
          ) : null}
          <h2 className="text-[15px] font-bold text-ink">{title}</h2>
        </div>
        <ChevronDown
          className={`h-4 w-4 shrink-0 text-muted transition-transform ${open ? 'rotate-180' : ''}`}
        />
      </button>
      {open ? <div className="border-t border-line px-4 py-3">{children}</div> : null}
    </section>
  );
}

function formatVal(value: number, unit: string): string {
  if (unit === '°') return `${value}°`;
  if (unit === ':1') return `${value}:1`;
  return `${value} ${unit}`;
}

export function SwingGuideView() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const analysisId = params.get('analysis');
  const forceFallback = params.get('fallback') === '1';

  const [guide, setGuide] = useState<StoredSwingGuide | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [checklist, setChecklist] = useState<Record<string, boolean>>({});
  const [history, setHistory] = useState(() => loadSwingGuides());
  const [sectionStatus, setSectionStatus] = useState<string>('');

  const profile = useMemo(() => loadGolfProfile() ?? DEFAULT_PROFILE, []);

  const refreshHistory = useCallback(() => {
    setHistory(loadSwingGuides());
  }, []);

  useEffect(() => {
    window.addEventListener('teeready-swing-guides-changed', refreshHistory);
    return () => window.removeEventListener('teeready-swing-guides-changed', refreshHistory);
  }, [refreshHistory]);

  useEffect(() => {
    let cancelled = false;
    const ac = new AbortController();

    async function run() {
      setLoading(true);
      setError(null);
      try {
        let analysis: SwingAnalysis | null = analysisId
          ? getSwingAnalysis(analysisId)
          : loadSwingHistory()[0] ?? null;

        if (!analysis) {
          setError('No swing analysis found. Record a swing first.');
          setLoading(false);
          return;
        }

        const existing = loadSwingGuides().find((g) => g.analysisId === analysis!.id);
        if (existing && !forceFallback) {
          if (!cancelled) {
            setGuide(existing);
            setChecklist(loadGuideChecklist(existing.id));
            setLoading(false);
          }
          return;
        }

        const doc = await buildSwingGuide({
          analysis,
          profile,
          disableLlm: forceFallback,
          signal: ac.signal,
          onSection: (section, status) => {
            if (!cancelled) setSectionStatus(`${section}: ${status}`);
          },
        });

        if (!doc) {
          if (!cancelled) {
            setError(
              'No actionable fault detected from high-confidence metrics. Re-record at the matching camera angle with 30+ fps when possible.',
            );
            setLoading(false);
          }
          return;
        }

        const active = getActiveSwingGuide();
        let stored: StoredSwingGuide = { ...doc, outcome: 'active' };

        if (active && active.id !== stored.id) {
          const weeksElapsed = Math.max(
            0,
            (Date.now() - active.createdAt) / (7 * 24 * 60 * 60 * 1000),
          );
          const evaluated = evaluateCycleProgress({
            active,
            newMetrics: analysis.metrics,
            weeksElapsed,
          });
          if (evaluated.outcome === 'improved' || evaluated.outcome === 'stalled') {
            saveSwingGuide({ ...evaluated, outcome: evaluated.outcome });
            if (evaluated.outcome === 'improved') {
              stored = { ...stored, outcome: 'active' };
            }
          } else {
            saveSwingGuide({ ...active, outcome: 'closed' });
          }
        }

        saveSwingGuide(stored);
        if (!cancelled) {
          setGuide(stored);
          setChecklist(loadGuideChecklist(stored.id));
        }
      } catch (e) {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : 'Guide failed');
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void run();
    return () => {
      cancelled = true;
      ac.abort();
    };
  }, [analysisId, forceFallback, profile]);

  const toggleItem = (itemId: string) => {
    if (!guide) return;
    const next = !checklist[itemId];
    setGuideChecklistItem(guide.id, itemId, next);
    setChecklist((c) => ({ ...c, [itemId]: next }));
  };

  const stalled = guide?.outcome === 'stalled';
  const improvedPrior = history.find((g) => g.outcome === 'improved');

  if (loading) {
    return (
      <div className="flex min-h-[50vh] flex-col items-center justify-center gap-3 px-5">
        <Loader2 className="h-8 w-8 animate-spin text-brand" />
        <p className="text-[15px] font-semibold text-ink">Building your guide…</p>
        <p className="text-[12px] text-muted">
          {sectionStatus || 'Assembling measured plan'}
        </p>
      </div>
    );
  }

  if (error || !guide) {
    return (
      <div className="mx-auto max-w-lg px-5 py-10 text-center">
        <p className="text-[15px] font-semibold text-ink">{error ?? 'No guide'}</p>
        <Link to="/swing" className="mt-4 inline-block text-[14px] font-semibold text-brand">
          Back to swing capture
        </Link>
      </div>
    );
  }

  const { plan, prose } = guide;

  return (
    <div className="mx-auto w-full max-w-lg px-5 pb-20 pt-6 md:px-8 print:max-w-none print:px-0">
      <header className="mb-5 print:mb-3">
        <p className="font-mono text-[10px] font-semibold uppercase tracking-[0.14em] text-faint">
          Improvement cycle · {plan.cycleWeeks} weeks
        </p>
        <h1 className="mt-1 font-display text-[26px] font-bold tracking-[-0.03em] text-ink">
          {plan.primary.label}
        </h1>
        <p className="mt-2 text-[13px] text-muted">
          Primary focus from measured pose data. Numbers are measured; paragraphs may be
          local-model prose or authored fallbacks.
        </p>
        <div className="mt-3 flex flex-wrap gap-2 print:hidden">
          <button
            type="button"
            onClick={() => window.print()}
            className="inline-flex items-center gap-1.5 rounded-xl border border-line bg-surface px-3 py-2 text-[12px] font-semibold text-ink shadow-card"
          >
            <Printer className="h-3.5 w-3.5" />
            Print for the range
          </button>
          <Link
            to="/swing"
            className="inline-flex items-center rounded-xl border border-line bg-surface px-3 py-2 text-[12px] font-semibold text-ink shadow-card"
          >
            New capture
          </Link>
        </div>
      </header>

      <div className="mb-4 space-y-2 rounded-card border border-line bg-canvas/60 px-3 py-3 text-[12px] text-muted">
        <p>{plan.safetyLine}</p>
        <p>{plan.scopeLine}</p>
      </div>

      {stalled ? (
        <div className="mb-4 flex gap-2 rounded-card border border-amber-500/40 bg-[color-mix(in_srgb,#f59e0b_12%,transparent)] px-3 py-3 text-[13px] text-ink">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
          <p>
            This cycle didn&apos;t move the checkpoint metric. Don&apos;t silently repeat the same
            plan — try the alternate library drill in your sessions, or see a coach for a live look.
            {guide.progress
              ? ` Measured ${guide.progress.metricId}: ${formatVal(guide.progress.previous, guide.progress.unit)} → ${formatVal(guide.progress.current, guide.progress.unit)} (target ${formatVal(guide.progress.target, guide.progress.unit)}).`
              : null}
          </p>
        </div>
      ) : null}

      {guide.progress && guide.outcome === 'improved' ? (
        <div className="mb-4 rounded-card border border-brand/30 bg-brand-soft px-3 py-3 text-[13px] text-ink">
          Checkpoint improved:{' '}
          <Measured>
            {formatVal(guide.progress.previous, guide.progress.unit)} →{' '}
            {formatVal(guide.progress.current, guide.progress.unit)}
          </Measured>
          . Cycle closed — next capture can pick a new root fault.
        </div>
      ) : null}

      <div className="space-y-3">
        <Section title="Assessment" eyebrow="Measured story">
          <Prose block={prose.assessment} />
          <div className="mt-3 space-y-1.5">
            <p className="text-[12px] text-muted">
              Primary:{' '}
              <Measured>
                {plan.primary.label} · {plan.primary.severity} ·{' '}
                {formatVal(plan.primary.metricValue, plan.primary.metricUnit)}
              </Measured>
            </p>
            {plan.secondary.map((s) => (
              <p key={s.faultId} className="text-[12px] text-muted">
                Also noted: {s.label} (
                <Measured>{formatVal(s.metricValue, s.metricUnit)}</Measured>)
              </p>
            ))}
          </div>
        </Section>

        <Section title="Root cause" eyebrow="Authored graph">
          <Prose block={prose.rootCause} />
          <p className="mt-2 text-[12px] text-muted">{plan.causeChainNarrative}</p>
        </Section>

        <Section title="Visual read" eyebrow="Qualitative only">
          <Prose block={prose.visualRead} />
        </Section>

        <Section title="Why these drills" eyebrow="Library ids only">
          <Prose block={prose.whyDrills} />
          {plan.goalConflictNote ? (
            <p className="mt-3 text-[13px] leading-relaxed text-ink">{plan.goalConflictNote}</p>
          ) : null}
        </Section>

        <Section title="Practice plan" eyebrow="Checkable sessions" defaultOpen>
          <ul className="space-y-4">
            {plan.sessions.map((session) => {
              const weekLine = prose.weeklyFraming[session.week - 1];
              return (
                <li key={session.id}>
                  <div className="mb-2">
                    <p className="text-[13px] font-bold text-ink">{session.label}</p>
                    {weekLine ? (
                      <p className="mt-0.5 text-[12px] italic text-muted">{weekLine.text}</p>
                    ) : null}
                  </div>
                  <ul className="space-y-2">
                    {session.drills.map((d) => {
                      const itemId = `${session.id}:${d.drillId}`;
                      const done = Boolean(checklist[itemId]);
                      return (
                        <li
                          key={itemId}
                          className="rounded-xl border border-line bg-canvas/40 px-3 py-2.5"
                        >
                          <label className="flex cursor-pointer gap-2.5">
                            <button
                              type="button"
                              role="checkbox"
                              aria-checked={done}
                              onClick={() => toggleItem(itemId)}
                              className={`mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded border ${
                                done
                                  ? 'border-brand bg-brand text-white'
                                  : 'border-line bg-surface'
                              }`}
                            >
                              {done ? <Check className="h-3 w-3" strokeWidth={3} /> : null}
                            </button>
                            <div className="min-w-0">
                              <div className="text-[13px] font-semibold text-ink">{d.name}</div>
                              <div className="mt-0.5 font-mono text-[11px] text-faint">
                                {d.sets}×{d.reps} {d.unit} · {d.location}
                              </div>
                              <p className="mt-1.5 text-[12px] text-muted">
                                <span className="font-semibold text-ink">Setup: </span>
                                {d.setup}
                              </p>
                              <p className="mt-1 text-[12px] text-muted">
                                <span className="font-semibold text-ink">Do: </span>
                                {d.execution}
                              </p>
                              <p className="mt-1 text-[12px] text-brand">
                                Done right: {d.checkpoint}
                              </p>
                            </div>
                          </label>
                        </li>
                      );
                    })}
                  </ul>
                </li>
              );
            })}
          </ul>
        </Section>

        <Section title="Checkpoints" eyebrow="Re-measure">
          <ul className="space-y-3">
            {plan.checkpoints.map((cp) => (
              <li key={`${cp.week}-${cp.metricId}`} className="text-[13px] text-ink">
                <div className="flex items-start gap-2">
                  <Target className="mt-0.5 h-4 w-4 shrink-0 text-brand" />
                  <div>
                    <p className="font-semibold">Week {cp.week}</p>
                    <p className="mt-1 text-muted">{cp.instruction}</p>
                    <p className="mt-1">
                      Now <Measured>{formatVal(cp.currentValue, cp.unit)}</Measured>
                      {' → target '}
                      <Measured>{formatVal(cp.targetValue, cp.unit)}</Measured>
                      {' · '}
                      {cp.angle === 'dtl' ? 'down-the-line' : 'face-on'}
                    </p>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        </Section>

        <Section title="History" eyebrow="Local cycles" defaultOpen={false}>
          {history.length === 0 ? (
            <p className="text-[13px] text-muted">No saved cycles yet.</p>
          ) : (
            <ul className="divide-y divide-line">
              {history.slice(0, 12).map((g) => (
                <li key={g.id} className="flex items-center justify-between gap-2 py-2.5">
                  <div>
                    <div className="text-[13px] font-semibold text-ink">
                      {g.plan.primary.label}
                    </div>
                    <div className="text-[11px] text-muted">
                      {new Date(g.createdAt).toLocaleDateString()} · {g.outcome} ·{' '}
                      {g.plan.cycleWeeks}w
                      {g.progress
                        ? ` · Δ ${g.progress.delta}`
                        : ''}
                    </div>
                  </div>
                  <button
                    type="button"
                    className="text-[12px] font-semibold text-brand"
                    onClick={() => {
                      setGuide(g);
                      setChecklist(loadGuideChecklist(g.id));
                      navigate(`/swing/guide?analysis=${g.analysisId}`, { replace: true });
                    }}
                  >
                    Open
                  </button>
                </li>
              ))}
            </ul>
          )}
          {improvedPrior ? (
            <p className="mt-2 text-[12px] text-muted">
              Last improvement logged on{' '}
              {new Date(improvedPrior.createdAt).toLocaleDateString()}.
            </p>
          ) : null}
        </Section>

        {!guide.usedLlm ? (
          <p className="text-center text-[11px] text-muted">
            Guide rendered from authored fallbacks
            {forceFallback ? ' (LLM disabled)' : ' (local model offline or unused)'}.
            {guide.totalLlmMs ? ` LLM time ${guide.totalLlmMs}ms.` : null}
          </p>
        ) : (
          <p className="text-center text-[11px] text-muted">
            Local model sections · {guide.totalLlmMs}ms total
          </p>
        )}
      </div>
    </div>
  );
}
