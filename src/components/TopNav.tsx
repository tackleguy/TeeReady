import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { NavLink, useLocation } from 'react-router-dom';
import { ChevronDown, MapPin, PanelLeft } from 'lucide-react';
import { hasStoredRound } from '../lib/golfTracker';
import { loadGolfProfile } from '../lib/golfProfile';
import { needsQuestionnaire } from '../lib/questionnaire';
import { useAuth } from '../lib/auth';
import { prefetchRoute } from '../lib/prefetchRoutes';
import {
  CURRENT_LOCATION,
  loadDisplayProfile,
  type DisplayProfile,
} from '../lib/mock';

interface Props {
  locationLabel?: string;
  onLocationClick?: () => void;
  onOpenSidebar?: () => void;
}

const ROUNDS_LINKS = [
  {
    label: 'Prep',
    href: '/rounds/prep',
    hint: 'Miss lines · yardages',
  },
  {
    label: 'GPS',
    href: '/rounds/gps',
    hint: 'Live ranging · keeps running',
  },
] as const;

function useMenuDismiss(
  open: boolean,
  onClose: () => void,
  triggerRef: React.RefObject<HTMLElement | null>,
  menuRef: React.RefObject<HTMLElement | null>,
) {
  useEffect(() => {
    if (!open) return;
    const onDoc = (e: PointerEvent) => {
      const t = e.target as Node;
      if (triggerRef.current?.contains(t) || menuRef.current?.contains(t)) {
        return;
      }
      onClose();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    // Defer so the opening tap/click does not immediately dismiss.
    const id = window.setTimeout(() => {
      document.addEventListener('pointerdown', onDoc);
    }, 0);
    document.addEventListener('keydown', onKey);
    return () => {
      window.clearTimeout(id);
      document.removeEventListener('pointerdown', onDoc);
      document.removeEventListener('keydown', onKey);
    };
  }, [open, onClose, triggerRef, menuRef]);
}

function MenuPortal({
  open,
  triggerRef,
  menuRef,
  align = 'left',
  children,
}: {
  open: boolean;
  triggerRef: React.RefObject<HTMLElement | null>;
  menuRef: React.RefObject<HTMLDivElement | null>;
  align?: 'left' | 'right';
  children: React.ReactNode;
}) {
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);

  useLayoutEffect(() => {
    if (!open) {
      setPos(null);
      return;
    }
    const update = () => {
      const el = triggerRef.current;
      if (!el) return;
      const r = el.getBoundingClientRect();
      const menuWidth = menuRef.current?.offsetWidth ?? 220;
      let left =
        align === 'right' ? r.right - menuWidth : r.left;
      left = Math.max(8, Math.min(left, window.innerWidth - menuWidth - 8));
      setPos({ top: r.bottom + 8, left });
    };
    update();
    // Re-measure after paint once menu width is known.
    const raf = window.requestAnimationFrame(update);
    window.addEventListener('resize', update);
    // Capture scroll from overflow-x nav and page scroll.
    window.addEventListener('scroll', update, true);
    return () => {
      window.cancelAnimationFrame(raf);
      window.removeEventListener('resize', update);
      window.removeEventListener('scroll', update, true);
    };
  }, [open, triggerRef, menuRef, align]);

  if (!open || !pos || typeof document === 'undefined') return null;

  return createPortal(
    <div
      ref={menuRef as React.RefObject<HTMLDivElement>}
      role="menu"
      style={{ top: pos.top, left: pos.left }}
      className="fixed z-[60] min-w-[200px] overflow-hidden rounded-card border border-line bg-surface shadow-lift"
    >
      {children}
    </div>,
    document.body,
  );
}

function RoundsMenu({ mobile = false }: { mobile?: boolean }) {
  const location = useLocation();
  const [open, setOpen] = useState(false);
  const [liveRound, setLiveRound] = useState(() => hasStoredRound());
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  useMenuDismiss(open, () => setOpen(false), triggerRef, menuRef);
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

  return (
    <div className="relative" data-tutorial="rounds">
      <button
        ref={triggerRef}
        type="button"
        aria-expanded={open}
        aria-haspopup="menu"
        onClick={() => setOpen((v) => !v)}
        onMouseEnter={() => prefetchRoute('/rounds/prep')}
        onFocus={() => prefetchRoute('/rounds/prep')}
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

      <MenuPortal
        open={open}
        triggerRef={triggerRef}
        menuRef={menuRef}
        align="left"
      >
        {ROUNDS_LINKS.map((item) => (
          <NavLink
            key={item.href}
            to={item.href}
            role="menuitem"
            onClick={() => setOpen(false)}
            onMouseEnter={() => prefetchRoute(item.href)}
            onFocus={() => prefetchRoute(item.href)}
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
      </MenuPortal>
    </div>
  );
}

function NavItem({
  to,
  children,
  mobile = false,
  tutorialId,
}: {
  to: string;
  children: React.ReactNode;
  mobile?: boolean;
  tutorialId?: string;
}) {
  return (
    <NavLink
      to={to}
      data-tutorial={tutorialId}
      onMouseEnter={() => prefetchRoute(to)}
      onFocus={() => prefetchRoute(to)}
      className={`${mobile ? 'whitespace-nowrap ' : ''}nav-link`}
    >
      {children}
    </NavLink>
  );
}

export function TopNav({
  locationLabel = CURRENT_LOCATION,
  onLocationClick,
  onOpenSidebar,
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
    <header className="sticky top-0 z-30 border-b border-line bg-[color-mix(in_srgb,var(--canvas)_94%,transparent)] pt-[env(safe-area-inset-top)] backdrop-blur-md">
      <div className="mx-auto flex w-full max-w-[1400px] items-center justify-between px-5 py-3 md:px-8">
        <div className="flex items-center gap-3 md:gap-7">
          {onOpenSidebar ? (
            <button
              type="button"
              onClick={onOpenSidebar}
              className="grid h-9 w-9 place-items-center rounded-full border border-line bg-surface text-muted shadow-card hover:text-ink md:hidden"
              aria-label="Open menu"
            >
              <PanelLeft className="h-4 w-4" strokeWidth={2.2} />
            </button>
          ) : null}
          <NavLink to="/today" className="group flex items-center gap-2.5">
            <span className="grid h-9 w-9 place-items-center rounded-full border border-line bg-surface font-display text-[15px] font-bold text-brand shadow-card">
              T
            </span>
            <span className="font-display text-[18px] font-semibold tracking-[-0.02em] text-ink group-hover:text-brand">
              TeeReady
            </span>
          </NavLink>
          <nav className="hidden items-center gap-5 md:flex">
            <NavItem to="/today" tutorialId="today">
              Today
            </NavItem>
            <NavItem to="/courses" tutorialId="courses">
              Courses
            </NavItem>
            <RoundsMenu />
            <NavItem to="/stats" tutorialId="stats">
              Stats
            </NavItem>
            <NavItem to="/swing">Swing</NavItem>
          </nav>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={onLocationClick}
            className="inline-flex max-w-[9.5rem] items-center gap-1.5 truncate rounded-pill border border-line bg-surface px-3 py-1.5 text-[12px] font-medium text-muted shadow-card hover:text-ink sm:max-w-none"
          >
            <MapPin className="h-3.5 w-3.5 shrink-0 text-accent" strokeWidth={2.2} />
            <span className="truncate">{locationLabel}</span>
          </button>
          <NavLink
            to={needsQ ? '/questionnaire' : '/settings'}
            title={user?.email ? `Account · ${user.email}` : 'Settings'}
            aria-label={needsQ ? 'Complete questionnaire' : 'Open settings'}
            className={({ isActive }) =>
              `relative grid h-9 w-9 place-items-center rounded-full border font-mono text-[11px] font-semibold transition-colors ${
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

      <nav className="flex items-center gap-4 overflow-x-auto border-t border-line/60 px-5 py-2 no-scrollbar md:hidden">
        <NavItem to="/today" mobile tutorialId="today">
          Today
        </NavItem>
        <NavItem to="/courses" mobile tutorialId="courses">
          Courses
        </NavItem>
        <RoundsMenu mobile />
        <NavItem to="/stats" mobile tutorialId="stats">
          Stats
        </NavItem>
        <NavItem to="/swing" mobile>
          Swing
        </NavItem>
      </nav>
    </header>
  );
}
