import { NavLink, useLocation } from 'react-router-dom';
import { ChartColumn, CloudSun, MapPinned, Users } from 'lucide-react';
import { hasStoredRound } from '../lib/golfTracker';
import { useEffect, useState } from 'react';

const TABS = [
  {
    id: 'weather',
    label: 'Weather',
    to: '/weather',
    match: (path: string) => path === '/weather' || path === '/today',
    icon: CloudSun,
  },
  {
    id: 'gps',
    label: 'Play',
    to: '/courses',
    match: (path: string) =>
      path.startsWith('/rounds') || path.startsWith('/courses'),
    icon: MapPinned,
  },
  {
    id: 'social',
    label: 'Social',
    to: '/group',
    match: (path: string) => path.startsWith('/group'),
    icon: Users,
  },
  {
    id: 'stats',
    label: 'Stats',
    to: '/stats',
    match: (path: string) => path.startsWith('/stats'),
    icon: ChartColumn,
  },
] as const;

/**
 * Primary IA — Weather | Play | Social | Stats.
 * Weather is the product home; AI Swing stays out of the tab bar.
 */
export function BottomTabBar() {
  const location = useLocation();
  const [liveRound, setLiveRound] = useState(() => hasStoredRound());

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
    <nav
      className="bottom-tab-bar"
      aria-label="Primary"
      data-tutorial="bottom-tabs"
    >
      {TABS.map((tab) => {
        const Icon = tab.icon;
        const active = tab.match(location.pathname);
        const href =
          tab.id === 'gps' ? (liveRound ? '/rounds/gps' : '/courses') : tab.to;
        const label = tab.id === 'gps' && liveRound ? 'GPS' : tab.label;

        return (
          <NavLink
            key={tab.id}
            to={href}
            className={`bottom-tab ${active ? 'is-active' : ''}`}
            aria-current={active ? 'page' : undefined}
            data-tutorial={tab.id === 'gps' ? 'play' : undefined}
          >
            <span className="bottom-tab-icon-wrap">
              <Icon
                className="bottom-tab-icon"
                strokeWidth={active ? 2.4 : 2}
                aria-hidden
              />
              {tab.id === 'gps' && liveRound ? (
                <span className="bottom-tab-live" aria-label="Round live" />
              ) : null}
            </span>
            <span className="bottom-tab-label">{label}</span>
          </NavLink>
        );
      })}
    </nav>
  );
}
