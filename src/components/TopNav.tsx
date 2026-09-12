import { useEffect, useState } from 'react';
import { NavLink } from 'react-router-dom';
import { MapPin } from 'lucide-react';
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
}

/**
 * Slim top chrome: brand, location, profile.
 * Primary IA lives in BottomTabBar (Home | GPS | AI Swing | Social | Stats).
 */
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
    <header className="sticky top-0 z-30 border-b border-line bg-[color-mix(in_srgb,var(--canvas)_94%,transparent)] pt-[env(safe-area-inset-top,0px)] backdrop-blur-md">
      <div className="mx-auto flex w-full max-w-[1400px] items-center justify-between px-4 py-2.5 sm:px-5 md:px-8">
        <NavLink
          to="/today"
          className="group flex items-center gap-2.5"
          onMouseEnter={() => prefetchRoute('/today')}
        >
          <span className="grid h-9 w-9 place-items-center rounded-full border border-line bg-surface font-display text-[15px] font-bold text-brand shadow-card">
            T
          </span>
          <span className="font-display text-[18px] font-semibold tracking-[-0.02em] text-ink group-hover:text-brand">
            TeeReady
          </span>
        </NavLink>

        <div className="flex items-center gap-2">
          <nav className="mr-1 hidden items-center gap-1 md:flex" aria-label="More">
            <NavLink
              to="/courses"
              onMouseEnter={() => prefetchRoute('/courses')}
              className="nav-link"
            >
              Courses
            </NavLink>
            <NavLink
              to="/weather"
              onMouseEnter={() => prefetchRoute('/weather')}
              className="nav-link"
            >
              Weather
            </NavLink>
            <NavLink
              to="/rounds/prep"
              onMouseEnter={() => prefetchRoute('/rounds/prep')}
              className="nav-link"
              data-tutorial="play"
            >
              Prep
            </NavLink>
          </nav>
          <button
            type="button"
            onClick={onLocationClick}
            aria-label={`Change location · ${locationLabel}`}
            className="inline-flex max-w-[8.5rem] items-center gap-1.5 truncate rounded-pill border border-line bg-surface px-3 py-1.5 text-[12px] font-medium text-muted shadow-card hover:text-ink sm:max-w-[12rem]"
          >
            <MapPin
              className="h-3.5 w-3.5 shrink-0 text-accent"
              strokeWidth={2.2}
              aria-hidden
            />
            <span className="truncate">{locationLabel}</span>
          </button>
          <NavLink
            to={needsQ ? '/questionnaire' : '/profile'}
            title={user?.email ? `Account · ${user.email}` : 'Profile'}
            aria-label={needsQ ? 'Complete questionnaire' : 'Open profile'}
            data-tutorial="profile"
            className={({ isActive }) =>
              `relative grid h-10 w-10 place-items-center rounded-full border font-mono text-[11px] font-semibold transition-colors ${
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
    </header>
  );
}
