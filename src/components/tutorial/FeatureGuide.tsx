/** First-visit how-to panel with numbered steps — dismissible, stays in details for replay. */

import { useState } from 'react';
import { BookOpen, X } from 'lucide-react';
import { hasSeenFeatureGuide, markFeatureGuideSeen } from '../../lib/featureGuide';

type Props = {
  storageKey: string;
  title: string;
  steps: readonly string[];
  className?: string;
};

export function FeatureGuide({ storageKey, title, steps, className }: Props) {
  const [dismissed, setDismissed] = useState(() => hasSeenFeatureGuide(storageKey));
  const [detailsOpen, setDetailsOpen] = useState(false);

  const dismiss = () => {
    markFeatureGuideSeen(storageKey);
    setDismissed(true);
  };

  if (!dismissed) {
    return (
      <section
        className={`rounded-card border border-brand/25 bg-brand-soft p-4 shadow-card ${className ?? ''}`}
        aria-labelledby={`${storageKey}-title`}
      >
        <div className="flex items-start justify-between gap-3">
          <div className="flex gap-2">
            <BookOpen className="mt-0.5 h-4 w-4 shrink-0 text-brand" aria-hidden="true" />
            <div>
              <h2
                id={`${storageKey}-title`}
                className="text-[13px] font-semibold text-brand"
              >
                How to use {title}
              </h2>
              <ol className="mt-3 list-decimal space-y-2 pl-4 text-[13px] leading-relaxed text-ink">
                {steps.map((step) => (
                  <li key={step}>{step}</li>
                ))}
              </ol>
            </div>
          </div>
          <button
            type="button"
            aria-label="Dismiss how-to guide"
            onClick={dismiss}
            className="grid h-8 w-8 shrink-0 place-items-center rounded-full text-muted hover:bg-canvas hover:text-ink"
          >
            <X className="h-4 w-4" strokeWidth={2.2} aria-hidden="true" />
          </button>
        </div>
        <button
          type="button"
          onClick={dismiss}
          className="mt-4 w-full rounded-xl bg-brand px-4 py-2.5 text-[13px] font-bold text-white"
        >
          Got it
        </button>
      </section>
    );
  }

  return (
    <details
      open={detailsOpen}
      onToggle={(e) => setDetailsOpen((e.target as HTMLDetailsElement).open)}
      className={`rounded-card bg-surface shadow-card ${className ?? ''}`}
    >
      <summary className="cursor-pointer list-none px-4 py-3 text-[13px] font-semibold text-ink [&::-webkit-details-marker]:hidden">
        <span className="inline-flex items-center gap-2">
          <BookOpen className="h-4 w-4 text-brand" aria-hidden="true" />
          How to use {title}
        </span>
      </summary>
      <ol className="list-decimal space-y-2 border-t border-line px-4 py-3 pl-8 text-[13px] leading-relaxed text-muted">
        {steps.map((step) => (
          <li key={step}>{step}</li>
        ))}
      </ol>
    </details>
  );
}
