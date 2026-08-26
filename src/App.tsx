import { Component, lazy, Suspense, useEffect, useState, type ReactNode } from 'react';
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
import { HomeLanding } from './routes/HomeLanding';
import { TodayView } from './routes/TodayView';
import { GolfView } from './routes/GolfView';
import { RouteFallback } from './components/ui/RouteFallback';

applyTheme(loadTheme());

const CourseMapView = lazy(() =>
  import('./routes/CourseMapView').then((m) => ({ default: m.CourseMapView })),
);
const CoursesView = lazy(() =>
  import('./routes/CoursesView').then((m) => ({ default: m.CoursesView })),
);
const GroupView = lazy(() =>
  import('./routes/GroupView').then((m) => ({ default: m.GroupView })),
);
const ProfileView = lazy(() =>
  import('./routes/ProfileView').then((m) => ({ default: m.ProfileView })),
);
const QuestionnaireView = lazy(() =>
  import('./routes/QuestionnaireView').then((m) => ({
    default: m.QuestionnaireView,
  })),
);
const SettingsView = lazy(() =>
  import('./routes/SettingsView').then((m) => ({ default: m.SettingsView })),
);
const StatsView = lazy(() =>
  import('./routes/StatsView').then((m) => ({ default: m.StatsView })),
);
const SwingView = lazy(() =>
  import('./routes/SwingView').then((m) => ({ default: m.SwingView })),
);
const SwingGuideView = lazy(() =>
  import('./routes/SwingGuideView').then((m) => ({ default: m.SwingGuideView })),
);
const LaunchView = lazy(() =>
  import('./routes/LaunchView').then((m) => ({ default: m.LaunchView })),
);
const RangeView = lazy(() =>
  import('./routes/RangeView').then((m) => ({ default: m.RangeView })),
);
const CameraProbe = import.meta.env.DEV
  ? lazy(() =>
      import('./routes/CameraProbe').then((m) => ({
        default: m.CameraProbe,
      })),
    )
  : null;
const UiAuditPreview = import.meta.env.DEV
  ? lazy(() =>
      import('./routes/UiAuditPreview').then((m) => ({
        default: m.UiAuditPreview,
      })),
    )
  : null;

class AppErrorBoundary extends Component<
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
            Something went wrong
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
    const useIdle = typeof requestIdleCallback === 'function';
    const handle = useIdle
      ? requestIdleCallback(() => {
          void import('./routes/CoursesView');
        })
      : window.setTimeout(() => {
          void import('./routes/CoursesView');
        }, 2000);
    return () => {
      if (useIdle) cancelIdleCallback(handle as number);
      else clearTimeout(handle as number);
    };
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
      <a href="#main-content" className="skip-link">
        Skip to main content
      </a>
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
          id="main-content"
          tabIndex={-1}
          className={
            fullBleedMain && showAppChrome
              ? 'app-main rounds'
              : isLanding
                ? 'app-main landing'
                : 'app-main'
          }
        >
        <Suspense fallback={<RouteFallback />}>
        <AppErrorBoundary>
        <Routes>
          <Route path="/" element={<PublicHome />} />
          {import.meta.env.DEV && UiAuditPreview ? (
            <Route
              path="/dev/ui-audit"
              element={
                <Suspense fallback={<RouteFallback />}>
                  <UiAuditPreview />
                </Suspense>
              }
            />
          ) : null}
          {import.meta.env.DEV && CameraProbe ? (
            <Route
              path="/dev/camera-probe"
              element={
                <Suspense fallback={<RouteFallback />}>
                  <CameraProbe />
                </Suspense>
              }
            />
          ) : null}
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
            path="/launch"
            element={
              <RequireAuth>
                <LaunchView />
              </RequireAuth>
            }
          />
          <Route
            path="/range"
            element={
              <RequireAuth>
                <RangeView />
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
        </AppErrorBoundary>
        </Suspense>
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
        <AppErrorBoundary>
          <Shell />
        </AppErrorBoundary>
      </AuthProvider>
    </BrowserRouter>
  );
}
