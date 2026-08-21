import { useEffect, useRef, useState } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import { ChevronDown } from 'lucide-react';
import {
  CURRENT_LOCATION,
  loadDisplayProfile,
  type DisplayProfile,
} from '../lib/mock';

interface Props {
  locationLabel?: string;
  onLocationClick?: () => void;
}

const ROUNDS_LINKS = [
  {
    label: 'Prep',
    href: '/rounds/prep',
    hint: 'Miss lines · front / mid / back',
  },
  {
    label: 'GPS',
    href: '/rounds/gps',
    hint: 'Live ranging · no misses',
  },
] as const;

function linkClass(active: boolean) {
  return `text-[13px] transition-colors ${
    active
      ? 'font-semibold text-brand'
      : 'font-medium text-muted hover:text-ink'
  }`;
}

function RoundsMenu({ mobile = false }: { mobile?: boolean }) {
  const location = useLocation();
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const roundsActive = location.pathname.startsWith('/rounds');

  useEffect(() => {
    setOpen(false);
  }, [location.pathname]);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onDoc);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDoc);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  return (
    <div ref={rootRef} className={`relative ${mobile ? '' : ''}`}>
      <button
        type="button"
        aria-expanded={open}
        aria-haspopup="menu"
        onClick={() => setOpen((v) => !v)}
        className={`inline-flex items-center gap-1 ${linkClass(roundsActive)} ${
          mobile ? 'whitespace-nowrap' : ''
        }`}
      >
        Rounds
        <ChevronDown
          className={`h-3.5 w-3.5 transition-transform ${open ? 'rotate-180' : ''}`}
          strokeWidth={2.2}
        />
      </button>

      {open ? (
        <div
          role="menu"
          className={`absolute z-40 overflow-hidden rounded-xl border border-line bg-surface shadow-lift ${
            mobile
              ? 'left-0 top-full mt-2 min-w-[200px]'
              : 'left-0 top-full mt-2 min-w-[220px]'
          }`}
        >
          {ROUNDS_LINKS.map((item) => (
            <NavLink
              key={item.href}
              to={item.href}
              role="menuitem"
              onClick={() => setOpen(false)}
              className={({ isActive }) =>
                `block px-3.5 py-2.5 transition-colors ${
                  isActive
                    ? 'bg-brand-soft'
                    : 'hover:bg-[color-mix(in_srgb,var(--canvas)_80%,transparent)]'
                }`
              }
            >
              {({ isActive }) => (
                <>
                  <div
                    className={`text-[13px] ${
                      isActive
                        ? 'font-semibold text-brand'
                        : 'font-semibold text-ink'
                    }`}
                  >
                    {item.label}
                  </div>
                  <div className="mt-0.5 text-[11px] text-muted">{item.hint}</div>
                </>
              )}
            </NavLink>
          ))}
        </div>
      ) : null}
    </div>
  );
}

export function TopNav({
  locationLabel = CURRENT_LOCATION,
  onLocationClick,
}: Props) {
  const [profile, setProfile] = useState<DisplayProfile>(() =>
    loadDisplayProfile(),
  );

  useEffect(() => {
    const refresh = () => setProfile(loadDisplayProfile());
    window.addEventListener('focus', refresh);
    window.addEventListener('teeready-display-changed', refresh);
    return () => {
      window.removeEventListener('focus', refresh);
      window.removeEventListener('teeready-display-changed', refresh);
    };
  }, []);

  return (
    <header className="sticky top-0 z-30 border-b border-line bg-[color-mix(in_srgb,var(--canvas)_92%,transparent)] backdrop-blur">
      <div className="mx-auto flex w-full max-w-[1400px] items-center justify-between px-5 py-4 md:px-8">
        <div className="flex items-center gap-7">
          <NavLink
            to="/"
            className="text-[17px] font-bold tracking-[-0.02em] text-ink"
          >
            TeeReady
          </NavLink>
          <nav className="hidden items-center gap-5 md:flex">
            <NavLink
              to="/"
              end
              className={({ isActive }) => linkClass(isActive)}
            >
              Today
            </NavLink>
            <NavLink
              to="/courses"
              className={({ isActive }) => linkClass(isActive)}
            >
              Courses
            </NavLink>
            <RoundsMenu />
            <NavLink
              to="/group"
              className={({ isActive }) => linkClass(isActive)}
            >
              Group
            </NavLink>
            <NavLink
              to="/settings"
              className={({ isActive }) => linkClass(isActive)}
            >
              Settings
            </NavLink>
          </nav>
        </div>

        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={onLocationClick}
            className="rounded-[10px] border border-line bg-surface px-3.5 py-2 text-[12px] font-medium text-muted hover:text-ink"
          >
            {locationLabel}
          </button>
          <NavLink
            to="/settings"
            title="Settings"
            aria-label="Open settings"
            className={({ isActive }) =>
              `grid h-8 w-8 place-items-center rounded-full font-mono text-[10px] font-semibold transition-colors ${
                isActive
                  ? 'bg-brand text-white'
                  : 'bg-brand-soft text-brand hover:ring-2 hover:ring-brand/20'
              }`
            }
          >
            {profile.initials}
          </NavLink>
        </div>
      </div>

      <nav className="flex items-center gap-5 overflow-x-auto px-5 pb-3 no-scrollbar md:hidden">
        <NavLink
          to="/"
          end
          className={({ isActive }) =>
            `whitespace-nowrap ${linkClass(isActive)}`
          }
        >
          Today
        </NavLink>
        <NavLink
          to="/courses"
          className={({ isActive }) =>
            `whitespace-nowrap ${linkClass(isActive)}`
          }
        >
          Courses
        </NavLink>
        <RoundsMenu mobile />
        <NavLink
          to="/group"
          className={({ isActive }) =>
            `whitespace-nowrap ${linkClass(isActive)}`
          }
        >
          Group
        </NavLink>
        <NavLink
          to="/settings"
          className={({ isActive }) =>
            `whitespace-nowrap ${linkClass(isActive)}`
          }
        >
          Settings
        </NavLink>
      </nav>
    </header>
  );
}
