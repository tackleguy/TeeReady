/** Warm route chunks before navigation so pages feel instant. */

const warmed = new Set<string>();

function warm(key: string, loader: () => Promise<unknown>) {
  if (warmed.has(key)) return;
  warmed.add(key);
  void loader();
}

export function prefetchRoute(path: string): void {
  if (path.startsWith('/rounds')) {
    warm('rounds', () => import('../routes/GolfView'));
    return;
  }
  switch (path) {
    case '/today':
      warm('today', () => import('../routes/TodayView'));
      break;
    case '/courses':
      warm('courses', () => import('../routes/CoursesView'));
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
    case '/settings':
      warm('settings', () => import('../routes/SettingsView'));
      break;
    default:
      break;
  }
}

/** After sign-in, prefetch the pages most users open first. */
export function prefetchAppShell(): void {
  prefetchRoute('/today');
  prefetchRoute('/courses');
  prefetchRoute('/rounds/prep');
}
