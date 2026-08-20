// Applies the persisted theme before paint-heavy routes mount so the
// first frame isn't a dark→light flash. Also keeps Auto in sync with
// system preference changes.

import { useEffect } from 'react';
import { applyTheme, loadTheme } from '../lib/theme';

export function ThemeBoot() {
  useEffect(() => {
    const sync = () => applyTheme(loadTheme());
    sync();

    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const onScheme = () => {
      if (loadTheme() === 'auto') applyTheme('auto');
    };
    mq.addEventListener('change', onScheme);
    window.addEventListener('teeready-theme-changed', sync);
    return () => {
      mq.removeEventListener('change', onScheme);
      window.removeEventListener('teeready-theme-changed', sync);
    };
  }, []);
  return null;
}
