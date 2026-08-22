import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { Sparkles } from 'lucide-react';
import {
  bagFromStocks,
  DEFAULT_PROFILE,
  loadGolfProfile,
  missLabel,
  saveGolfProfile,
  type MissBias,
} from '../lib/golfProfile';
import { needsQuestionnaire } from '../lib/questionnaire';
import { formatHandicap, MAX_HANDICAP, MIN_HANDICAP } from '../lib/golfHandicap';

const MISS_OPTIONS: Array<{ value: MissBias; label: string; hint: string }> = [
  { value: 'left', label: 'Left', hint: 'Start left, finish further left' },
  { value: 'right', label: 'Right', hint: 'Start right, finish further right' },
  { value: 'both', label: 'Both', hint: 'Two-way miss — favor the fat side' },
  { value: 'straight', label: 'Straight', hint: 'Tight dispersion both sides' },
];

function FieldLabel({ children }: { children: ReactNode }) {
  return (
    <span className="mb-1.5 block font-mono text-[10px] font-semibold uppercase tracking-[0.12em] text-faint">
      {children}
    </span>
  );
}

function inputClassName() {
  return 'w-full rounded-xl border border-line bg-canvas px-3 py-2.5 text-[14px] text-ink outline-none transition-colors placeholder:text-faint focus:border-brand';
}

export function ProfileView() {
  const [commonText, setCommonText] = useState('');
  const [handicap, setHandicap] = useState(DEFAULT_PROFILE.handicap);
  const [miss, setMiss] = useState<MissBias>(DEFAULT_PROFILE.miss);
  const [sevenIronYards, setSevenIronYards] = useState(
    DEFAULT_PROFILE.sevenIronYards,
  );
  const [driverYards, setDriverYards] = useState(DEFAULT_PROFILE.driverYards);
  const [savedFlash, setSavedFlash] = useState<string | null>(null);
  const [showQuestionnairePrompt, setShowQuestionnairePrompt] = useState(false);

  useEffect(() => {
    const refresh = () => {
      const saved = loadGolfProfile() ?? DEFAULT_PROFILE;
      setCommonText(saved.commonCourses.join(', '));
      setHandicap(saved.handicap);
      setMiss(saved.miss);
      setSevenIronYards(saved.sevenIronYards);
      setDriverYards(saved.driverYards);
      setShowQuestionnairePrompt(needsQuestionnaire(saved));
    };
    refresh();
    window.addEventListener('teeready-profile-changed', refresh);
    return () =>
      window.removeEventListener('teeready-profile-changed', refresh);
  }, []);

  const bagPreview = useMemo(
    () => bagFromStocks(driverYards, sevenIronYards),
    [driverYards, sevenIronYards],
  );

  const canSave =
    Number.isFinite(handicap) &&
    Number.isFinite(sevenIronYards) &&
    Number.isFinite(driverYards) &&
    driverYards > sevenIronYards + 15;

  const flash = (msg: string) => {
    setSavedFlash(msg);
    window.setTimeout(() => setSavedFlash(null), 2200);
  };

  const saveAll = () => {
    if (!canSave) return;
    const existing = loadGolfProfile() ?? DEFAULT_PROFILE;
    const commonCourses = commonText
      .split(/[,;\n]+/)
      .map((s) => s.trim())
      .filter(Boolean)
      .slice(0, 8);
    saveGolfProfile({
      ...existing,
      commonCourses,
      handicap,
      miss,
      sevenIronYards,
      driverYards,
    });
    flash('Golfer info saved');
  };

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-[28px] font-bold tracking-[-0.03em] text-ink">
            Golfer info
          </h1>
          <p className="mt-1 text-[14px] text-muted">
            Handicap, bag stocks, and home courses — used in Rounds and Today.
          </p>
        </div>
        {savedFlash ? (
          <span className="shrink-0 rounded-full bg-brand-soft px-3 py-1.5 text-[12px] font-semibold text-brand">
            {savedFlash}
          </span>
        ) : null}
      </div>

      {showQuestionnairePrompt ? (
        <section className="rounded-card border border-brand/30 bg-brand-soft p-5 shadow-card">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-start gap-3">
              <Sparkles className="mt-0.5 h-5 w-5 shrink-0 text-brand" />
              <div>
                <h2 className="text-[15px] font-bold text-ink">
                  Complete your player profile
                </h2>
                <p className="mt-1 text-[13px] text-muted">
                  A few more questions unlock personalized coaching and smarter
                  round prep.
                </p>
              </div>
            </div>
            <Link
              to="/questionnaire"
              className="shrink-0 rounded-xl bg-brand px-4 py-2.5 text-center text-[13px] font-bold text-white"
            >
              Take questionnaire
            </Link>
          </div>
        </section>
      ) : (
        <p className="text-[13px] text-muted">
          Want to update goals and motivation?{' '}
          <Link to="/questionnaire" className="font-semibold text-brand">
            Retake questionnaire
          </Link>
        </p>
      )}

      <section className="rounded-card bg-surface p-5 shadow-card">
        <h2 className="text-[15px] font-bold text-ink">Your game</h2>
        <p className="mt-1 text-[13px] text-muted">
          Calibrates hole plans, club picks, and miss rings in Rounds.
        </p>

        <label className="mt-4 block">
          <FieldLabel>Common courses</FieldLabel>
          <input
            value={commonText}
            onChange={(e) => setCommonText(e.target.value)}
            placeholder="e.g. Torrey Pines, Rancho Park, Riviera"
            className={inputClassName()}
          />
        </label>

        <div className="mt-4 grid grid-cols-2 gap-3">
          <label className="block">
            <FieldLabel>Handicap</FieldLabel>
            <input
              type="number"
              min={MIN_HANDICAP}
              max={MAX_HANDICAP}
              step={0.1}
              value={Number.isFinite(handicap) ? handicap : ''}
              onChange={(e) => {
                const raw = e.target.value;
                setHandicap(raw === '' ? Number.NaN : Number(raw));
              }}
              className={`${inputClassName()} tabular`}
            />
            <span className="mt-1 block text-[11px] text-muted">
              Plus handicaps: enter negative (e.g. −2 for +2).
            </span>
          </label>
          <div>
            <FieldLabel>Typical miss</FieldLabel>
            <div className="grid grid-cols-2 gap-1.5">
              {MISS_OPTIONS.map((opt) => {
                const on = miss === opt.value;
                return (
                  <button
                    key={opt.value}
                    type="button"
                    title={opt.hint}
                    onClick={() => setMiss(opt.value)}
                    className={
                      on
                        ? 'rounded-lg bg-brand-soft px-2 py-2 text-[12px] font-semibold text-brand ring-1 ring-[color-mix(in_srgb,var(--brand)_30%,transparent)]'
                        : 'rounded-lg border border-line bg-canvas px-2 py-2 text-[12px] font-medium text-muted hover:text-ink'
                    }
                  >
                    {opt.label}
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        <div className="mt-4 grid grid-cols-2 gap-3">
          <label className="block">
            <FieldLabel>7-iron carry</FieldLabel>
            <div className="relative">
              <input
                type="number"
                min={80}
                max={220}
                value={sevenIronYards}
                onChange={(e) => setSevenIronYards(Number(e.target.value))}
                className={`${inputClassName()} pr-10 tabular`}
              />
              <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-[11px] text-faint">
                yd
              </span>
            </div>
          </label>
          <label className="block">
            <FieldLabel>Driver carry</FieldLabel>
            <div className="relative">
              <input
                type="number"
                min={140}
                max={360}
                value={driverYards}
                onChange={(e) => setDriverYards(Number(e.target.value))}
                className={`${inputClassName()} pr-10 tabular`}
              />
              <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-[11px] text-faint">
                yd
              </span>
            </div>
          </label>
        </div>

        {!canSave ? (
          <p className="mt-3 text-[12px] text-bad">
            Driver should be ~20+ yards longer than 7-iron.
          </p>
        ) : null}

        <div className="mt-5 rounded-xl border border-line bg-canvas px-3 py-3">
          <div className="mb-2 font-mono text-[10px] font-semibold uppercase tracking-[0.12em] text-faint">
            Bag preview — total avg
          </div>
          <div className="grid grid-cols-4 gap-1.5 sm:grid-cols-6">
            {bagPreview.map((c) => (
              <div
                key={c.key}
                className="rounded-lg bg-surface px-1.5 py-1.5 text-center shadow-card"
              >
                <div className="text-[9px] uppercase tracking-wide text-faint">
                  {c.label}
                </div>
                <div className="text-[12px] font-semibold tabular text-ink">
                  {c.yards}
                </div>
              </div>
            ))}
          </div>
          <p className="mt-2 text-[12px] text-muted">
            {missLabel(miss)} · HCP {formatHandicap(handicap)}
          </p>
        </div>
      </section>

      <div className="flex flex-wrap items-center gap-3 pb-4">
        <button
          type="button"
          disabled={!canSave}
          onClick={saveAll}
          className="rounded-xl bg-brand px-5 py-2.5 text-[13px] font-bold text-white disabled:cursor-not-allowed disabled:opacity-40"
        >
          Save golfer info
        </button>
        <Link
          to="/rounds/prep"
          className="rounded-xl border border-line bg-surface px-5 py-2.5 text-[13px] font-semibold text-muted hover:text-ink"
        >
          Open rounds
        </Link>
      </div>
    </div>
  );
}
