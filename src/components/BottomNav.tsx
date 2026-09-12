import { NavLink, useLocation } from 'react-router-dom';
import {
  Activity,
  Crosshair,
  Home,
  Users,
  Video,
} from 'lucide-react';
import { useEffect, useState } from 'react';
import { hasStoredRound } from '../lib/golfTracker';
import { prefetchRoute } from '../lib/prefetchRoutes';

const TABS = [
  {
    label: 'Home',
    to: '/today',
    icon: Home,
    match: (path: string) =>
      path === '/today' ||
      path === '/weather' ||
      path === '/courses' ||
      path.startsWith('/courses/'),
    prefetch: '/today',
    tutorial: 'today',
  },
  {
    label: 'GPS',
    to: '/rounds/gps',
    icon: Crosshair,
    match: (path: string) => path.startsWith('/rounds'),
    prefetch: '/rounds/gps',
    tutorial: 'play',
  },
  {
    label: 'AI Swing',
    to: '/swing',
    icon: Video,
    match: (path: string) => path.startsWith('/swing'),
    prefetch: '/swing',
    tutorial: 'progress',
  },
  {
    label: 'Social',
    to: '/group',
    icon: Users,
    match: (path: string) => path.startsWith('/group'),
    prefetch: '/group',
    tutorial: 'social',
  },
  {
    label: 'Stats',
    to: '/stats',
    icon: Activity,
    match: (path: string) => path.startsWith('/stats'),
    prefetch: '/stats',
    tutorial: 'stats',
  },
] as const;

export function BottomNav() {
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
    <nav className="bottom-nav" aria-label="Primary" data-tutorial="bottom-nav">
      <div className="bottom-nav-inner">
        {TABS.map((tab) => {
          const Icon = tab.icon;
          const active = tab.match(location.pathname);
          const showLive = tab.to === '/rounds/gps' && liveRound;
          return (
            <NavLink
              key={tab.to}
              to={tab.to}
              data-tutorial={tab.tutorial}
              onMouseEnter={() => prefetchRoute(tab.prefetch)}
              onFocus={() => prefetchRoute(tab.prefetch)}
              aria-current={active ? 'page' : undefined}
              className={`bottom-nav-item ${active ? 'is-active' : ''}`}
            >
              <span className="bottom-nav-icon-wrap">
                <Icon
                  className="h-5 w-5"
                  strokeWidth={active ? 2.4 : 2}
                  aria-hidden
                />
                {showLive ? (
                  <span
                    className="bottom-nav-live"
                    aria-label="Round in progress"
                  />
                ) : null}
              </span>
              <span className="bottom-nav-label">
                {showLive && active ? 'Play' : tab.label}
              </span>
            </NavLink>
          );
        })}
      </div>
    </nav>
  );
}
