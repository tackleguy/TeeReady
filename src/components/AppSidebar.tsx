import { useEffect, useRef } from 'react';
import { NavLink } from 'react-router-dom';
import {
  CloudSun,
  Flag,
  Map,
  Settings,
  UserRound,
  X,
} from 'lucide-react';
import { prefetchRoute } from '../lib/prefetchRoutes';
import { useFocusTrap } from '../hooks/useFocusTrap';

export const SIDE_LINKS = [
  { label: 'Profile', href: '/profile', icon: UserRound },
  { label: 'Courses', href: '/courses', icon: Map },
  { label: 'Weather', href: '/weather', icon: CloudSun },
  { label: 'Prep round', href: '/rounds/prep', icon: Flag },
  { label: 'Settings', href: '/settings', icon: Settings },
] as const;

interface Props {
  open: boolean;
  onClose: () => void;
  /** Desktop rail — hide on full-bleed map/GPS so the main view stays focused. */
  showRail?: boolean;
}

function SideNav({ onNavigate }: { onNavigate?: () => void }) {
  return (
    <nav className="flex flex-1 flex-col gap-0.5">
      {SIDE_LINKS.map(({ label, href, icon: Icon }) => (
        <NavLink
          key={href}
          to={href}
          onClick={onNavigate}
          onMouseEnter={() => prefetchRoute(href)}
          onFocus={() => prefetchRoute(href)}
          className={({ isActive }) =>
            `app-sidebar-link ${isActive ? 'is-active' : ''}`
          }
        >
          <Icon className="h-4 w-4 shrink-0" strokeWidth={2} aria-hidden />
          {label}
        </NavLink>
      ))}
    </nav>
  );
}

export function AppSidebar({ open, onClose, showRail = true }: Props) {
  const panelRef = useRef<HTMLElement>(null);
  useFocusTrap(open, panelRef, onClose);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  return (
    <>
      {showRail ? (
        <aside className="app-sidebar hidden lg:flex" aria-label="More">
          <p className="app-sidebar-label">More</p>
          <SideNav />
        </aside>
      ) : null}

      {open ? (
        <div className="app-sidebar-drawer lg:hidden">
          <button
            type="button"
            className="app-sidebar-backdrop"
            aria-label="Close menu"
            onClick={onClose}
          />
          <aside
            ref={panelRef}
            className="app-sidebar-panel"
            role="dialog"
            aria-modal="true"
            aria-labelledby="app-sidebar-title"
          >
            <div className="flex items-center justify-between px-4 pb-3 pt-[max(1rem,env(safe-area-inset-top))]">
              <p id="app-sidebar-title" className="text-[13px] font-semibold text-ink">
                More
              </p>
              <button
                type="button"
                onClick={onClose}
                className="grid h-11 w-11 place-items-center rounded-full text-muted hover:bg-canvas hover:text-ink"
                aria-label="Close menu"
              >
                <X className="h-4 w-4" aria-hidden />
              </button>
            </div>
            <div className="px-2 pb-[max(1.5rem,env(safe-area-inset-bottom))]">
              <SideNav onNavigate={onClose} />
            </div>
          </aside>
        </div>
      ) : null}
    </>
  );
}
