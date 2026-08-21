/** Session storage that honors "Remember me". */

const REMEMBER_KEY = 'teeready-remember-v1';

export function getRememberMe(): boolean {
  try {
    const raw = localStorage.getItem(REMEMBER_KEY);
    // Default on so returning golfers stay signed in.
    if (raw == null) return true;
    return raw === '1';
  } catch {
    return true;
  }
}

export function setRememberMe(remember: boolean): void {
  try {
    localStorage.setItem(REMEMBER_KEY, remember ? '1' : '0');
  } catch {
    // ignore
  }
}

function read(key: string): string | null {
  try {
    return localStorage.getItem(key) ?? sessionStorage.getItem(key);
  } catch {
    return null;
  }
}

function write(key: string, value: string): void {
  const remember = getRememberMe();
  try {
    if (remember) {
      localStorage.setItem(key, value);
      sessionStorage.removeItem(key);
    } else {
      sessionStorage.setItem(key, value);
      localStorage.removeItem(key);
    }
  } catch {
    // ignore
  }
}

function remove(key: string): void {
  try {
    localStorage.removeItem(key);
    sessionStorage.removeItem(key);
  } catch {
    // ignore
  }
}

/** Supabase auth storage adapter — local vs session based on Remember me. */
export const authStorage = {
  getItem: (key: string) => read(key),
  setItem: (key: string, value: string) => write(key, value),
  removeItem: (key: string) => remove(key),
};
