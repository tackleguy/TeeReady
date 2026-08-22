import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { AccountPanel } from '../components/AccountPanel';
import { useAuth } from '../lib/auth';
import { upsertCloudProfile } from '../lib/accountProfile';
import {
  bagFromStocks,
  DEFAULT_PROFILE,
  loadGolfProfile,
  missLabel,
  saveGolfProfile,
  type MissBias,
} from '../lib/golfProfile';
import { clearRound, loadRound } from '../lib/golfTracker';
import {
  CURRENT_USER,
  loadDisplayProfile,
  saveDisplayProfile,
  type DisplayProfile,
} from '../lib/mock';
import {
  THEME_OPTIONS,
  loadTheme,
  setTheme,
  type ThemeId,
} from '../lib/theme';
import { formatHandicap } from '../lib/golfHandicap';
import { GoalPicker } from '../components/coach/GoalPicker';
import type { GoalId } from '../lib/goals';

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

export function SettingsView() {
  const { user } = useAuth();
  const [name, setName] = useState(() => loadDisplayProfile().name);
  const [commonText, setCommonText] = useState('');
  const [handicap, setHandicap] = useState(DEFAULT_PROFILE.handicap);
  const [miss, setMiss] = useState<MissBias>(DEFAULT_PROFILE.miss);
  const [sevenIronYards, setSevenIronYards] = useState(
    DEFAULT_PROFILE.sevenIronYards,
  );
  const [driverYards, setDriverYards] = useState(DEFAULT_PROFILE.driverYards);
  const [goals, setGoals] = useState<GoalId[]>(DEFAULT_PROFILE.goals);
  const [customGoals, setCustomGoals] = useState<string[]>(
    DEFAULT_PROFILE.customGoals,
  );
  const [targetHandicap, setTargetHandicap] = useState<number | ''>('');
  const [theme, setThemeId] = useState<ThemeId>(() => loadTheme());
  const [hasRound, setHasRound] = useState(false);
  const [savedFlash, setSavedFlash] = useState<string | null>(null);

  // Re-read storage whenever Settings is shown so leftovers don't leave a
  // stale form that overwrites a good save.
  useEffect(() => {
    const refresh = () => {
      const saved = loadGolfProfile() ?? DEFAULT_PROFILE;
      const display = loadDisplayProfile();
      setName(display.name);
      setCommonText(saved.commonCourses.join(', '));
      setHandicap(saved.handicap);
      setMiss(saved.miss);
      setSevenIronYards(saved.sevenIronYards);
      setDriverYards(saved.driverYards);
      setGoals(saved.goals);
      setCustomGoals(saved.customGoals);
      setTargetHandicap(saved.targetHandicap ?? '');
      setThemeId(loadTheme());
      setHasRound(loadRound() != null);
    };
    refresh();
    window.addEventListener('teeready-profile-changed', refresh);
    window.addEventListener('teeready-display-changed', refresh);
    return () => {
      window.removeEventListener('teeready-profile-changed', refresh);
      window.removeEventListener('teeready-display-changed', refresh);
    };
  }, []);

  const bagPreview = useMemo(
    () => bagFromStocks(driverYards, sevenIronYards),
    [driverYards, sevenIronYards],
  );

  const canSave =
    name.trim().length > 0 &&
    Number.isFinite(handicap) &&
    Number.isFinite(sevenIronYards) &&
    Number.isFinite(driverYards) &&
    driverYards > sevenIronYards + 15;

  const flash = (msg: string) => {
    setSavedFlash(msg);
    window.setTimeout(() => setSavedFlash(null), 2200);
  };

  const onPickTheme = (id: ThemeId) => {
    setThemeId(id);
    setTheme(id);
    flash(
      `${THEME_OPTIONS.find((t) => t.id === id)?.label ?? 'Theme'} applied`,
    );
  };

  const saveAll = async () => {
    if (!canSave) return;
    const commonCourses = commonText
      .split(/[,;\n]+/)
      .map((s) => s.trim())
      .filter(Boolean)
      .slice(0, 8);
    saveGolfProfile({
      commonCourses,
      handicap,
      miss,
      sevenIronYards,
      driverYards,
      goals,
      customGoals,
      targetHandicap:
        targetHandicap === '' ? undefined : Number(targetHandicap),
    });
    const next: DisplayProfile = saveDisplayProfile({ name: name.trim() });
    setName(next.name);
    setTheme(theme);
    if (user?.id) {
      try {
        await upsertCloudProfile(user.id);
        flash('Settings saved · synced');
      } catch {
        flash('Settings saved locally (sync failed)');
      }
    } else {
      flash('Settings saved');
    }
  };

  const onClearRound = () => {
    clearRound();
    setHasRound(false);
    flash('Tracked round cleared');
  };

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-[28px] font-bold tracking-[-0.03em] text-ink">
            Settings
          </h1>
          <p className="mt-1 text-[14px] text-muted">
            Appearance, profile, and bag stocks used across Today and Rounds.
          </p>
        </div>
        {savedFlash ? (
          <span className="shrink-0 rounded-full bg-brand-soft px-3 py-1.5 text-[12px] font-semibold text-brand">
            {savedFlash}
          </span>
        ) : null}
      </div>

      <AccountPanel />

      <section className="rounded-card bg-surface p-5 shadow-card">
        <h2 className="text-[15px] font-bold text-ink">Appearance</h2>
        <p className="mt-1 text-[13px] text-muted">
          Light, dark, or sand — applies immediately across the app.
        </p>
        <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
          {THEME_OPTIONS.map((opt) => {
            const on = theme === opt.id;
            return (
              <button
                key={opt.id}
                type="button"
                onClick={() => onPickTheme(opt.id)}
                aria-pressed={on}
                className={
                  on
                    ? 'rounded-xl border border-brand bg-brand-soft p-3 text-left ring-1 ring-[color-mix(in_srgb,var(--brand)_30%,transparent)]'
                    : 'rounded-xl border border-line bg-canvas p-3 text-left hover:border-[color-mix(in_srgb,var(--brand)_35%,var(--line))]'
                }
              >
                <div className="mb-2.5 flex h-10 overflow-hidden rounded-lg border border-line">
                  <span
                    className="w-[42%]"
                    style={{ background: opt.swatch[0] }}
                  />
                  <span
                    className="w-[33%]"
                    style={{ background: opt.swatch[1] }}
                  />
                  <span
                    className="flex-1"
                    style={{ background: opt.swatch[2] }}
                  />
                </div>
                <div className="text-[13px] font-semibold text-ink">
                  {opt.label}
                </div>
                <div className="mt-0.5 text-[11px] leading-snug text-muted">
                  {opt.description}
                </div>
              </button>
            );
          })}
        </div>
      </section>

      <section className="rounded-card bg-surface p-5 shadow-card">
        <h2 className="text-[15px] font-bold text-ink">Profile</h2>
        <p className="mt-1 text-[13px] text-muted">
          Shown in the nav avatar and Social board.
        </p>
        <label className="mt-4 block">
          <FieldLabel>Display name</FieldLabel>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder={CURRENT_USER.name}
            className={inputClassName()}
          />
        </label>
        <div className="mt-3 flex items-center gap-3">
          <div className="grid h-10 w-10 place-items-center rounded-full bg-brand-soft font-mono text-[11px] font-semibold text-brand">
            {(name.trim() || CURRENT_USER.name)
              .split(/\s+/)
              .map((p) => p[0])
              .join('')
              .slice(0, 2)
              .toUpperCase()}
          </div>
          <span className="text-[13px] text-muted">
            Initials update from your name
          </span>
        </div>
      </section>

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
          <span className="mt-1.5 block text-[12px] text-faint">
            Comma-separated — quick picks in course search.
          </span>
        </label>

        <div className="mt-4 grid grid-cols-2 gap-3">
          <label className="block">
            <FieldLabel>Handicap</FieldLabel>
            <input
              type="number"
              min={-10}
              max={54}
              step={0.1}
              value={Number.isFinite(handicap) ? handicap : ''}
              onChange={(e) => {
                const raw = e.target.value;
                setHandicap(raw === '' ? Number.NaN : Number(raw));
              }}
              className={`${inputClassName()} tabular`}
            />
            <span className="mt-1 block text-[11px] text-faint">
              Use negatives for plus handicaps (e.g. -2 → +2). Click Save
              settings after editing.
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

        <div className="mt-5 border-t border-line pt-5">
          <FieldLabel>Goals · your coach</FieldLabel>
          <p className="mb-2 text-[12px] text-muted">
            Today and Rounds adapt to what you&apos;re working on.
          </p>
          <GoalPicker
            value={goals}
            onChange={setGoals}
            customGoals={customGoals}
            onCustomGoalsChange={setCustomGoals}
            max={3}
            maxCustom={3}
          />
          {goals.includes('lower-handicap') ? (
            <label className="mt-3 block">
              <FieldLabel>Target handicap</FieldLabel>
              <input
                type="number"
                step={0.1}
                min={-10}
                max={54}
                value={targetHandicap}
                onChange={(e) =>
                  setTargetHandicap(
                    e.target.value === '' ? '' : Number(e.target.value),
                  )
                }
                placeholder={formatHandicap(Math.max(0, handicap - 3))}
                className={`${inputClassName()} tabular`}
              />
            </label>
          ) : null}
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
            Name required · driver should be ~20+ yards longer than 7-iron.
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

      <section className="rounded-card bg-surface p-5 shadow-card">
        <h2 className="text-[15px] font-bold text-ink">Data</h2>
        <p className="mt-1 text-[13px] text-muted">
          Clear the in-progress tracked round stored on this device.
        </p>
        <button
          type="button"
          disabled={!hasRound}
          onClick={onClearRound}
          className="mt-4 rounded-xl border border-line px-4 py-2.5 text-[13px] font-semibold text-muted hover:text-ink disabled:cursor-not-allowed disabled:opacity-40"
        >
          {hasRound ? 'Clear tracked round' : 'No tracked round'}
        </button>
      </section>

      <div className="flex flex-wrap items-center gap-3 pb-4">
        <button
          type="button"
          disabled={!canSave}
          onClick={saveAll}
          className="rounded-xl bg-brand px-5 py-2.5 text-[13px] font-bold text-white disabled:cursor-not-allowed disabled:opacity-40"
        >
          Save settings
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
