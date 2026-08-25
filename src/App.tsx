import { Component, useEffect, useState, type ReactNode } from 'react';
import {
  BrowserRouter,
  Navigate,
  Route,
  Routes,
  useLocation,
} from 'react-router-dom';
import { AppSidebar } from './components/AppSidebar';
import { InstallPrompt } from './components/InstallPrompt';
import { SearchBar } from './components/radar/SearchBar';
import { ThemeBoot } from './components/ThemeBoot';
import { TopNav } from './components/TopNav';
import { AppTutorial } from './components/tutorial/AppTutorial';
import { AuthProvider, useAuth } from './lib/auth';
import { CURRENT_LOCATION } from './lib/mock';
import { applyTheme, loadTheme } from './lib/theme';
import { defaultSearchLoc, saveSearchLoc } from './lib/searchLoc';
import { loadGreenMeshManifest } from './lib/golfGreen3d';
import { CourseMapView } from './routes/CourseMapView';
import { CoursesView } from './routes/CoursesView';
import { GroupView } from './routes/GroupView';
import { GolfView } from './routes/GolfView';
import { HomeLanding } from './routes/HomeLanding';
import { ProfileView } from './routes/ProfileView';
import { QuestionnaireView } from './routes/QuestionnaireView';
import { SettingsView } from './routes/SettingsView';
import { StatsView } from './routes/StatsView';
import { SwingGuideView } from './routes/SwingGuideView';
import { SwingView } from './routes/SwingView';
import { UiAuditPreview } from './routes/UiAuditPreview';
import { TodayView } from './routes/TodayView';

applyTheme(loadTheme());

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

class RoundsErrorBoundary extends Component<
  { children: ReactNode },
  { error: Error | null }
> {
  state: { error: Error | null } = { error: null };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  render() {
    if (this.state.error) {
      return (
        <div className="flex min-h-[50vh] flex-col items-center justify-center gap-3 px-6 text-center">
          <p className="text-[15px] font-semibold text-ink">
            Rounds couldn&apos;t load
          </p>
          <p className="max-w-md text-[13px] text-muted">
            {this.state.error.message}
          </p>
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="rounded-xl bg-brand px-4 py-2 text-[13px] font-bold text-white"
          >
            Reload
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

function RequireAuth({ children }: { children: ReactNode }) {
  const { configured, loading, user } = useAuth();
  const location = useLocation();

  if (!configured) {
    return <Navigate to="/" replace state={{ from: location }} />;
  }
  if (loading) {
    return <RouteFallback />;
  }
  if (!user) {
    return <Navigate to="/" replace state={{ from: location }} />;
  }
  return <>{children}</>;
}

function PublicHome() {
  const { configured, loading, user } = useAuth();
  if (loading) return <RouteFallback />;
  if (configured && user) {
    return <Navigate to="/today" replace />;
  }
  return <HomeLanding />;
}

function RoundsPage() {
  return (
    <RoundsErrorBoundary>
      <GolfView active />
    </RoundsErrorBoundary>
  );
}

function Shell() {
  const location = useLocation();
  const { user } = useAuth();
  const isLanding = location.pathname === '/';
  const isRounds = location.pathname.startsWith('/rounds');
  const isCourseMap = location.pathname.startsWith('/courses/map');
  const isCourses = location.pathname === '/courses';
  const [place, setPlace] = useState(() => defaultSearchLoc().name || CURRENT_LOCATION);
  const [pickingLocation, setPickingLocation] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);

  useEffect(() => {
    loadGreenMeshManifest().catch(() => {});
  }, []);

  useEffect(() => {
    setSidebarOpen(false);
  }, [location.pathname]);

  useEffect(() => {
    const sync = () => setPlace(defaultSearchLoc().name || CURRENT_LOCATION);
    window.addEventListener('teeready-location-changed', sync);
    window.addEventListener('teeready-profile-changed', sync);
    return () => {
      window.removeEventListener('teeready-location-changed', sync);
      window.removeEventListener('teeready-profile-changed', sync);
    };
  }, []);

  const showAppChrome = Boolean(user) && !isLanding;
  const fullBleedMain = isRounds || isCourseMap || isCourses;
  const showSideRail = showAppChrome && !isRounds && !isCourseMap;

  return (
    <div className={`app-shell ${showSideRail ? 'has-sidebar' : ''}`}>
      <ThemeBoot />
      {showAppChrome ? (
        <TopNav
          locationLabel={place}
          onLocationClick={() => setPickingLocation((v) => !v)}
          onOpenSidebar={() => setSidebarOpen(true)}
        />
      ) : null}

      {pickingLocation && showAppChrome ? (
        <div className="mx-auto w-full max-w-[1400px] px-5 pb-2 pt-3 md:px-8">
          <div className="max-w-md rounded-card border border-line bg-surface p-3 shadow-card">
            <SearchBar
              onPick={(pick) => {
                const short =
                  pick.label.split(',')[0]?.trim() || pick.label;
                saveSearchLoc({
                  name: short,
                  lat: pick.lat,
                  lon: pick.lon,
                });
                setPlace(short);
                setPickingLocation(false);
              }}
            />
          </div>
        </div>
      ) : null}

      <div className={showAppChrome ? 'app-body' : undefined}>
        {showAppChrome ? (
          <AppSidebar
            open={sidebarOpen}
            onClose={() => setSidebarOpen(false)}
            showRail={showSideRail}
          />
        ) : null}

        <main
          className={
            fullBleedMain && showAppChrome
              ? 'app-main rounds'
              : isLanding
                ? 'app-main landing'
                : 'app-main'
          }
        >
        <Routes>
          <Route path="/" element={<PublicHome />} />
          <Route path="/dev/ui-audit" element={<UiAuditPreview />} />
          <Route
            path="/today"
            element={
              <RequireAuth>
                <TodayView />
              </RequireAuth>
            }
          />
          <Route
            path="/courses/map"
            element={
              <RequireAuth>
                <CourseMapView />
              </RequireAuth>
            }
          />
          <Route
            path="/courses"
            element={
              <RequireAuth>
                <CoursesView />
              </RequireAuth>
            }
          />
          <Route
            path="/group"
            element={
              <RequireAuth>
                <GroupView />
              </RequireAuth>
            }
          />
          <Route
            path="/profile"
            element={
              <RequireAuth>
                <ProfileView />
              </RequireAuth>
            }
          />
          <Route
            path="/questionnaire"
            element={
              <RequireAuth>
                <QuestionnaireView />
              </RequireAuth>
            }
          />
          <Route
            path="/stats"
            element={
              <RequireAuth>
                <StatsView />
              </RequireAuth>
            }
          />
          <Route
            path="/swing"
            element={
              <RequireAuth>
                <SwingView />
              </RequireAuth>
            }
          />
          <Route
            path="/swing/guide"
            element={
              <RequireAuth>
                <SwingGuideView />
              </RequireAuth>
            }
          />
          <Route
            path="/settings"
            element={
              <RequireAuth>
                <SettingsView />
              </RequireAuth>
            }
          />
          <Route
            path="/rounds"
            element={
              <RequireAuth>
                <Navigate to="/rounds/prep" replace />
              </RequireAuth>
            }
          />
          <Route
            path="/rounds/*"
            element={
              <RequireAuth>
                <RoundsPage />
              </RequireAuth>
            }
          />
          <Route
            path="/golf"
            element={
              <RequireAuth>
                <Navigate to="/rounds/prep" replace />
              </RequireAuth>
            }
          />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
        </main>
      </div>
      {showAppChrome ? <InstallPrompt /> : null}
      {showAppChrome ? <AppTutorial active={showAppChrome} /> : null}
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
