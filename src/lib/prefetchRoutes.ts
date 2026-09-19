/** Warm route chunks before navigation so pages feel instant. */

const warmed = new Set<string>();

function warm(key: string, loader: () => Promise<unknown>) {
  if (warmed.has(key)) return;
  warmed.add(key);
  void loader().catch(() => warmed.delete(key));
}

export function prefetchRoute(path: string): void {
  // Touch devices (including Safari without Network Information API) load on navigation.
  if (typeof window === 'undefined' || !window.matchMedia('(hover: hover) and (pointer: fine)').matches) return;
  const connection = (navigator as Navigator & { connection?: { saveData?: boolean; effectiveType?: string } }).connection;
  if (connection?.saveData || (connection?.effectiveType && connection.effectiveType !== '4g')) return;
  if (path.startsWith('/rounds')) {
    warm('rounds', () => import('../routes/GolfView'));
    return;
  }
  switch (path) {
    case '/today':
      warm('today', () => import('../routes/TodayView'));
      break;
    case '/weather':
      warm('weather', () => import('../routes/WeatherView'));
      break;
    case '/courses':
      warm('courses', () => import('../routes/CoursesView'));
      break;
    case '/courses/map':
      warm('course-map', () => import('../routes/CourseMapView'));
      break;
    case '/group':
      warm('group', () => import('../routes/GroupView'));
      break;
    case '/profile':
      warm('profile', () => import('../routes/ProfileView'));
      break;
    case '/questionnaire':
      warm('questionnaire', () => import('../routes/QuestionnaireView'));
      break;
    case '/stats':
      warm('stats', () => import('../routes/StatsView'));
      break;
    case '/swing':
      warm('swing', () => import('../routes/SwingView'));
      break;
    case '/swing/guide':
      warm('swing-guide', () => import('../routes/SwingGuideView'));
      break;
    case '/settings':
      warm('settings', () => import('../routes/SettingsView'));
      break;
    default:
      break;
  }
}
