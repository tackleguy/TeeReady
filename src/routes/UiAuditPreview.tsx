import { useMemo, useState } from 'react';
import { GolfScorecard } from '../components/golf/GolfScorecard';
import { GpsMod } from '../components/golf/GpsMod';
import type { GolfHole } from '../lib/golf';
import { applyTheme, type ThemeId } from '../lib/theme';
import {
  newRound,
  setHoleScore,
  type TrackedRound,
} from '../lib/golfTracker';

const THEMES: ThemeId[] = ['light', 'dark', 'sand'];

function mockHoles(): GolfHole[] {
  return Array.from({ length: 18 }, (_, i) => {
    const n = i + 1;
    const par = n % 6 === 0 ? 5 : n % 3 === 0 ? 3 : 4;
    return {
      number: n,
      par,
      yards: par === 3 ? 165 : par === 5 ? 520 : 390,
      bearingDeg: 90,
      tee: { lat: 0, lon: 0 },
      green: { lat: 0, lon: 0 },
      source: 'tee-green',
    };
  });
}

function seedRound(holes: GolfHole[]): TrackedRound {
  let round = newRound('audit-course', 'Pebble Beach · Audit');
  for (const h of holes.slice(0, 7)) {
    const par = h.par ?? 4;
    round = setHoleScore(
      round,
      h.number,
      par,
      par + ((h.number % 3) - 1),
      h.number % 2 === 0 ? 2 : 1,
    );
  }
  return round;
}

/**
 * Unauthenticated layout preview for accessibility / density screenshots.
 * Visit /dev/ui-audit — not linked in nav.
 */
export function UiAuditPreview() {
  const holes = useMemo(() => mockHoles(), []);
  const [round, setRound] = useState(() => seedRound(holes));
  const [theme, setTheme] = useState<ThemeId>('light');
  const [hole, setHole] = useState(7);

  return (
    <div className="min-h-screen bg-canvas px-3 py-4 text-ink">
      <div className="mx-auto flex max-w-lg flex-col gap-4">
        <header className="flex flex-wrap items-center justify-between gap-2">
          <h1 className="text-[15px] font-bold">UI audit preview</h1>
          <div className="flex gap-1">
            {THEMES.map((t) => (
              <button
                key={t}
                type="button"
                data-theme-btn={t}
                onClick={() => {
                  setTheme(t);
                  applyTheme(t);
                }}
                className={
                  theme === t
                    ? 'rounded-lg bg-brand px-3 text-[13px] font-semibold text-white'
                    : 'rounded-lg border border-line px-3 text-[13px] font-semibold text-muted'
                }
              >
                {t}
              </button>
            ))}
          </div>
        </header>

        <section data-audit="gps" className="space-y-2">
          <p className="font-mono text-[11px] font-semibold uppercase tracking-[0.12em] text-faint">
            GPS HUD
          </p>
          <GpsMod
            enabled
            follow
            position={{
              lat: 36.57,
              lon: -121.95,
              accuracyM: 4.2,
              headingDeg: 112,
              speedMps: 0,
              ts: Date.now(),
            }}
            quality="good"
            error={null}
            distances={{ front: 142, mid: 158, back: 174 }}
            holeYards={390}
            holeNumber={hole}
            bearingToPin={118}
            onToggleFollow={() => {}}
            onLocate={() => {}}
            onDropShot={() => {}}
            canDropShot
            onClose={() => {}}
          />
          <GpsMod
            enabled
            follow={false}
            position={{
              lat: 36.57,
              lon: -121.95,
              accuracyM: 8,
              headingDeg: null,
              speedMps: null,
              ts: Date.now(),
            }}
            quality="fair"
            error={null}
            distances={{ front: 142, mid: 158, back: 174 }}
            holeYards={390}
            holeNumber={hole}
            bearingToPin={118}
            onToggleFollow={() => {}}
            onLocate={() => {}}
            compact
            expanded={false}
            onToggleExpanded={() => {}}
            onClose={() => {}}
          />
        </section>

        <section data-audit="scorecard" className="h-[70vh]">
          <p className="mb-2 font-mono text-[11px] font-semibold uppercase tracking-[0.12em] text-faint">
            Scorecard
          </p>
          <GolfScorecard
            holes={holes}
            round={round}
            handicap={12.4}
            activeHoleNumber={hole}
            onChange={setRound}
            onClose={() => {}}
            onSelectHole={setHole}
            onNextHole={() => setHole((h) => Math.min(18, h + 1))}
            onPrevHole={() => setHole((h) => Math.max(1, h - 1))}
          />
        </section>
      </div>
    </div>
  );
}
