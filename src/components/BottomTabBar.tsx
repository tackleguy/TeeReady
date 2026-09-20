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
      path === '/today' || path === '/weather',
    icon: Home,
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
 * Play tab resumes a live GPS round when one exists; otherwise opens Courses
 * so you explicitly choose Prep or GPS for a course — never flips modes mid-round.
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
            <span className="bottom-tab-label">{label}</span>
          </NavLink>
        );
      })}
    </nav>
  );
}
