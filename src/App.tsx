import { Suspense, lazy, useEffect, useState } from 'react';
import {
  BrowserRouter,
  Navigate,
  Route,
  Routes,
  useLocation,
} from 'react-router-dom';
import { InstallPrompt } from './components/InstallPrompt';
import { ThemeBoot } from './components/ThemeBoot';
import { TopNav } from './components/TopNav';
import { SearchBar } from './components/radar/SearchBar';
import { hasStoredRound } from './lib/golfTracker';
import { CURRENT_LOCATION } from './lib/mock';
import { applyTheme, loadTheme } from './lib/theme';
import { AuthProvider } from './lib/auth';
import { CoursesView } from './routes/CoursesView';
import { GroupView } from './routes/GroupView';
import { SettingsView } from './routes/SettingsView';
import { TodayView } from './routes/TodayView';

applyTheme(loadTheme());

const GolfView = lazy(() =>
  import('./routes/GolfView').then((m) => ({ default: m.GolfView })),
);

function RouteFallback() {
  return (
    <div
      className="flex min-h-[40vh] items-center justify-center"
      aria-busy="true"
      aria-label="Loading"
    >
      <div className="h-2 w-32 overflow-hidden rounded-full bg-brand-soft">
        <div className="h-full w-1/3 animate-[shimmer_1.6s_linear_infinite] bg-[color-mix(in_srgb,var(--brand)_40%,transparent)]" />
      </div>
    </div>
  );
}

function Shell() {
  const location = useLocation();
  const isRounds = location.pathname.startsWith('/rounds');
  const [place, setPlace] = useState(CURRENT_LOCATION);
  const [pickingLocation, setPickingLocation] = useState(false);
  // Keep Rounds mounted after first visit (or if a round is already live)
  // so GPS / scorecard state survive navigating to Today, Settings, etc.
  const [keepRoundsAlive, setKeepRoundsAlive] = useState(() =>
    hasStoredRound(),
  );

  useEffect(() => {
    if (isRounds) setKeepRoundsAlive(true);
  }, [isRounds]);

  useEffect(() => {
    const onRound = (e: Event) => {
      const detail = (e as CustomEvent<unknown>).detail;
      if (detail != null) setKeepRoundsAlive(true);
    };
    window.addEventListener('teeready-round-changed', onRound);
    return () => window.removeEventListener('teeready-round-changed', onRound);
  }, []);

  const showRoundsLayer = isRounds || keepRoundsAlive;

  return (
    <div className="app-shell">
      <ThemeBoot />
      <TopNav
        locationLabel={place}
        onLocationClick={() => setPickingLocation((v) => !v)}
      />

      {pickingLocation ? (
        <div className="mx-auto w-full max-w-[1400px] px-5 pb-2 pt-3 md:px-8">
          <div className="max-w-md rounded-card border border-line bg-surface p-3 shadow-card">
            <SearchBar
              onPick={(pick) => {
                const short =
                  pick.label.split(',')[0]?.trim() || pick.label;
                setPlace(short);
                setPickingLocation(false);
                try {
                  const cities = [
                    {
                      name: short,
                      latitude: pick.lat,
                      longitude: pick.lon,
                      isCurrent: true,
                    },
                  ];
                  localStorage.setItem('cities-v1', JSON.stringify(cities));
                } catch {
                  // ignore
                }
              }}
            />
          </div>
        </div>
      ) : null}

      <main className={isRounds ? 'app-main rounds' : 'app-main'}>
        {showRoundsLayer ? (
          <div
            className={
              isRounds ? 'rounds-keepalive is-active' : 'rounds-keepalive'
            }
            data-active={isRounds ? 'true' : 'false'}
            aria-hidden={!isRounds}
          >
            <Suspense fallback={isRounds ? <RouteFallback /> : null}>
              <GolfView active={isRounds} />
            </Suspense>
          </div>
        ) : null}

        <Suspense fallback={isRounds ? null : <RouteFallback />}>
          <Routes>
            <Route path="/" element={<TodayView />} />
            <Route path="/courses" element={<CoursesView />} />
            <Route path="/group" element={<GroupView />} />
            <Route path="/settings" element={<SettingsView />} />
            <Route
              path="/rounds"
              element={<Navigate to="/rounds/prep" replace />}
            />
            {/* GolfView is keep-alive mounted above; this route only holds the URL. */}
            <Route path="/rounds/:mode" element={null} />
            <Route
              path="/golf"
              element={<Navigate to="/rounds/prep" replace />}
            />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </Suspense>
      </main>
      <InstallPrompt />
    </div>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <Shell />
      </AuthProvider>
    </BrowserRouter>
  );
}
