// Appearance themes. Tokens live as CSS variables on <html data-theme="…">.

export type ThemeId = 'light' | 'dark' | 'sand' | 'auto';

export interface ThemeOption {
  id: ThemeId;
  label: string;
  description: string;
  /** Swatch colors for the settings picker [canvas, surface, accent]. */
  swatch: [string, string, string];
}

export const THEME_OPTIONS: ThemeOption[] = [
  {
    id: 'light',
    label: 'Light',
    description: 'Cool green canvas for daytime',
    swatch: ['#f4f5f2', '#ffffff', '#14713f'],
  },
  {
    id: 'dark',
    label: 'Dark',
    description: 'Deep fairway night look',
    swatch: ['#0c110e', '#161c17', '#3d9a62'],
  },
  {
    id: 'sand',
    label: 'Sand',
    description: 'Warm paper-toned light theme',
    swatch: ['#f3ebe0', '#fffaf3', '#b45309'],
  },
  {
    id: 'auto',
    label: 'Auto',
    description: 'Follow system light / dark',
    swatch: ['#f4f5f2', '#0c110e', '#14713f'],
  },
];

export const DEFAULT_THEME: ThemeId = 'light';

const STORAGE_KEY = 'teeready-theme-v1';
const LEGACY_KEY = 'ws-theme-v1';

export function loadTheme(): ThemeId {
  try {
    const raw =
      localStorage.getItem(STORAGE_KEY) ?? localStorage.getItem(LEGACY_KEY);
    if (raw === 'midnight') return 'dark';
    if (raw && THEME_OPTIONS.some((t) => t.id === raw)) return raw as ThemeId;
  } catch {
    // ignore
  }
  return DEFAULT_THEME;
}

export function saveTheme(id: ThemeId): void {
  try {
    localStorage.setItem(STORAGE_KEY, id);
  } catch {
    // ignore
  }
}

/** Resolve auto → concrete light/dark for applying data-theme. */
export function resolveTheme(id: ThemeId): Exclude<ThemeId, 'auto'> {
  if (id !== 'auto') return id;
  if (typeof window === 'undefined') return 'light';
  return window.matchMedia('(prefers-color-scheme: dark)').matches
    ? 'dark'
    : 'light';
}

export function applyTheme(id: ThemeId): void {
  if (typeof document === 'undefined') return;
  const resolved = resolveTheme(id);
  document.documentElement.dataset.theme = resolved;
  document.documentElement.style.colorScheme =
    resolved === 'dark' ? 'dark' : 'light';

  const canvas =
    getComputedStyle(document.documentElement)
      .getPropertyValue('--canvas')
      .trim() || '#f4f5f2';
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute('content', canvas);
}

export function setTheme(id: ThemeId): void {
  saveTheme(id);
  applyTheme(id);
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('teeready-theme-changed', { detail: id }));
  }
}
