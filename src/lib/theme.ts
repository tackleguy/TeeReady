// Appearance themes. Tokens live as CSS variables on <html data-theme="…">.

export type ThemeId = 'dark' | 'light' | 'auto' | 'midnight' | 'sand';

export interface ThemeOption {
  id: ThemeId;
  label: string;
  description: string;
}

export const THEME_OPTIONS: ThemeOption[] = [
  { id: 'dark', label: 'Dark', description: 'Default blue-glass night look' },
  { id: 'light', label: 'Light', description: 'Bright panels for daytime use' },
  { id: 'auto', label: 'Auto', description: 'Follow system light / dark' },
  { id: 'midnight', label: 'Midnight', description: 'Near-black, low glare' },
  { id: 'sand', label: 'Sand', description: 'Warm paper-toned light theme' },
];

export const DEFAULT_THEME: ThemeId = 'dark';

const STORAGE_KEY = 'ws-theme-v1';

export function loadTheme(): ThemeId {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
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
  if (typeof window === 'undefined') return 'dark';
  return window.matchMedia('(prefers-color-scheme: light)').matches
    ? 'light'
    : 'dark';
}

export function applyTheme(id: ThemeId): void {
  if (typeof document === 'undefined') return;
  const resolved = resolveTheme(id);
  document.documentElement.dataset.theme = resolved;
  document.documentElement.style.colorScheme =
    resolved === 'light' || resolved === 'sand' ? 'light' : 'dark';
}
