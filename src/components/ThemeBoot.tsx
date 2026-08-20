// Applies the persisted theme before paint-heavy routes mount so the
// first frame isn't a dark→light flash.

import { useEffect } from 'react';
import { applyTheme, loadTheme } from '../lib/theme';

export function ThemeBoot() {
  useEffect(() => {
    applyTheme(loadTheme());
  }, []);
  return null;
}
