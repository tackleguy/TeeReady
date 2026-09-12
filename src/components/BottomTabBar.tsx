import { NavLink, useLocation } from 'react-router-dom';
import {
  ChartColumn,
  Home,
  MapPinned,
  Users,
  Video,
} from 'lucide-react';
import { hasStoredRound } from '../lib/golfTracker';
import { prefetchRoute } from '../lib/prefetchRoutes';
import { useEffect, useState } from 'react';

const TABS = [
  {
    id: 'home',
    label: 'Home',
    to: '/today',
    match: (path: string) =>
      path === '/today' || path === '/weather' || path === '/courses',
    icon: Home,
  },
  {
    id: 'gps',
    label: 'GPS',
    to: '/rounds/gps',
    match: (path: string) => path.startsWith('/rounds'),
    icon: MapPinned,
  },
  {
    id: 'swing',
    label: 'AI Swing',
    to: '/swing',
    match: (path: string) => path.startsWith('/swing'),
    icon: Video,
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
 * Mobile-first primary navigation.
 * GPS tab resumes a live round when one exists; otherwise opens prep to start.
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
          tab.id === 'gps' ? (liveRound ? '/rounds/gps' : '/rounds/prep') : tab.to;

        return (
          <NavLink
            key={tab.id}
            to={href}
            onMouseEnter={() => prefetchRoute(href)}
            onFocus={() => prefetchRoute(href)}
            className={`bottom-tab ${active ? 'is-active' : ''}`}
            aria-current={active ? 'page' : undefined}
          >
            <span className="bottom-tab-icon-wrap">
              <Icon className="bottom-tab-icon" strokeWidth={active ? 2.4 : 2} aria-hidden />
              {tab.id === 'gps' && liveRound ? (
                <span className="bottom-tab-live" aria-label="Round live" />
              ) : null}
            </span>
            <span className="bottom-tab-label">{tab.label}</span>
          </NavLink>
        );
      })}
    </nav>
  );
}
