/** Per-feature how-to guides — first-visit banner + replay from Settings optional. */

export function hasSeenFeatureGuide(key: string): boolean {
  try {
    return localStorage.getItem(key) === '1';
  } catch {
    return false;
  }
}

export function markFeatureGuideSeen(key: string): void {
  try {
    localStorage.setItem(key, '1');
  } catch {
    // ignore
  }
}

export function resetFeatureGuide(key: string): void {
  try {
    localStorage.removeItem(key);
  } catch {
    // ignore
  }
}

export const LAUNCH_GUIDE_KEY = 'teeready-launch-howto-v1';
export const RANGE_GUIDE_KEY = 'teeready-range-howto-v1';
