import { useEffect } from 'react';
import { NavLink } from 'react-router-dom';
import { Settings, UserRound, Users, X } from 'lucide-react';
import { prefetchRoute } from '../lib/prefetchRoutes';

export const SIDE_LINKS = [
  { label: 'Profile', href: '/profile', icon: UserRound },
  { label: 'Social', href: '/group', icon: Users },
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
          <Icon className="h-4 w-4 shrink-0" strokeWidth={2} />
          {label}
        </NavLink>
      ))}
    </nav>
  );
}

export function AppSidebar({ open, onClose, showRail = true }: Props) {
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
        <aside className="app-sidebar hidden md:flex" aria-label="More">
          <p className="app-sidebar-label">Account</p>
          <SideNav />
        </aside>
      ) : null}

      {open ? (
        <div className="app-sidebar-drawer md:hidden" role="dialog" aria-modal>
          <button
            type="button"
            className="app-sidebar-backdrop"
            aria-label="Close menu"
            onClick={onClose}
          />
          <aside className="app-sidebar-panel">
            <div className="flex items-center justify-between px-4 pb-3 pt-[max(1rem,env(safe-area-inset-top))]">
              <p className="text-[13px] font-semibold text-ink">Account</p>
              <button
                type="button"
                onClick={onClose}
                className="grid h-8 w-8 place-items-center rounded-full text-muted hover:bg-canvas hover:text-ink"
                aria-label="Close"
              >
                <X className="h-4 w-4" />
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
