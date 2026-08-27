import { useEffect, useState, type ReactNode } from 'react';
import { AccountPanel } from '../components/AccountPanel';
import { useAuth } from '../lib/auth';
import { upsertCloudProfile } from '../lib/accountProfile';
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
import { requestTutorialReplay } from '../lib/tutorial';

function FieldLabel({ children }: { children: ReactNode }) {
  return (
    <span className="mb-1.5 block font-mono text-[11px] font-semibold uppercase tracking-[0.12em] text-faint">
      {children}
    </span>
  );
}

function inputClassName() {
  return 'w-full rounded-xl border border-line bg-canvas px-3 py-2.5 text-base text-ink outline-none transition-colors placeholder:text-faint focus:border-brand focus-visible:ring-2 focus-visible:ring-brand';
}

export function SettingsView() {
  const { user } = useAuth();
  const [name, setName] = useState(() => loadDisplayProfile().name);
  const [theme, setThemeId] = useState<ThemeId>(() => loadTheme());
  const [hasRound, setHasRound] = useState(false);
  const [savedFlash, setSavedFlash] = useState<string | null>(null);

  useEffect(() => {
    const refresh = () => {
      const display = loadDisplayProfile();
      setName(display.name);
      setThemeId(loadTheme());
      setHasRound(loadRound() != null);
    };
    refresh();
    window.addEventListener('teeready-display-changed', refresh);
    return () =>
      window.removeEventListener('teeready-display-changed', refresh);
  }, []);

  const canSave = name.trim().length > 0;

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
            Account, appearance, and device data. Golfer info and stats live on
            their own pages.
          </p>
          <p className="mt-2 text-[13px] text-muted">
            Rounds and swing history stay on this device until you clear site
            data.
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
        <h2 className="text-[15px] font-bold text-ink">Display name</h2>
        <p className="mt-1 text-[13px] text-muted">
          Shown in the nav avatar and Social board.
        </p>
        <label className="mt-4 block">
          <FieldLabel>Name</FieldLabel>
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
        <h2 className="text-[15px] font-bold text-ink">Tutorial</h2>
        <p className="mt-1 text-[13px] text-muted">
          A short walkthrough of Today, Courses, Prep, and GPS — replay anytime.
        </p>
        <button
          type="button"
          onClick={() => {
            requestTutorialReplay();
            flash('Tutorial starting');
          }}
          className="mt-4 rounded-xl border border-line px-4 py-2.5 text-[13px] font-semibold text-ink hover:border-brand/40 hover:bg-brand-soft"
        >
          Replay tutorial
        </button>
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
      </div>
    </div>
  );
}
