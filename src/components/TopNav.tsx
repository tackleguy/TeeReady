import { NavLink } from 'react-router-dom';
import { CURRENT_LOCATION, CURRENT_USER, NAV_ITEMS } from '../lib/mock';

interface Props {
  locationLabel?: string;
  onLocationClick?: () => void;
}

export function TopNav({
  locationLabel = CURRENT_LOCATION,
  onLocationClick,
}: Props) {
  return (
    <header className="sticky top-0 z-30 border-b border-line bg-canvas/92 backdrop-blur">
      <div className="mx-auto flex w-full max-w-[1400px] items-center justify-between px-5 py-4 md:px-8">
        <div className="flex items-center gap-7">
          <NavLink
            to="/"
            className="text-[17px] font-bold tracking-[-0.02em] text-ink"
          >
            TeeReady
          </NavLink>
          <nav className="hidden items-center gap-5 md:flex">
            {NAV_ITEMS.map((item) => (
              <NavLink
                key={item.href}
                to={item.href}
                end={item.href === '/'}
                className={({ isActive }) =>
                  `text-[13px] transition-colors ${
                    isActive
                      ? 'font-semibold text-brand'
                      : 'font-medium text-muted hover:text-ink'
                  }`
                }
              >
                {item.label}
              </NavLink>
            ))}
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
          <div className="grid h-8 w-8 place-items-center rounded-full bg-brand-soft font-mono text-[10px] font-semibold text-brand">
            {CURRENT_USER.initials}
          </div>
        </div>
      </div>

      <nav className="flex gap-5 overflow-x-auto px-5 pb-3 no-scrollbar md:hidden md:px-8">
        {NAV_ITEMS.map((item) => (
          <NavLink
            key={item.href}
            to={item.href}
            end={item.href === '/'}
            className={({ isActive }) =>
              `whitespace-nowrap text-[13px] ${
                isActive
                  ? 'font-semibold text-brand'
                  : 'font-medium text-muted'
              }`
            }
          >
            {item.label}
          </NavLink>
        ))}
      </nav>
    </header>
  );
}
