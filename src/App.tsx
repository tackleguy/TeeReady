import { Suspense, lazy } from 'react';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { InstallPrompt } from './components/InstallPrompt';
import { ThemeBoot } from './components/ThemeBoot';
import { applyTheme, loadTheme } from './lib/theme';

applyTheme(loadTheme());

const GolfView = lazy(() =>
  import('./routes/GolfView').then((m) => ({ default: m.GolfView })),
);

function RouteFallback() {
  return (
    <div
      className="absolute inset-0 flex items-center justify-center"
      style={{ background: 'var(--surface-0)' }}
      aria-busy="true"
      aria-label="Loading"
    >
      <div className="h-2 w-32 overflow-hidden rounded-full bg-white/10">
        <div className="h-full w-1/3 animate-[shimmer_1.6s_linear_infinite] bg-white/40" />
      </div>
    </div>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <div className="relative h-[100dvh] overflow-hidden bg-[var(--bg-deep)] transition-colors duration-[var(--t-base)]">
        <ThemeBoot />
        <div className="app-main golf-solo">
          <Suspense fallback={<RouteFallback />}>
            <Routes>
              <Route path="/" element={<GolfView />} />
              <Route path="/golf" element={<GolfView />} />
              <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
          </Suspense>
        </div>
        <InstallPrompt />
      </div>
    </BrowserRouter>
  );
}
