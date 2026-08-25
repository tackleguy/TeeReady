/** First-run product tour — local, dismissable, replayable from Settings. */

export const TUTORIAL_STORAGE_KEY = 'teeready-tutorial-v1';
export const TUTORIAL_START_EVENT = 'teeready-tutorial-start';

export type TutorialState = {
  completed: boolean;
  skipped: boolean;
  version: 1;
};

function read(): TutorialState | null {
  try {
    const raw = localStorage.getItem(TUTORIAL_STORAGE_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as TutorialState;
  } catch {
    return null;
  }
}

function write(state: TutorialState) {
  try {
    localStorage.setItem(TUTORIAL_STORAGE_KEY, JSON.stringify(state));
  } catch {
    // ignore quota / private mode
  }
}

export function hasCompletedTutorial(): boolean {
  const s = read();
  return Boolean(s?.completed || s?.skipped);
}

export function markTutorialDone(kind: 'completed' | 'skipped') {
  write({
    completed: kind === 'completed',
    skipped: kind === 'skipped',
    version: 1,
  });
}

export function resetTutorial() {
  try {
    localStorage.removeItem(TUTORIAL_STORAGE_KEY);
  } catch {
    // ignore
  }
}

/** Replay from Settings — clears dismiss and asks the shell to open the tour. */
export function requestTutorialReplay() {
  resetTutorial();
  window.dispatchEvent(new Event(TUTORIAL_START_EVENT));
}
