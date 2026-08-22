import { useEffect, useRef, useState } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import { ChevronDown, MapPin } from 'lucide-react';
import { hasStoredRound } from '../lib/golfTracker';
import { loadGolfProfile } from '../lib/golfProfile';
import { needsQuestionnaire } from '../lib/questionnaire';
import { useAuth } from '../lib/auth';
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
    hint: 'Live ranging · keeps running',
  },
] as const;

function RoundsMenu({ mobile = false }: { mobile?: boolean }) {
  const location = useLocation();
  const [open, setOpen] = useState(false);
  const [liveRound, setLiveRound] = useState(() => hasStoredRound());
  const rootRef = useRef<HTMLDivElement>(null);
  const roundsActive = location.pathname.startsWith('/rounds');

  useEffect(() => {
    setOpen(false);
  }, [location.pathname]);

  useEffect(() => {
    const sync = () => setLiveRound(hasStoredRound());
    window.addEventListener('teeready-round-changed', sync);
    window.addEventListener('focus', sync);
    return () => {
      window.removeEventListener('teeready-round-changed', sync);
      window.removeEventListener('focus', sync);
    };
  }, []);

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
    <div ref={rootRef} className="relative">
      <button
        type="button"
        aria-expanded={open}
        aria-haspopup="menu"
        onClick={() => setOpen((v) => !v)}
        className={`nav-link inline-flex items-center gap-1 ${mobile ? 'whitespace-nowrap' : ''}`}
        aria-current={roundsActive ? 'page' : undefined}
      >
        Rounds
        {liveRound ? (
          <span
            className="ml-0.5 inline-block h-1.5 w-1.5 rounded-full bg-accent"
            title="Round running in background"
            aria-label="Round live"
          />
        ) : null}
        <ChevronDown
          className={`h-3.5 w-3.5 transition-transform ${open ? 'rotate-180' : ''}`}
          strokeWidth={2.2}
        />
      </button>

      {open ? (
        <div
          role="menu"
          className={`absolute z-40 overflow-hidden rounded-card border border-line bg-surface shadow-lift ${
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

function NavItem({
  to,
  children,
  mobile = false,
}: {
  to: string;
  children: React.ReactNode;
  mobile?: boolean;
}) {
  return (
    <NavLink
      to={to}
      className={`${mobile ? 'whitespace-nowrap ' : ''}nav-link`}
    >
      {children}
    </NavLink>
  );
}

export function TopNav({
  locationLabel = CURRENT_LOCATION,
  onLocationClick,
}: Props) {
  const { user } = useAuth();
  const [profile, setProfile] = useState<DisplayProfile>(() =>
    loadDisplayProfile(),
  );
  const [needsQ, setNeedsQ] = useState(false);

  useEffect(() => {
    const refresh = () => {
      setProfile(loadDisplayProfile());
      const golf = loadGolfProfile();
      setNeedsQ(golf ? needsQuestionnaire(golf) : true);
    };
    refresh();
    window.addEventListener('focus', refresh);
    window.addEventListener('teeready-display-changed', refresh);
    window.addEventListener('teeready-profile-changed', refresh);
    return () => {
      window.removeEventListener('focus', refresh);
      window.removeEventListener('teeready-display-changed', refresh);
      window.removeEventListener('teeready-profile-changed', refresh);
    };
  }, []);

  return (
    <header className="sticky top-0 z-30 border-b border-line bg-[color-mix(in_srgb,var(--canvas)_94%,transparent)] backdrop-blur-md">
      <div className="mx-auto flex w-full max-w-[1400px] items-center justify-between px-5 py-3.5 md:px-8">
        <div className="flex items-center gap-8">
          <NavLink to="/today" className="group flex items-center gap-2.5">
            <span className="grid h-9 w-9 place-items-center rounded-full border border-line bg-surface font-display text-[15px] font-bold text-brand shadow-card">
              T
            </span>
            <span className="font-display text-[18px] font-semibold tracking-[-0.02em] text-ink group-hover:text-brand">
              TeeReady
            </span>
          </NavLink>
          <nav className="hidden items-center gap-6 md:flex">
            <NavItem to="/today">Today</NavItem>
            <NavItem to="/courses">Courses</NavItem>
            <RoundsMenu />
            <NavItem to="/stats">Stats</NavItem>
            <NavItem to="/profile">Profile</NavItem>
            <NavItem to="/group">Social</NavItem>
            <NavItem to="/settings">Settings</NavItem>
          </nav>
        </div>

        <div className="flex items-center gap-2.5">
          <button
            type="button"
            onClick={onLocationClick}
            className="inline-flex items-center gap-1.5 rounded-pill border border-line bg-surface px-3 py-2 text-[12px] font-medium text-muted shadow-card hover:text-ink"
          >
            <MapPin className="h-3.5 w-3.5 text-accent" strokeWidth={2.2} />
            {locationLabel}
          </button>
          <NavLink
            to={needsQ ? '/questionnaire' : '/settings'}
            title={user?.email ? `Account · ${user.email}` : 'Settings'}
            aria-label={needsQ ? 'Complete questionnaire' : 'Open settings'}
            className={({ isActive }) =>
              `relative grid h-9 w-9 place-items-center rounded-full border font-mono text-[10px] font-semibold transition-colors ${
                isActive
                  ? 'border-brand bg-brand text-white'
                  : 'border-line bg-surface text-brand shadow-card hover:border-brand/40'
              }`
            }
          >
            {profile.initials}
            {needsQ ? (
              <span
                className="absolute -bottom-0.5 -right-0.5 h-2 w-2 rounded-full bg-bad ring-2 ring-[var(--canvas)]"
                aria-label="Questionnaire incomplete"
              />
            ) : user ? (
              <span
                className="absolute -bottom-0.5 -right-0.5 h-2 w-2 rounded-full bg-accent ring-2 ring-[var(--canvas)]"
                aria-hidden
              />
            ) : null}
          </NavLink>
        </div>
      </div>

      <nav className="flex items-center gap-5 overflow-x-auto border-t border-line/60 px-5 py-2.5 no-scrollbar md:hidden">
        <NavItem to="/today" mobile>
          Today
        </NavItem>
        <NavItem to="/courses" mobile>
          Courses
        </NavItem>
        <RoundsMenu mobile />
        <NavItem to="/stats" mobile>
          Stats
        </NavItem>
        <NavItem to="/profile" mobile>
          Profile
        </NavItem>
        <NavItem to="/group" mobile>
          Social
        </NavItem>
        <NavItem to="/settings" mobile>
          Settings
        </NavItem>
      </nav>
    </header>
  );
}
